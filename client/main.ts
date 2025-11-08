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
const resetViewBtn = document.getElementById('reset-view') as HTMLButtonElement | null;
const showUsersBtn = document.getElementById('show-users') as HTMLButtonElement | null;
const usersPanel = document.getElementById('users-panel') as HTMLDivElement | null;
const usersCloseBtn = document.getElementById('users-close') as HTMLButtonElement | null;
const usersList = document.getElementById('users-list') as HTMLUListElement | null;
const onboardingEl = document.getElementById('onboarding') as HTMLDivElement | null;
const onboardNameInput = document.getElementById('onboard-name') as HTMLInputElement | null;
const onboardStartBtn = document.getElementById('onboard-start') as HTMLButtonElement | null;

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
  setStageCursorForTool(tool);
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

// Users panel toggle
function setUsersPanelVisible(v: boolean) { if (!usersPanel) return; usersPanel.style.display = v ? 'block' : 'none'; }
showUsersBtn?.addEventListener('click', () => setUsersPanelVisible(true));
usersCloseBtn?.addEventListener('click', () => setUsersPanelVisible(false));

let isDown = false;
let currentStrokeId: string | null = null;
let lastPoint: { x: number; y: number } | null = null;
const localPoints: { x: number; y: number }[] = [];

function genId() { return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8); }
function size() { return Number(sizeInput.value); }
function color() { return colorInput.value; }

function pointerPos(e: PointerEvent) {
  // screen coords -> world coords via renderer viewport
  return layers.screenToWorld({ x: e.clientX, y: e.clientY });
}

hud.addEventListener('pointerdown', (e) => { e.preventDefault(); }); // prevent text selection
live.addEventListener('pointerdown', (e) => { e.preventDefault(); });
base.addEventListener('pointerdown', (e) => {
  const screen = { x: e.clientX, y: e.clientY };
  if (isPanningMode) {
    document.body.classList.add('panning-active');
    panStart = screen;
    const vp = layers.getViewport();
    viewAtPanStart = { offsetX: vp.offsetX, offsetY: vp.offsetY, scale: vp.scale };
    try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    return;
  }
  // Track active pointers for gesture detection
  activePointers.set(e.pointerId, screen);
  if (activePointers.size === 2) {
    // Initiate pinch gesture, abort any stroke
    if (isDown && currentStrokeId) {
      ws.emit('stroke:end', { strokeId: currentStrokeId });
      // Optimistic local commit for brush to avoid flicker
      if (tool === 'brush' && localPoints.length) {
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
      }
      currentStrokeId = null; lastPoint = null; localPoints.length = 0;
      layers.clearLive(); layers.clearAllPreviews?.();
      isDown = false;
    }
    const pts = Array.from(activePointers.values());
    const a = pts[0]; const b = pts[1];
    gestureInitialDistance = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    gestureInitialCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    gestureViewportStart = layers.getViewport();
    gestureWorldCenterBefore = layers.screenToWorld(gestureInitialCenter);
    gestureActive = true;
    return; // don't start drawing
  }
  const p = pointerPos(e);
  isDown = true;
  currentStrokeId = genId();
  lastPoint = p;
  localPoints.length = 0; localPoints.push(p);
  ws.emit('stroke:begin', { strokeId: currentStrokeId, tool, color: color(), size: size(), x: p.x, y: p.y });
  try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch {}
});

let isPanningMode = false; // toggled by spacebar
let isPanning = false;
let panStart: { x: number; y: number } | null = null;
let viewAtPanStart: { offsetX: number; offsetY: number; scale: number } | null = null;

// Multi-touch gesture state (pinch zoom + two-finger pan)
const activePointers = new Map<number, { x: number; y: number }>();
let gestureActive = false;
let gestureInitialDistance = 0;
let gestureInitialCenter: { x: number; y: number } | null = null;
let gestureViewportStart: { scale: number; offsetX: number; offsetY: number } | null = null;
let gestureWorldCenterBefore: { x: number; y: number } | null = null;

