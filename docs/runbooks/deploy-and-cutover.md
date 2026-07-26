# Deploy and cut over `scwlkr.com`

This runbook separates application proof from DNS cutover. Do not combine the first production cutover with a registrar transfer. Stabilize the Worker first; registrar ownership can move later without changing Cloudflare nameservers.

## Preconditions

- Cloudflare account email is verified, account 2FA is enabled, and recovery codes are stored outside the repository.
- The `scwlkr.com` zone is active in Cloudflare.
- Cloudflare **SSL/TLS → Edge Certificates → Always Use HTTPS** is enabled. This is the required blanket HTTP redirect because Static Assets can be served before the Worker runs.
- R2 is enabled for the account.
- The 1Password item `op://Personal/scwlkr ROOM_1 moderator/password` is accessible through an authenticated `op` CLI session.
- Wrangler is authenticated to the intended Cloudflare account: `npx wrangler whoami`.
- The commit being deployed passed CI and is identifiable with `git rev-parse HEAD`.
- Any unrelated working-tree changes are left untouched.
- The legacy Hostinger push webhook is disabled before the first GitHub push that should no longer deploy the parked site. Retain its details only until Worker rollback is proven, then remove the obsolete Hostinger webhook and deployment secrets.

Before changing the live hostname, export or screenshot the existing apex and `www` DNS records, proxy state, redirects, and TLS mode. Record the last known healthy Worker deployment from:

```sh
npx wrangler deployments list
```

## One-time environment setup

Create both configured private Archive buckets if they do not exist:

```sh
npx wrangler r2 bucket create scwlkr-room-preview-archive
npx wrangler r2 bucket create scwlkr-room-archive
```

Preview and production must never share an Archive bucket. The Wrangler files also reserve separate Durable Object namespaces and separate edge rate-limit namespace IDs. The edge limits allow 60 session requests, 120 WebSocket admissions, and 60 diagnostic reads per IP per minute in each Cloudflare location, leaving room for the planned 50-client preview check while reducing one-actor abuse. The Durable Object separately enforces 24-hour Room budgets of 2,500 session requests, 2,500 WebSocket admissions, 10,000 reads, and 1,500,000 leased handled frames.

The first deploy creates each Worker. The moderation credential already lives at the 1Password reference above. Do not put its value in GitHub Actions, issue comments, shell arguments, `.env` files, screenshots, or chat.

## Verify before deployment

From a clean checkout:

```sh
npm ci
npx playwright install chromium firefox webkit
npm run release:check
```

The primary pass condition is the two-browser contract in Chromium, Firefox, and WebKit: both Visitors share `ROOM_1`, an accepted change reaches both, and the change survives reload. The narrow touch and reduced-motion check runs in Chromium because it uses Chromium's touch-emulation protocol. Unit or dry-run success alone is insufficient.

## Deploy and prove preview

```sh
npm run deploy:preview
op read 'op://Personal/scwlkr ROOM_1 moderator/password' \
  | npx wrangler secret put MODERATOR_TOKEN --config wrangler.preview.jsonc
npx wrangler secret list --config wrangler.preview.jsonc
```

The pipeline sends the secret directly from 1Password to Wrangler; run it in a private shell with command tracing disabled. `wrangler secret put` creates and immediately deploys a new preview version. Confirm the secret list includes `MODERATOR_TOKEN`, then keep the final preview URL and version reported by Wrangler.

Preview is the only remote environment where automated mutation is allowed:

```sh
E2E_BASE_URL=https://scwlkr-room-preview.WORKERS_SUBDOMAIN.workers.dev \
E2E_MODERATOR_TOKEN='op://Personal/scwlkr ROOM_1 moderator/password' \
op run -- npm run test:e2e

BASE_URL=https://scwlkr-room-preview.WORKERS_SUBDOMAIN.workers.dev \
CLIENTS=50 \
LOAD_TEST_TOKEN='op://Personal/scwlkr ROOM_1 moderator/password' \
op run -- npm run load:test
```

The Playwright configuration refuses a remote run without the 1Password-provided token. The load script sends `LOAD_TEST_TOKEN` only on WebSocket admission so the deliberate 16-socket and per-actor admission caps do not invalidate the owner-run 50-client proof; it never prints the token and does not bypass Room-wide budgets. Confirm preview readiness reports HTTP 200 with `ok: true`, `ready: true`, and `room: "ROOM_1"`; all three browser projects pass; the 50-Visitor check reports occupancy 50; cursor and durable mutation fan-out are each below two seconds; the deliberate preview Note succeeds; and the preview Archive binding names `scwlkr-room-preview-archive`.

Do not proceed if preview is unready or if any browser, persistence, moderation, or load check fails.

## Deploy production to `workers.dev`

```sh
npm run deploy
op read 'op://Personal/scwlkr ROOM_1 moderator/password' \
  | npx wrangler secret put MODERATOR_TOKEN --config wrangler.jsonc
npx wrangler secret list --config wrangler.jsonc
BASE_URL=https://scwlkr-room.WORKERS_SUBDOMAIN.workers.dev npm run verify:public
```

Confirm the secret list includes `MODERATOR_TOKEN` and the production Archive binding names `scwlkr-room-archive`. `verify:public` performs only GET/HEAD checks for HTTPS redirect, readiness, and static security headers.

Open the production `workers.dev` URL in a real owner-controlled browser, choose **ENTER**, confirm a generated identity, `CONNECTED`, and a sensible occupancy count, then close the tab. Do not draw, place a Note or Object, toggle the light, report, moderate, run the load test, or run remote Playwright against production. Production proof must not seed fake Artifacts.

Do not change live DNS until preview's mutating proof and production's non-mutating proof both pass.

