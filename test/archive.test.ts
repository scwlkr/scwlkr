import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const ACTIVE_CAPACITY = 1500;

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
  socket.close(1000, "archive test complete");
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe("room compaction", () => {
  it("keeps canonical state visible until overflow is durably archived", async () => {
    const archive = env.ARCHIVE;
    if (!archive) throw new Error("Archive binding missing from the test runtime");
    const stub = env.ROOM.getByName(`archive-${crypto.randomUUID()}`);
    await stub.fetch("https://example.com/api/health");
    const createdAt = Date.now();

    await runInDurableObject(stub, (_instance, state) => {
      state.storage.transactionSync(() => {
        for (let index = 0; index <= ACTIVE_CAPACITY + 100; index += 1) {
          state.storage.sql.exec(
            "INSERT INTO artifacts (id, kind, creator_token, created_at, updated_at, revision, lifecycle, payload) VALUES (?, 'note', 'archive-test-visitor-token', ?, ?, 1, 'active', ?)",
            `capacity_${index}`,
            createdAt + index,
            createdAt + index,
            JSON.stringify({ text: `capacity ${index}`, point: { x: 400, y: 320 } }),
          );
        }
        state.storage.sql.exec(
          "INSERT INTO reports (id, artifact_id, reporter_token, reason, created_at) VALUES ('archive-report', 'capacity_0', 'archive-reporter-ref', 'archive proof', ?)",
          createdAt,
        );
        state.storage.sql.exec("UPDATE room_sequences SET value = ? WHERE id = 'visible-artifacts'", ACTIVE_CAPACITY + 101);
        state.storage.sql.exec("UPDATE room_sequences SET value = 1 WHERE id = 'reports'");
      });
    });

    const session = await stub.fetch("https://example.com/api/session", { method: "POST" });
    const cookie = session.headers.get("Set-Cookie")?.split(";", 1)[0];
    expect(cookie).toBeTruthy();
    const upgrade = await stub.fetch("https://example.com/ws", {
      headers: { Cookie: cookie ?? "", Upgrade: "websocket" },
    });
    const socket = upgrade.webSocket;
    expect(socket).toBeTruthy();
    if (!socket) throw new Error("Archive test socket missing");
    socket.accept();

    try {
      const snapshot = await nextMessage(socket, "room.snapshot");
      const artifacts = snapshot.artifacts as Array<{ id: string }>;
      expect(artifacts).toHaveLength(ACTIVE_CAPACITY + 101);
      expect(artifacts.some((artifact) => artifact.id === "capacity_0")).toBe(true);
      expect(artifacts.some((artifact) => artifact.id === `capacity_${ACTIVE_CAPACITY}`)).toBe(true);

      const mutationId = `fixture_${crypto.randomUUID()}`;
      const mutationResult = nextMessage(socket, "mutation.result");
      socket.send(JSON.stringify({ type: "fixture.toggle", mutationId, payload: { id: "light" } }));
      expect(await mutationResult).toMatchObject({ ok: true, mutationId });

      const archivesBefore = await archive.list({ prefix: "room-1/" });
      const removedMessage = nextMessage(socket, "artifacts.removed");
      expect(await runDurableObjectAlarm(stub)).toBe(true);
      const removed = await removedMessage;
      const expectedRemoved = Array.from({ length: 101 }, (_, index) => `capacity_${index}`);
      expect(removed.artifactIds).toEqual(expectedRemoved);

      const remaining = await runInDurableObject(stub, (_instance, state) => {
        const active = state.storage.sql
          .exec("SELECT COUNT(*) AS count FROM artifacts WHERE lifecycle = 'active'")
          .toArray()[0] as { count: number };
        const sequences = state.storage.sql
          .exec("SELECT id, value FROM room_sequences WHERE id IN ('visible-artifacts', 'reports')")
          .toArray() as unknown as Array<{ id: string; value: number }>;
        return { active, sequences };
      });
      expect(remaining.active.count).toBe(ACTIVE_CAPACITY);
      expect(Object.fromEntries(remaining.sequences.map((row) => [row.id, row.value]))).toEqual({
        reports: 0,
        "visible-artifacts": ACTIVE_CAPACITY,
      });

      const archivesAfter = await archive.list({ prefix: "room-1/" });
      const previousKeys = new Set(archivesBefore.objects.map((object) => object.key));
      const newObject = archivesAfter.objects.find((object) => !previousKeys.has(object.key));
      expect(newObject).toBeTruthy();
      const archived = newObject ? await archive.get(newObject.key) : null;
      const archiveBody = (await archived?.json()) as
        | {
            artifacts: Array<{ id: string; creatorRef?: string; creatorToken?: string }>;
            reports: Array<{ artifactId: string; reporterRef?: string; reporterToken?: string }>;
          }
        | undefined;
      expect(archiveBody?.artifacts.map((artifact) => artifact.id)).toEqual(expectedRemoved);
      expect(archiveBody?.artifacts[0]).toMatchObject({
        id: "capacity_0",
        creatorRef: "archive-test-visitor-token",
      });
      expect(archiveBody?.artifacts[0]).not.toHaveProperty("creatorToken");
      expect(archiveBody?.reports).toEqual([
        expect.objectContaining({ artifactId: "capacity_0", reporterRef: "archive-reporter-ref" }),
      ]);
      expect(archiveBody?.reports[0]).not.toHaveProperty("reporterToken");
    } finally {
      await closeSocket(socket);
    }
  });
});
