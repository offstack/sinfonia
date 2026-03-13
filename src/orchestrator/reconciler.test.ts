import { describe, it, expect, vi, beforeEach } from "vitest";
import { reconcileRunning } from "./reconciler.js";
import { OrchestratorState } from "./state.js";
import type { RunningSession } from "../shared/types.js";
import type { TrackerAdapter } from "../tracker/types.js";
import type { WorkspaceManager } from "../workspace/manager.js";

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

function makeTracker(stateMap: Map<string, string> = new Map()): TrackerAdapter {
  return {
    fetchCandidateIssues: vi.fn(),
    fetchIssueStatesByIds: vi.fn().mockResolvedValue(stateMap),
    updateIssueState: vi.fn(),
    createComment: vi.fn(),
    createIssue: vi.fn(),
    searchIssues: vi.fn(),
    listTeams: vi.fn(),
  };
}

function makeWorkspace(): WorkspaceManager {
  return {
    create: vi.fn(),
    remove: vi.fn(),
    getPath: vi.fn(),
    exists: vi.fn(),
  } as unknown as WorkspaceManager;
}

describe("reconcileRunning", () => {
  let state: OrchestratorState;
  const activeStates = ["Todo", "In Progress"];

  beforeEach(() => {
    state = new OrchestratorState();
  });

  it("returns empty result when no sessions are running", async () => {
    const result = await reconcileRunning(state, makeTracker(), makeWorkspace(), activeStates, 60000);
    expect(result.staleIssues).toHaveLength(0);
    expect(result.terminalIssues).toHaveLength(0);
    expect(result.stateChanges.size).toBe(0);
  });

  it("detects stalled sessions", async () => {
    const pastDate = new Date(Date.now() - 120000); // 2 minutes ago
    state.setRunning("id-1", makeSession({
      issueId: "id-1",
      lastEventAt: pastDate,
    }));

    const stateMap = new Map([["id-1", "Todo"]]);
    const result = await reconcileRunning(state, makeTracker(stateMap), makeWorkspace(), activeStates, 60000);
    expect(result.staleIssues).toContain("id-1");
  });

  it("does not flag active sessions as stalled", async () => {
    state.setRunning("id-1", makeSession({
      issueId: "id-1",
      lastEventAt: new Date(), // just now
    }));

    const stateMap = new Map([["id-1", "Todo"]]);
    const result = await reconcileRunning(state, makeTracker(stateMap), makeWorkspace(), activeStates, 60000);
    expect(result.staleIssues).toHaveLength(0);
  });

  it("skips stall detection when stallTimeoutMs is 0", async () => {
    const pastDate = new Date(Date.now() - 999999);
    state.setRunning("id-1", makeSession({
      issueId: "id-1",
      lastEventAt: pastDate,
    }));

    const stateMap = new Map([["id-1", "Todo"]]);
    const result = await reconcileRunning(state, makeTracker(stateMap), makeWorkspace(), activeStates, 0);
    expect(result.staleIssues).toHaveLength(0);
  });

  it("detects terminal issues (state no longer active)", async () => {
    state.setRunning("id-1", makeSession({
      issueId: "id-1",
      state: "Todo",
    }));

    const stateMap = new Map([["id-1", "Done"]]);
    const result = await reconcileRunning(state, makeTracker(stateMap), makeWorkspace(), activeStates, 60000);
    expect(result.terminalIssues).toContain("id-1");
  });

  it("detects state changes for still-active issues", async () => {
    state.setRunning("id-1", makeSession({
      issueId: "id-1",
      state: "Todo",
    }));

    const stateMap = new Map([["id-1", "In Progress"]]);
    const result = await reconcileRunning(state, makeTracker(stateMap), makeWorkspace(), activeStates, 60000);
    expect(result.stateChanges.get("id-1")).toBe("In Progress");
    expect(result.terminalIssues).toHaveLength(0);
  });

  it("handles tracker fetch failure gracefully", async () => {
    state.setRunning("id-1", makeSession({ issueId: "id-1" }));

    const tracker = makeTracker();
    (tracker.fetchIssueStatesByIds as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network error"));

    const result = await reconcileRunning(state, tracker, makeWorkspace(), activeStates, 60000);
    // Should not throw, returns empty terminal/state changes
    expect(result.terminalIssues).toHaveLength(0);
    expect(result.stateChanges.size).toBe(0);
  });

  it("active state matching is case-insensitive", async () => {
    state.setRunning("id-1", makeSession({
      issueId: "id-1",
      state: "todo",
    }));

    // Tracker returns uppercase, activeStates has "Todo"
    const stateMap = new Map([["id-1", "TODO"]]);
    const result = await reconcileRunning(state, makeTracker(stateMap), makeWorkspace(), activeStates, 60000);
    expect(result.terminalIssues).toHaveLength(0);
  });
});
