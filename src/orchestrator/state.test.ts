import { describe, it, expect, beforeEach } from "vitest";
import { OrchestratorState } from "./state.js";
import type { RunningSession } from "../shared/types.js";

function makeSession(overrides: Partial<RunningSession> = {}): RunningSession {
  return {
    issueId: "id-1",
    issueIdentifier: "SIN-1",
    pid: 123,
    sessionId: "s1",
    threadId: "t1",
    turnId: "u1",
    turn: 1,
    startedAt: new Date(),
    lastEventAt: new Date(),
    tokens: { input: 0, output: 0 },
    state: "Todo",
    lastEvent: "",
    ...overrides,
  };
}

describe("OrchestratorState", () => {
  let state: OrchestratorState;

  beforeEach(() => {
    state = new OrchestratorState();
  });

  describe("claims", () => {
    it("claims an unclaimed issue", () => {
      expect(state.claim("id-1")).toBe(true);
      expect(state.isClaimed("id-1")).toBe(true);
    });

    it("rejects double-claim", () => {
      state.claim("id-1");
      expect(state.claim("id-1")).toBe(false);
    });

    it("allows re-claim after release", () => {
      state.claim("id-1");
      state.release("id-1");
      expect(state.isClaimed("id-1")).toBe(false);
      expect(state.claim("id-1")).toBe(true);
    });
  });

  describe("running sessions", () => {
    it("tracks running count", () => {
      expect(state.runningCount).toBe(0);
      state.setRunning("id-1", makeSession());
      expect(state.runningCount).toBe(1);
    });

    it("removes running session", () => {
      state.setRunning("id-1", makeSession());
      state.removeRunning("id-1");
      expect(state.runningCount).toBe(0);
    });

    it("updates running event", () => {
      state.setRunning("id-1", makeSession());
      state.updateRunningEvent("id-1", "tool_use");
      expect(state.running.get("id-1")!.lastEvent).toBe("tool_use");
    });

    it("updates running tokens", () => {
      state.setRunning("id-1", makeSession());
      state.updateRunningTokens("id-1", 100, 200);
      expect(state.running.get("id-1")!.tokens).toEqual({ input: 100, output: 200 });
    });

    it("counts running by state (case-insensitive)", () => {
      state.setRunning("id-1", makeSession({ issueId: "id-1", state: "Todo" }));
      state.setRunning("id-2", makeSession({ issueId: "id-2", state: "Rework" }));
      expect(state.runningCountForState("todo")).toBe(1);
      expect(state.runningCountForState("rework")).toBe(1);
    });

    it("returns running issue IDs", () => {
      state.setRunning("id-1", makeSession({ issueId: "id-1" }));
      state.setRunning("id-2", makeSession({ issueId: "id-2" }));
      expect(state.getRunningIssueIds()).toEqual(["id-1", "id-2"]);
    });
  });

  describe("retry queue", () => {
    it("queues and removes retry entries", () => {
      state.queueRetry({
        issueId: "id-1", issueIdentifier: "SIN-1", attempt: 1,
        dueAt: Date.now() + 5000, timer: null, isContinuation: false,
      });
      expect(state.retryQueue.size).toBe(1);
      state.removeRetry("id-1");
      expect(state.retryQueue.size).toBe(0);
    });
  });

  describe("completed", () => {
    it("marks issue as completed", () => {
      state.claim("id-1");
      state.setRunning("id-1", makeSession());
      state.markCompleted("id-1");
      expect(state.completed).toContain("id-1");
      expect(state.isClaimed("id-1")).toBe(false);
      expect(state.runningCount).toBe(0);
    });

    it("does not duplicate completed entries", () => {
      state.markCompleted("id-1");
      state.markCompleted("id-1");
      expect(state.completed.filter((id) => id === "id-1")).toHaveLength(1);
    });
  });

  describe("tokens", () => {
    it("accumulates tokens", () => {
      state.addTokens(100, 50);
      state.addTokens(200, 100);
      expect(state.totalTokens).toEqual({ input: 300, output: 150 });
    });

    it("returns a copy of totalTokens", () => {
      state.addTokens(100, 50);
      const tokens = state.totalTokens;
      tokens.input = 999;
      expect(state.totalTokens.input).toBe(100);
    });
  });
});
