import { describe, it, expect, beforeEach } from "vitest";
import { OrchestratorState } from "./state.js";
import type { RunningSession, RetryEntry } from "../shared/types.js";

function makeSession(issueId: string): RunningSession {
  return {
    issueId,
    issueIdentifier: issueId,
    pid: 1234,
    sessionId: "sess-1",
    threadId: "thread-1",
    turnId: "turn-1",
    turn: 1,
    startedAt: new Date(),
    lastEventAt: new Date(),
    tokens: { input: 0, output: 0 },
    state: "running",
    lastEvent: "started",
  };
}

describe("OrchestratorState", () => {
  let state: OrchestratorState;

  beforeEach(() => {
    state = new OrchestratorState();
  });

  describe("claims", () => {
    it("claims an unclaimed issue", () => {
      expect(state.claim("SIN-1")).toBe(true);
    });

    it("cannot claim an already-claimed issue", () => {
      state.claim("SIN-1");
      expect(state.claim("SIN-1")).toBe(false);
    });

    it("isClaimed returns true after claim", () => {
      state.claim("SIN-1");
      expect(state.isClaimed("SIN-1")).toBe(true);
    });

    it("isClaimed returns false for unknown issue", () => {
      expect(state.isClaimed("SIN-99")).toBe(false);
    });

    it("isClaimed returns false after release", () => {
      state.claim("SIN-1");
      state.release("SIN-1");
      expect(state.isClaimed("SIN-1")).toBe(false);
    });
  });

  describe("running sessions", () => {
    it("sets and retrieves a running session", () => {
      const session = makeSession("SIN-1");
      state.claim("SIN-1");
      state.setRunning("SIN-1", session);
      expect(state.running.get("SIN-1")).toBe(session);
    });

    it("isClaimed returns true for running sessions", () => {
      state.claim("SIN-1");
      state.setRunning("SIN-1", makeSession("SIN-1"));
      expect(state.isClaimed("SIN-1")).toBe(true);
    });

    it("runningCount reflects active sessions", () => {
      state.claim("SIN-1");
      state.setRunning("SIN-1", makeSession("SIN-1"));
      state.claim("SIN-2");
      state.setRunning("SIN-2", makeSession("SIN-2"));
      expect(state.runningCount).toBe(2);
    });

    it("removeRunning removes from running map", () => {
      state.claim("SIN-1");
      state.setRunning("SIN-1", makeSession("SIN-1"));
      state.removeRunning("SIN-1");
      expect(state.running.has("SIN-1")).toBe(false);
    });

    it("updateRunningEvent updates lastEvent and lastEventAt", () => {
      const session = makeSession("SIN-1");
      state.claim("SIN-1");
      state.setRunning("SIN-1", session);
      const before = session.lastEventAt;
      state.updateRunningEvent("SIN-1", "tool_use");
      expect(session.lastEvent).toBe("tool_use");
      expect(session.lastEventAt >= before).toBe(true);
    });

    it("updateRunningTokens updates token counts", () => {
      const session = makeSession("SIN-1");
      state.claim("SIN-1");
      state.setRunning("SIN-1", session);
      state.updateRunningTokens("SIN-1", 100, 50);
      expect(session.tokens).toEqual({ input: 100, output: 50 });
    });

    it("getRunningIssueIds returns all running issue IDs", () => {
      state.claim("SIN-1");
      state.setRunning("SIN-1", makeSession("SIN-1"));
      state.claim("SIN-2");
      state.setRunning("SIN-2", makeSession("SIN-2"));
      expect(state.getRunningIssueIds().sort()).toEqual(["SIN-1", "SIN-2"]);
    });

    it("runningCountForState counts by session state", () => {
      const s1 = makeSession("SIN-1");
      s1.state = "running";
      const s2 = makeSession("SIN-2");
      s2.state = "stalled";
      state.claim("SIN-1");
      state.setRunning("SIN-1", s1);
      state.claim("SIN-2");
      state.setRunning("SIN-2", s2);
      expect(state.runningCountForState("running")).toBe(1);
      expect(state.runningCountForState("stalled")).toBe(1);
      expect(state.runningCountForState("idle")).toBe(0);
    });
  });

  describe("retry queue", () => {
    it("queues a retry entry", () => {
      const entry: RetryEntry = {
        issueId: "SIN-1",
        issueIdentifier: "SIN-1",
        attempt: 1,
        dueAt: Date.now() + 1000,
        timer: null,
        isContinuation: false,
      };
      state.queueRetry(entry);
      expect(state.retryQueue.get("SIN-1")).toBe(entry);
    });

    it("removeRetry removes from queue", () => {
      const entry: RetryEntry = {
        issueId: "SIN-1",
        issueIdentifier: "SIN-1",
        attempt: 1,
        dueAt: Date.now() + 1000,
        timer: null,
        isContinuation: false,
      };
      state.queueRetry(entry);
      state.removeRetry("SIN-1");
      expect(state.retryQueue.has("SIN-1")).toBe(false);
    });
  });

  describe("completed", () => {
    it("markCompleted adds to completed list", () => {
      state.claim("SIN-1");
      state.markCompleted("SIN-1");
      expect(state.completed).toContain("SIN-1");
    });

    it("markCompleted releases the claim", () => {
      state.claim("SIN-1");
      state.markCompleted("SIN-1");
      expect(state.isClaimed("SIN-1")).toBe(false);
    });

    it("markCompleted does not add duplicates", () => {
      state.claim("SIN-1");
      state.markCompleted("SIN-1");
      state.claim("SIN-1");
      state.markCompleted("SIN-1");
      expect(state.completed.filter((id) => id === "SIN-1").length).toBe(1);
    });
  });

  describe("tokens", () => {
    it("addTokens accumulates totals", () => {
      state.addTokens(100, 50);
      state.addTokens(200, 75);
      expect(state.totalTokens).toEqual({ input: 300, output: 125 });
    });

    it("totalTokens returns a copy (not live reference)", () => {
      state.addTokens(10, 5);
      const snapshot = state.totalTokens;
      state.addTokens(100, 50);
      expect(snapshot).toEqual({ input: 10, output: 5 });
    });
  });

  describe("release", () => {
    it("release removes from running and retry maps", () => {
      state.claim("SIN-1");
      state.setRunning("SIN-1", makeSession("SIN-1"));
      state.release("SIN-1");
      expect(state.running.has("SIN-1")).toBe(false);
      expect(state.retryQueue.has("SIN-1")).toBe(false);
    });
  });
});
