# Operate `ROOM_1`

## Health signals

`GET /api/readiness` is the production monitor target. It is uncached and verifies the canonical Room plus required R2 and moderation bindings. Treat a non-200 response, invalid JSON, `ok` other than `true`, `ready` other than `true`, or `room` other than `ROOM_1` as unhealthy. `GET /api/health` is a diagnostic liveness view and must not replace readiness monitoring.

Configure an external HTTPS monitor to request `https://scwlkr.com/api/readiness` every five minutes and require HTTP 200 with `ok: true`, `ready: true`, and `room: "ROOM_1"`. This verifies DNS, TLS, the Worker, the Durable Object, SQLite, and required bindings together. A static-homepage or `/api/health` check alone is insufficient.

Use Cloudflare Workers Observability for runtime exceptions. Reproduce visible save or mutation failures in an isolated browser while tailing current invocations with:

```sh
npx wrangler tail scwlkr-room
```

The first-release capacity target is 50 simultaneous Visitors. Run the connection check only against the isolated preview Worker before cutover and after meaningful realtime changes; it creates Visitor rows, sends peer-visible cursor traffic, creates one persistent preview Note, and measures both cursor and mutation fan-out:

```sh
BASE_URL=https://scwlkr-room-preview.WORKERS_SUBDOMAIN.workers.dev \
CLIENTS=50 \
LOAD_TEST_TOKEN='op://Personal/scwlkr ROOM_1 moderator/password' \
op run -- npm run load:test
```

The token is sent only on WebSocket admission and bypasses the 16-socket and per-actor admission caps for this owner-run proof; it does not bypass Room-wide admission or handled-frame budgets, and the script never prints it. The pass condition is occupancy equal to `CLIENTS`, peer cursor fan-out below two seconds, a successful `note.create`, and peer mutation fan-out below two seconds. Record the emitted `cursorFanoutMs`, `mutationFanoutMs`, and preview `artifactId`. An occupancy mismatch, repeated WebSocket reconnects, a rejected Note, or either latency at or above two seconds is a capacity failure. Never run the load test against production because it intentionally persists one Artifact.

## Free-plan and Room budgets

Cloudflare's current Workers Free allowances for SQLite Durable Objects are [100,000 Durable Object requests per day](https://developers.cloudflare.com/durable-objects/platform/pricing/#compute-billing) and [100,000 SQLite rows written per day](https://developers.cloudflare.com/durable-objects/platform/pricing/#sqlite-storage-backend). Limits reset at 00:00 UTC; when a Free allowance is exhausted, further operations of that type fail. Incoming WebSocket messages use a 20:1 ratio for request billing, although analytics still show actual message counts.

`ROOM_1` deliberately stays below those account ceilings with tighter application guardrails. Room-day counters below use bounded 24-hour application windows; Cloudflare's account allowance resets separately at 00:00 UTC.

- 60 session requests, 120 WebSocket admissions, and 60 diagnostic reads per `CF-Connecting-IP` per minute, per Cloudflare location; the 50-client preview check fits those edge limits;
- 64 simultaneous Room sockets, at most three per Visitor and 16 per hashed IP actor; only the 1Password-authenticated owner load check bypasses the actor cap;
- 2,500 `/api/session` requests per Room day, with at most 100 new sessions per hashed IP actor and 1,000 new sessions Room-wide; after 900 new sessions, the final 100 slots admit only the first session from a new actor;
- 2,500 WebSocket admissions per Room day, with at most 30 per minute and 200 per Room day per hashed IP actor; after 2,000 admissions, the final 500 slots admit only the first admission from a new actor;
- 10,000 combined `/api/health`, `/api/readiness`, and `/api/occupancy` reads per Room day;
- 1,500,000 leased handled frames per Room day and 80,000 per hashed IP actor, allocated in 100-frame chunks; all frames cap at 60 per second per presence and hashed actor;
- 4,000 unique mutation attempts and 500 new Artifacts per Room day;
- 80 mutations per Visitor and 300 Room-wide per 10 seconds, plus 60 mutations per hashed IP actor per 10 seconds and 400 per actor per Room day;
- cursor and drawing-preview updates coalesce every 100 ms, accept 12 ephemeral updates per second per presence, and close abusive sockets above 24; durable mutations remain outside ephemeral coalescing;
- the browser sends one heartbeat every 60 seconds, paces cursor frames at `max(250 ms, occupancy × 20 ms)` (one cursor per second per moving Visitor at occupancy 50), and limits live-drawing previews to one every 250 ms; the shared light accepts at most one toggle per 1.5 seconds.

