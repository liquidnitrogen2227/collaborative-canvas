import express from 'express';
import http from 'http';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import { Server } from 'socket.io';
import { Rooms } from './rooms';
import { appendPoint, beginStroke, endStroke, redo, snapshot, undo } from './drawing-state';

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.disable('x-powered-by');

// Serve static client
const clientDir = path.join(process.cwd(), 'client');
app.use(express.static(clientDir));

// Health
app.get('/healthz', (_req, res) => res.json({ ok: true }));

const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: false } });
const rooms = new Rooms();

io.on('connection', (socket) => {
  let roomId = 'lobby';
  let name = `User-${socket.id.slice(0, 4)}`;
  let color = `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;

  function broadcastUsers() {
    const r = rooms.get(roomId);
    const users = [...r.users.values()];
    io.to(roomId).emit('user:list', users);
  }

  socket.on('user:join', (p: { roomId?: string; name?: string; color?: string }) => {
    roomId = p.roomId || 'lobby';
    name = p.name || name;
    color = p.color || color;
    socket.join(roomId);
    const r = rooms.addUser(roomId, { id: socket.id, name, color });
    // send snapshot to joiner
    socket.emit('snapshot', snapshot(r));
    broadcastUsers();
  });

  // Stroke streaming
  socket.on('stroke:begin', (p: { strokeId: string; tool: 'brush'|'eraser'; color: string; size: number; x: number; y: number }) => {
    const r = rooms.get(roomId);
    beginStroke(r, p.strokeId, socket.id, p.tool, p.color, p.size, p.x, p.y);
    socket.to(roomId).emit('stroke:begin', { userId: socket.id, ...p });
  });
  socket.on('stroke:point', (p: { strokeId: string; x: number; y: number }) => {
    const r = rooms.get(roomId);
    appendPoint(r, p.strokeId, p.x, p.y);
    socket.to(roomId).emit('stroke:point', { userId: socket.id, ...p });
  });
  socket.on('stroke:end', (p: { strokeId: string }) => {
    const r = rooms.get(roomId);
    const op = endStroke(r, p.strokeId);
    if (op) io.to(roomId).emit('op:commit', op);
    socket.to(roomId).emit('stroke:end', { userId: socket.id, ...p });
  });

  socket.on('op:undo', () => {
    const r = rooms.get(roomId);
    const changed = undo(r);
    if (changed) io.to(roomId).emit('state:snapshot', snapshot(r));
  });
  socket.on('op:redo', () => {
    const r = rooms.get(roomId);
    const changed = redo(r);
    if (changed) io.to(roomId).emit('state:snapshot', snapshot(r));
  });

  socket.on('cursor', (p: { x: number; y: number }) => {
    const r = rooms.get(roomId);
    const me = r.users.get(socket.id);
    socket.to(roomId).emit('cursor', { userId: socket.id, name: me?.name, color: me?.color, ...p });
  });

  socket.on('disconnect', () => {
    rooms.removeUser(roomId, socket.id);
    broadcastUsers();
  });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
httpServer.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});
