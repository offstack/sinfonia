import { describe, it, expect } from "vitest";
import { validateConfig } from "./loader.js";
import type { SinfoniaConfig } from "./schema.js";

function makeValidConfig(overrides: Partial<SinfoniaConfig> = {}): SinfoniaConfig {
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

describe("validateConfig", () => {
  it("returns no errors for a valid config", () => {
    const errors = validateConfig(makeValidConfig());
    expect(errors).toHaveLength(0);
  });

  it("flags missing api_key", () => {
    const config = makeValidConfig();
    config.tracker.api_key = "";
    const errors = validateConfig(config);
    expect(errors.some((e) => e.includes("api_key"))).toBe(true);
  });

  it("flags unexpanded env var in api_key", () => {
    const config = makeValidConfig();
    config.tracker.api_key = "$LINEAR_API_KEY";
    const errors = validateConfig(config);
    expect(errors.some((e) => e.includes("api_key"))).toBe(true);
  });

  it("flags missing project_slug", () => {
    const config = makeValidConfig();
    config.tracker.project_slug = "";
    const errors = validateConfig(config);
    expect(errors.some((e) => e.includes("project_slug"))).toBe(true);
  });

  it("flags empty active_states", () => {
    const config = makeValidConfig();
    config.tracker.active_states = [];
    const errors = validateConfig(config);
    expect(errors.some((e) => e.includes("active_states"))).toBe(true);
  });

  it("flags empty prompt", () => {
    const config = makeValidConfig();
    config.prompt = "";
    const errors = validateConfig(config);
    expect(errors.some((e) => e.includes("prompt"))).toBe(true);
  });
});
