# Collaborative Canvas (TypeScript + Socket.io)

Real-time multi-user drawing with brush/eraser, colors, stroke width, live cursors, and global undo/redo. Vanilla Canvas on the frontend and Node.js + Socket.io on the backend. No frameworks.

## Quick start

```powershell
npm install
npm start
```

Then open two browser windows to http://localhost:3000 and draw.

## What’s included

- server/server.ts – Express + Socket.io server; serves static client and manages protocol
- server/rooms.ts – simple in-memory room + user registry
- server/drawing-state.ts – authoritative stroke history with global undo/redo
- client/index.html – layered canvases (base/live/hud) + toolbar
- client/style.css – minimal styles
- client/renderer.ts – multi-layer canvas renderer (no path bridging)
- client/websocket.ts – typed Socket.io client
- client/main.ts – tool handling, streaming, state replay, cursors, undo/redo
- tsconfig.server.json – TypeScript config for server build (CommonJS, dist/)
- render.yaml – Render.com blueprint (server + client on one origin)
- package.json – scripts: build, dev, start

## Scripts

- npm run dev – start TS server (watch) and client bundler (watch)
- npm run build – compile server and bundle client
- npm start – build then run server from dist (for local Node server)

## Testing multi-user

Open two tabs at http://localhost:3000 and draw. You’ll see live strokes and cursors across tabs. Use Ctrl+Z / Ctrl+Y or toolbar buttons for global undo/redo.

## Notes / Limitations

- In-memory history only (no persistence). Deploying multiple instances would need shared state (e.g., Redis pub/sub + store).
- Global undo/redo is LIFO across all users (last operation wins), by design per assignment.
- Collision/conflict resolution is server-order based. Eraser uses compositing to non-destructively remove pixels from prior ops.

## Deploy to Render (recommended for realtime)

This app is designed to run server and client on the same origin (best for Socket.io).

1) Fork/clone this repo.
2) Create a new Web Service on Render and connect your repo.
	- Build Command: `npm run build`
	- Start Command: `node dist/server/server.js`
	- Health Check Path: `/healthz`
3) Deploy. Render sets `PORT` automatically; the server will pick it up.
4) Open your Render URL in two browser tabs and draw—strokes should sync in real time.

Optional: You can also use `render.yaml` in this repo to spin up the service via “Blueprints” on Render.
- Security hardening (CSP, rate limiting) is pared down for simplicity; add per your deployment needs.

## Time spent

Initial scaffold → realtime → dual-canvas fix → tools/undo/redo/cursors/internals: ~4–6 hours.