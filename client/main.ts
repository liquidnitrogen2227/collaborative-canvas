import { WSClient, StrokeOp, User } from './websocket.ts';
import { CanvasLayers } from './renderer.ts';

// Splash screen and name input elements
const splashScreen = document.getElementById('splash-screen') as HTMLDivElement;
const nameInputScreen = document.getElementById('name-input-screen') as HTMLDivElement;
const nameInputField = document.getElementById('name-input-field') as HTMLInputElement;
const startBtn = document.getElementById('start-btn') as HTMLButtonElement;
const appLogo = document.getElementById('app-logo') as HTMLImageElement;
const placeholderLogo = document.getElementById('placeholder-logo') as HTMLDivElement;

const base = document.getElementById('base') as HTMLCanvasElement;
const live = document.getElementById('live') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLCanvasElement;
const sizeInput = document.getElementById('size') as HTMLInputElement;
const sizeDisplay = document.getElementById('size-display') as HTMLSpanElement;
const colorInput = document.getElementById('color') as HTMLInputElement;
const undoBtn = document.getElementById('undo') as HTMLButtonElement;
const redoBtn = document.getElementById('redo') as HTMLButtonElement;
const clearAllBtn = document.getElementById('clear-all') as HTMLButtonElement;
const usersCount = document.getElementById('users-count') as HTMLSpanElement;
const brushBtn = document.getElementById('tool-brush') as HTMLButtonElement;
const eraserBtn = document.getElementById('tool-eraser') as HTMLButtonElement;
const lineBtn = document.getElementById('tool-line') as HTMLButtonElement;
const rectBtn = document.getElementById('tool-rect') as HTMLButtonElement;
const ellipseBtn = document.getElementById('tool-ellipse') as HTMLButtonElement;
const shapesToggle = document.getElementById('shapes-toggle') as HTMLButtonElement;
const shapesMenu = document.getElementById('shapes-menu') as HTMLDivElement;
const resetViewBtn = document.getElementById('reset-view') as HTMLButtonElement | null;
const showUsersBtn = document.getElementById('show-users') as HTMLButtonElement | null;
const usersPanel = document.getElementById('users-panel') as HTMLDivElement | null;
const usersCloseBtn = document.getElementById('users-close') as HTMLButtonElement | null;
const usersList = document.getElementById('users-list') as HTMLUListElement | null;
const onboardingEl = document.getElementById('onboarding') as HTMLDivElement | null;
const onboardNameInput = document.getElementById('onboard-name') as HTMLInputElement | null;
const onboardStartBtn = document.getElementById('onboard-start') as HTMLButtonElement | null;
const leaveSessionBtn = document.getElementById('leave-session') as HTMLButtonElement | null;

const layers = new CanvasLayers(base, live, hud);
const ws = new WSClient();

// Stats display elements
const fpsValueEl = document.getElementById('fps-value') as HTMLSpanElement;
const latencyValueEl = document.getElementById('latency-value') as HTMLSpanElement;
const connectionStatusEl = document.getElementById('connection-status') as HTMLDivElement;

// FPS tracking
let frameCount = 0;
let lastFpsUpdate = Date.now();
function updateFPS() {
  frameCount++;
  const now = Date.now();
  if (now - lastFpsUpdate >= 1000) {
    const fps = Math.round(frameCount * 1000 / (now - lastFpsUpdate));
    fpsValueEl.textContent = fps.toString();
    frameCount = 0;
    lastFpsUpdate = now;
  }
  requestAnimationFrame(updateFPS);
}
updateFPS();

// Latency tracking
setInterval(() => {
  const latency = ws.getLatency();
  latencyValueEl.textContent = `${latency}ms`;
  
  // Color code latency
  if (latency < 50) {
    latencyValueEl.style.color = '#4caf50'; // Green
  } else if (latency < 100) {
    latencyValueEl.style.color = '#ffa726'; // Orange
  } else {
    latencyValueEl.style.color = '#ff5252'; // Red
  }
}, 1000);

