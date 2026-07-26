import { env, exports } from "cloudflare:workers";
import { abortAllDurableObjects } from "cloudflare:test";
import { describe, expect, it } from "vitest";

interface RoomSnapshot {
  type: "room.snapshot";
  room: string;
  occupancy: number;
  self: { presenceId: string; displayName: string };
  artifacts: Array<{ id: string; kind: string; revision: number; payload: Record<string, unknown> }>;
}

async function createSession(): Promise<{ cookie: string; displayName: string }> {
  const response = await exports.default.fetch("https://example.com/api/session", { method: "POST" });
  expect(response.status).toBe(201);
  const setCookie = response.headers.get("Set-Cookie");
  expect(setCookie).toContain("__Host-room_visitor=");
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("Secure");
  const cookie = setCookie?.split(";", 1)[0];
  if (!cookie) throw new Error("Session cookie missing");
  const body = (await response.json()) as { displayName: string };
  return { cookie, displayName: body.displayName };
}

async function openRoom(cookie: string): Promise<{ socket: WebSocket; snapshot: RoomSnapshot }> {
  const response = await env.ROOM.getByName("ROOM_1").fetch("https://example.com/ws", {
    headers: { Cookie: cookie, Upgrade: "websocket" },
  });
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  if (!socket) throw new Error("WebSocket missing");
  socket.accept();
  const snapshot = (await nextMessage(socket, "room.snapshot")) as unknown as RoomSnapshot;
  return { socket, snapshot };
}

async function nextMessage(socket: WebSocket, expectedType: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${expectedType}`)), 2_000);
    const listener = (event: MessageEvent) => {
      const value = JSON.parse(String(event.data)) as Record<string, unknown>;
      if (value.type !== expectedType) return;
      clearTimeout(timeout);
      socket.removeEventListener("message", listener);
      resolve(value);
    };
    socket.addEventListener("message", listener);
  });
}

async function closeSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return;

  await new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timeout);
      socket.removeEventListener("close", finish);
      resolve();
    };
    const timeout = setTimeout(finish, 500);
    socket.addEventListener("close", finish, { once: true });
    socket.close(1000, "test complete");
  });
}

describe("ROOM_1 Worker", () => {
  it("creates a private persistent identity and rejects an anonymous socket", async () => {
    const anonymous = await exports.default.fetch("https://example.com/ws", {
      headers: { Upgrade: "websocket" },
    });
    expect(anonymous.status).toBe(401);

    const session = await createSession();
    const repeat = await exports.default.fetch("https://example.com/api/session", {
      method: "POST",
      headers: { Cookie: session.cookie },
    });
    expect(repeat.status).toBe(200);
    expect(await repeat.json()).toEqual({ displayName: session.displayName });
  });

  it("persists one idempotent note across reconnect and a Durable Object restart", async () => {
    const firstSession = await createSession();
    const first = await openRoom(firstSession.cookie);
    let second: Awaited<ReturnType<typeof openRoom>> | undefined;

    try {
      expect(first.snapshot.room).toBe("ROOM_1");
      expect(first.snapshot.self.displayName).toBe(firstSession.displayName);

      const mutationId = `note_${crypto.randomUUID()}`;
      const message = JSON.stringify({
        type: "note.create",
        mutationId,
        payload: { text: "still here", point: { x: 400, y: 320 } },
      });
      const acceptedMessage = nextMessage(first.socket, "mutation.result");
      first.socket.send(message);
      const accepted = await acceptedMessage;
      expect(accepted.ok).toBe(true);

      const repeatedMessage = nextMessage(first.socket, "mutation.result");
      first.socket.send(message);
      const repeated = await repeatedMessage;
      expect(repeated).toEqual(accepted);

      await abortAllDurableObjects();

      const secondSession = await createSession();
      second = await openRoom(secondSession.cookie);
      const matches = second.snapshot.artifacts.filter(
        (artifact) => artifact.kind === "note" && artifact.payload.text === "still here",
      );
      expect(matches).toHaveLength(1);
      expect(matches[0]?.revision).toBe(1);
    } finally {
      await Promise.all([closeSocket(first.socket), ...(second ? [closeSocket(second.socket)] : [])]);
    }
  });

  it("reports health without caching", async () => {
    const response = await exports.default.fetch("https://example.com/api/health");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ ok: true, room: "ROOM_1" });
  });
});
