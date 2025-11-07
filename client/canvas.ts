export type BrushOpts = { color: string; size: number };

export class CanvasPad {
  private ctx: CanvasRenderingContext2D;
  private drawing = false;
  private lastX = 0;
  private lastY = 0;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context not supported');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const { width, height } = this.canvas.getBoundingClientRect();
    // preserve content by snapshot
    const img = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    this.canvas.width = Math.floor(width);
    this.canvas.height = Math.floor(height);
    this.ctx.putImageData(img, 0, 0);
  }

  begin(x: number, y: number, opts: BrushOpts) {
    this.drawing = true;
    this.lastX = x; this.lastY = y;
    this.ctx.strokeStyle = opts.color;
    this.ctx.lineWidth = opts.size;
    this.ctx.lineJoin = 'round';
    this.ctx.lineCap = 'round';
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
  }

  point(x: number, y: number) {
    if (!this.drawing) return;
    this.ctx.lineTo(x, y);
    this.ctx.stroke();
    this.lastX = x; this.lastY = y;
  }

  end() {
    if (!this.drawing) return;
    this.drawing = false;
    this.ctx.closePath();
  }
}
