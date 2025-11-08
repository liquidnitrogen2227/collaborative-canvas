export type User = {
  id: string;
  name: string;
  color: string;
};

export type Point = { x: number; y: number };
export type Tool = 'brush' | 'eraser' | 'line' | 'rect' | 'ellipse';

export type StrokeOp = {
  id: string; // strokeId
  userId: string;
  tool: Tool;
  color: string;
  size: number;
  points: Point[];
  ts: number;
};

export type RoomState = {
  id: string;
  users: Map<string, User>;
  history: StrokeOp[];
  redoStack: StrokeOp[];
  // active strokes accumulating points before commit
  active: Map<string, StrokeOp>; // key: strokeId
};

export class Rooms {
  private rooms = new Map<string, RoomState>();

  get(roomId: string): RoomState {
    let r = this.rooms.get(roomId);
    if (!r) {
      r = {
        id: roomId,
        users: new Map(),
        history: [],
        redoStack: [],
        active: new Map(),
      };
      this.rooms.set(roomId, r);
    }
    return r;
  }

  addUser(roomId: string, user: User) {
    const r = this.get(roomId);
    r.users.set(user.id, user);
    return r;
  }

  removeUser(roomId: string, userId: string) {
    const r = this.get(roomId);
    r.users.delete(userId);
    // also clean up any active strokes by this user
    for (const [sid, s] of [...r.active]) if (s.userId === userId) r.active.delete(sid);
    return r;
  }
}
