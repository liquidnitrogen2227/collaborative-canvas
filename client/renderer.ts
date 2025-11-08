export type Tool = 'brush' | 'eraser' | 'line' | 'rect' | 'ellipse';
export type Point = { x: number; y: number };
export type StrokeOp = { id: string; tool: Tool; color: string; size: number; points: Point[] };

type CursorInfo = { x: number; y: number; color: string; name: string };

export class CanvasLayers {
  private baseCtx: CanvasRenderingContext2D;
  private liveCtx: CanvasRenderingContext2D;
  private hudCtx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private rafId: number | null = null;
  private cursors = new Map<string, CursorInfo>();
  private previews = new Map<string, { tool: Tool; color: string; size: number; from: Point; to: Point }>();

  constructor(private base: HTMLCanvasElement, private live: HTMLCanvasElement, private hud: HTMLCanvasElement) {
    const b = base.getContext('2d');
    const l = live.getContext('2d');
    const h = hud.getContext('2d');
    if (!b || !l || !h) throw new Error('2D canvas not supported');
    this.baseCtx = b; this.liveCtx = l; this.hudCtx = h;
    this.resizeToWindow();
    window.addEventListener('resize', () => this.resizeToWindow());
    this.startHudLoop();
  }

  private resizeToWindow() {
    const displayW = Math.floor(window.innerWidth);
    const displayH = Math.floor(window.innerHeight);
    const dpr = Math.max(1, Math.floor((window.devicePixelRatio || 1) * 100) / 100);
    const dimensionChanged = displayW !== this.width || displayH !== this.height;
    const dprChanged = dpr !== this.dpr;
    if (!dimensionChanged && !dprChanged) return;

    // Snapshot base into an offscreen canvas before resize to preserve content
    const prev = document.createElement('canvas');
    prev.width = this.base.width;
    prev.height = this.base.height;
    const prevCtx = prev.getContext('2d');
    if (prevCtx) prevCtx.drawImage(this.base, 0, 0);

    // Resize all canvases to device pixels
    for (const c of [this.base, this.live, this.hud]) {
      c.width = Math.max(1, Math.floor(displayW * dpr));
      c.height = Math.max(1, Math.floor(displayH * dpr));
      // CSS size is controlled by stylesheet (100vw/100vh)
    }
    this.width = displayW; this.height = displayH; this.dpr = dpr;

    // Reset transforms to map CSS pixels to device pixels
    for (const ctx of [this.baseCtx, this.liveCtx, this.hudCtx]) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // Restore previous image scaled to new display size (draw in CSS pixel space)
    try {
      if (prev.width && prev.height) {
        this.baseCtx.drawImage(prev, 0, 0, this.width, this.height);
      }
    } catch {}
  }

  clearBase() {
    this.baseCtx.clearRect(0, 0, this.width, this.height);
  }

  replay(history: StrokeOp[]) {
    this.clearBase();
    for (const op of history) this.applyOpToBase(op);
  }

  private applyOpToBase(op: StrokeOp) {
    const ctx = this.baseCtx;
    if (op.tool === 'line' || op.tool === 'rect' || op.tool === 'ellipse') {
      // shape rendering inline
      const from = op.points[0];
      const to = op.points[op.points.length - 1] || from;
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.lineWidth = op.size;
      ctx.strokeStyle = op.color;
      switch (op.tool) {
        case 'line': this.drawLine(ctx, from, to); break;
        case 'rect': this.drawRect(ctx, from, to); break;
        case 'ellipse': this.drawEllipse(ctx, from, to); break;
      }
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = op.size;
    if (op.tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = op.color;
    }
    ctx.beginPath();
    const pts = op.points;
    if (!pts.length) { ctx.restore(); return; }
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.closePath();
    ctx.restore();
  }

  // Live incremental segment. For brush: draw on live layer (overlay). For eraser: apply directly to base for immediate visual feedback.
  drawLiveSegment(tool: Tool, color: string, size: number, from: Point, to: Point) {
    const ctx = tool === 'eraser' ? this.baseCtx : this.liveCtx;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = size;
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
    }
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.closePath();
    ctx.restore();
  }

  // Explicitly draw a segment onto the base canvas (used for optimistic local brush and immediate remote rendering)
  drawBaseSegment(tool: Tool, color: string, size: number, from: Point, to: Point) {
    const ctx = this.baseCtx;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = size;
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
    }
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.closePath();
    ctx.restore();
  }

  // Apply a committed operation to the base without full replay
  applyCommittedOp(op: StrokeOp) {
    this.applyOpToBase(op);
  }

  clearLive() {
    this.liveCtx.clearRect(0, 0, this.width, this.height);
  }

  clearAllPreviews() { this.previews.clear(); }

  setCursor(userId: string, x: number, y: number, color: string, name: string) {
    this.cursors.set(userId, { x, y, color, name });
  }
  removeCursor(userId: string) { this.cursors.delete(userId); }

  private startHudLoop() {
    const draw = () => {
      this.hudCtx.clearRect(0, 0, this.width, this.height);
      for (const c of this.cursors.values()) this.drawCursor(c);
      for (const p of this.previews.values()) this.drawPreview(p);
      this.rafId = requestAnimationFrame(draw);
    };
    this.rafId = requestAnimationFrame(draw);
  }
  stopHudLoop() { if (this.rafId) cancelAnimationFrame(this.rafId); this.rafId = null; }

  private drawCursor(c: CursorInfo) {
    const r = 4;
    const ctx = this.hudCtx;
    ctx.save();
    ctx.beginPath();
    ctx.fillStyle = c.color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // label
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    const label = c.name;
    ctx.strokeText(label, c.x + 8, c.y - 8);
    ctx.fillText(label, c.x + 8, c.y - 8);
    ctx.restore();
  }

  setShapePreview(strokeId: string, tool: Tool, color: string, size: number, from: Point, to: Point) {
    this.previews.set(strokeId, { tool, color, size, from, to });
  }
  clearPreview(strokeId: string) { this.previews.delete(strokeId); }

  private drawPreview(p: { tool: Tool; color: string; size: number; from: Point; to: Point }) {
    const ctx = this.hudCtx;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = p.size;
    ctx.strokeStyle = p.color;
    ctx.setLineDash([4, 4]);
    switch (p.tool) {
      case 'line': this.drawLine(ctx, p.from, p.to); break;
      case 'rect': this.drawRect(ctx, p.from, p.to); break;
      case 'ellipse': this.drawEllipse(ctx, p.from, p.to); break;
    }
    ctx.restore();
  }

  private drawLine(ctx: CanvasRenderingContext2D, from: Point, to: Point) {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.closePath();
  }
  private drawRect(ctx: CanvasRenderingContext2D, from: Point, to: Point) {
    const x = Math.min(from.x, to.x), y = Math.min(from.y, to.y);
    const w = Math.abs(to.x - from.x), h = Math.abs(to.y - from.y);
    ctx.strokeRect(x, y, w, h);
  }
  private drawEllipse(ctx: CanvasRenderingContext2D, from: Point, to: Point) {
    const cx = (from.x + to.x) / 2; const cy = (from.y + to.y) / 2;
    const rx = Math.abs(to.x - from.x) / 2; const ry = Math.abs(to.y - from.y) / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.closePath();
  }
}