// Coalesced drawing & cursor updates for smoother mobile performance
let pendingCursor: { x: number; y: number } | null = null;
let pendingStrokePoint: { x: number; y: number } | null = null;
function flushPoint() {
  if (pendingCursor) {
    ws.emit('cursor', { x: pendingCursor.x, y: pendingCursor.y, tool });
    pendingCursor = null;
  }
  if (pendingStrokePoint && currentStrokeId && lastPoint) {
    const p = pendingStrokePoint;
    if (tool === 'brush') {
      layers.drawLiveSegment(tool, color(), size(), lastPoint, p);
    } else if (tool === 'eraser') {
      layers.drawBaseSegment(tool, color(), size(), lastPoint, p);
      incrementalApplied.add(currentStrokeId);
    } else {
      layers.setShapePreview(currentStrokeId, tool, color(), size(), localPoints[0], p);
    }
    localPoints.push(p);
    ws.emit('stroke:point', { strokeId: currentStrokeId, x: p.x, y: p.y });
    lastPoint = p;
    pendingStrokePoint = null;
  }
}
let flushScheduled = false;
function scheduleFlush() {
  if (!flushScheduled) {
    flushScheduled = true;
    requestAnimationFrame(() => { flushScheduled = false; flushPoint(); });
  }
}

window.addEventListener('pointermove', (e) => {
  const screen = { x: e.clientX, y: e.clientY };
  if (activePointers.has(e.pointerId)) activePointers.set(e.pointerId, screen);
  // Multi-touch pinch / pan
  if (gestureActive) {
    if (activePointers.size < 2 || !gestureViewportStart || !gestureInitialCenter || !gestureWorldCenterBefore) {
      gestureActive = false;
    } else {
      const pts = Array.from(activePointers.values());
      const a = pts[0]; const b = pts[1];
      const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const scaleRatio = dist / gestureInitialDistance;
      const newScale = gestureViewportStart.scale * scaleRatio;
      const world = gestureWorldCenterBefore;
      const newOffsetX = center.x - world.x * newScale;
      const newOffsetY = center.y - world.y * newScale;
      layers.setViewport(newScale, newOffsetX, newOffsetY);
      scheduleRedraw();
      return;
    }
  }
  if (isPanningMode && panStart && viewAtPanStart) {
    const dx = screen.x - panStart.x;
    const dy = screen.y - panStart.y;
    layers.setViewport(viewAtPanStart.scale, viewAtPanStart.offsetX + dx, viewAtPanStart.offsetY + dy);
    scheduleRedraw();
    return;
  }
  const p = pointerPos(e);
  pendingCursor = p;
  if (isDown && currentStrokeId) {
    pendingStrokePoint = p;
    scheduleFlush();
  } else {
    scheduleFlush();
  }
});

window.addEventListener('pointerup', (e) => {
  // Remove from gesture tracking
  if (activePointers.has(e.pointerId)) {
    activePointers.delete(e.pointerId);
    if (gestureActive && activePointers.size < 2) {
      gestureActive = false;
      gestureViewportStart = null; gestureInitialCenter = null; gestureWorldCenterBefore = null;
    }
  }
  if (isPanningMode) { panStart = null; viewAtPanStart = null; document.body.classList.remove('panning-active'); }
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
    } else if (tool === 'brush') {
      // Optimistic local commit to avoid brief gap before server commit
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
    }
    currentStrokeId = null;
    lastPoint = null;
    localPoints.length = 0;
    layers.clearLive();
  }
  // Release pointer capture if applied
  try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
});

// End gesture on cancel
window.addEventListener('pointercancel', (e) => {
  if (activePointers.has(e.pointerId)) activePointers.delete(e.pointerId);
  if (gestureActive && activePointers.size < 2) {
    gestureActive = false;
    gestureViewportStart = null; gestureInitialCenter = null; gestureWorldCenterBefore = null;
  }
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
  if (e.key === ' ') { isPanningMode = true; e.preventDefault(); document.body.classList.add('panning'); }
});
window.addEventListener('keyup', (e) => { if (e.key === ' ') { isPanningMode = false; panStart = null; viewAtPanStart = null; document.body.classList.remove('panning'); document.body.classList.remove('panning-active'); } });

// Zoom with wheel (Ctrl+wheel or normal wheel). Zoom centered at pointer.
window.addEventListener('wheel', (e) => {
  e.preventDefault();
  const vp = layers.getViewport();
  if (e.ctrlKey) {
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = vp.scale * zoomFactor;
    const worldBefore = layers.screenToWorld({ x: e.clientX, y: e.clientY });
    layers.setViewport(newScale, vp.offsetX, vp.offsetY);
    const screenAfter = { x: worldBefore.x * newScale + vp.offsetX, y: worldBefore.y * newScale + vp.offsetY };
    const dx = e.clientX - screenAfter.x;
    const dy = e.clientY - screenAfter.y;
    const vp2 = layers.getViewport();
    layers.setViewport(vp2.scale, vp2.offsetX + dx, vp2.offsetY + dy);
  } else {
    // Pan with wheel
    layers.setViewport(vp.scale, vp.offsetX - e.deltaX, vp.offsetY - e.deltaY);
  }
  scheduleRedraw();
}, { passive: false });

