import { io, Socket } from 'socket.io-client';

export type DrawBegin = { strokeId: string; x: number; y: number; color: string; size: number };
export type DrawPoint = { strokeId: string; x: number; y: number };
export type DrawEnd = { strokeId: string };
export type Cursor = { x: number; y: number };

export class WSClient {
  private socket: Socket;

  constructor() {
    this.socket = io();
  }

  on(event: 'draw:begin', cb: (p: DrawBegin & { userId: string }) => void): void;
  on(event: 'draw:point', cb: (p: DrawPoint & { userId: string }) => void): void;
  on(event: 'draw:end', cb: (p: DrawEnd & { userId: string }) => void): void;
  on(event: 'cursor', cb: (p: Cursor & { userId: string }) => void): void;
  on(event: string, cb: (p: any) => void) { this.socket.on(event, cb); }

  emit(event: 'draw:begin', p: DrawBegin): void;
  emit(event: 'draw:point', p: DrawPoint): void;
  emit(event: 'draw:end', p: DrawEnd): void;
  emit(event: 'cursor', p: Cursor): void;
  emit(event: string, p: any) { this.socket.emit(event, p); }
}
