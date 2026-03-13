import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Orchestrator } from "./index.js";
import type { SinfoniaConfig } from "../config/schema.js";
import type { TrackerAdapter } from "../tracker/types.js";
import type { Issue } from "../shared/types.js";

vi.mock("../shared/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
  createSessionLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../workspace/manager.js", () => ({
  WorkspaceManager: vi.fn().mockImplementation(() => ({
    updateConfig: vi.fn(),
    createForIssue: vi.fn().mockResolvedValue("/tmp/workspace"),
    remove: vi.fn(),
    getWorkspacePath: vi.fn().mockReturnValue("/tmp/workspace"),
    runBeforeRunHook: vi.fn().mockResolvedValue(undefined),
    runAfterRunHook: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("../agent/runner.js", () => ({
  AgentRunner: vi.fn().mockImplementation(() => ({
    updateConfig: vi.fn(),
    run: vi.fn().mockResolvedValue({
      outcome: "succeeded",
      session: { sessionId: "s1", threadId: "t1", turnId: "u1", turn: 1 },
      tokens: { input: 100, output: 50 },
    }),
  })),
}));

function makeConfig(overrides: Partial<SinfoniaConfig> = {}): SinfoniaConfig {
  return {
    project: { name: "test", repo: "/tmp/repo" },
    tracker: {
      kind: "linear",
      api_key: "key",
      project_slug: "SIN",
      active_states: ["Todo"],
    },
    orchestrator: {
      polling_interval_ms: 60000,
      max_concurrent_agents: 3,
      max_concurrent_by_state: {},
      retry: { max_backoff_ms: 300000 },
    },
    workspace: {
      root: "/tmp/ws",
      strategy: "directory",
      hooks: { after_create: "", before_run: "", after_run: "", before_remove: "" },
      hooks_timeout_ms: 60000,
    },
    agent: {
      command: "echo",
      allowed_tools: [],
      max_turns: 1,
      turn_timeout_ms: 5000,
      stall_timeout_ms: 120000,
    },
    prompt: "test prompt",
    scanners: {
      schedule: "",
      on_push: false,
      modules: {},
      linear: { target_state: "Backlog", labels: [], dedup: true },
    },
    integrations: { server_port: 3100, sources: {} },
    dashboard: { tui: false, web: false, web_port: 3200 },
    ...overrides,
  };
}

function makeTracker(overrides: Partial<TrackerAdapter> = {}): TrackerAdapter {
  return {
    fetchCandidateIssues: vi.fn().mockResolvedValue([]),
    fetchIssueStatesByIds: vi.fn().mockResolvedValue(new Map()),
    updateIssueState: vi.fn().mockResolvedValue(undefined),
    createComment: vi.fn().mockResolvedValue(undefined),
    createIssue: vi.fn().mockResolvedValue({} as Issue),
    searchIssues: vi.fn().mockResolvedValue([]),
    listTeams: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("Orchestrator", () => {
  let config: SinfoniaConfig;
  let tracker: TrackerAdapter;

  beforeEach(() => {
    vi.useFakeTimers();
    config = makeConfig();
    tracker = makeTracker();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("creates an instance", () => {
      const orch = new Orchestrator(config, tracker);
      expect(orch).toBeInstanceOf(Orchestrator);
    });
  });

  describe("snapshot", () => {
    it("returns initial state snapshot", () => {
      const orch = new Orchestrator(config, tracker);
      const snap = orch.snapshot();
      expect(snap).toEqual({
        running: [],
        retryQueue: [],
        completed: [],
        totalTokens: { input: 0, output: 0 },
        runtimeMs: expect.any(Number),
        maxAgents: 3,
        pollingIntervalMs: 60000,
      });
    });
  });

  describe("onEvent", () => {
    it("registers event handlers that receive events", () => {
      const orch = new Orchestrator(config, tracker);
      const handler = vi.fn();
      orch.onEvent(handler);

      orch.start();
      // emit passes (event, data?) so the handler receives both args
      expect(handler).toHaveBeenCalledWith("started", undefined);

      orch.stop();
      expect(handler).toHaveBeenCalledWith("stopped", undefined);
    });
  });

  describe("start and stop", () => {
    it("starts and stops without error", async () => {
      const orch = new Orchestrator(config, tracker);
      orch.start();

      // pollTick is async - flush microtasks for the promise chain to resolve
      await vi.advanceTimersByTimeAsync(0);
      expect(tracker.fetchCandidateIssues).toHaveBeenCalled();

      orch.stop();
    });

    it("calls fetchCandidateIssues on each poll tick", async () => {
      const orch = new Orchestrator(config, tracker);
      orch.start();

      // Flush initial async tick
      await vi.advanceTimersByTimeAsync(0);
      const initialCalls = (tracker.fetchCandidateIssues as ReturnType<typeof vi.fn>).mock.calls.length;

      // Advance past one polling interval
      await vi.advanceTimersByTimeAsync(config.orchestrator.polling_interval_ms);

      expect((tracker.fetchCandidateIssues as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(initialCalls);

      orch.stop();
    });
  });

  describe("updateConfig", () => {
    it("accepts config updates without error", () => {
      const orch = new Orchestrator(config, tracker);
      const newConfig = makeConfig({ orchestrator: { ...config.orchestrator, max_concurrent_agents: 10 } });
      expect(() => orch.updateConfig(newConfig)).not.toThrow();
    });
  });

  describe("forceDispatch", () => {
    it("throws when issue is not found", async () => {
      const orch = new Orchestrator(config, tracker);
      await expect(orch.forceDispatch("SIN-999")).rejects.toThrow("Issue SIN-999 not found");
    });

    it("dispatches a found issue", async () => {
      const issue: Issue = {
        id: "id-1",
        identifier: "SIN-1",
        title: "Test",
        description: "",
        state: "Todo",
        priority: 2,
        created_at: "2025-01-01",
        labels: [],
        blockers: [],
      };
      const fetchFn = vi.fn().mockResolvedValue([issue]);
      const orch = new Orchestrator(config, makeTracker({ fetchCandidateIssues: fetchFn }));

      // Should not throw
      await orch.forceDispatch("SIN-1");
      expect(fetchFn).toHaveBeenCalled();
    });
  });

  describe("requestRefresh", () => {
    it("triggers an immediate poll tick", async () => {
      const orch = new Orchestrator(config, tracker);
      orch.requestRefresh();
      // pollTick is async - flush microtasks
      await vi.advanceTimersByTimeAsync(0);
      expect(tracker.fetchCandidateIssues).toHaveBeenCalled();
    });
  });
});
