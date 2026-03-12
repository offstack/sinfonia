import { randomUUID } from "node:crypto";

export interface Session {
  threadId: string;
  turnId: string;
  turn: number;
  sessionId: string;
}

export function createSession(): Session {
  const threadId = randomUUID().slice(0, 8);
  const turnId = randomUUID().slice(0, 8);
  return {
    threadId,
    turnId,
    turn: 1,
    sessionId: `${threadId}-${turnId}`,
  };
}

export function nextTurn(session: Session): Session {
  const turnId = randomUUID().slice(0, 8);
  return {
    threadId: session.threadId,
    turnId,
    turn: session.turn + 1,
    sessionId: `${session.threadId}-${turnId}`,
  };
}
