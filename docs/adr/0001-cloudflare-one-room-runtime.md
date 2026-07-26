# ADR 0001: Cloudflare one-room runtime

- Status: Accepted
- Date: 2026-07-26
- Decision owners: scwlkr

## Context

The One-Room Internet needs one canonical shared state, realtime fan-out, reload persistence, server-side quotas and conflict resolution, reversible moderation, and cold archival. The initial target is at least 50 simultaneous Visitors. The public client is a small static browser application, and the operating budget should remain inside Cloudflare's free allowances when traffic permits.

Splitting room authority among independent stateless instances would require an additional coordination layer and would make conflicting room histories possible. Keeping hot history forever in the realtime state store would also make the Room progressively heavier.

## Decision

Use one Cloudflare Worker deployment with three runtime responsibilities:

1. **Static Assets** serves the entry surface and Room client from `public/`.
2. **One SQLite Durable Object**, reached by the stable name `ROOM_1`, owns all live WebSockets and authoritative active state. It serializes accepted Mutations, enforces quotas and spatial bounds, stores active Artifacts and audit records, and broadcasts accepted results.
3. **One private R2 bucket**, `scwlkr-room-archive`, stores dated JSON archive batches. The Durable Object writes a batch successfully before deleting those Artifacts from active SQLite state and records the R2 object key in its archive index.

The Worker handles `/api/*` and `/ws` before Static Assets. All other paths fall through to the browser application. Static Assets and Worker code deploy as one version.

The anonymous Visitor cookie is `Secure`, `HttpOnly`, `SameSite=Strict`, and scoped to the host. Operator moderation uses a Worker secret named `MODERATOR_TOKEN`; it is never a plaintext config variable.

## Consequences

- A single named Durable Object gives `ROOM_1` one ordered history and removes cross-node conflict coordination from the first release.
- WebSocket hibernation allows idle connections without keeping the object continuously active.
- SQLite is hot state; R2 is cold history. R2 is not a second live database and does not automatically restore archived Artifacts to the Room.
- The one-object design has a deliberate scaling ceiling. Measure connection saturation and mutation latency before introducing sharding; multiple public Rooms are outside the product contract.
- Durable Object storage migrations must remain backward compatible with deployed code. A Worker rollback does not roll back SQLite or R2 data.
- A failed archive write must leave the corresponding Artifacts in active SQLite state. Operators must not manually delete the Durable Object or R2 bucket during recovery.
- Deployment remains one unit, while domain cutover remains reversible because the Worker is first proven on `workers.dev`.

## Alternatives rejected

- **Static hosting plus a separate realtime provider:** adds an external state authority, another deployment surface, and more credentials without improving the one-Room contract.
- **KV or R2 as live Room state:** neither supplies the single ordered mutation boundary required for collaborative movement and quota enforcement.
- **D1 plus stateless WebSocket Workers:** requires explicit fan-out and concurrency coordination that the named Durable Object already provides.
- **One Durable Object per Visitor or region:** fragments the canonical Room and makes state reconciliation the core system problem.
