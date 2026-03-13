import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConfigWatcher } from "./watcher.js";
import type { SinfoniaConfig } from "./schema.js";

vi.mock("./loader.js", () => ({
  loadConfig: vi.fn(),
}));

vi.mock("../shared/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { loadConfig } from "./loader.js";

const mockedLoadConfig = vi.mocked(loadConfig);

function makeConfig(overrides: Partial<SinfoniaConfig> = {}): SinfoniaConfig {
  return {
    project: { name: "test", repo: "./" },
    tracker: {
      kind: "linear",
      api_key: "lin_api_abc123",
      project_slug: "TEST",
      active_states: ["Todo"],
    },
    orchestrator: {
      polling_interval_ms: 30000,
      max_concurrent_agents: 5,
      max_concurrent_by_state: {},
      retry: { max_backoff_ms: 300000 },
    },
    workspace: {
      root: "./.sinfonia/workspaces",
      strategy: "worktree",
      hooks: { after_create: "", before_run: "", after_run: "", before_remove: "" },
      hooks_timeout_ms: 60000,
    },
    agent: {
      command: "claude",
      allowed_tools: ["Bash"],
      max_turns: 30,
      turn_timeout_ms: 900000,
      stall_timeout_ms: 120000,
    },
    prompt: "Fix {{issue.identifier}}",
    scanners: {
      schedule: "0 2 * * *",
      on_push: false,
      modules: {},
      linear: { target_state: "Backlog", labels: ["auto-detected"], dedup: true },
    },
    integrations: { server_port: 3100, sources: {} },
    dashboard: { tui: true, web: false, web_port: 3200 },
    ...overrides,
  } as SinfoniaConfig;
}

describe("ConfigWatcher", () => {
  let watcher: ConfigWatcher;
  let initialConfig: SinfoniaConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    initialConfig = makeConfig();
    watcher = new ConfigWatcher("/tmp/sinfonia.yaml", initialConfig);
  });

  describe("config getter", () => {
    it("returns the initial config", () => {
      expect(watcher.config).toBe(initialConfig);
    });
  });

  describe("reload", () => {
    it("updates config on successful reload", () => {
      const newConfig = makeConfig({ prompt: "New prompt" });
      mockedLoadConfig.mockReturnValue(newConfig);

      const result = watcher.reload();

      expect(result).toBe(true);
      expect(watcher.config).toBe(newConfig);
      expect(mockedLoadConfig).toHaveBeenCalledWith("/tmp/sinfonia.yaml");
    });

    it("notifies all onChange listeners on successful reload", () => {
      const newConfig = makeConfig({ prompt: "Updated" });
      mockedLoadConfig.mockReturnValue(newConfig);

      const listener1 = vi.fn();
      const listener2 = vi.fn();
      watcher.onChange(listener1);
      watcher.onChange(listener2);

      watcher.reload();

      expect(listener1).toHaveBeenCalledWith(newConfig);
      expect(listener2).toHaveBeenCalledWith(newConfig);
    });

    it("keeps previous config on reload failure", () => {
      mockedLoadConfig.mockImplementation(() => {
        throw new Error("parse error");
      });

      const result = watcher.reload();

      expect(result).toBe(false);
      expect(watcher.config).toBe(initialConfig);
    });

    it("does not notify listeners on reload failure", () => {
      mockedLoadConfig.mockImplementation(() => {
        throw new Error("bad yaml");
      });

      const listener = vi.fn();
      watcher.onChange(listener);

      watcher.reload();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("onChange", () => {
    it("registers multiple listeners", () => {
      const newConfig = makeConfig();
      mockedLoadConfig.mockReturnValue(newConfig);

      const listeners = [vi.fn(), vi.fn(), vi.fn()];
      listeners.forEach((l) => watcher.onChange(l));

      watcher.reload();

      listeners.forEach((l) => expect(l).toHaveBeenCalledOnce());
    });
  });

  describe("stop", () => {
    it("can be called without starting", () => {
      expect(() => watcher.stop()).not.toThrow();
    });
  });
});
