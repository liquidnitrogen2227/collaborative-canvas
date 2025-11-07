# Collaborative Canvas (TypeScript minimal)

Simple real-time collaborative drawing using vanilla Canvas, Node.js, and Socket.io.

## Quick start

```powershell
npm install
npm start
```

Then open two browser windows to:
- http://localhost:3000 (local dev)

## What’s included

- server/server.ts – Express + Socket.io server; serves static client and relays events
- client/index.html – UI shell loading bundled script
- client/style.css – minimal styles
- client/canvas.ts – tiny canvas drawing helper
- client/websocket.ts – thin typed wrapper for socket.io-client
- client/main.ts – wires input events to canvas + websocket
- tsconfig.server.json – TypeScript config for server build (CommonJS, dist/)
- package.json – scripts: build, dev, start

## Scripts

- npm run dev – start TS server (watch) and client bundler (watch)
- npm run build – compile server and bundle client
- npm start – build then run server from dist (for local Node server)

## Testing multi-user

Open two tabs at http://localhost:3000 and draw. You should see strokes mirrored across tabs live. A small cursor broadcast is implemented too for presence.

## Notes / Limitations

- No persistence or undo/redo yet; this is a minimal working baseline.

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
- Brush only; eraser, tools, rooms, and global history are future work.
- Security hardening (CSP, rate limiting) is pared down for simplicity; add per your deployment needs.

## Time spent

Initial scaffold and verification automated by scripts (≈30–45 min on a fresh machine).