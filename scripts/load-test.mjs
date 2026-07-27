import WebSocket from "ws";

const baseUrl = new URL(process.env.BASE_URL ?? "http://127.0.0.1:8787");
const clients = readPositiveInteger(process.env.CLIENTS, 50);
const timeoutMs = readPositiveInteger(process.env.TIMEOUT_MS, 20_000);
const loadTestToken = process.env.LOAD_TEST_TOKEN?.trim();

if (clients < 2) throw new Error("The shared-state proof requires at least two clients");

function readPositiveInteger(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, received ${JSON.stringify(value)}`);
  }
  return parsed;
}

function withTimeout(promise, label) {
  let timeout;
  const guard = new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timeout));
}

function waitForMessage(socket, predicate, label) {
  return withTimeout(
    new Promise((resolve, reject) => {
      const cleanup = () => {
        socket.off("message", onMessage);
        socket.off("error", onError);
        socket.off("close", onClose);
      };
      const onMessage = (raw) => {
        let message;
        try {
          message = JSON.parse(raw.toString());
        } catch {
          return;
        }
        if (!predicate(message)) return;
        cleanup();
        resolve(message);
      };
      const onError = (error) => {
        cleanup();
        reject(error);
      };
      const onClose = () => {
        cleanup();
        reject(new Error(`${label} socket closed early`));
      };
      socket.on("message", onMessage);
      socket.once("error", onError);
      socket.once("close", onClose);
    }),
    label,
  );
}

async function openVisitor(index) {
  const sessionResponse = await fetch(new URL("/api/session", baseUrl), { method: "POST" });
  if (sessionResponse.status !== 201) {
    throw new Error(`Visitor ${index}: session returned ${sessionResponse.status}`);
  }
  const cookie = sessionResponse.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error(`Visitor ${index}: session cookie missing`);

  const socketUrl = new URL("/ws", baseUrl);
  socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
  const headers = { Cookie: cookie };
  if (loadTestToken) headers.Authorization = `Bearer ${loadTestToken}`;
  const socket = new WebSocket(socketUrl, { headers });

  const snapshot = await waitForMessage(
    socket,
    (message) => message.type === "room.snapshot",
    `Visitor ${index} connection`,
  );

  socket.send(
    JSON.stringify({
      type: "cursor",
      payload: { point: { x: 40 + (index % 20) * 45, y: 120 + Math.floor(index / 20) * 70 } },
    }),
  );
  return { socket, snapshot };
}

async function closeSocket(socket) {
  if (socket.readyState === WebSocket.CLOSED) return;
  await withTimeout(
    new Promise((resolve) => {
      socket.once("close", resolve);
      socket.close(1000, "load test complete");
    }),
    "Socket close",
  );
}

const startedAt = performance.now();
const visitors = [];

try {
  for (let index = 1; index <= clients; index += 1) {
    visitors.push(await openVisitor(index));
  }

  const occupancyResponse = await fetch(new URL("/api/occupancy", baseUrl), { cache: "no-store" });
  if (!occupancyResponse.ok) throw new Error(`Occupancy returned ${occupancyResponse.status}`);
  const occupancyBody = await occupancyResponse.json();
  if (occupancyBody.occupancy !== clients) {
    throw new Error(`Expected occupancy ${clients}, received ${occupancyBody.occupancy}`);
  }

  const source = visitors[0]?.socket;
  const observer = visitors.at(-1)?.socket;
  if (!source || !observer || source === observer) throw new Error("Shared-state clients missing");

  const marker = { x: 913.7, y: 73.2 };
  const cursorStartedAt = performance.now();
  const cursorFanout = waitForMessage(
    observer,
    (message) =>
      message.type === "presence.cursors" &&
      Array.isArray(message.cursors) &&
      message.cursors.some((cursor) => cursor?.point?.x === marker.x && cursor?.point?.y === marker.y),
    "Peer cursor fan-out",
  );
  source.send(JSON.stringify({ type: "cursor", payload: { point: marker } }));
  await cursorFanout;
  const cursorFanoutMs = Math.round(performance.now() - cursorStartedAt);

  const mutationId = `load_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const artifactId = `note_${mutationId}`;
  const mutationStartedAt = performance.now();
  const mutationResult = waitForMessage(
    source,
    (message) => message.type === "mutation.result" && message.mutationId === mutationId,
    "Durable mutation result",
  );
  const mutationFanout = waitForMessage(
    observer,
    (message) => message.type === "artifact.upsert" && message.artifact?.id === artifactId,
    "Peer durable mutation fan-out",
  );
  source.send(JSON.stringify({
    type: "note.create",
    mutationId,
    payload: { text: "preview load proof", point: { x: 820, y: 520 } },
  }));
  const [result] = await Promise.all([mutationResult, mutationFanout]);
  if (result.ok !== true) throw new Error(`Durable mutation failed with ${String(result.code ?? "unknown")}`);
  const mutationFanoutMs = Math.round(performance.now() - mutationStartedAt);
  if (cursorFanoutMs >= 2_000 || mutationFanoutMs >= 2_000) {
    throw new Error(
      `Realtime fan-out exceeded 2000ms (cursor=${cursorFanoutMs}, mutation=${mutationFanoutMs})`,
    );
  }

  const elapsedMs = Math.round(performance.now() - startedAt);
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      room: "ROOM_1",
      clients,
      occupancy: occupancyBody.occupancy,
      connectMs: elapsedMs,
      cursorFanoutMs,
      mutationFanoutMs,
      artifactId,
    })}\n`,
  );
} finally {
  await Promise.allSettled(visitors.map(({ socket }) => closeSocket(socket)));
}
