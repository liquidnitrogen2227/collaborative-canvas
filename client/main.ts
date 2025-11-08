import { WSClient, StrokeOp, User } from './websocket.ts';
import { CanvasLayers } from './renderer.ts';

const base = document.getElementById('base') as HTMLCanvasElement;
const live = document.getElementById('live') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLCanvasElement;
const sizeInput = document.getElementById('size') as HTMLInputElement;
const colorInput = document.getElementById('color') as HTMLInputElement;
const undoBtn = document.getElementById('undo') as HTMLButtonElement;
const redoBtn = document.getElementById('redo') as HTMLButtonElement;
const clearBtn = document.getElementById('clear') as HTMLButtonElement;
const clearGlobalBtn = document.getElementById('clear-global') as HTMLButtonElement;
const usersSpan = document.getElementById('users') as HTMLSpanElement;
const brushBtn = document.getElementById('tool-brush') as HTMLButtonElement;
const eraserBtn = document.getElementById('tool-eraser') as HTMLButtonElement;
const lineBtn = document.getElementById('tool-line') as HTMLButtonElement;
const rectBtn = document.getElementById('tool-rect') as HTMLButtonElement;
const ellipseBtn = document.getElementById('tool-ellipse') as HTMLButtonElement;
const toggleToolbarBtn = document.getElementById('toggle-toolbar') as HTMLButtonElement | null;
const toolbar = document.getElementById('toolbar') as HTMLDivElement;

const layers = new CanvasLayers(base, live, hud);
const ws = new WSClient();

let tool: 'brush' | 'eraser' | 'line' | 'rect' | 'ellipse' = 'brush';
function setTool(t: 'brush'|'eraser'|'line'|'rect'|'ellipse') {
  tool = t;
  brushBtn.classList.toggle('active', t === 'brush');
  eraserBtn.classList.toggle('active', t === 'eraser');
  lineBtn.classList.toggle('active', t === 'line');
  rectBtn.classList.toggle('active', t === 'rect');
  ellipseBtn.classList.toggle('active', t === 'ellipse');
}
brushBtn.addEventListener('click', () => setTool('brush'));
eraserBtn.addEventListener('click', () => setTool('eraser'));
lineBtn.addEventListener('click', () => setTool('line'));
rectBtn.addEventListener('click', () => setTool('rect'));
ellipseBtn.addEventListener('click', () => setTool('ellipse'));

// Show toggle button on small screens
function updateToggleVisibility() {
  if (!toggleToolbarBtn) return;
  const show = window.innerWidth < 700;
  toggleToolbarBtn.style.display = show ? 'inline-block' : 'none';
  if (!show) toolbar.classList.remove('collapsed');
}
updateToggleVisibility();
window.addEventListener('resize', updateToggleVisibility);
toggleToolbarBtn?.addEventListener('click', () => {
  toolbar.classList.toggle('collapsed');
});

let isDown = false;
let currentStrokeId: string | null = null;
let lastPoint: { x: number; y: number } | null = null;
const localPoints: { x: number; y: number }[] = [];

function genId() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8); }
function size() { return Number(sizeInput.value); }
function color() { return colorInput.value; }

function pointerPos(e: PointerEvent) {
  return { x: e.clientX, y: e.clientY };
}

hud.addEventListener('pointerdown', (e) => { e.preventDefault(); }); // prevent text selection
live.addEventListener('pointerdown', (e) => { e.preventDefault(); });
base.addEventListener('pointerdown', (e) => {
  const p = pointerPos(e);
  isDown = true;
  currentStrokeId = genId();
  lastPoint = p;
  localPoints.length = 0; localPoints.push(p);
  ws.emit('stroke:begin', { strokeId: currentStrokeId, tool, color: color(), size: size(), x: p.x, y: p.y });
  // Ensure we keep receiving events even if finger/mouse leaves canvas slightly
  try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch {}
});

window.addEventListener('pointermove', (e) => {
  const p = pointerPos(e);
  ws.emit('cursor', { x: p.x, y: p.y });
  if (!isDown || !currentStrokeId || !lastPoint) return;
  // live preview: brush -> live layer; eraser -> base; shapes -> HUD preview (do not mark incremental for shapes)
  if (tool === 'brush') {
    layers.drawLiveSegment(tool, color(), size(), lastPoint, p);
  } else if (tool === 'eraser') {
    layers.drawBaseSegment(tool, color(), size(), lastPoint, p);
    if (currentStrokeId) incrementalApplied.add(currentStrokeId);
  } else { // shape tools
    layers.setShapePreview(currentStrokeId, tool, color(), size(), localPoints[0], p);
  }
  localPoints.push(p);
  ws.emit('stroke:point', { strokeId: currentStrokeId, x: p.x, y: p.y });
  lastPoint = p;
});