// Tutorial elements
const tutorialOverlay = document.getElementById('tutorial-overlay') as HTMLDivElement;
const tutorialSteps = [
  document.getElementById('tutorial-step-1') as HTMLDivElement,
  document.getElementById('tutorial-step-2') as HTMLDivElement,
  document.getElementById('tutorial-step-3') as HTMLDivElement,
  document.getElementById('tutorial-step-4') as HTMLDivElement,
  document.getElementById('tutorial-step-5') as HTMLDivElement,
];
let currentTutorialStep = 0;

// Hide old onboarding initially
if (onboardingEl) onboardingEl.style.display = 'none';

// Check if user has already set their name
const savedName = localStorage.getItem('userName');
const tutorialCompleted = localStorage.getItem('tutorialCompleted') === 'true';

console.log('[Onboarding] Checking localStorage:', { savedName, tutorialCompleted });

// Handle splash screen and name input
// Check if logo exists, otherwise use placeholder
appLogo.onerror = () => {
  appLogo.style.display = 'none';
  placeholderLogo.style.display = 'block';
};
appLogo.onload = () => {
  appLogo.style.display = 'block';
  placeholderLogo.style.display = 'none';
};

if (savedName) {
  console.log('[Onboarding] Returning user detected, skipping onboarding');
  // User has been here before - skip splash and name input
  splashScreen.style.display = 'none';
  nameInputScreen.style.display = 'none';
  
  // Set the saved name for connection
  if (onboardNameInput) onboardNameInput.value = savedName;
  
  // Auto-join after a brief moment
  setTimeout(() => {
    console.log('[Onboarding] Auto-joining with saved name:', savedName);
    if (onboardStartBtn) onboardStartBtn.click();
  }, 300);
  
  // Show tutorial only if they haven't completed it
  if (!tutorialCompleted) {
    console.log('[Onboarding] Showing tutorial (not completed yet)');
    setTimeout(() => startTutorial(), 500);
  } else {
    console.log('[Onboarding] Skipping tutorial (already completed)');
  }
} else {
  console.log('[Onboarding] First-time user, showing full onboarding flow');
  // First-time user - show splash and name input flow
  // Show name input behind splash screen, then transition
  nameInputScreen.style.display = 'flex';

  // After splash animation (2 seconds), fade out splash to reveal name input
  setTimeout(() => {
    splashScreen.style.animation = 'fadeOut 0.5s ease-out forwards';
    setTimeout(() => {
      splashScreen.style.display = 'none';
      nameInputField.focus();
    }, 500);
  }, 2000);
}

// Handle name input submission
function startApp() {
  const name = nameInputField.value.trim();
  if (!name) {
    nameInputField.style.borderColor = '#ff4444';
    return;
  }
  
  // Store name in localStorage for future visits
  localStorage.setItem('userName', name);
  console.log('[Onboarding] Saved name to localStorage:', name);
  
  // Hide name input screen
  nameInputScreen.style.animation = 'fadeOut 0.3s ease-out forwards';
  setTimeout(() => {
    nameInputScreen.style.display = 'none';
    // Start tutorial
    startTutorial();
  }, 300);
  
  // Set the name for the websocket connection
  if (onboardNameInput) onboardNameInput.value = name;
}

startBtn.addEventListener('click', startApp);
nameInputField.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') startApp();
});

// Tutorial system
function startTutorial() {
  tutorialOverlay.style.display = 'block';
  showTutorialStep(0);
  
  // Add next button listeners (only add once)
  tutorialSteps.forEach((step, index) => {
    const nextBtn = step.querySelector('.tutorial-next') as HTMLButtonElement;
    if (nextBtn && !nextBtn.hasAttribute('data-listener-added')) {
      nextBtn.setAttribute('data-listener-added', 'true');
      nextBtn.addEventListener('click', () => {
        if (index < tutorialSteps.length - 1) {
          showTutorialStep(index + 1);
        } else {
          // End tutorial and mark as completed
          localStorage.setItem('tutorialCompleted', 'true');
          tutorialOverlay.style.animation = 'fadeOut 0.3s ease-out forwards';
          setTimeout(() => {
            tutorialOverlay.style.display = 'none';
            // Connect to the canvas after tutorial
            if (onboardStartBtn) onboardStartBtn.click();
          }, 300);
        }
      });
    }
  });
}

