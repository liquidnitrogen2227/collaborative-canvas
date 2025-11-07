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
// Track remote partial strokes (strokeId -> path state)
const remoteActive = new Map<string, { strokeId: string; color: string; size: number }>();
// Maintain previous end point per stroke for validation (avoid automatic line bridging)
const strokeLastPoint = new Map<string, { x:number; y:number }>();

const getOpts = () => ({ color: colorInput.value, size: Number(sizeInput.value) });

canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  isDown = true;
  const opts = getOpts();
  // Always start a brand-new path; ensure we close any current one
  pad.end();
  currentStrokeId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8);
  pad.begin(x, y, opts);
  ws.emit('draw:begin', { strokeId: currentStrokeId, x, y, ...opts });
  strokeLastPoint.set(currentStrokeId, { x, y });
});

canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  ws.emit('cursor', { x, y });
  if (!isDown) return;
  // Draw local segment
  pad.point(x, y);
  if (currentStrokeId) ws.emit('draw:point', { strokeId: currentStrokeId, x, y });
  if (currentStrokeId) strokeLastPoint.set(currentStrokeId, { x, y });
});

canvas.addEventListener('pointerup', () => {
  if (!isDown) return;
  isDown = false;
  pad.end(); // close local path
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
  if (userId === ws.id()) return; // ignore own echo
  // Start independent path for remote stroke
  const ctx = canvas.getContext('2d')!;
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = size;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.moveTo(x, y);
  remoteActive.set(strokeId, { strokeId, color, size });
  strokeLastPoint.set(strokeId, { x, y });
});

ws.on('draw:point', ({ strokeId, x, y, userId }) => {
  if (userId === ws.id()) return;
  const entry = remoteActive.get(strokeId); if (!entry) return;
  const ctx = canvas.getContext('2d')!;
  const last = strokeLastPoint.get(strokeId);
  // If last is missing (rare) move then lineTo to avoid bridging from unrelated stroke
  if (!last) { ctx.moveTo(x, y); }
  ctx.lineTo(x, y);
  ctx.stroke();
  strokeLastPoint.set(strokeId, { x, y });
});

ws.on('draw:end', ({ strokeId, userId }) => {
  if (userId === ws.id()) return;
  if (!remoteActive.has(strokeId)) return;
  const ctx = canvas.getContext('2d')!;
  ctx.closePath();
  remoteActive.delete(strokeId);
  strokeLastPoint.delete(strokeId);
});

// Defensive: ensure no accidental bridging when a remote begin arrives during local draw
canvas.addEventListener('pointerdown', () => {
  // If any remote path is halfway rendered and local stroke starts, no need to close those (each has its own path) but ensure the primary pad path ended
  if (isDown) pad.end();
});
