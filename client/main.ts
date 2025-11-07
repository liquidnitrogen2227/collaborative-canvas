import { CanvasPad } from './canvas.ts';
import { WSClient } from './websocket.ts';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const sizeInput = document.getElementById('size') as HTMLInputElement;
const colorInput = document.getElementById('color') as HTMLInputElement;
const clearBtn = document.getElementById('clear') as HTMLButtonElement;

function fitCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

const pad = new CanvasPad(canvas);
const ws = new WSClient();

let isDown = false;
// Active local stroke id
let currentStrokeId: string | null = null;
// Track remote partial strokes separately to avoid merging with local path
const remoteActive = new Map<string, { strokeId: string; color: string; size: number; lastX: number; lastY: number }>();

const getOpts = () => ({ color: colorInput.value, size: Number(sizeInput.value) });

canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  isDown = true;
  const opts = getOpts();
  // End any previous local stroke to reset path
  pad.end();
  currentStrokeId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8);
  pad.begin(x, y, opts);
  ws.emit('draw:begin', { strokeId: currentStrokeId, x, y, ...opts });
});

canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  ws.emit('cursor', { x, y });
  if (!isDown) return;
  pad.point(x, y);
  if (currentStrokeId) ws.emit('draw:point', { strokeId: currentStrokeId, x, y });
});

canvas.addEventListener('pointerup', () => {
  if (!isDown) return;
  isDown = false;
  pad.end();
  if (currentStrokeId) {
    ws.emit('draw:end', { strokeId: currentStrokeId });
    currentStrokeId = null;
  }
});

clearBtn.addEventListener('click', () => {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// Remote events
ws.on('draw:begin', ({ strokeId, x, y, color, size, userId }) => {
  // Ignore echo of own stroke (will appear because server broadcasts)
  if (userId === (ws as any).socket?.id) return;
  // Begin a remote stroke as an isolated path (draw segment-by-segment)
  remoteActive.set(strokeId, { strokeId, color, size, lastX: x, lastY: y });
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
});

ws.on('draw:point', ({ strokeId, x, y, userId }) => {
  if (userId === (ws as any).socket?.id) return;
  const entry = remoteActive.get(strokeId);
  if (!entry) return;
  const ctx = canvas.getContext('2d')!;
  ctx.lineTo(x, y);
  ctx.stroke();
  entry.lastX = x; entry.lastY = y;
});

ws.on('draw:end', ({ strokeId, userId }) => {
  if (userId === (ws as any).socket?.id) return;
  const entry = remoteActive.get(strokeId);
  if (!entry) return;
  const ctx = canvas.getContext('2d')!;
  ctx.closePath();
  remoteActive.delete(strokeId);
});
