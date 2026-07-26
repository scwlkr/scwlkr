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
5. Accepted mutations are idempotent by mutation ID. Reconnect and replay must not duplicate an action.
6. Ordinary Visitors cannot permanently delete Artifacts. Moderation is reversible. Aging and compaction archive data to R2 before removing it from active state.
7. Built-in Fixtures and safety boundaries remain usable even when Visitors behave badly.
8. Audio is opt-in. Keyboard, touch, narrow screens, and reduced-motion preferences remain supported.
9. Incorrect shared state is never an acceptable performance fallback.

## Primary acceptance seam

Two isolated browser clients enter `ROOM_1`. One changes the Room; both observe the same accepted result; a reload still observes that result. The browser contract also covers identity continuity, occupancy, drawing, notes, objects, movement conflicts, the light Fixture, quotas, reconnect reconciliation, moderation, keyboard access, reduced motion, and narrow touch screens.

Pure unit tests are reserved for bounded domain rules. Runtime integration tests verify Durable Object persistence and WebSocket behavior. The initial operational target is at least 50 simultaneous Visitors.

## Runtime map

The browser receives Static Assets from the Worker. The same Worker forwards `/api/*` and `/ws` to the named `ROOM_1` Durable Object. The Durable Object stores active state in SQLite, broadcasts realtime state over hibernatable WebSockets, and writes aged batches to the private R2 Archive.

See [ADR 0001](./docs/adr/0001-cloudflare-one-room-runtime.md) for the decision and consequences.
