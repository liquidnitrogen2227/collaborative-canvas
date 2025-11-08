import { io, Socket } from 'socket.io-client';

export type StrokeBegin = { strokeId: string; tool: 'brush'|'eraser'; color: string; size: number; x: number; y: number };
export type StrokePoint = { strokeId: string; x: number; y: number };
export type StrokeEnd = { strokeId: string };
export type Cursor = { x: number; y: number };
export type StrokeOp = {
  id: string;
  userId: string;
  tool: 'brush'|'eraser';
  color: string;
  size: number;
  points: { x: number; y: number }[];
  ts: number;
};
export type Snapshot = { history: StrokeOp[] };
export type User = { id: string; name: string; color: string };

export class WSClient {
  private socket: Socket;

  constructor() {
    this.socket = io();
  }

  id(): string | undefined { return (this.socket as any).id; }

  on(event: 'stroke:begin', cb: (p: StrokeBegin & { userId: string }) => void): void;
  on(event: 'stroke:point', cb: (p: StrokePoint & { userId: string }) => void): void;
  on(event: 'stroke:end', cb: (p: StrokeEnd & { userId: string }) => void): void;
  on(event: 'cursor', cb: (p: Cursor & { userId: string; name?: string; color?: string }) => void): void;
  on(event: 'op:commit', cb: (p: StrokeOp) => void): void;
  on(event: 'snapshot', cb: (p: Snapshot) => void): void;
  on(event: 'state:snapshot', cb: (p: Snapshot) => void): void;
  on(event: 'user:list', cb: (p: User[]) => void): void;
  on(event: string, cb: (p: any) => void) { this.socket.on(event, cb); }

  emit(event: 'stroke:begin', p: StrokeBegin): void;
  emit(event: 'stroke:point', p: StrokePoint): void;
  emit(event: 'stroke:end', p: StrokeEnd): void;
  emit(event: 'cursor', p: Cursor): void;
  emit(event: 'user:join', p: { roomId?: string; name?: string; color?: string }): void;
  emit(event: 'op:undo'): void;
  emit(event: 'op:redo'): void;
  emit(event: string, p?: any) { this.socket.emit(event, p); }
}
