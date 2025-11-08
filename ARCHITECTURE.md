# Architecture Overview

## High-Level Design

Three layered canvases eliminate path interference during concurrent drawing:

- Base canvas: committed stroke history (replayed from authoritative server operations).
- Live canvas: transient segments for all active strokes (local + remote); cleared after each commit or history change.
- HUD canvas: continuously renders user cursors & labels (presence layer).

This decouples in-progress path construction from committed pixels, removing race conditions and bridging lines between simultaneous users.

## Data Flow

Client pointer events generate streaming stroke messages:

1. User presses pointer: generate `stroke:begin` (strokeId, tool, color, size, x, y) – server registers active stroke.
2. Pointer moves: emit `stroke:point` for each sampled point – server appends to active stroke.
3. Pointer releases: emit `stroke:end` – server finalizes stroke, pushes to history, broadcasts `op:commit` full stroke object.
4. Global operations: user triggers undo/redo – client emits `op:undo` / `op:redo`; server mutates history stacks and broadcasts `state:snapshot`.
5. Presence: every pointer move (drawing or not) sends `cursor` to share location + identity.
6. On join: client emits `user:join`; server responds with `snapshot` (existing history) and `user:list` (current participants).

## WebSocket Protocol (Authoritative Order)

Incoming (client -> server):
- `user:join` { roomId?, name?, color? }
- `stroke:begin` { strokeId, tool, color, size, x, y }
- `stroke:point` { strokeId, x, y }
- `stroke:end` { strokeId }
- `cursor` { x, y }
- `op:undo` {}
- `op:redo` {}

Outgoing (server -> clients):
- `snapshot` { history: StrokeOp[] } (initial join)
- `state:snapshot` { history: StrokeOp[] } (after undo/redo)
- `user:list` User[]
- `stroke:begin` { userId, strokeId, tool, color, size, x, y }
- `stroke:point` { userId, strokeId, x, y }
- `stroke:end` { userId, strokeId }
- `op:commit` StrokeOp (complete stroke after end)
- `cursor` { userId, name, color, x, y }

Ordering guarantees provided by Socket.io preserve stroke integrity; strokes are authoritative only after `op:commit`.

## Stroke & History Model

`StrokeOp`: { id, userId, tool, color, size, points[], ts }

Server keeps:
- `history[]`: committed strokes in chronological order.
- `redoStack[]`: strokes removed via undo for possible restoration.
- `active`: map of in-progress strokes receiving point updates.

Global Undo: pop last element of `history` (regardless of author) -> push to `redoStack` -> broadcast `state:snapshot`. Server enforces a maximum of 5 undo steps relative to the current head (no more than 5 entries in `redoStack`).
Global Redo: pop last from `redoStack` -> append to `history` -> broadcast `state:snapshot`. Redo is naturally limited by prior undos (max 5).
Snapshots trigger full replay on clients (clear base; re-render each stroke sequentially).

Eraser Tool: uses `globalCompositeOperation = 'destination-out'` during stroke replay, enabling non-destructive removal without altering underlying stroke data (logical inversion per segment).

## Conflict Resolution Strategy

Pixel conflicts (overlapping strokes) are resolved by temporal ordering: later strokes visually overlay earlier ones. Eraser strokes selectively punch holes by compositing, without mutating earlier stroke definitions. Since server is authoritative, divergent client predictions converge when commits or snapshots arrive.

Undo conflicts (two users undoing rapidly) are linearized by server order; only the latest operation sequence defines current visible state. Redo similarly respects stack order.

## Performance Decisions

- Live segments drawn per pointer move as independent tiny paths (segment from last point to new point) – avoids rebuilding large Path2D and prevents bridging.
- History replay uses straightforward lineTo iteration; can be optimized later (e.g., pre-render stroke bitmaps or incremental texture atlases) if stroke count grows large.
- Cursors rendered in a `requestAnimationFrame` loop; extremely lightweight.
- Eraser employs compositing instead of pixel scanning for O(n) stroke replay cost.
- No batching currently; low-latency direct emission suits modest concurrency. Future optimization: coalesce points per frame.

## Edge Cases & Handling

- Lost `stroke:end`: active stroke would remain; periodic cleanup (not yet implemented) could prune idle strokes by timestamp.
- Interleaved undo during active stroke: undo affects only committed strokes; active strokes unaffected until commit.
- Resize: base snapshot preserved; live/hud cleared (acceptable transient loss for in-progress visuals).
- Rapid tool switching mid-stroke: tool captured at `stroke:begin`; changes apply next stroke – avoids mixed-mode strokes.

## Future Enhancements

- Persistent storage (e.g., append-only stroke log in Redis / Postgres) & room sharding.
- Branch-aware undo (per-user stacks) or CRDT-based stroke sets for advanced multi-author semantics.
- Point smoothing (quadratic/catmull interpolation) & pressure sensitivity.
- Latency compensation (client-side prediction with reconciliation diffs).
- Differential snapshot compression (send only deltas after undo/redo).

## Security / Robustness (Deferred)

- Rate limiting per socket (stroke frequency) to mitigate spam.
- Validation of incoming payload shapes & bounds (e.g., clamp coordinates).
- Auth / identity tokens (out of scope per assignment).