## Attach `scwlkr.com`

In Cloudflare, open **Workers & Pages → scwlkr-room → Settings → Domains & Routes → Add → Custom Domain** and choose `scwlkr.com`.

Cloudflare may require replacement of the existing apex parking record. Remove only the saved Hostinger parking record that conflicts with the Worker custom domain. Do not change nameservers. Let Cloudflare provision the DNS target and certificate.

Reconfirm **SSL/TLS → Edge Certificates → Always Use HTTPS** is on before public verification. The Worker also returns a `308` fallback for routed HTTP `/api/*` and `/ws` requests, but it cannot enforce redirects for asset-first `/` and static-file requests. The zone setting is therefore part of the release, not an optional hardening step.

Make the apex canonical. Replace the old `www` parking record with the [Cloudflare-documented redirect placeholder](https://developers.cloudflare.com/fundamentals/manage-domains/redirect-domain/): an `A` record named `www`, content `192.0.2.1`, **Proxied**, TTL **Auto**. This non-routable address lets Cloudflare receive the request without defining an origin.

Create a Cloudflare Single Redirect with these exact settings:

- match expression: `(http.host eq "www.scwlkr.com")`;
- dynamic target expression: `concat("https://scwlkr.com", http.request.uri.path)`;
- status: `302` while verifying, then `308` after verification;
- **Preserve query string**: enabled.

The target expression preserves the complete path; the explicit query-string setting preserves the query. Do not leave `www` pointed at Hostinger.

Verify from outside the logged-in Cloudflare session:

```sh
BASE_URL=https://scwlkr.com npm run verify:public
curl --head --fail --show-error 'http://scwlkr.com/'
curl --head --fail --show-error 'http://scwlkr.com/api/readiness'
curl --include --fail --show-error --silent 'https://scwlkr.com/api/readiness'
curl --head --fail --show-error --silent 'https://scwlkr.com/'
curl --head --show-error 'https://www.scwlkr.com/path-proof?source=cutover'
```

Both HTTP requests must redirect to the same path on `https://scwlkr.com` without a loop. The `www` proof must return `Location: https://scwlkr.com/path-proof?source=cutover` exactly. The Worker's routed-request fallback uses `308`; switch the verified `www` rule from `302` to `308` and repeat the proof. HTTPS readiness must return `200`, include `Cache-Control: no-store`, and report `ok: true`, `ready: true`, and `room: "ROOM_1"`. The static `/` response must include `Content-Security-Policy`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and the restrictive `Permissions-Policy`. `www` must reach the apex without a loop.

Finally, open `https://scwlkr.com` in a real owner-controlled browser, choose **ENTER**, and confirm the identity, occupancy, and `CONNECTED` state over `wss://`. Close the tab without creating, moving, reporting, moderating, or toggling anything. Do not run remote E2E or the load test against the custom domain, and do not seed a fake Artifact for proof.

Observe errors, WebSocket connections, and mutation failures for at least 30 minutes before declaring cutover healthy. Keep the pre-cutover DNS snapshot until the site has remained healthy for 24 hours.

## Transfer registrar and enable DNSSEC

Move the registrar only after the Worker hostname has been healthy for at least 24 hours. The zone already uses Cloudflare nameservers, so a registrar transfer must not change those nameservers or the Worker records.

Use this sequence so DNSSEC never has a mismatched chain of trust:

1. Before transfer, run `dig +short NS scwlkr.com` and confirm the assigned Cloudflare nameservers. Run `dig +short DS scwlkr.com`; it must be empty while DNSSEC is disabled. If a DS record appears, stop, remove it at the current registrar, and wait its full parent-zone TTL before continuing.
2. Complete the registrar transfer with DNSSEC still disabled. Recheck the nameservers, `https://scwlkr.com/api/readiness`, and the exact `www` path/query redirect after transfer.
3. In Cloudflare **Manage Domains → scwlkr.com → Configuration**, select **Enable DNSSEC**. Cloudflare Registrar publishes the DS record automatically from CDS/CDNSKEY; [Cloudflare documents a one-to-two-day publication interval](https://developers.cloudflare.com/registrar/get-started/enable-dnssec/).
4. Wait until **DNS → Settings → DNSSEC** shows **Confirmed**. Then require `dig +short DS scwlkr.com @1.1.1.1` to return a DS record and `dig +dnssec scwlkr.com A @1.1.1.1` to return `status: NOERROR` with the `ad` flag. Recheck readiness and `www` from a separate network.
5. If validation fails, do not disable zone signing first. Follow Cloudflare's [DNSSEC rollback order](https://developers.cloudflare.com/dns/dnssec/#roll-back-dnssec): remove or disable the parent DS, keep Cloudflare signing enabled until the DS TTL expires, and only then disable signing.

## Application rollback

A bad static or Worker release should be rolled back at the Worker layer; DNS should stay attached.

```sh
npx wrangler deployments list
npx wrangler rollback VERSION_ID --message "rollback: REASON"
```

After rollback, repeat the production public verifier and real owner browser entry. If mutating regression proof is needed, deploy the rollback candidate to preview and test there. A rollback changes code and assets only. It does not revert Durable Object SQLite or R2, so do not roll back across an incompatible storage migration.

## Domain rollback

Use domain rollback only when the custom-domain route or certificate is the failure:

1. Remove the `scwlkr.com` custom domain from the Worker.
2. Restore the exact apex and `www` records from the pre-cutover snapshot.
3. Verify the restored destination over HTTPS.
4. Keep the Worker available on `workers.dev` for diagnosis.

Never delete either Durable Object namespace, `scwlkr-room-preview-archive`, or `scwlkr-room-archive` as part of rollback.
