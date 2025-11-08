import { RoomState, StrokeOp, Tool } from './rooms';

const MAX_UNDO_STEPS = 5;

export function beginStroke(room: RoomState, strokeId: string, userId: string, tool: Tool, color: string, size: number, x: number, y: number) {
  // starting a new stroke cancels redo history (new branch)
  room.redoStack = [];
  const op: StrokeOp = { id: strokeId, userId, tool, color, size, points: [{ x, y }], ts: Date.now() };
  room.active.set(strokeId, op);
}

export function appendPoint(room: RoomState, strokeId: string, x: number, y: number) {
  const op = room.active.get(strokeId);
  if (!op) return;
  op.points.push({ x, y });
}

export function endStroke(room: RoomState, strokeId: string): StrokeOp | null {
  const op = room.active.get(strokeId);
  if (!op) return null;
  room.active.delete(strokeId);
  room.history.push(op);
  // Reset undo window when a new op is committed
  room.redoStack = [];
  return op;
}

export function undo(room: RoomState): StrokeOp | null {
  // Enforce max undo window size relative to current head
  if (room.redoStack.length >= MAX_UNDO_STEPS) return null;
  const op = room.history.pop() || null;
  if (op) room.redoStack.push(op);
  return op;
}

export function redo(room: RoomState): StrokeOp | null {
  const op = room.redoStack.pop() || null;
  if (op) room.history.push(op);
  return op;
}

export function snapshot(room: RoomState) {
  // Return a serializable snapshot
  return {
    history: room.history,
  };
}
