import { env, exports } from "cloudflare:workers";
import { abortAllDurableObjects, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/worker";

interface RoomSnapshot {
  type: "room.snapshot";
  room: string;
  occupancy: number;
  self: { presenceId: string; displayName: string };
  artifacts: Array<{ id: string; kind: string; revision: number; payload: Record<string, unknown> }>;
  quota: { ink: number; inkCapacity: number; lastObjectAt: number | null };
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

async function expectNoMessageMatching(
  socket: WebSocket,
  predicate: (message: Record<string, unknown>) => boolean,
  duration = 250,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const listener = (event: MessageEvent) => {
      const value = JSON.parse(String(event.data)) as Record<string, unknown>;
      if (!predicate(value)) return;
      clearTimeout(timeout);
      socket.removeEventListener("message", listener);
      reject(new Error(`Unexpected peer message: ${String(value.type)}`));
    };
    const timeout = setTimeout(() => {
      socket.removeEventListener("message", listener);
      resolve();
    }, duration);
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

async function waitForClose(socket: WebSocket): Promise<CloseEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for socket close")), 2_000);
    socket.addEventListener("close", (event) => {
      clearTimeout(timeout);
      resolve(event);
    }, { once: true });
  });
}

describe("ROOM_1 Worker", () => {
  it("redirects public HTTP to HTTPS and exposes local readiness", async () => {
    const redirect = await exports.default.fetch("http://example.com/api/health?probe=edge", {
      redirect: "manual",
    });
    expect(redirect.status).toBe(308);
    expect(redirect.headers.get("Location")).toBe("https://example.com/api/health?probe=edge");

    const readiness = await exports.default.fetch("http://127.0.0.1:8788/api/readiness");
    expect(readiness.status).toBe(200);
    expect(readiness.headers.get("Cache-Control")).toBe("no-store");
    expect(await readiness.json()).toMatchObject({
      ok: true,
      ready: true,
      room: "ROOM_1",
      archiveReachable: true,
      maintenanceHealthy: true,
    });
  });

  it("preserves an unready Durable Object response", async () => {
    let forwardedPath = "";
    const fakeEnvironment = {
      ASSETS: env.ASSETS,
      ROOM: {
        getByName: () => ({
          fetch: (request: Request) => {
            forwardedPath = new URL(request.url).pathname;
            return Response.json(
              { ok: true, ready: false, archiveConfigured: false, moderationConfigured: false },
              { status: 503, headers: { "Cache-Control": "no-store" } },
            );
          },
        }),
      },
    } as unknown as Cloudflare.Env;

    const readiness = await worker.fetch(new Request("https://example.com/api/readiness"), fakeEnvironment);
    expect(forwardedPath).toBe("/api/readiness");
    expect(readiness.status).toBe(503);
    expect(readiness.headers.get("Cache-Control")).toBe("no-store");
    expect(await readiness.json()).toMatchObject({ ready: false, archiveConfigured: false });
  });

  it("rejects cross-origin browser writes while allowing non-browser clients", async () => {
    const crossOriginSession = await exports.default.fetch("https://example.com/api/session", {
      method: "POST",
      headers: { Origin: "https://attacker.example" },
    });
    expect(crossOriginSession.status).toBe(403);
    expect(await crossOriginSession.json()).toEqual({ error: "ORIGIN_FORBIDDEN" });

    const crossOriginSocket = await exports.default.fetch("https://example.com/ws", {
      headers: { Origin: "https://attacker.example", Upgrade: "websocket" },
    });
    expect(crossOriginSocket.status).toBe(403);

    const sameOriginSession = await exports.default.fetch("https://example.com/api/session", {
      method: "POST",
      headers: { Origin: "https://example.com:443" },
    });
    expect(sameOriginSession.status).toBe(201);

    const nonBrowserSession = await exports.default.fetch("https://example.com/api/session", { method: "POST" });
    expect(nonBrowserSession.status).toBe(201);
  });

  it("rate limits session and WebSocket admission by Cloudflare actor before the Room", async () => {
    const sessionKeys: string[] = [];
    const socketKeys: string[] = [];
    const readKeys: string[] = [];
    let roomLookups = 0;
    const fakeEnvironment = {
      ASSETS: env.ASSETS,
      ROOM: {
        getByName: () => {
          roomLookups += 1;
          return { fetch: () => new Response(null, { status: 204 }) };
        },
      },
      SESSION_RATE_LIMITER: {
        limit: ({ key }: { key: string }) => {
          sessionKeys.push(key);
          return Promise.resolve({ success: false });
        },
      },
      WS_RATE_LIMITER: {
        limit: ({ key }: { key: string }) => {
          socketKeys.push(key);
          return Promise.resolve({ success: false });
        },
      },
      READ_RATE_LIMITER: {
        limit: ({ key }: { key: string }) => {
          readKeys.push(key);
          return Promise.resolve({ success: false });
        },
      },
    } as unknown as Cloudflare.Env;

    const session = await worker.fetch(
      new Request("https://example.com/api/session", {
        method: "POST",
        headers: { "CF-Connecting-IP": "203.0.113.8" },
      }),
      fakeEnvironment,
    );
    expect(session.status).toBe(429);
    expect(session.headers.get("Cache-Control")).toBe("no-store");
    expect(session.headers.get("Retry-After")).toBe("60");
    expect(await session.json()).toEqual({ error: "EDGE_RATE_LIMITED" });

    const socket = await worker.fetch(
      new Request("https://example.com/ws", {
        headers: { "CF-Connecting-IP": "203.0.113.8", Upgrade: "websocket" },
      }),
      fakeEnvironment,
    );
    expect(socket.status).toBe(429);
    expect(socket.headers.get("Cache-Control")).toBe("no-store");
    expect(sessionKeys).toEqual(["203.0.113.8"]);
    expect(socketKeys).toEqual(["203.0.113.8"]);
    expect(roomLookups).toBe(0);

    const read = await worker.fetch(
      new Request("https://example.com/api/health", {
        headers: { "CF-Connecting-IP": "203.0.113.8" },
      }),
      fakeEnvironment,
    );
    expect(read.status).toBe(429);
    expect(readKeys).toEqual(["203.0.113.8"]);
    expect(roomLookups).toBe(0);

    const moderation = await worker.fetch(
      new Request("https://example.com/api/moderation/quarantine", {
        method: "POST",
        headers: { Authorization: "Bearer wrong" },
      }),
      fakeEnvironment,
    );
    expect(moderation.status).toBe(401);
    expect(roomLookups).toBe(0);

    const localSession = await worker.fetch(
      new Request("https://example.com/api/session", { method: "POST" }),
      fakeEnvironment,
    );
    expect(localSession.status).toBe(204);
    expect(roomLookups).toBe(1);
  });

  it("creates a private persistent identity and rejects an anonymous socket", async () => {
    const anonymous = await exports.default.fetch("https://example.com/ws", {
      headers: { Upgrade: "websocket" },
    });
    expect(anonymous.status).toBe(401);

    const session = await createSession();
    const visitorToken = session.cookie.split("=", 2)[1];
    const lastSeenBefore = await runInDurableObject(env.ROOM.getByName("ROOM_1"), (_instance, state) => {
      return state.storage.sql
        .exec("SELECT last_seen_at FROM visitors WHERE visitor_token = ?", visitorToken)
        .toArray()[0] as { last_seen_at: number };
    });
    const repeat = await exports.default.fetch("https://example.com/api/session", {
      method: "POST",
      headers: { Cookie: session.cookie },
    });
    expect(repeat.status).toBe(200);
    expect(await repeat.json()).toEqual({ displayName: session.displayName });
    const lastSeenAfter = await runInDurableObject(env.ROOM.getByName("ROOM_1"), (_instance, state) => {
      return state.storage.sql
        .exec("SELECT last_seen_at FROM visitors WHERE visitor_token = ?", visitorToken)
        .toArray()[0] as { last_seen_at: number };
    });
    expect(lastSeenAfter.last_seen_at).toBe(lastSeenBefore.last_seen_at);

    const invalidModeration = await exports.default.fetch("https://example.com/api/moderation/quarantine", {
      method: "POST",
      headers: { Authorization: "Bearer test-moderator-token", "Content-Type": "application/json" },
      body: "null",
    });
    expect(invalidModeration.status).toBe(400);
  });

  it("gives each tab its own presence and caps one identity at three sockets", async () => {
    const session = await createSession();
    const sockets: WebSocket[] = [];
    try {
      const first = await openRoom(session.cookie);
      sockets.push(first.socket);
      const second = await openRoom(session.cookie);
      sockets.push(second.socket);
      const third = await openRoom(session.cookie);
      sockets.push(third.socket);

      expect(new Set([
        first.snapshot.self.presenceId,
        second.snapshot.self.presenceId,
        third.snapshot.self.presenceId,
      ]).size).toBe(3);

      const fourth = await env.ROOM.getByName("ROOM_1").fetch("https://example.com/ws", {
        headers: { Cookie: session.cookie, Upgrade: "websocket" },
      });
      expect(fourth.status).toBe(429);
      expect(await fourth.json()).toMatchObject({ error: "TOO_MANY_TABS" });
    } finally {
      await Promise.all(sockets.map(closeSocket));
    }
  });

  it("caps one network actor while allowing the authenticated owner load check", async () => {
    const stub = env.ROOM.getByName(`actor-cap-${crypto.randomUUID()}`);
    const sockets: WebSocket[] = [];
    const cookies: string[] = [];

    try {
      for (let index = 0; index <= 16; index += 1) {
        const session = await stub.fetch("https://example.com/api/session", { method: "POST" });
        cookies.push(session.headers.get("Set-Cookie")?.split(";", 1)[0] ?? "");
      }

      for (const cookie of cookies.slice(0, 16)) {
        const upgrade = await stub.fetch("https://example.com/ws", {
          headers: {
            Cookie: cookie,
            Upgrade: "websocket",
            "CF-Connecting-IP": "203.0.113.44",
          },
        });
        expect(upgrade.status).toBe(101);
        const socket = upgrade.webSocket;
        if (!socket) throw new Error("Actor-cap socket missing");
        socket.accept();
        await nextMessage(socket, "room.snapshot");
        sockets.push(socket);
      }

      const rejected = await stub.fetch("https://example.com/ws", {
        headers: {
          Cookie: cookies[16] ?? "",
          Upgrade: "websocket",
          "CF-Connecting-IP": "203.0.113.44",
        },
      });
      expect(rejected.status).toBe(429);
      expect(await rejected.json()).toMatchObject({ error: "TOO_MANY_CONNECTIONS" });

      const ownerUpgrade = await stub.fetch("https://example.com/ws", {
        headers: {
          Authorization: "Bearer test-moderator-token",
          Cookie: cookies[16] ?? "",
          Upgrade: "websocket",
          "CF-Connecting-IP": "203.0.113.44",
        },
      });
      expect(ownerUpgrade.status).toBe(101);
      const ownerSocket = ownerUpgrade.webSocket;
      if (!ownerSocket) throw new Error("Owner load-check socket missing");
      ownerSocket.accept();
      await nextMessage(ownerSocket, "room.snapshot");
      sockets.push(ownerSocket);
    } finally {
      await Promise.all(sockets.map(closeSocket));
    }
  });

  it("bounds serial WebSocket admissions and reserves every handled frame", async () => {
    const stub = env.ROOM.getByName(`ws-admission-${crypto.randomUUID()}`);
    const address = "203.0.113.45";
    const session = await stub.fetch("https://example.com/api/session", {
      method: "POST",
      headers: { "CF-Connecting-IP": address },
    });
    const cookie = session.headers.get("Set-Cookie")?.split(";", 1)[0] ?? "";
    const upgrade = await stub.fetch("https://example.com/ws", {
      headers: { Cookie: cookie, Upgrade: "websocket", "CF-Connecting-IP": address },
    });
    expect(upgrade.status).toBe(101);
    const socket = upgrade.webSocket;
    if (!socket) throw new Error("Admission socket missing");
    socket.accept();
    await nextMessage(socket, "room.snapshot");
    const pong = nextMessage(socket, "pong");
    socket.send(JSON.stringify({ type: "ping" }));
    await pong;
    await closeSocket(socket);

    const before = await runInDurableObject(stub, (_instance, state) => {
      const roomAdmissions = state.storage.sql
        .exec("SELECT mutation_count FROM room_limits WHERE id = 'ws-day'")
        .toArray()[0] as { mutation_count: number };
      const roomFrames = state.storage.sql
        .exec("SELECT mutation_count FROM room_limits WHERE id = 'frames-day'")
        .toArray()[0] as { mutation_count: number };
      const actor = state.storage.sql
        .exec("SELECT kind, attempt_count FROM actor_limits WHERE kind IN ('ws-minute', 'ws-day', 'frames-day')")
        .toArray() as unknown as Array<{ kind: string; attempt_count: number }>;
      state.storage.sql.exec("UPDATE actor_limits SET attempt_count = 30 WHERE kind = 'ws-minute'");
      return { roomAdmissions, roomFrames, actor };
    });
    expect(before.roomAdmissions.mutation_count).toBe(1);
    expect(before.roomFrames.mutation_count).toBe(100);
    expect(Object.fromEntries(before.actor.map((row) => [row.kind, row.attempt_count]))).toMatchObject({
      "ws-minute": 1,
      "ws-day": 1,
      "frames-day": 100,
    });

    const rejected = await stub.fetch("https://example.com/ws", {
      headers: { Cookie: cookie, Upgrade: "websocket", "CF-Connecting-IP": address },
    });
    expect(rejected.status).toBe(429);
    expect(await rejected.json()).toMatchObject({ error: "SOCKET_RATE_LIMITED" });
    const afterRejected = await runInDurableObject(stub, (_instance, state) => {
      return state.storage.sql
        .exec("SELECT mutation_count FROM room_limits WHERE id = 'ws-day'")
        .toArray()[0] as { mutation_count: number };
    });
    expect(afterRejected.mutation_count).toBe(1);

    const owner = await stub.fetch("https://example.com/ws", {
      headers: {
        Authorization: "Bearer test-moderator-token",
        Cookie: cookie,
        Upgrade: "websocket",
        "CF-Connecting-IP": address,
      },
    });
    expect(owner.status).toBe(101);
    const ownerSocket = owner.webSocket;
    if (!ownerSocket) throw new Error("Owner admission socket missing");
    ownerSocket.accept();
    await nextMessage(ownerSocket, "room.snapshot");
    await closeSocket(ownerSocket);
  });

  it("shares live strokes, keeps reports private, and rejects an expired create replay", async () => {
    const sessionA = await createSession();
    const sessionB = await createSession();
    const first = await openRoom(sessionA.cookie);
    const second = await openRoom(sessionB.cookie);
    const mutationId = `draw_${crypto.randomUUID()}`;
    const createMessage = JSON.stringify({
      type: "drawing.create",
      mutationId,
      payload: {
        points: [{ x: 120, y: 150 }, { x: 260, y: 230 }],
        width: 3,
        color: "chalk",
      },
    });

    try {
      const previewMessage = nextMessage(second.socket, "drawing.previews");
      first.socket.send(JSON.stringify({
        type: "drawing.preview",
        mutationId,
        payload: {
          points: [{ x: 120, y: 150 }, { x: 180, y: 190 }],
          width: 3,
          color: "chalk",
        },
      }));
      const preview = await previewMessage;
      expect(preview.previews).toEqual([
        expect.objectContaining({
          presenceId: first.snapshot.self.presenceId,
          previewId: mutationId,
          color: "chalk",
        }),
      ]);

      const acceptedMessage = nextMessage(first.socket, "mutation.result");
      const sharedArtifact = nextMessage(second.socket, "artifact.upsert");
      const removedPreview = nextMessage(second.socket, "drawing.preview.removed");
      first.socket.send(createMessage);
      const accepted = await acceptedMessage;
      expect(accepted).toMatchObject({ ok: true, mutationId });
      const artifactEvent = await sharedArtifact;
      const artifact = (artifactEvent.artifact ?? {}) as Record<string, unknown>;
      expect(artifact).toMatchObject({ id: `drawing_${mutationId}`, kind: "drawing", revision: 1 });
      expect(artifact).not.toHaveProperty("creatorToken");
      expect(await removedPreview).toMatchObject({
        presenceId: first.snapshot.self.presenceId,
        previewId: mutationId,
      });

      const privateReport = expectNoMessageMatching(
        second.socket,
        (message) => message.type === "mutation.result" || message.type === "report.accepted",
      );
      const reportResult = nextMessage(first.socket, "mutation.result");
      first.socket.send(JSON.stringify({
        type: "report.create",
        mutationId: `report_${crypto.randomUUID()}`,
        payload: { artifactId: `drawing_${mutationId}`, reason: "test report" },
      }));
      expect(await reportResult).toMatchObject({ ok: true });
      await privateReport;

      const duplicateReport = nextMessage(first.socket, "mutation.result");
      first.socket.send(JSON.stringify({
        type: "report.create",
        mutationId: `report_${crypto.randomUUID()}`,
        payload: { artifactId: `drawing_${mutationId}`, reason: "duplicate test report" },
      }));
      expect(await duplicateReport).toMatchObject({ ok: true });
      const reportCount = await runInDurableObject(env.ROOM.getByName("ROOM_1"), (_instance, state) => {
        return state.storage.sql
          .exec("SELECT COUNT(*) AS count FROM reports WHERE artifact_id = ?", `drawing_${mutationId}`)
          .toArray()[0] as { count: number };
      });
      expect(reportCount.count).toBe(1);
      const privateReferences = await runInDurableObject(env.ROOM.getByName("ROOM_1"), (_instance, state) => {
        const visitorToken = sessionA.cookie.split("=", 2)[1];
        const visitor = state.storage.sql
          .exec("SELECT visitor_ref FROM visitors WHERE visitor_token = ?", visitorToken)
          .toArray()[0] as { visitor_ref: string };
        const storedArtifact = state.storage.sql
          .exec("SELECT creator_token FROM artifacts WHERE id = ?", `drawing_${mutationId}`)
          .toArray()[0] as { creator_token: string };
        const storedReport = state.storage.sql
          .exec("SELECT reporter_token FROM reports WHERE artifact_id = ?", `drawing_${mutationId}`)
          .toArray()[0] as { reporter_token: string };
        return { visitorToken, visitor, storedArtifact, storedReport };
      });
      expect(privateReferences.storedArtifact.creator_token).toBe(privateReferences.visitor.visitor_ref);
      expect(privateReferences.storedReport.reporter_token).toBe(privateReferences.visitor.visitor_ref);
      expect(privateReferences.storedArtifact.creator_token).not.toBe(privateReferences.visitorToken);

      await runInDurableObject(env.ROOM.getByName("ROOM_1"), (_instance, state) => {
        state.storage.sql.exec("DELETE FROM mutations WHERE id = ?", mutationId);
        state.storage.sql.exec("DELETE FROM mutation_tombstones WHERE id = ?", mutationId);
      });
      const expiredReplay = nextMessage(first.socket, "mutation.result");
      first.socket.send(createMessage);
      expect(await expiredReplay).toMatchObject({
        mutationId,
        ok: false,
        code: "ALREADY_HEARD",
      });
    } finally {
      await Promise.all([closeSocket(first.socket), closeSocket(second.socket)]);
    }
  });

  it("bounds session issuance and does not charge rejected attempts to the daily budget", async () => {
    const stub = env.ROOM.getByName(`session-limit-${crypto.randomUUID()}`);
    let firstCookie = "";
    for (let index = 0; index < 120; index += 1) {
      const response = await stub.fetch("https://example.com/api/session", { method: "POST" });
      expect(response.status).toBe(201);
      if (index === 0) firstCookie = response.headers.get("Set-Cookie")?.split(";", 1)[0] ?? "";
    }
    const rejected = await stub.fetch("https://example.com/api/session", { method: "POST" });
    expect(rejected.status).toBe(429);

    const dailyCount = await runInDurableObject(stub, (_instance, state) => {
      return state.storage.sql
        .exec("SELECT mutation_count FROM room_limits WHERE id = 'sessions-day'")
        .toArray()[0] as { mutation_count: number };
    });
    expect(dailyCount.mutation_count).toBe(120);

    const existing = await stub.fetch("https://example.com/api/session", {
      method: "POST",
      headers: { Cookie: firstCookie },
    });
    expect(existing.status).toBe(200);
  });

  it("reserves new-visitor capacity after one network actor reaches its daily session budget", async () => {
    const stub = env.ROOM.getByName(`actor-session-limit-${crypto.randomUUID()}`);
    for (let index = 0; index < 100; index += 1) {
      const response = await stub.fetch("https://example.com/api/session", {
        method: "POST",
        headers: { "CF-Connecting-IP": "203.0.113.50" },
      });
      expect(response.status).toBe(201);
    }
    const rejected = await stub.fetch("https://example.com/api/session", {
      method: "POST",
      headers: { "CF-Connecting-IP": "203.0.113.50" },
    });
    expect(rejected.status).toBe(429);

    const freshActor = await stub.fetch("https://example.com/api/session", {
      method: "POST",
      headers: { "CF-Connecting-IP": "203.0.113.51" },
    });
    expect(freshActor.status).toBe(201);
  });

  it("keeps target-50 realtime traffic responsive with 1,500 persisted artifacts", async () => {
    const stub = env.ROOM.getByName(`mixed-target-${crypto.randomUUID()}`);
    const sockets: WebSocket[] = [];

    try {
      await runInDurableObject(stub, (_instance, state) => {
        state.storage.transactionSync(() => {
          for (let index = 0; index < 1500; index += 1) {
            const at = Date.now() - (1500 - index);
            state.storage.sql.exec(
              `INSERT INTO artifacts
               (id, kind, creator_token, created_at, updated_at, revision, z_index, lifecycle, payload)
               VALUES (?, 'note', 'performance-proof-ref', ?, ?, 1, ?, 'active', ?)`,
              `performance_${String(index).padStart(4, "0")}`,
              at,
              at,
              index + 1,
              JSON.stringify({
                text: `persisted ${index}`,
                point: { x: 40 + (index % 24) * 38, y: 90 + (index % 12) * 42 },
              }),
            );
          }
          state.storage.sql.exec("UPDATE room_sequences SET value = 1500 WHERE id = 'visible-artifacts'");
          state.storage.sql.exec("UPDATE room_sequences SET value = 1500 WHERE id = 'z-order'");
        });
      });
      for (let index = 0; index < 50; index += 1) {
        const session = await stub.fetch("https://example.com/api/session", { method: "POST" });
        const cookie = session.headers.get("Set-Cookie")?.split(";", 1)[0] ?? "";
        const upgrade = await stub.fetch("https://example.com/ws", {
          headers: { Cookie: cookie, Upgrade: "websocket" },
        });
        const socket = upgrade.webSocket;
        if (!socket) throw new Error("Target-occupancy socket missing");
        socket.accept();
        await nextMessage(socket, "room.snapshot");
        sockets.push(socket);
      }

      const observer = sockets.at(-1);
      if (!observer) throw new Error("Target-occupancy observer missing");
      for (let round = 0; round < 3; round += 1) {
        const cursorFanout = nextMessage(observer, "presence.cursors");
        sockets.forEach((socket, index) => {
          socket.send(JSON.stringify({
            type: "cursor",
            payload: { point: { x: 20 + index, y: 120 + round * 10 } },
          }));
        });
        const cursorBatch = await cursorFanout;
        expect(cursorBatch.cursors).toHaveLength(50);
      }
      const first = sockets[0];
      if (!first) throw new Error("Target-occupancy sender missing");
      const previewId = `preview_${crypto.randomUUID()}`;
      for (let round = 0; round < 3; round += 1) {
        const previewFanout = nextMessage(observer, "drawing.previews");
        first.send(JSON.stringify({
          type: "drawing.preview",
          mutationId: previewId,
          payload: {
            points: [{ x: 20, y: 20 }, { x: 80 + round * 10, y: 80 + round * 10 }],
            width: 3,
            color: "chalk",
          },
        }));
        expect((await previewFanout).previews).toHaveLength(1);
      }
      const mutationId = `fixture_${crypto.randomUUID()}`;
      const resultMessage = nextMessage(first, "mutation.result");
      const mutationFanout = nextMessage(observer, "fixture.updated");
      const startedAt = performance.now();
      first.send(JSON.stringify({ type: "fixture.toggle", mutationId, payload: { id: "light" } }));
      expect(await resultMessage).toMatchObject({ ok: true, mutationId });
      expect(await mutationFanout).toMatchObject({ type: "fixture.updated" });
      expect(performance.now() - startedAt).toBeLessThan(1000);
    } finally {
      await Promise.all(sockets.map(closeSocket));
    }
  }, 30_000);

  it("bounds one actor's daily invalid mutation attempts without draining the Room", async () => {
    const stub = env.ROOM.getByName(`actor-mutation-limit-${crypto.randomUUID()}`);
    const address = "203.0.113.60";
    const session = await stub.fetch("https://example.com/api/session", {
      method: "POST",
      headers: { "CF-Connecting-IP": address },
    });
    const cookie = session.headers.get("Set-Cookie")?.split(";", 1)[0] ?? "";
    const upgrade = await stub.fetch("https://example.com/ws", {
      headers: { Cookie: cookie, Upgrade: "websocket", "CF-Connecting-IP": address },
    });
    const socket = upgrade.webSocket;
    if (!socket) throw new Error("Actor mutation socket missing");
    socket.accept();
    await nextMessage(socket, "room.snapshot");

    try {
      const firstId = `move_${crypto.randomUUID()}`;
      const firstResult = nextMessage(socket, "mutation.result");
      socket.send(JSON.stringify({ type: "artifact.move", mutationId: firstId, payload: {} }));
      expect(await firstResult).toMatchObject({ ok: false, code: "CANNOT_MOVE" });

      await runInDurableObject(stub, (_instance, state) => {
        state.storage.sql.exec(
          "UPDATE actor_limits SET attempt_count = 400 WHERE kind = 'mutations-day'",
        );
      });
      const dailyBefore = await runInDurableObject(stub, (_instance, state) => {
        return state.storage.sql
          .exec("SELECT mutation_count FROM room_limits WHERE id = 'mutations-day'")
          .toArray()[0] as { mutation_count: number };
      });

      const rejectedId = `move_${crypto.randomUUID()}`;
      const rejectedResult = nextMessage(socket, "mutation.result");
      socket.send(JSON.stringify({ type: "artifact.move", mutationId: rejectedId, payload: {} }));
      expect(await rejectedResult).toMatchObject({ ok: false, code: "ACTOR_RESTING" });
      const after = await runInDurableObject(stub, (_instance, state) => {
        const daily = state.storage.sql
          .exec("SELECT mutation_count FROM room_limits WHERE id = 'mutations-day'")
          .toArray()[0] as { mutation_count: number };
        const receipt = state.storage.sql
          .exec("SELECT COUNT(*) AS count FROM mutations WHERE id = ?", rejectedId)
          .toArray()[0] as { count: number };
        return { daily, receipt };
      });
      expect(after.daily.mutation_count).toBe(dailyBefore.mutation_count);
      expect(after.receipt.count).toBe(0);
    } finally {
      await closeSocket(socket);
    }
  });

  it("coalesces shared-light bursts below the flashing threshold", async () => {
    const stub = env.ROOM.getByName(`fixture-cooldown-${crypto.randomUUID()}`);
    const session = await stub.fetch("https://example.com/api/session", { method: "POST" });
    const cookie = session.headers.get("Set-Cookie")?.split(";", 1)[0] ?? "";
    const upgrade = await stub.fetch("https://example.com/ws", {
      headers: { Cookie: cookie, Upgrade: "websocket" },
    });
    const socket = upgrade.webSocket;
    if (!socket) throw new Error("Fixture cooldown socket missing");
    socket.accept();
    await nextMessage(socket, "room.snapshot");

    try {
      const first = nextMessage(socket, "mutation.result");
      socket.send(JSON.stringify({
        type: "fixture.toggle",
        mutationId: `fixture_${crypto.randomUUID()}`,
        payload: { id: "light" },
      }));
      expect(await first).toMatchObject({ ok: true });

      const second = nextMessage(socket, "mutation.result");
      socket.send(JSON.stringify({
        type: "fixture.toggle",
        mutationId: `fixture_${crypto.randomUUID()}`,
        payload: { id: "light" },
      }));
      expect(await second).toMatchObject({ ok: false, code: "FIXTURE_COOLDOWN" });
    } finally {
      await closeSocket(socket);
    }
  });

  it("does not persist receipts for rate-limited mutation floods", async () => {
    const stub = env.ROOM.getByName(`mutation-limit-${crypto.randomUUID()}`);
    const session = await stub.fetch("https://example.com/api/session", { method: "POST" });
    const cookie = session.headers.get("Set-Cookie")?.split(";", 1)[0] ?? "";
    const upgrade = await stub.fetch("https://example.com/ws", {
      headers: { Cookie: cookie, Upgrade: "websocket" },
    });
    const socket = upgrade.webSocket;
    if (!socket) throw new Error("Rate-limit test socket missing");
    socket.accept();
    await nextMessage(socket, "room.snapshot");

    try {
      for (let index = 0; index <= 80; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 60));
        const resultMessage = nextMessage(socket, "mutation.result");
        socket.send(JSON.stringify({
          type: "artifact.move",
          mutationId: `move_${String(index).padStart(3, "0")}_${crypto.randomUUID()}`,
          payload: {},
        }));
        const result = await resultMessage;
        expect(result.code).toBe(index < 80 ? "CANNOT_MOVE" : "SLOW_DOWN");
      }
      const receiptCount = await runInDurableObject(stub, (_instance, state) => {
        return state.storage.sql.exec("SELECT COUNT(*) AS count FROM mutations").toArray()[0] as { count: number };
      });
      expect(receiptCount.count).toBe(80);
    } finally {
      await closeSocket(socket);
    }
  });

  it("closes sustained valid-shaped traffic after repeated actor-rate rejections", async () => {
    const stub = env.ROOM.getByName(`rejected-rate-${crypto.randomUUID()}`);
    const address = "203.0.113.69";
    const session = await stub.fetch("https://example.com/api/session", {
      method: "POST",
      headers: { "CF-Connecting-IP": address },
    });
    const cookie = session.headers.get("Set-Cookie")?.split(";", 1)[0] ?? "";
    const upgrade = await stub.fetch("https://example.com/ws", {
      headers: { Cookie: cookie, Upgrade: "websocket", "CF-Connecting-IP": address },
    });
    const socket = upgrade.webSocket;
    if (!socket) throw new Error("Rejected-rate socket missing");
    socket.accept();
    await nextMessage(socket, "room.snapshot");

    for (let index = 0; index < 60; index += 1) {
      const mutationId = `move_rate_${String(index).padStart(2, "0")}_${crypto.randomUUID()}`;
      const result = nextMessage(socket, "mutation.result");
      socket.send(JSON.stringify({ type: "artifact.move", mutationId, payload: {} }));
      expect(await result).toMatchObject({ ok: false, code: "CANNOT_MOVE" });
    }
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const closed = waitForClose(socket);
    for (let index = 0; index < 6; index += 1) {
      socket.send(JSON.stringify({
        type: "artifact.move",
        mutationId: `move_rejected_${index}_${crypto.randomUUID()}`,
        payload: {},
      }));
    }
    expect((await closed).code).toBe(1008);
  });

  it("rejects null frames and closes a malformed-frame flood", async () => {
    const stub = env.ROOM.getByName(`frame-limit-${crypto.randomUUID()}`);
    const address = "203.0.113.70";
    const session = await stub.fetch("https://example.com/api/session", {
      method: "POST",
      headers: { "CF-Connecting-IP": address },
    });
    const cookie = session.headers.get("Set-Cookie")?.split(";", 1)[0] ?? "";
    const upgrade = await stub.fetch("https://example.com/ws", {
      headers: { Cookie: cookie, Upgrade: "websocket", "CF-Connecting-IP": address },
    });
    const socket = upgrade.webSocket;
    if (!socket) throw new Error("Frame-limit test socket missing");
    socket.accept();
    await nextMessage(socket, "room.snapshot");

    const oversizedResult = nextMessage(socket, "mutation.result");
    socket.send(new Uint8Array(32_001).buffer);
    expect(await oversizedResult).toMatchObject({ ok: false, code: "TOO_LOUD" });

    const nullResult = nextMessage(socket, "mutation.result");
    socket.send("null");
    expect(await nullResult).toMatchObject({ ok: false, code: "BAD_MESSAGE" });
    const unknownResult = nextMessage(socket, "mutation.result");
    socket.send(JSON.stringify({
      type: "unknown.action",
      mutationId: `unknown_${crypto.randomUUID()}`,
      payload: {},
    }));
    expect(await unknownResult).toMatchObject({ ok: false, code: "UNKNOWN_ACTION" });
    const invalidDaily = await runInDurableObject(stub, (_instance, state) => {
      return state.storage.sql
        .exec("SELECT attempt_count FROM actor_limits WHERE kind = 'invalid-frames-day'")
        .toArray()[0] as { attempt_count: number };
    });
    expect(invalidDaily.attempt_count).toBe(3);

    const closed = waitForClose(socket);
    for (let index = 0; index < 3; index += 1) socket.send("{");
    expect((await closed).code).toBe(1008);
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

      const acceptedEvent = accepted.event as { artifact: { id: string; revision: number } };
      const artifactId = acceptedEvent.artifact.id;
      expect(acceptedEvent.artifact.revision).toBe(1);

      const moveMessage = nextMessage(first.socket, "mutation.result");
      first.socket.send(
        JSON.stringify({
          type: "artifact.move",
          mutationId: `move_${crypto.randomUUID()}`,
          payload: { id: artifactId, revision: 1, point: { x: 700, y: 500 } },
        }),
      );
      expect(await moveMessage).toMatchObject({ ok: true });

      const quarantine = await exports.default.fetch("https://example.com/api/moderation/quarantine", {
        method: "POST",
        headers: { Authorization: "Bearer test-moderator-token", "Content-Type": "application/json" },
        body: JSON.stringify({ artifactId }),
      });
      expect(quarantine.status).toBe(200);
      const quarantinedAudit = await runInDurableObject(env.ROOM.getByName("ROOM_1"), (_instance, state) => {
        return state.storage.sql
          .exec(
            "SELECT action, actor, prior_lifecycle FROM moderation_audit WHERE artifact_id = ? ORDER BY rowid ASC",
            artifactId,
          )
          .toArray() as unknown as Array<{ action: string; actor: string; prior_lifecycle: string }>;
      });
      expect(quarantinedAudit).toEqual([
        { action: "quarantine", actor: "operator", prior_lifecycle: "active" },
      ]);

      const repeatedMessage = nextMessage(first.socket, "mutation.result");
      first.socket.send(message);
      const repeated = await repeatedMessage;
      expect(repeated).toMatchObject({
        type: "mutation.result",
        mutationId,
        ok: true,
        replayed: true,
      });
      expect(repeated).not.toHaveProperty("event");
      expect(repeated).not.toHaveProperty("artifact");

      const restore = await exports.default.fetch("https://example.com/api/moderation/restore", {
        method: "POST",
        headers: { Authorization: "Bearer test-moderator-token", "Content-Type": "application/json" },
        body: JSON.stringify({ artifactId }),
      });
      expect(restore.status).toBe(200);
      const restoredAudit = await runInDurableObject(env.ROOM.getByName("ROOM_1"), (_instance, state) => {
        return state.storage.sql
          .exec(
            "SELECT action, actor, prior_lifecycle FROM moderation_audit WHERE artifact_id = ? ORDER BY rowid ASC",
            artifactId,
          )
          .toArray() as unknown as Array<{ action: string; actor: string; prior_lifecycle: string }>;
      });
      expect(restoredAudit).toEqual([
        { action: "quarantine", actor: "operator", prior_lifecycle: "active" },
        { action: "restore", actor: "operator", prior_lifecycle: "quarantined" },
      ]);

      await abortAllDurableObjects();

      const secondSession = await createSession();
      second = await openRoom(secondSession.cookie);
      const matches = second.snapshot.artifacts.filter(
        (artifact) => artifact.kind === "note" && artifact.payload.text === "still here",
      );
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({ revision: 4, payload: { point: { x: 700, y: 500 } } });
      const restartedAudit = await runInDurableObject(env.ROOM.getByName("ROOM_1"), (_instance, state) => {
        return state.storage.sql
          .exec(
            "SELECT action, actor, prior_lifecycle FROM moderation_audit WHERE artifact_id = ? ORDER BY rowid ASC",
            artifactId,
          )
          .toArray() as unknown as Array<{ action: string; actor: string; prior_lifecycle: string }>;
      });
      expect(restartedAudit).toEqual(restoredAudit);
    } finally {
      await Promise.all([closeSocket(first.socket), ...(second ? [closeSocket(second.socket)] : [])]);
    }
  });

  it("persists exhausted ink and reconciles the authoritative balance after reconnect", async () => {
    const stubName = `ink-${crypto.randomUUID()}`;
    const stub = env.ROOM.getByName(stubName);
    const sessionResponse = await stub.fetch("https://example.com/api/session", { method: "POST" });
    const cookie = sessionResponse.headers.get("Set-Cookie")?.split(";", 1)[0] ?? "";
    expect(cookie).toContain("__Host-room_visitor=");

    const open = async (): Promise<{ socket: WebSocket; snapshot: RoomSnapshot }> => {
      const response = await env.ROOM.getByName(stubName).fetch("https://example.com/ws", {
        headers: { Cookie: cookie, Upgrade: "websocket" },
      });
      expect(response.status).toBe(101);
      const socket = response.webSocket;
      if (!socket) throw new Error("Ink test WebSocket missing");
      socket.accept();
      const snapshot = (await nextMessage(socket, "room.snapshot")) as unknown as RoomSnapshot;
      return { socket, snapshot };
    };

    const first = await open();
    let second: Awaited<ReturnType<typeof open>> | undefined;
    try {
      expect(first.snapshot.quota).toMatchObject({ ink: 1200, inkCapacity: 1200 });
      const stroke = {
        points: [{ x: 0, y: 0 }, { x: 1000, y: 640 }],
        width: 12,
        color: "chalk",
      };
      const spent = nextMessage(first.socket, "mutation.result");
      first.socket.send(JSON.stringify({
        type: "drawing.create",
        mutationId: `ink_spend_${crypto.randomUUID()}`,
        payload: stroke,
      }));
      const spentResult = await spent;
      expect(spentResult).toMatchObject({ ok: true, ink: 60 });

      const depleted = nextMessage(first.socket, "mutation.result");
      first.socket.send(JSON.stringify({
        type: "drawing.create",
        mutationId: `ink_deplete_${crypto.randomUUID()}`,
        payload: {
          points: [{ x: 0, y: 0 }, { x: 62.5, y: 0 }],
          width: 12,
          color: "chalk",
        },
      }));
      const depletedResult = await depleted;
      expect(depletedResult).toMatchObject({ ok: true });
      expect(Number(depletedResult.ink)).toBeLessThan(1);

      const exhausted = nextMessage(first.socket, "mutation.result");
      first.socket.send(JSON.stringify({
        type: "drawing.create",
        mutationId: `ink_empty_${crypto.randomUUID()}`,
        payload: stroke,
      }));
      expect(await exhausted).toMatchObject({ ok: false, code: "NO_INK" });

      await closeSocket(first.socket);
      await abortAllDurableObjects();
      second = await open();
      expect(second.snapshot.quota.ink).toBeGreaterThanOrEqual(0);
      expect(second.snapshot.quota.ink).toBeLessThan(5);

      const stillExhausted = nextMessage(second.socket, "mutation.result");
      second.socket.send(JSON.stringify({
        type: "drawing.create",
        mutationId: `ink_refresh_${crypto.randomUUID()}`,
        payload: stroke,
      }));
      expect(await stillExhausted).toMatchObject({ ok: false, code: "NO_INK" });
    } finally {
      await Promise.all([closeSocket(first.socket), ...(second ? [closeSocket(second.socket)] : [])]);
    }
  });

  it("runs legacy state backfills only once across Durable Object restarts", async () => {
    const stubName = `migration-${crypto.randomUUID()}`;
    const stub = env.ROOM.getByName(stubName);
    expect((await stub.fetch("https://example.com/api/health")).status).toBe(200);
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE runtime_status SET updated_at = 123 WHERE id = 'schema-version'",
      );
    });

    await abortAllDurableObjects();
    const restartedStub = env.ROOM.getByName(stubName);
    expect((await restartedStub.fetch("https://example.com/api/health")).status).toBe(200);
    const marker = await runInDurableObject(restartedStub, (_instance, state) => {
      return state.storage.sql
        .exec("SELECT value, updated_at FROM runtime_status WHERE id = 'schema-version'")
        .toArray()[0] as { value: string; updated_at: number };
    });
    expect(marker).toEqual({ value: "2", updated_at: 123 });
  });

  it("reports health without caching", async () => {
    const response = await exports.default.fetch("https://example.com/api/health");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ ok: true, room: "ROOM_1" });
  });
});
