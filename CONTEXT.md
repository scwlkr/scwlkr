# One-Room Internet context

## Product boundary

The One-Room Internet is the entire public experience at `scwlkr.com`. Every visitor enters the same canonical `Room`, `ROOM_1`. There are no accounts, profiles, feeds, portfolios, lobbies, private rooms, scores, uploads, or conventional navigation.

The product line is `LEAVING PEOPLE TO THEIR OWN DEVICES.` The room itself is the explanation.

## Domain vocabulary

- **Room**: the single shared place and authoritative state boundary.
- **Visitor**: an anonymous participant with a whimsical display name and a private device cookie.
- **Drawing**: a bounded vector-like stroke that consumes replenishing ink.
- **Note**: a short plain-text artifact placed on a room surface.
- **Object**: a crude artifact assembled from a constrained shape and color set.
- **Fixture**: a built-in part of the Room. Fixtures cannot be removed; the light has shared state.
- **Artifact**: a persistent drawing, note, or object with a stable ID, lifecycle, spatial payload, and revision.
- **Mutation**: a client request that the Room accepts or rejects, orders, stores, and broadcasts.
- **Presence**: ephemeral connection state. It is not an Artifact and disappears when a Visitor disconnects.
- **Archive**: retained cold history written to R2 before aged Artifacts leave active Room state.
- **Quarantine**: a reversible operator action that removes an Artifact from ordinary Room state while retaining an audit record.

## Invariants

1. `ROOM_1` is the only public Room. All HTTP and WebSocket traffic resolves to the same named Durable Object.
2. The Durable Object is authoritative for mutation acceptance, quotas, ordering, revisions, and conflict resolution.
3. Presence is live and disposable. Artifacts, fixtures, quotas, mutation receipts, reports, and moderation audit records are durable.
4. A Visitor token is private. Public snapshots and broadcasts expose a temporary presence ID and display name, never the persistent token.
5. Accepted mutations are idempotent by mutation ID. Full results remain replayable for seven days; after that, the ID remains tombstoned and rejected through 30 days from the original acceptance. Reconnect and replay inside that window must not duplicate an action.
6. Ordinary Visitors cannot permanently delete Artifacts. Moderation is reversible. Aging and compaction archive data to R2 before removing it from active state.
7. Built-in Fixtures and safety boundaries remain usable even when Visitors behave badly.
8. Audio is opt-in. Keyboard, touch, narrow screens, and reduced-motion preferences remain supported.
9. Incorrect shared state is never an acceptable performance fallback.
10. Preview and production never share their Durable Object namespace, R2 Archive, or edge rate-limit counters.
11. The Visitor authentication cookie is private capability material. Public Artifacts omit it, while moderation and cold Archive provenance use a separate non-authenticating Visitor reference.

## Primary acceptance seam

Two isolated browser clients enter `ROOM_1`. One changes the Room; both observe the same accepted result; a reload still observes that result. The browser contract also covers identity continuity, occupancy, drawing, notes, objects, movement conflicts, the light Fixture, quotas, reconnect reconciliation, moderation, keyboard access, reduced motion, and narrow touch screens.

Pure unit tests are reserved for bounded domain rules. Runtime integration tests verify Durable Object persistence and WebSocket behavior. The initial operational target is at least 50 simultaneous Visitors.

The first-release protective budgets are 64 simultaneous Room connections; edge limits of 60 session requests, 120 WebSocket admissions, and 60 diagnostic reads per IP per minute per Cloudflare location; and Room-window limits of 2,500 session requests, 2,500 WebSocket admissions, 10,000 diagnostic reads, 1,500,000 leased handled frames, 4,000 unique mutation attempts, and 500 new Artifacts. Hashed network actors are further limited to 100 new sessions, 30 WebSocket admissions per minute and 200 per Room day, 80,000 leased handled frames, and 400 unique mutation attempts per Room day. The final 100 new-session slots and final 500 WebSocket-admission slots are reserved one-per-new-network-actor. Frame capacity is leased in 100-frame chunks. The browser sends a heartbeat every 60 seconds, paces cursor frames at `max(250 ms, occupancy × 20 ms)` (one second at 50 Visitors), and limits drawing previews to one every 250 ms; the Room coalesces ephemeral fan-out every 100 ms without dropping durable mutations. These are availability guardrails, not product scores or user-visible goals.

## Runtime map

The browser receives Static Assets from the Worker. The same Worker validates browser origin, applies per-actor session and WebSocket admission limits, and forwards `/api/*` and `/ws` to the named `ROOM_1` Durable Object. The Durable Object stores active state in SQLite, broadcasts realtime state over hibernatable WebSockets, and writes aged batches to the environment's private R2 Archive.

See [ADR 0001](./docs/adr/0001-cloudflare-one-room-runtime.md) for the decision and consequences.
