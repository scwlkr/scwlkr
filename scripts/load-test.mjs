import WebSocket from "ws";

const baseUrl = new URL(process.env.BASE_URL ?? "http://127.0.0.1:8787");
const clients = readPositiveInteger(process.env.CLIENTS, 50);
const timeoutMs = readPositiveInteger(process.env.TIMEOUT_MS, 20_000);

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

async function openVisitor(index) {
  const sessionResponse = await fetch(new URL("/api/session", baseUrl), { method: "POST" });
  if (sessionResponse.status !== 201) {
    throw new Error(`Visitor ${index}: session returned ${sessionResponse.status}`);
  }
  const cookie = sessionResponse.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error(`Visitor ${index}: session cookie missing`);

  const socketUrl = new URL("/ws", baseUrl);
  socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(socketUrl, { headers: { Cookie: cookie } });

  const snapshot = await withTimeout(
    new Promise((resolve, reject) => {
      socket.once("error", reject);
      socket.on("message", (raw) => {
        const message = JSON.parse(raw.toString());
        if (message.type === "room.snapshot") resolve(message);
      });
    }),
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

  const elapsedMs = Math.round(performance.now() - startedAt);
  process.stdout.write(
    `${JSON.stringify({ ok: true, room: "ROOM_1", clients, occupancy: occupancyBody.occupancy, connectMs: elapsedMs })}\n`,
  );
} finally {
  await Promise.allSettled(visitors.map(({ socket }) => closeSocket(socket)));
}