resetViewBtn?.addEventListener('click', () => { layers.setViewport(1, 0, 0); scheduleRedraw(); });

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
let redrawScheduled = false;
function scheduleRedraw() {
  if (redrawScheduled) return;
  redrawScheduled = true;
  requestAnimationFrame(() => { redraw(); redrawScheduled = false; });
}

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

// Track users and show toast on join/leave
let usersInitialized = false;
let lastUsers = new Map<string, User>();
ws.on('user:list', (users: User[]) => {
  // Update toolbar count
  usersSpan.textContent = `${users.length} online`;
  // Update panel list
  if (usersList) {
    usersList.innerHTML = '';
    for (const u of users) {
      const li = document.createElement('li');
      li.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${u.color}"></span>${u.name}</span>`;
      usersList.appendChild(li);
    }
  }
  // Join/leave toasts (skip first list to avoid spam)
  const current = new Map(users.map(u => [u.id, u] as [string, User]));
  if (usersInitialized) {
    for (const [id, u] of current) { if (!lastUsers.has(id)) toast(`${u.name} joined`); }
    for (const [id, u] of lastUsers) { if (!current.has(id)) toast(`${u.name} left`); }
  }
  lastUsers = current;
  usersInitialized = true;
});

// Simple toast utility
function toast(message: string, ms = 2500) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.textContent = message;
  el.style.cssText = 'background: rgba(0,0,0,0.8); color:#fff; padding:8px 12px; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.3); font-size:13px; max-width:70vw;';
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 200ms'; }, ms);
  setTimeout(() => { el.remove(); }, ms + 220);
}

ws.on('cursor', (p) => {
  if (!p.userId) return;
  layers.setCursor(p.userId, p.x, p.y, p.color || '#333', p.name || 'User', p.tool as any);
});

// Join default room
// Defer join until onboarding completed
function joinWithName(name?: string) {
  ws.emit('user:join', { name: name && name.trim() ? name.trim() : undefined });
}
if (onboardStartBtn && onboardingEl && onboardNameInput) {
  onboardStartBtn.addEventListener('click', () => {
    const chosen = onboardNameInput.value.trim() || undefined;
    joinWithName(chosen);
    onboardingEl.style.opacity = '0';
    onboardingEl.style.pointerEvents = 'none';
    setTimeout(() => onboardingEl.remove(), 400);
  });
  // Allow Enter key to submit
  onboardNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') onboardStartBtn.click();
  });
} else {
  // Fallback (overlay missing) join immediately
  joinWithName();
}

// Tool-specific cursor using inline SVG data URIs
function setStageCursorForTool(t: 'brush'|'eraser'|'line'|'rect'|'ellipse') {
  const stage = document.getElementById('stage') as HTMLDivElement;
  if (!stage) return;
  const svgBrush = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M3 21c1.5 0 2.5-.5 3.5-1.5l6.5-6.5 2 2 4-4-2-2 1.5-1.5c.7-.7.7-1.8 0-2.5s-1.8-.7-2.5 0L10 7.5l-2-2-4 4 2 2L3.5 17.5C2.5 18.5 2 19.5 2 21h1z" fill="#000"/></svg>';
  const svgEraser = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M16 3l5 5-9 9H7l-4-4L12 3h4z" fill="#ddd" stroke="#000"/><path d="M6 17h6" stroke="#000" stroke-width="2"/></svg>';
  const svgPlus = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="#000" stroke-width="2" stroke-linecap="round"/></svg>';
  function makeCursor(svg: string, x: number, y: number) {
    return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") ${x} ${y}, auto`;
  }
  if (t === 'eraser') stage.style.cursor = makeCursor(svgEraser, 8, 16);
  else if (t === 'line' || t === 'rect' || t === 'ellipse') stage.style.cursor = makeCursor(svgPlus, 12, 12);
  else stage.style.cursor = makeCursor(svgBrush, 2, 22);
}
setStageCursorForTool(tool);
