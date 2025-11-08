export type Tool = 'brush' | 'eraser' | 'line' | 'rect' | 'ellipse';
export type Point = { x: number; y: number };
export type StrokeOp = { id: string; tool: Tool; color: string; size: number; points: Point[] };

type CursorInfo = { x: number; y: number; color: string; name: string; tool?: Tool };

export class CanvasLayers {
  private baseCtx: CanvasRenderingContext2D;
  private liveCtx: CanvasRenderingContext2D;
  private hudCtx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private scale = 1;
  private offsetX = 0;
  private offsetY = 0;
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

  // Viewport API
  setViewport(scale: number, offsetX: number, offsetY: number) {
    this.scale = Math.max(0.1, Math.min(10, scale));
    this.offsetX = offsetX;
    this.offsetY = offsetY;
    this.applyTransforms();
  }
  getViewport() { return { scale: this.scale, offsetX: this.offsetX, offsetY: this.offsetY }; }
  screenToWorld(p: Point): Point {
    return { x: (p.x - this.offsetX) / this.scale, y: (p.y - this.offsetY) / this.scale };
  }

  private applyTransforms() {
    for (const ctx of [this.baseCtx, this.liveCtx, this.hudCtx]) {
      ctx.setTransform(this.dpr * this.scale, 0, 0, this.dpr * this.scale, this.dpr * this.offsetX, this.dpr * this.offsetY);
    }
  }

  private resizeToWindow() {
    const displayW = Math.floor(window.innerWidth);
    const displayH = Math.floor(window.innerHeight);
  // Clamp DPR on mobile to reduce memory/overdraw cost
  const rawDpr = Math.max(1, Math.floor((window.devicePixelRatio || 1) * 100) / 100);
  const dpr = Math.min(2, rawDpr);
    const dimensionChanged = displayW !== this.width || displayH !== this.height;
    const dprChanged = dpr !== this.dpr;
    if (!dimensionChanged && !dprChanged) return;

    // Snapshot base before resize
    const prev = document.createElement('canvas');
    prev.width = this.base.width;
    prev.height = this.base.height;
    const prevCtx = prev.getContext('2d');
    if (prevCtx) prevCtx.drawImage(this.base, 0, 0);

    // Resize to device pixels
    for (const c of [this.base, this.live, this.hud]) {
      c.width = Math.max(1, Math.floor(displayW * dpr));
      c.height = Math.max(1, Math.floor(displayH * dpr));
    }
    this.width = displayW; this.height = displayH; this.dpr = dpr;

    // Reset to DPR only, then apply viewport
    for (const ctx of [this.baseCtx, this.liveCtx, this.hudCtx]) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    this.applyTransforms();

    // Restore previous pixels without transforms
    if (prev.width && prev.height) {
      this.baseCtx.setTransform(1, 0, 0, 1, 0, 0);
      this.baseCtx.clearRect(0, 0, this.base.width, this.base.height);
      this.baseCtx.drawImage(prev, 0, 0);
      this.applyTransforms();
    }
  }

  private clearPixelAligned(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  clearBase() { this.clearPixelAligned(this.baseCtx, this.base); this.applyTransforms(); }
  clearLive() { this.clearPixelAligned(this.liveCtx, this.live); this.applyTransforms(); }

  replay(history: StrokeOp[]) {
    this.clearBase();
    for (const op of history) this.applyOpToBase(op);
  }

  private applyOpToBase(op: StrokeOp) {
    const ctx = this.baseCtx;
    if (op.tool === 'line' || op.tool === 'rect' || op.tool === 'ellipse') {
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
    const pts = op.points;
    if (!pts.length) { ctx.restore(); return; }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.closePath();
    ctx.restore();
  }

  // Live incremental segment. Brush -> live; Eraser -> base
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

  // Explicitly draw onto base
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

  applyCommittedOp(op: StrokeOp) { this.applyOpToBase(op); }

  clearAllPreviews() { this.previews.clear(); }

  setCursor(userId: string, x: number, y: number, color: string, name: string, tool?: Tool) {
    this.cursors.set(userId, { x, y, color, name, tool });
  }
  removeCursor(userId: string) { this.cursors.delete(userId); }

  private startHudLoop() {
    let last = 0;
    const draw = (ts: number) => {
      // Throttle to ~30 FPS to reduce mobile overdraw
      if (ts - last > 33) {
        this.clearPixelAligned(this.hudCtx, this.hud);
        this.applyTransforms();
        for (const c of this.cursors.values()) this.drawCursor(c);
        for (const p of this.previews.values()) this.drawPreview(p);
        last = ts;
      }
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
    // Tool icon near cursor
    this.drawToolIcon(ctx, c);
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#000';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    const label = c.name;
    ctx.strokeText(label, c.x + 8, c.y - 8);
    ctx.fillText(label, c.x + 8, c.y - 8);
    ctx.restore();
  }

  private drawToolIcon(ctx: CanvasRenderingContext2D, c: CursorInfo) {
    const tool = c.tool || 'brush';
    ctx.save();
    ctx.translate(c.x + 10, c.y + 10);
    ctx.lineWidth = 2;
    switch (tool) {
      case 'brush': {
        // simple pen: diagonal line with nib
        ctx.strokeStyle = c.color;
        ctx.beginPath();
        ctx.moveTo(-6, -6);
        ctx.lineTo(6, 6);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(2, 6);
        ctx.lineTo(6, 2);
        ctx.stroke();
        break;
      }
      case 'eraser': {
        ctx.fillStyle = '#ddd';
        ctx.strokeStyle = '#000';
        ctx.rotate(-0.4);
        ctx.beginPath();
        ctx.rect(-6, -4, 12, 8);
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'line':
      case 'rect':
      case 'ellipse': {
        // plus sign
        ctx.strokeStyle = c.color;
        ctx.beginPath();
        ctx.moveTo(-6, 0); ctx.lineTo(6, 0);
        ctx.moveTo(0, -6); ctx.lineTo(0, 6);
        ctx.stroke();
        break;
      }
    }
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
