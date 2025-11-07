import express from 'express';
import http from 'http';
import helmet from 'helmet';
import compression from 'compression';
import path from 'path';
import { Server } from 'socket.io';

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

io.on('connection', (socket) => {
  // Relay draw events to others
  socket.on('draw:begin', (p) => socket.broadcast.emit('draw:begin', { userId: socket.id, ...p }));
  socket.on('draw:point', (p) => socket.broadcast.emit('draw:point', { userId: socket.id, ...p }));
  socket.on('draw:end', (p) => socket.broadcast.emit('draw:end', { userId: socket.id, ...p }));

  socket.on('cursor', (p) => socket.broadcast.emit('cursor', { userId: socket.id, ...p }));
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
httpServer.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});
