import { ROOM_NAME } from "./domain";
import type { Env } from "./env";

export { Room } from "./room";

const API_PATHS = new Set([
  "/api/health",
  "/api/readiness",
  "/api/occupancy",
  "/api/session",
  "/api/moderation/quarantine",
  "/api/moderation/restore",
]);
const MODERATION_PATHS = new Set([
  "/api/moderation/quarantine",
  "/api/moderation/restore",
]);

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

function hasSameOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get("Origin");
  if (origin === null) return true;

  try {
    return new URL(origin).origin === url.origin;
  } catch {
    return false;
  }
}

function originForbidden(): Response {
  return Response.json(
    { error: "ORIGIN_FORBIDDEN" },
    { status: 403, headers: { "Cache-Control": "no-store" } },
  );
}

function edgeRateLimited(): Response {
  return Response.json(
    { error: "EDGE_RATE_LIMITED" },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": "60",
      },
    },
  );
}

async function allowsActor(request: Request, limiter: RateLimit): Promise<boolean> {
  const actor = request.headers.get("CF-Connecting-IP")?.trim();
  if (!actor) return true;
  return (await limiter.limit({ key: actor })).success;
}

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

    if (url.protocol === "http:" && !isLocalHostname(url.hostname)) {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 308);
    }

    const requiresSameOrigin = url.pathname === "/ws" || (request.method === "POST" && API_PATHS.has(url.pathname));
    if (requiresSameOrigin && !hasSameOrigin(request, url)) return originForbidden();
    if (
      request.method === "POST" &&
      MODERATION_PATHS.has(url.pathname) &&
      (!env.MODERATOR_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.MODERATOR_TOKEN}`)
    ) {
      return Response.json(
        { error: "UNAUTHORIZED" },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (
      url.pathname === "/api/session" &&
      request.method === "POST" &&
      !(await allowsActor(request, env.SESSION_RATE_LIMITER))
    ) {
      return edgeRateLimited();
    }
    if (url.pathname === "/ws" && !(await allowsActor(request, env.WS_RATE_LIMITER))) {
      return edgeRateLimited();
    }
    if (
      request.method === "GET" &&
      ["/api/health", "/api/readiness", "/api/occupancy"].includes(url.pathname) &&
      !(await allowsActor(request, env.READ_RATE_LIMITER))
    ) {
      return edgeRateLimited();
    }

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
