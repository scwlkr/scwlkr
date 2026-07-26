import { DurableObject } from "cloudflare:workers";

interface Env {
  ASSETS: Fetcher;
  ROOM: DurableObjectNamespace<Room>;
  ARCHIVE: R2Bucket;
}

const ROOM_NAME = "ROOM_1";

export class Room extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, room: ROOM_NAME });
    }

    return new Response("Not found", { status: 404 });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/") || url.pathname === "/ws") {
      const room = env.ROOM.getByName(ROOM_NAME);
      return room.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
