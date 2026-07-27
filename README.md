# One-Room Internet

`scwlkr.com` is one permanent shared room. Anonymous visitors enter `ROOM_1`, see who is present, and leave drawings, notes, objects, and fixture changes that remain after they leave.

The implementation is intentionally small:

- one Cloudflare Worker serves the static browser client and routes `/api/*` and `/ws`;
- one SQLite-backed Durable Object named `ROOM_1` orders realtime mutations and stores active room state;
- one private R2 bucket per deployed environment receives cold archives before old artifacts leave active state: `scwlkr-room-preview-archive` for preview and `scwlkr-room-archive` for production.

The domain contract and vocabulary are in [CONTEXT.md](./CONTEXT.md). The runtime decision is recorded in [ADR 0001](./docs/adr/0001-cloudflare-one-room-runtime.md).

## Local development

Requirements: Node.js 22 or newer and npm.

```sh
npm ci
npx playwright install chromium firefox webkit
npm run dev
```

Wrangler serves the application at `http://127.0.0.1:8787` by default and emulates the Durable Object and R2 bindings locally.

Run the complete release gate, including Chromium, Firefox, and WebKit:

```sh
npm run release:check
```

For a faster non-browser loop:

```sh
npm run check
```

With the development server running, exercise the initial 50-visitor target:

```sh
BASE_URL=http://127.0.0.1:8787 CLIENTS=50 npm run load:test
```

## Deploy

Production is Cloudflare Workers with Static Assets, Durable Objects, and R2. Preview and production use different Worker names, Durable Object namespaces, rate-limit namespaces, and R2 buckets. Both deployments require the `MODERATOR_TOKEN` secret; never commit or print it.

```sh
npx wrangler login
npx wrangler r2 bucket create scwlkr-room-preview-archive
npx wrangler r2 bucket create scwlkr-room-archive
npm run deploy:preview
```

Provision the preview secret directly from 1Password, then run mutating browser and 50-Visitor proof only against preview. Production proof is read-only (`npm run verify:public`) plus one real owner browser entry; it never seeds fake Artifacts. The exact secret commands, deployment order, custom-domain cutover, verification, and rollback procedure are in [the deployment runbook](./docs/runbooks/deploy-and-cutover.md). Readiness monitoring, moderation safety, budgets, archival, and incident handling are in [the operations runbook](./docs/runbooks/operations.md).
