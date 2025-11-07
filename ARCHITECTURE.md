# Architecture overview

## Data flow

1. Pointer events on the client produce a sequence of messages:
   - `draw:begin` { x, y, color, size }
   - `draw:point` { x, y }  (sent for each move while drawing)
   - `draw:end` {}
   - `cursor` { x, y } (presence signal on moves, regardless of drawing)
2. The server (Socket.io) relays each event from the source socket to all other sockets.
3. Receivers apply events onto their local Canvas context immediately for smoothness.

## WebSocket protocol

- draw:begin -> broadcast to others with { userId, x, y, color, size }
- draw:point -> broadcast to others with { userId, x, y }
- draw:end   -> broadcast to others with { userId }
- cursor     -> broadcast to others with { userId, x, y }

Messages are fire-and-forget to keep latency low. Ordering is generally preserved by Socket.io within a connection.

## Undo/redo (future work)

- Represent the canvas as an ordered list of operations (strokes with metadata).
- Global undo marks the last active op as undone (regardless of author); redo re-activates.
- Clients re-render from operations on reconciliation (server-sourced snapshot) or keep an incremental texture layer per op to avoid full redraws.

## Performance notes

- Client draws immediately on local canvas (client-side prediction) for responsiveness.
- Stream points instead of full paths for incremental rendering; batch via requestAnimationFrame if needed under heavy load.
- esbuild bundles the client for fast dev builds.

## Conflict resolution (future work)

- The minimal baseline simply overdraws strokes; later, layering per-operation enables eraser/tool semantics without destructive writes.