import { describe, it, expect, beforeEach } from "vitest";
import { sortCandidates, getAvailableSlots, isEligibleForDispatch, selectDispatchCandidates } from "./dispatcher.js";
import { OrchestratorState } from "./state.js";
import type { Issue } from "../shared/types.js";
import type { OrchestratorConfig } from "../config/schema.js";

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "id-1",
    identifier: "SIN-1",
    title: "Test issue",
    description: "A test issue",
    state: "Todo",
    priority: 2,
    created_at: "2025-01-01T00:00:00Z",
    labels: [],
    blockers: [],
    ...overrides,
  };
}

function makeConfig(overrides: Partial<OrchestratorConfig> = {}): OrchestratorConfig {
  return {
    polling_interval_ms: 30000,
    max_concurrent_agents: 5,
    max_concurrent_by_state: {},
    retry: { max_backoff_ms: 300000 },
    ...overrides,
  };
}

describe("sortCandidates", () => {
  it("sorts by priority ascending", () => {
    const issues = [
      makeIssue({ id: "a", priority: 3 }),
      makeIssue({ id: "b", priority: 1 }),
      makeIssue({ id: "c", priority: 2 }),
    ];
    const sorted = sortCandidates(issues);
    expect(sorted.map((i) => i.priority)).toEqual([1, 2, 3]);
  });

  it("breaks priority ties by created_at", () => {
    const issues = [
      makeIssue({ id: "a", priority: 2, created_at: "2025-01-03T00:00:00Z" }),
      makeIssue({ id: "b", priority: 2, created_at: "2025-01-01T00:00:00Z" }),
    ];
    const sorted = sortCandidates(issues);
    expect(sorted.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("breaks full ties by identifier", () => {
    const issues = [
      makeIssue({ id: "a", identifier: "SIN-2", priority: 2, created_at: "2025-01-01T00:00:00Z" }),
      makeIssue({ id: "b", identifier: "SIN-1", priority: 2, created_at: "2025-01-01T00:00:00Z" }),
    ];
    const sorted = sortCandidates(issues);
    expect(sorted.map((i) => i.identifier)).toEqual(["SIN-1", "SIN-2"]);
  });

  it("does not mutate the original array", () => {
    const issues = [makeIssue({ priority: 3 }), makeIssue({ priority: 1 })];
    sortCandidates(issues);
    expect(issues[0].priority).toBe(3);
  });
});

describe("getAvailableSlots", () => {
  it("returns remaining slots", () => {
    const state = new OrchestratorState();
    const config = makeConfig({ max_concurrent_agents: 3 });
    expect(getAvailableSlots(config, state)).toBe(3);
  });

  it("subtracts running sessions", () => {
    const state = new OrchestratorState();
    state.setRunning("id-1", {
      issueId: "id-1", issueIdentifier: "SIN-1", pid: 1, sessionId: "s1",
      threadId: "t1", turnId: "u1", turn: 1, startedAt: new Date(),
      lastEventAt: new Date(), tokens: { input: 0, output: 0 }, state: "Todo", lastEvent: "",
    });
    const config = makeConfig({ max_concurrent_agents: 3 });
    expect(getAvailableSlots(config, state)).toBe(2);
  });

  it("returns 0 when at capacity", () => {
    const state = new OrchestratorState();
    const config = makeConfig({ max_concurrent_agents: 0 });
    expect(getAvailableSlots(config, state)).toBe(0);
  });
});

describe("isEligibleForDispatch", () => {
  let state: OrchestratorState;
  let config: OrchestratorConfig;
  const terminalStates = new Set(["Done", "Canceled"]);

  beforeEach(() => {
    state = new OrchestratorState();
    config = makeConfig();
  });

  it("returns true for unclaimed issue", () => {
    const issue = makeIssue();
    expect(isEligibleForDispatch(issue, config, state, terminalStates)).toBe(true);
  });

  it("returns false for claimed issue", () => {
    const issue = makeIssue({ id: "id-1" });
    state.claim("id-1");
    expect(isEligibleForDispatch(issue, config, state, terminalStates)).toBe(false);
  });

  it("returns false when per-state concurrency limit reached", () => {
    config = makeConfig({ max_concurrent_by_state: { todo: 1 } });
    state.setRunning("id-0", {
      issueId: "id-0", issueIdentifier: "SIN-0", pid: 1, sessionId: "s0",
      threadId: "t0", turnId: "u0", turn: 1, startedAt: new Date(),
      lastEventAt: new Date(), tokens: { input: 0, output: 0 }, state: "Todo", lastEvent: "",
    });
    const issue = makeIssue({ id: "id-1" });
    expect(isEligibleForDispatch(issue, config, state, terminalStates)).toBe(false);
  });

  it("returns false for Todo issues with blockers", () => {
    const issue = makeIssue({ state: "Todo", blockers: ["blocker-1"] });
    expect(isEligibleForDispatch(issue, config, state, terminalStates)).toBe(false);
  });
});

describe("selectDispatchCandidates", () => {
  it("selects up to available slots", () => {
    const state = new OrchestratorState();
    const config = makeConfig({ max_concurrent_agents: 2 });
    const issues = [
      makeIssue({ id: "a", identifier: "SIN-1", priority: 1 }),
      makeIssue({ id: "b", identifier: "SIN-2", priority: 2 }),
      makeIssue({ id: "c", identifier: "SIN-3", priority: 3 }),
    ];
    const selected = selectDispatchCandidates(issues, config, state, new Set());
    expect(selected).toHaveLength(2);
    expect(selected.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("returns empty array when no slots available", () => {
    const state = new OrchestratorState();
    const config = makeConfig({ max_concurrent_agents: 0 });
    const selected = selectDispatchCandidates([makeIssue()], config, state, new Set());
    expect(selected).toHaveLength(0);
  });
});