At Cloudflare's 20:1 incoming WebSocket-message billing ratio, 1,500,000 leased handled frames equal 75,000 Durable Object request equivalents. Adding the maximum 10,000 diagnostic reads, 2,500 session requests, and 2,500 WebSocket admissions yields 90,000 request equivalents for normal accepted application work, leaving 10,000 for alarms, retries, and operational headroom below the 100,000-request Free allowance. Because leases reserve 100 frames at a time, actual handled traffic can be lower than the leased count. Once the application cannot obtain another lease, it closes the affected socket; sustained heavy realtime activity can therefore end before Cloudflare's 00:00 UTC reset by design. The daily mutation and session caps also bound SQLite writes; do not increase any limit without recalculating both allowances.

Cloudflare's [Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) is permissive, eventually consistent, and local to a Cloudflare location. Treat its 429s as abuse protection, not exact usage accounting. Hashed-IP limits also do not aggregate a distributed attacker. Room-wide budgets bound accepted work and close admitted abusive sockets, but a request rejected after reaching the Durable Object is still billable. A sufficiently distributed attack can therefore exceed the 90,000-work plan and exhaust Cloudflare's account allowance; that is the residual Free-plan risk. Revisit all budgets together when real traffic or Free-plan telemetry approaches 70% of a daily allowance; do not raise a single limit in isolation.

## Triage order

1. Check public DNS and TLS, then request `/api/readiness` and require `ready: true`.
2. Check the most recent deployment with `npx wrangler deployments list`.
3. Inspect Workers Observability and `npx wrangler tail scwlkr-room` for exceptions.
4. Reproduce with two isolated browsers. Distinguish a Static Assets failure from an `/api/*` or `/ws` failure.
5. If the current version introduced the failure, use the application rollback in the deployment runbook.
6. If only the custom hostname fails, keep testing the healthy `workers.dev` URL and use domain rollback.

Do not reset `ROOM_1` to fix a connection incident. Its SQLite state is the shared Room history.

## Archive safety

The four-hour Durable Object alarm archives eligible aged Artifacts to private R2 JSON objects under `room-1/YYYY-MM-DD/`. The R2 write completes before those rows are removed from active SQLite, and an archive index records the object key.

If archival errors appear:

- confirm preview points to `scwlkr-room-preview-archive`, production points to `scwlkr-room-archive`, and the affected bucket still exists;
- inspect the error before retrying or deploying a fix;
- do not manually delete active rows, archive objects, the bucket, or the Durable Object;
- copy the relevant R2 object before any manual recovery work.

R2 is cold history, not an automatic restore source. Restoring archived Artifacts requires an explicit, reviewed recovery procedure or code change.

## Moderation

Visitor reports increase the `reports` health count. Quarantine and restore are authenticated operator actions at `/api/moderation/quarantine` and `/api/moderation/restore`; both retain audit history, and restore is supported.

Use an HTTPS client that reads `MODERATOR_TOKEN` directly from the password manager and sends it as a Bearer credential. Never paste the credential into an issue, log excerpt, screenshot, browser URL, command-line argument, or chat. Confirm the exact Artifact ID before acting, then verify the change from an ordinary browser.

Replace the password field in the `scwlkr ROOM_1 moderator` 1Password item, then rotate both isolated deployments without displaying the value:

```sh
op read 'op://Personal/scwlkr ROOM_1 moderator/password' \
  | npx wrangler secret put MODERATOR_TOKEN --config wrangler.preview.jsonc
op read 'op://Personal/scwlkr ROOM_1 moderator/password' \
  | npx wrangler secret put MODERATOR_TOKEN --config wrangler.jsonc
```

Run the pipelines with shell command tracing disabled. Verify moderation on preview, then require production `/api/readiness` to return `ready: true`; do not perform a production moderation mutation merely as a credential test. Rotation does not require changing source control.

## Security baseline

- Require 2FA for every Cloudflare super administrator and keep recovery codes offline.
- Use least-privilege Cloudflare API tokens for automation; do not use the global API key.
- Keep the R2 bucket private. Do not expose an `r2.dev` public URL.
- Keep registrar transfer codes, Cloudflare tokens, moderation credentials, and visitor tokens out of Git, CI logs, issue comments, and chat.
- Preserve `Secure`, `HttpOnly`, `SameSite=Strict` on the Visitor cookie and the Worker security headers.
- Review account members, API tokens, Worker routes, and DNS records after cutover and after any incident.
- Do not log raw WebSocket payloads or persistent Visitor tokens.

## Healthy-change checklist

A change is operationally complete only when CI passes, mutating proof passes on preview, the exact commit is deployed, production `/api/readiness` reports `ready: true`, a real owner browser can enter without creating a test Artifact, rollback information is recorded, and the intended hostname passes the non-mutating public verifier from outside the Cloudflare account session.