function showTutorialStep(stepIndex: number) {
  // Hide all steps
  tutorialSteps.forEach(step => step.style.display = 'none');
  // Show current step
  if (tutorialSteps[stepIndex]) {
    tutorialSteps[stepIndex].style.display = 'block';
  }
  currentTutorialStep = stepIndex;
}

// Add fadeOut animation
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeOut {
    to {
      opacity: 0;
      pointer-events: none;
    }
  }
`;
document.head.appendChild(style);

// Update size display
sizeInput.addEventListener('input', () => {
  sizeDisplay.textContent = `${sizeInput.value}px`;
});

// Shapes dropdown toggle
shapesToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  shapesMenu.classList.toggle('show');
  shapesToggle.classList.toggle('active');
  
  // Position dropdown below the button
  if (shapesMenu.classList.contains('show')) {
    const rect = shapesToggle.getBoundingClientRect();
    shapesMenu.style.top = `${rect.bottom + 8}px`;
    shapesMenu.style.left = `${rect.left}px`;
  }
});

// Close shapes menu when clicking outside
document.addEventListener('click', () => {
  shapesMenu.classList.remove('show');
  shapesToggle.classList.remove('active');
});

shapesMenu.addEventListener('click', (e) => {
  e.stopPropagation();
});

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
    // For single-click dots: duplicate the point if we only have one
    if (localPoints.length === 1) {
      localPoints.push({ ...localPoints[0] });
    }
    
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
clearAllBtn.addEventListener('click', () => ws.emit('op:clear'));

// Leave session button - clears localStorage and reloads page
leaveSessionBtn?.addEventListener('click', () => {
  if (confirm('Leave this session? Your name and progress will be forgotten.')) {
    console.log('[Leave Session] Clearing localStorage and reloading...');
    localStorage.clear();
    toast('👋 Leaving session...', 1500);
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  }
});

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
  // Update toolbar count badge
  usersCount.textContent = `${users.length}`;
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

// Reconnection handling
let isConnected = true;
let userName = '';
let userColor = '';

ws.on('disconnect', (reason) => {
  isConnected = false;
  connectionStatusEl.classList.remove('connected');
  connectionStatusEl.classList.add('disconnected');
  
  console.warn('WebSocket disconnected:', reason);
  
  if (reason === 'io server disconnect') {
    // Server initiated disconnect, manually reconnect
    toast('⚠️ Connection lost - reconnecting...', 3000);
  } else {
    // Client disconnected, Socket.io will auto-reconnect
    toast('⚠️ Connection lost - attempting to reconnect...', 3000);
  }
});

ws.on('connect', () => {
  const wasDisconnected = !isConnected;
  isConnected = true;
  connectionStatusEl.classList.remove('disconnected', 'reconnecting');
  connectionStatusEl.classList.add('connected');
  
  if (wasDisconnected) {
    console.log('WebSocket reconnected');
    toast('✅ Reconnected!', 2000);
    
    // Re-join room with saved credentials
    if (userName) {
      ws.emit('user:join', { name: userName, color: userColor });
    }
  }
});

ws.on('connect_error', (error) => {
  connectionStatusEl.classList.remove('connected', 'disconnected');
  connectionStatusEl.classList.add('reconnecting');
  console.error('Connection error:', error);
});

// Save user credentials for reconnection
function saveUserCredentials(name: string, color: string) {
  userName = name;
  userColor = color;
}

// Join default room
// Defer join until onboarding completed
function joinWithName(name?: string) {
  const finalName = name && name.trim() ? name.trim() : 'Anonymous';
  ws.emit('user:join', { name: finalName });
  // Note: Server assigns color, we'll capture it from the user:list event
  saveUserCredentials(finalName, '#333'); // Temp color until we get real one
}

// Update saved credentials when we get user list (captures server-assigned color)
let hasCapturedColor = false;
const originalUserListHandler = ws.on.bind(ws);
ws.on('user:list', (users: User[]) => {
  // Capture our own color on first user list
  if (!hasCapturedColor && ws.id()) {
    const me = users.find(u => u.id === ws.id());
    if (me) {
      saveUserCredentials(me.name, me.color);
      hasCapturedColor = true;
    }
  }
});

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
