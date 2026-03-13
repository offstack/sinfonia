import { describe, it, expect } from "vitest";
import { createSession, nextTurn } from "./session.js";

describe("createSession", () => {
  it("creates a session with turn 1", () => {
    const session = createSession();
    expect(session.turn).toBe(1);
  });

  it("has a valid sessionId composed of threadId and turnId", () => {
    const session = createSession();
    expect(session.sessionId).toBe(`${session.threadId}-${session.turnId}`);
  });

  it("generates unique thread and turn IDs", () => {
    const a = createSession();
    const b = createSession();
    expect(a.threadId).not.toBe(b.threadId);
  });
});

describe("nextTurn", () => {
  it("increments the turn number", () => {
    const session = createSession();
    const next = nextTurn(session);
    expect(next.turn).toBe(2);
  });

  it("preserves the threadId", () => {
    const session = createSession();
    const next = nextTurn(session);
    expect(next.threadId).toBe(session.threadId);
  });

  it("generates a new turnId", () => {
    const session = createSession();
    const next = nextTurn(session);
    expect(next.turnId).not.toBe(session.turnId);
  });

  it("updates sessionId with new turnId", () => {
    const session = createSession();
    const next = nextTurn(session);
    expect(next.sessionId).toBe(`${session.threadId}-${next.turnId}`);
  });
});
