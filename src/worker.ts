import { ROOM_NAME } from "./domain";
import type { Env } from "./env";

export { Room } from "./room";

const API_PATHS = new Set([
  "/api/health",
  "/api/occupancy",
  "/api/session",
  "/api/moderation/quarantine",
  "/api/moderation/restore",
]);

function securityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; connect-src 'self' wss:; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws" || API_PATHS.has(url.pathname)) {
      const room = env.ROOM.getByName(ROOM_NAME);
      return room.fetch(request);
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "NOT_FOUND" }, { status: 404 });
    }

    const response = await env.ASSETS.fetch(request);
    return securityHeaders(response);
  },
} satisfies ExportedHandler<Env>;
