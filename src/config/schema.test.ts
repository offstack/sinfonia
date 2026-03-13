import { describe, it, expect } from "vitest";
import { sinfoniaConfigSchema } from "./schema.js";

describe("sinfoniaConfigSchema", () => {
  const minimalConfig = {
    project: { name: "test" },
    tracker: {
      kind: "linear",
      api_key: "lin_api_abc",
      project_slug: "TEST",
    },
  };

  it("parses a minimal valid config with defaults", () => {
    const result = sinfoniaConfigSchema.safeParse(minimalConfig);
    expect(result.success).toBe(true);
    if (!result.success) return;

    const config = result.data;
    expect(config.project.name).toBe("test");
    expect(config.project.repo).toBe("./");
    expect(config.tracker.active_states).toEqual(["Todo", "In Progress", "Rework"]);
    expect(config.orchestrator.polling_interval_ms).toBe(30000);
    expect(config.orchestrator.max_concurrent_agents).toBe(5);
    expect(config.workspace.strategy).toBe("worktree");
    expect(config.agent.command).toBe("claude");
    expect(config.agent.max_turns).toBe(30);
    expect(config.dashboard.tui).toBe(true);
    expect(config.dashboard.web).toBe(false);
  });

  it("rejects config without project name", () => {
    const result = sinfoniaConfigSchema.safeParse({
      project: { name: "" },
      tracker: { kind: "linear", api_key: "key", project_slug: "T" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects config without tracker", () => {
    const result = sinfoniaConfigSchema.safeParse({
      project: { name: "test" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid tracker kind", () => {
    const result = sinfoniaConfigSchema.safeParse({
      ...minimalConfig,
      tracker: { kind: "jira", api_key: "key", project_slug: "T" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid workspace strategy", () => {
    const result = sinfoniaConfigSchema.safeParse({
      ...minimalConfig,
      workspace: { strategy: "invalid" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid workspace strategies", () => {
    for (const strategy of ["worktree", "clone", "directory"]) {
      const result = sinfoniaConfigSchema.safeParse({
        ...minimalConfig,
        workspace: { strategy },
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects negative polling interval", () => {
    const result = sinfoniaConfigSchema.safeParse({
      ...minimalConfig,
      orchestrator: { polling_interval_ms: -1 },
    });
    expect(result.success).toBe(false);
  });

  it("applies scanner module defaults", () => {
    const result = sinfoniaConfigSchema.safeParse({
      ...minimalConfig,
      scanners: {
        modules: {
          security: { enabled: true },
        },
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const securityModule = result.data.scanners.modules.security;
    expect(securityModule.enabled).toBe(true);
    expect(securityModule.include).toEqual(["src/**/*.ts"]);
    expect(securityModule.exclude).toEqual([]);
  });

  it("applies integration source defaults", () => {
    const result = sinfoniaConfigSchema.safeParse({
      ...minimalConfig,
      integrations: {
        sources: {
          sentry: { enabled: true, secret: "s3cret" },
        },
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const sentry = result.data.integrations.sources.sentry;
    expect(sentry.enabled).toBe(true);
    expect(sentry.auto_triage).toBe(false);
    expect(sentry.ignore_environments).toEqual([]);
    expect(sentry.ignore_patterns).toEqual([]);
  });
});
