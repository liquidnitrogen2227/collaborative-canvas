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

const getOpts = () => ({ color: colorInput.value, size: Number(sizeInput.value) });

canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  isDown = true;
  const opts = getOpts();
  pad.begin(x, y, opts);
  ws.emit('draw:begin', { x, y, ...opts });
});

canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  ws.emit('cursor', { x, y });
  if (!isDown) return;
  pad.point(x, y);
  ws.emit('draw:point', { x, y });
});

canvas.addEventListener('pointerup', () => {
  if (!isDown) return;
  isDown = false;
  pad.end();
  ws.emit('draw:end', {});
});

clearBtn.addEventListener('click', () => {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
});

// Remote events
ws.on('draw:begin', ({ x, y, color, size }) => pad.begin(x, y, { color, size }));
ws.on('draw:point', ({ x, y }) => pad.point(x, y));
ws.on('draw:end', () => pad.end());
