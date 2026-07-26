# Deploy and cut over `scwlkr.com`

This runbook separates application proof from DNS cutover. Do not combine the first production cutover with a registrar transfer. Stabilize the Worker first; registrar ownership can move later without changing Cloudflare nameservers.

## Preconditions

- Cloudflare account email is verified, account 2FA is enabled, and recovery codes are stored outside the repository.
- The `scwlkr.com` zone is active in Cloudflare.
- R2 is enabled for the account.
- Wrangler is authenticated to the intended Cloudflare account: `npx wrangler whoami`.
- The commit being deployed passed CI and is identifiable with `git rev-parse HEAD`.
- Any unrelated working-tree changes are left untouched.
- The legacy Hostinger push webhook is disabled before the first GitHub push that should no longer deploy the parked site. Retain its details only until Worker rollback is proven, then remove the obsolete Hostinger webhook and deployment secrets.

Before changing the live hostname, export or screenshot the existing apex and `www` DNS records, proxy state, redirects, and TLS mode. Record the last known healthy Worker deployment from:

```sh
npx wrangler deployments list
```

## One-time production setup

Create the configured private Archive bucket if it does not exist:

```sh
npx wrangler r2 bucket create scwlkr-room-archive
```

The first `npm run deploy` below creates the Worker. Before that step, generate and save a random credential of at least 32 bytes in the password manager. Do not put it in GitHub Actions, issue comments, shell arguments, `.env` files, screenshots, or chat.

## Verify before deployment

From a clean checkout:

```sh
npm ci
npx playwright install chromium
npm run check
npm run test:e2e
```

The primary pass condition is the two-browser contract: both Visitors share `ROOM_1`, an accepted change reaches both, and the change survives reload. Unit or dry-run success alone is insufficient.

## Deploy to `workers.dev`

```sh
npm run deploy
npx wrangler secret put MODERATOR_TOKEN
```

Enter the saved credential only at Wrangler's hidden prompt. `wrangler secret put` creates and immediately deploys a new Worker version. Keep the URL and version reported by Wrangler. Confirm `npx wrangler secret list` includes `MODERATOR_TOKEN`; never attach the live domain to a version without it. Against the final URL:

1. `GET /api/health` returns HTTP 200, `ok: true`, and `room: "ROOM_1"`.
2. Two isolated browsers enter, occupancy changes, and a note or drawing synchronizes.
3. Close both browsers, open a fresh session, and confirm the Artifact persists.
4. Reload during a reconnect and confirm the action is not duplicated.
5. Exercise entry and a core mutation at a narrow mobile viewport.
6. Run the 50-Visitor connection check:

```sh
BASE_URL=https://WORKER.workers.dev CLIENTS=50 npm run load:test
```

Do not change live DNS until all six checks pass.

## Attach `scwlkr.com`

In Cloudflare, open **Workers & Pages → scwlkr-room → Settings → Domains & Routes → Add → Custom Domain** and choose `scwlkr.com`.

Cloudflare may require replacement of the existing apex parking record. Remove only the saved Hostinger parking record that conflicts with the Worker custom domain. Do not change nameservers. Let Cloudflare provision the DNS target and certificate.

Make the apex canonical. Replace the old `www` parking record with a proxied `A` record for `www` pointing to the reserved placeholder `192.0.2.0`, then configure a Cloudflare Single Redirect from `www.scwlkr.com` to the same path and query on `https://scwlkr.com`. Use a temporary redirect while verifying and switch to `308` only after it passes. Do not leave `www` pointed at Hostinger.

Verify from outside the logged-in Cloudflare session:

```sh
curl --fail --show-error --silent https://scwlkr.com/api/health
curl --head --fail --show-error https://scwlkr.com/
curl --head --show-error https://www.scwlkr.com/
```

Then repeat the two-browser persistence check over `https://scwlkr.com`. Confirm the WebSocket connects over `wss://`, the static response has the expected security headers, and `www` reaches the apex without a loop.

Observe errors, WebSocket connections, and mutation failures for at least 30 minutes before declaring cutover healthy. Keep the pre-cutover DNS snapshot until the site has remained healthy for 24 hours.

## Application rollback

A bad static or Worker release should be rolled back at the Worker layer; DNS should stay attached.

```sh
npx wrangler deployments list
npx wrangler rollback VERSION_ID --message "rollback: REASON"
```

After rollback, repeat the health, two-browser, and reload-persistence checks. A rollback changes code and assets only. It does not revert Durable Object SQLite or R2, so do not roll back across an incompatible storage migration.

## Domain rollback

Use domain rollback only when the custom-domain route or certificate is the failure:

1. Remove the `scwlkr.com` custom domain from the Worker.
2. Restore the exact apex and `www` records from the pre-cutover snapshot.
3. Verify the restored destination over HTTPS.
4. Keep the Worker available on `workers.dev` for diagnosis.

Never delete the Durable Object namespace or `scwlkr-room-archive` as part of rollback.