window.addEventListener('pointerup', (e) => {
  if (!isDown) return;
  isDown = false;
  if (currentStrokeId) {
    ws.emit('stroke:end', { strokeId: currentStrokeId });
    if (tool === 'line' || tool === 'rect' || tool === 'ellipse') {
      const op: StrokeOp = {
        id: currentStrokeId,
        userId: ws.id() || 'me',
        tool,
        color: color(),
        size: size(),
        points: [...localPoints],
        ts: Date.now(),
      };
      layers.applyCommittedOp(op);
      incrementalApplied.add(op.id);
      layers.clearAllPreviews?.();
    }
    currentStrokeId = null;
    lastPoint = null;
    localPoints.length = 0;
    layers.clearLive();
  }
  // Release pointer capture if applied
  try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
});

// Prevent iOS Safari from triggering pull-to-refresh / scroll during drawing
document.addEventListener('touchmove', (ev) => {
  if (isDown) ev.preventDefault();
}, { passive: false });

// Handle orientation changes explicitly (resize event already adjusts, but we can trigger manual flush)
window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    layers['replay']?.(history); // re-render after resize
  }, 50);
});

undoBtn.addEventListener('click', () => ws.emit('op:undo'));
redoBtn.addEventListener('click', () => ws.emit('op:redo'));
clearBtn.addEventListener('click', () => { layers.clearBase(); layers.clearLive(); layers.clearAllPreviews?.(); });
clearGlobalBtn.addEventListener('click', () => ws.emit('op:clear'));

window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { ws.emit('op:undo'); e.preventDefault(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { ws.emit('op:redo'); e.preventDefault(); }
});

// Maintain active remote strokes local reconstruction for smoother live lines
const remoteLast = new Map<string, { x: number; y: number; tool: 'brush'|'eraser'|'line'|'rect'|'ellipse'; color: string; size: number }>();
const remoteOrigin = new Map<string, { x: number; y: number }>();
ws.on('stroke:begin', ({ strokeId, tool, color, size, x, y, userId }) => {
  if (userId === ws.id()) return;
  remoteLast.set(strokeId, { x, y, tool, color, size });
  remoteOrigin.set(strokeId, { x, y });
});

ws.on('stroke:point', ({ strokeId, x, y, userId }) => {
  if (userId === ws.id()) return;
  const last = remoteLast.get(strokeId); if (!last) return;
  if (last.tool === 'brush' || last.tool === 'eraser') {
    layers.drawBaseSegment(last.tool, last.color, last.size, { x: last.x, y: last.y }, { x, y });
    incrementalApplied.add(strokeId); // only mark base-applied strokes
  } else {
    // remote shape preview; anchor is first point stored at stroke begin
    const origin = remoteOrigin.get(strokeId) || { x: last.x, y: last.y };
    layers.setShapePreview(strokeId, last.tool, last.color, last.size, origin, { x, y });
  }
  last.x = x; last.y = y;
});
ws.on('stroke:end', ({ strokeId, userId }) => {
  if (userId === ws.id()) return;
  remoteLast.delete(strokeId);
  remoteOrigin.delete(strokeId);
  layers.clearPreview(strokeId);
  // live canvas will be cleared after commit event
});

// Commit operations update base canvas
const history: StrokeOp[] = [];
const incrementalApplied = new Set<string>();
function redraw() { layers.replay(history); }

ws.on('op:commit', (op) => {
  history.push(op);
  if (incrementalApplied.has(op.id)) {
    // already drawn incrementally
    incrementalApplied.delete(op.id);
  } else {
    layers.applyCommittedOp(op);
  }
  layers.clearLive();
});
ws.on('snapshot', (snap) => { history.length = 0; history.push(...snap.history); layers.clearAllPreviews?.(); redraw(); });
ws.on('state:snapshot', (snap) => { history.length = 0; history.push(...snap.history); layers.clearAllPreviews?.(); redraw(); });

ws.on('user:list', (users: User[]) => {
  usersSpan.textContent = users.map(u => u.name).join(', ');
});

ws.on('cursor', (p) => {
  if (!p.userId) return;
  layers.setCursor(p.userId, p.x, p.y, p.color || '#333', p.name || 'User');
});

// Join default room
ws.emit('user:join', {});
