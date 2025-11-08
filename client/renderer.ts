export type Tool = 'brush' | 'eraser';
export type Point = { x: number; y: number };
export type StrokeOp = { id: string; tool: Tool; color: string; size: number; points: Point[] };

type CursorInfo = { x: number; y: number; color: string; name: string };

export class CanvasLayers {
  private baseCtx: CanvasRenderingContext2D;
  private liveCtx: CanvasRenderingContext2D;
  private hudCtx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private rafId: number | null = null;
  private cursors = new Map<string, CursorInfo>();

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
    const w = Math.floor(window.innerWidth);
    const h = Math.floor(window.innerHeight);
    if (w === this.width && h === this.height) return;
    // Snapshot base before resize
    const img = this.baseCtx.getImageData(0, 0, this.base.width, this.base.height);
    for (const c of [this.base, this.live, this.hud]) { c.width = w; c.height = h; }
    this.width = w; this.height = h;
    // restore base
    try { this.baseCtx.putImageData(img, 0, 0); } catch {}
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

  // Live incremental segment: independent path per segment to avoid bridging
  drawLiveSegment(tool: Tool, color: string, size: number, from: Point, to: Point) {
    const ctx = this.liveCtx;
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

  clearLive() {
    this.liveCtx.clearRect(0, 0, this.width, this.height);
  }

  setCursor(userId: string, x: number, y: number, color: string, name: string) {
    this.cursors.set(userId, { x, y, color, name });
  }
  removeCursor(userId: string) { this.cursors.delete(userId); }

  private startHudLoop() {
    const draw = () => {
      this.hudCtx.clearRect(0, 0, this.width, this.height);
      for (const c of this.cursors.values()) this.drawCursor(c);
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
}
