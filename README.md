# One-Room Internet

`scwlkr.com` is one permanent shared room. Anonymous visitors enter `ROOM_1`, see who is present, and leave drawings, notes, objects, and fixture changes that remain after they leave.

The implementation is intentionally small:

- one Cloudflare Worker serves the static browser client and routes `/api/*` and `/ws`;
- one SQLite-backed Durable Object named `ROOM_1` orders realtime mutations and stores active room state;
- one private R2 bucket, `scwlkr-room-archive`, receives cold archives before old artifacts leave active state.

The domain contract and vocabulary are in [CONTEXT.md](./CONTEXT.md). The runtime decision is recorded in [ADR 0001](./docs/adr/0001-cloudflare-one-room-runtime.md).

## Local development

Requirements: Node.js 22 or newer and npm.

```sh
npm ci
npx playwright install chromium
npm run dev
```

Wrangler serves the application at `http://127.0.0.1:8787` by default and emulates the Durable Object and R2 bindings locally.

Run the deterministic checks:

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Or run the non-browser checks together:

```sh
npm run check
```

With the development server running, exercise the initial 50-visitor target:

```sh
BASE_URL=http://127.0.0.1:8787 CLIENTS=50 npm run load:test
```

## Deploy

Production is Cloudflare Workers with Static Assets, Durable Objects, and R2. A first deployment needs the R2 bucket and the `MODERATOR_TOKEN` Worker secret. Never commit or print that token.

```sh
npx wrangler login
npx wrangler r2 bucket create scwlkr-room-archive
npm run deploy
npx wrangler secret put MODERATOR_TOKEN
```

The first deploy creates the Worker. Generate and save a random moderation credential in the password manager, then enter it only at Wrangler's hidden prompt. Setting the secret immediately creates and deploys a new version; keep the site on `workers.dev` while doing both. Prove that final generated deployment before attaching `scwlkr.com`. The complete deployment, custom-domain cutover, verification, and rollback procedure is in [the deployment runbook](./docs/runbooks/deploy-and-cutover.md). Health checks, moderation safety, archival, and incident handling are in [the operations runbook](./docs/runbooks/operations.md).
