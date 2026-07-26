# Operate `ROOM_1`

## Health signals

`GET /api/health` is uncached and returns the canonical Room name, occupancy, active Artifact count, report count, and check time. Treat a non-200 response, invalid JSON, `ok` other than `true`, or `room` other than `ROOM_1` as unhealthy.

Configure an external HTTPS monitor to request `https://scwlkr.com/api/health` every five minutes. This verifies DNS, TLS, the Worker, the Durable Object, and SQLite together. A static-homepage check alone does not verify Room authority.

Use Cloudflare Workers Observability for runtime exceptions. Reproduce visible save or mutation failures in an isolated browser while tailing current invocations with:

```sh
npx wrangler tail scwlkr-room
```

The first-release capacity target is 50 simultaneous Visitors. Run the connection check against `workers.dev` before cutover and after meaningful realtime changes:

```sh
BASE_URL=https://WORKER.workers.dev CLIENTS=50 npm run load:test
```

An occupancy mismatch, repeated WebSocket reconnects, repeated visible save failures, or slow snapshots is a capacity warning even when `/api/health` remains green.

## Triage order

1. Check public DNS and TLS, then request `/api/health`.
2. Check the most recent deployment with `npx wrangler deployments list`.
3. Inspect Workers Observability and `npx wrangler tail scwlkr-room` for exceptions.
4. Reproduce with two isolated browsers. Distinguish a Static Assets failure from an `/api/*` or `/ws` failure.
5. If the current version introduced the failure, use the application rollback in the deployment runbook.
6. If only the custom hostname fails, keep testing the healthy `workers.dev` URL and use domain rollback.

Do not reset `ROOM_1` to fix a connection incident. Its SQLite state is the shared Room history.

## Archive safety

The daily Durable Object alarm archives eligible aged Artifacts to private R2 JSON objects under `room-1/YYYY-MM-DD/`. The R2 write completes before those rows are removed from active SQLite, and an archive index records the object key.

If archival errors appear:

- confirm the `ARCHIVE` binding points to `scwlkr-room-archive` and the bucket still exists;
- inspect the error before retrying or deploying a fix;
- do not manually delete active rows, archive objects, the bucket, or the Durable Object;
- copy the relevant R2 object before any manual recovery work.

R2 is cold history, not an automatic restore source. Restoring archived Artifacts requires an explicit, reviewed recovery procedure or code change.

## Moderation

Visitor reports increase the `reports` health count. Quarantine and restore are authenticated operator actions at `/api/moderation/quarantine` and `/api/moderation/restore`; both retain audit history, and restore is supported.

Use an HTTPS client that reads `MODERATOR_TOKEN` directly from the password manager and sends it as a Bearer credential. Never paste the credential into an issue, log excerpt, screenshot, browser URL, command-line argument, or chat. Confirm the exact Artifact ID before acting, then verify the change from an ordinary browser.

Generate and save a replacement of at least 32 random bytes in the password manager, then rotate a suspected credential without displaying it:

```sh
npx wrangler secret put MODERATOR_TOKEN
```

Enter the value only at Wrangler's hidden prompt. Then verify one authorized request and one unauthorized request. Rotation does not require changing source control.

## Security baseline

- Require 2FA for every Cloudflare super administrator and keep recovery codes offline.
- Use least-privilege Cloudflare API tokens for automation; do not use the global API key.
- Keep the R2 bucket private. Do not expose an `r2.dev` public URL.
- Keep registrar transfer codes, Cloudflare tokens, moderation credentials, and visitor tokens out of Git, CI logs, issue comments, and chat.
- Preserve `Secure`, `HttpOnly`, `SameSite=Strict` on the Visitor cookie and the Worker security headers.
- Review account members, API tokens, Worker routes, and DNS records after cutover and after any incident.
- Do not log raw WebSocket payloads or persistent Visitor tokens.

## Healthy-change checklist

A change is operationally complete only when CI passes, the exact commit is deployed, `/api/health` is green, two isolated browsers agree on one persisted mutation, rollback information is recorded, and the intended hostname has been verified from outside the Cloudflare account session.
