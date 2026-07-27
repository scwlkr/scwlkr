const configuredBaseUrl = process.env.BASE_URL;

if (!configuredBaseUrl) {
  throw new Error("BASE_URL is required, for example BASE_URL=https://scwlkr.com npm run verify:public");
}

const baseUrl = new URL(configuredBaseUrl);
if (
  baseUrl.protocol !== "https:" ||
  baseUrl.username ||
  baseUrl.password ||
  baseUrl.pathname !== "/" ||
  baseUrl.search ||
  baseUrl.hash
) {
  throw new Error("BASE_URL must be an HTTPS origin without credentials, path, query, or fragment");
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, init = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    ...init,
  });
  return response;
}

const httpRedirectPath = baseUrl.hostname.endsWith(".workers.dev") ? "/api/readiness" : "/";
const httpUrl = new URL(httpRedirectPath, baseUrl);
httpUrl.protocol = "http:";
const redirect = await fetch(httpUrl, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(15_000) });
requireCondition(
  [301, 308].includes(redirect.status),
  `HTTP ${httpRedirectPath} returned ${redirect.status}, expected 301 or 308`,
);
const redirectLocation = redirect.headers.get("location");
requireCondition(Boolean(redirectLocation), `HTTP ${httpRedirectPath} redirect is missing Location`);
requireCondition(
  new URL(redirectLocation, httpUrl).href === new URL(httpRedirectPath, baseUrl).href,
  `HTTP ${httpRedirectPath} redirected elsewhere`,
);

const readiness = await request("/api/readiness", { headers: { Accept: "application/json" } });
requireCondition(readiness.status === 200, `Readiness returned ${readiness.status}`);
requireCondition(readiness.headers.get("cache-control") === "no-store", "Readiness is missing Cache-Control: no-store");
const readinessBody = await readiness.json();
requireCondition(readinessBody.ok === true, "Readiness did not report ok: true");
requireCondition(readinessBody.ready === true, "Readiness did not report ready: true");
requireCondition(readinessBody.room === "ROOM_1", "Readiness did not report ROOM_1");

const home = await request("/");
requireCondition(home.status === 200, `Static homepage returned ${home.status}`);
const expectedHeaders = new Map([
  ["content-security-policy", "default-src 'self'"],
  ["referrer-policy", "no-referrer"],
  ["x-content-type-options", "nosniff"],
  ["x-frame-options", "DENY"],
  ["permissions-policy", "camera=()"],
]);
for (const [name, expected] of expectedHeaders) {
  const actual = home.headers.get(name);
  requireCondition(actual?.includes(expected), `Static homepage ${name} is missing ${JSON.stringify(expected)}`);
}
await home.body?.cancel();

process.stdout.write(
  `${JSON.stringify({
    ok: true,
    origin: baseUrl.origin,
    readiness: { ready: true, room: "ROOM_1" },
    httpRedirect: { path: httpRedirectPath, status: redirect.status },
    staticHeaders: Array.from(expectedHeaders.keys()),
  })}\n`,
);
