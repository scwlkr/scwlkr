# ADR 0001: Cloudflare one-room runtime

- Status: Accepted
- Date: 2026-07-26
- Decision owners: scwlkr

## Context

The One-Room Internet needs one canonical shared state, realtime fan-out, reload persistence, server-side quotas and conflict resolution, reversible moderation, and cold archival. The initial target is at least 50 simultaneous Visitors. The public client is a small static browser application, and the operating budget should remain inside Cloudflare's free allowances when traffic permits.

Splitting room authority among independent stateless instances would require an additional coordination layer and would make conflicting room histories possible. Keeping hot history forever in the realtime state store would also make the Room progressively heavier.

## Decision

Use one production Cloudflare Worker, proven first in an isolated preview Worker, with three runtime responsibilities:

1. **Static Assets** serves the entry surface and Room client from `public/`.
2. **One SQLite Durable Object**, reached by the stable name `ROOM_1`, owns all live WebSockets and authoritative active state. It serializes accepted Mutations, enforces quotas and spatial bounds, stores active Artifacts and audit records, and broadcasts accepted results.
3. **One private R2 bucket per environment** stores dated JSON archive batches: `scwlkr-room-preview-archive` for preview and `scwlkr-room-archive` for production. The Durable Object writes a batch successfully before deleting those Artifacts from active SQLite state and records the R2 object key in its archive index.

The Worker handles `/api/*` and `/ws` before Static Assets. It rejects cross-origin browser mutations and applies per-`CF-Connecting-IP`, per-Cloudflare-location edge limits of 60 session requests, 120 WebSocket requests, and 60 diagnostic reads per minute before forwarding allowed traffic to `ROOM_1`. Missing IP headers bypass the edge counter so local and non-Cloudflare development works. All other paths fall through to the browser application. Static Assets and Worker code deploy as one version.

The anonymous Visitor cookie is `Secure`, `HttpOnly`, `SameSite=Strict`, and scoped to the host. Operator moderation uses a Worker secret named `MODERATOR_TOKEN`; it is never a plaintext config variable.

Inside `ROOM_1`, a non-raw hash of `CF-Connecting-IP` supplies bounded per-actor connection, session, WebSocket-admission, frame, and mutation budgets. Daily actor counters are private operational state and expire after their window; Artifacts and public events never contain them. Room-wide 24-hour windows cap session endpoint requests at 2,500, WebSocket admissions at 2,500, diagnostic reads at 10,000, and leased handled frames at 1,500,000. Frame capacity is leased 100 at a time and each hashed actor receives at most 80,000 leased frames per Room day. Durable mutation frames are never silently discarded by ephemeral coalescing.

Accepted mutation results remain replayable for seven days. Maintenance then retains a tombstone that rejects the same mutation ID through 30 days from its original acceptance, after which replay protection is no longer guaranteed.

## Consequences

- A single named Durable Object gives `ROOM_1` one ordered history and removes cross-node conflict coordination from the first release.
- WebSocket hibernation allows idle connections without keeping the object continuously active.
- Edge rate limiting is a permissive, per-location abuse brake rather than exact accounting. Preview and production use separate rate-limit namespace IDs; shared-IP networks can share one counter.
- At 1,500,000 incoming handled frames and Cloudflare's 20:1 WebSocket-message billing ratio, the Room reserves at most 75,000 Durable Object request equivalents for accepted frame leases. The 10,000-read, 2,500-session-request, and 2,500-WebSocket-admission budgets bring normal accepted application work to at most 90,000 before alarms and operational headroom. Requests rejected after a Room budget is exhausted have already reached the Durable Object and are not included in that total.
- The browser heartbeat is 60 seconds. Cursor pacing is `max(250 ms, occupancy × 20 ms)`, which is one second at 50 Visitors; live drawing previews are limited to 250 ms and the Room coalesces ephemeral fan-out every 100 ms.
- The shared light accepts at most one state change per 1.5 seconds. This keeps a global fixture event below flashing thresholds even before local muting and reduced-motion behavior are considered.
- The budgets can deliberately stop heavy realtime activity before Cloudflare's UTC allowance reset. Per-location edge counters and hashed-IP actor limits reduce ordinary abuse, but a sufficiently distributed attack can still bill rejected Durable Object requests and exhaust the account allowance; this is a documented Free-plan availability tradeoff.
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
