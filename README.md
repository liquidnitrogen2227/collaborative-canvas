# Collaborative Canvas (TypeScript + Socket.io)

Real-time multi-user drawing with brush/eraser, colors, stroke width, live cursors, and global undo/redo. Vanilla Canvas on the frontend and Node.js + Socket.io on the backend. No frameworks.

## Quick start

```powershell
npm install
npm start
```

Then open two browser windows to http://localhost:3000 and draw.

## What's included

- server/server.ts – Express + Socket.io server; serves static client and manages protocol
- server/rooms.ts – simple in-memory room + user registry
- server/drawing-state.ts – authoritative stroke history with global undo/redo
- client/index.html – layered canvases (base/live/hud) + toolbar + performance stats
- client/style.css – responsive styles with mobile optimizations
- Mobile-friendly responsive toolbar and high-DPI canvas rendering
- client/renderer.ts – multi-layer canvas renderer (no path bridging)
- client/websocket.ts – typed Socket.io client with reconnection handling
- client/main.ts – tool handling, streaming, state replay, cursors, undo/redo, FPS tracking
- tsconfig.server.json – TypeScript config for server build (CommonJS, dist/)
- render.yaml – Render.com blueprint (server + client on one origin)
- package.json – scripts: build, dev, start

## Features

### Real-time Collaboration
- Live stroke streaming (point-by-point)
- User presence with colored cursors and names
- Join/leave notifications via toast messages
- Global undo/redo (affects all users)
- Multiple drawing tools (brush, eraser, line, rectangle, ellipse)

### Performance Monitoring
- **FPS Counter**: Real-time frames-per-second display (top-right corner)
- **Latency Display**: Shows ping time to server with color coding:
  - Green: < 50ms (excellent)
  - Orange: 50-100ms (good)
  - Red: > 100ms (poor)
- **Connection Status**: Visual indicator showing connection state:
  - Green dot: Connected
  - Red dot (pulsing): Disconnected
  - Orange dot (pulsing): Reconnecting

### Automatic Reconnection
- Socket.io handles automatic reconnection on network failures
- User credentials (name/color) preserved across reconnections
- Automatic room re-join after reconnection
- Visual feedback during connection state changes
- Fresh state snapshot requested after reconnection to ensure sync

## Scripts

- npm run dev – start TS server (watch) and client bundler (watch)
- npm run build – compile server and bundle client
- npm start – build then run server from dist (for local Node server)

## Testing multi-user

Open two tabs at http://localhost:3000 and draw. You'll see live strokes and cursors across tabs. Use Ctrl+Z / Ctrl+Y or toolbar buttons for global undo/redo.

## User Experience

### First Visit
1. Splash screen with rainbow animation (2 seconds)
2. Name input screen
3. Interactive tutorial (5 steps introducing tools)
4. Canvas ready to draw

### Returning Users
- Your name is saved in localStorage
- Splash screen and name input are skipped
- If you completed the tutorial before, you go straight to drawing
- If you skipped the tutorial, it shows again (you can complete it to not see it again)
- Simply reload the page to rejoin with your saved name

### Leave Session & Start Fresh
- Click the **Leave Session** button (🚪 icon) in the toolbar
- Confirms before clearing your saved name and tutorial progress
- Page reloads with full onboarding flow
- Perfect for switching to a different name or starting over

### Manual Reset (Alternative)
To reset via DevTools Console:
```javascript
localStorage.clear()
// Then reload the page
```

## Notes / Limitations

- In-memory history only (no persistence). Deploying multiple instances would need shared state (e.g., Redis pub/sub + store).
- Global undo/redo is LIFO across all users (last operation wins), capped at 5 consecutive undos to keep interactions snappy.
- Collision/conflict resolution is server-order based. Eraser uses compositing to non-destructively remove pixels from prior ops.

## Infinite canvas & navigation

- Pan (desktop): hold Space and drag, or use the mouse wheel (no Ctrl) to scroll/pan.
- Zoom (desktop): Ctrl + mouse wheel; zoom is centered under the pointer. Use the "Reset View" button to return to 100%.
- Pan/Zoom (mobile): two-finger pan and pinch-zoom. Single finger draws. The view keeps the content under your fingers stable while zooming.
- All strokes are stored in world coordinates and render correctly at any zoom level.

## Mobile compatibility

This app includes several mobile-focused improvements:

- Responsive toolbar that wraps on small screens and can be collapsed via a toggle button (appears under ~700px width).
- High-DPI rendering: canvases allocate device pixels and map CSS pixels through a transform for crisp results on Retina devices.
- Touch drawing refinements: pointer capture to avoid dropouts, `touch-action: none` to prevent scroll/zoom while drawing, and a guarded `touchmove` handler to stop pull-to-refresh during strokes. Two-finger pan and pinch-zoom are supported for the infinite canvas.
- Orientation changes and resizes preserve content by snapshotting and redrawing after canvas resize.

Future ideas:
- Optional Wake Lock to keep the screen on while collaborating.
  

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