import { describe, it, expect, vi } from "vitest";
import { AgentRunner } from "./runner.js";
import type { AgentConfig } from "../config/schema.js";
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

function makeAgentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    command: "claude",
    allowed_tools: ["Bash", "Read"],
    max_turns: 30,
    turn_timeout_ms: 900000,
    stall_timeout_ms: 120000,
    ...overrides,
  };
}

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "id-1",
    identifier: "SIN-42",
    title: "Fix login bug",
    description: "Users cannot log in with SSO",
    state: "Todo",
    priority: 1,
    created_at: "2025-01-01T00:00:00Z",
    labels: ["bug", "auth"],
    blockers: [],
    ...overrides,
  };
}

describe("AgentRunner", () => {
  describe("constructor", () => {
    it("creates an instance without errors", () => {
      const runner = new AgentRunner(makeAgentConfig(), "Fix {{issue.identifier}}");
      expect(runner).toBeInstanceOf(AgentRunner);
    });
  });

  describe("updateConfig", () => {
    it("updates config and prompt template", () => {
      const runner = new AgentRunner(makeAgentConfig(), "template-1");
      const newConfig = makeAgentConfig({ max_turns: 10 });
      runner.updateConfig(newConfig, "template-2");
      // No public accessor, but verify it doesn't throw
      expect(runner).toBeInstanceOf(AgentRunner);
    });
  });

  describe("getPid", () => {
    it("returns -1 for a process with no pid", () => {
      const runner = new AgentRunner(makeAgentConfig(), "test");
      const fakeProcNoPid = { pid: undefined } as any;
      expect(runner.getPid(fakeProcNoPid)).toBe(-1);
    });

    it("returns the process pid", () => {
      const runner = new AgentRunner(makeAgentConfig(), "test");
      const fakeProc = { pid: 12345 } as any;
      expect(runner.getPid(fakeProc)).toBe(12345);
    });
  });

  describe("run", () => {
    it("spawns the configured command and returns a result", async () => {
      // Use 'echo' as the agent command for a quick, deterministic test
      const config = makeAgentConfig({
        command: "echo",
        allowed_tools: [],
        max_turns: 1,
        turn_timeout_ms: 5000,
        stall_timeout_ms: 0,
      });
      const runner = new AgentRunner(config, "test prompt");
      const issue = makeIssue();

      const result = await runner.run(issue, "/tmp", null);

      expect(result.outcome).toBe("succeeded");
      expect(result.session.turn).toBe(1);
      expect(result.tokens).toEqual({ input: 0, output: 0 });
    });

    it("reports failure for a command that exits non-zero", async () => {
      const config = makeAgentConfig({
        command: "false",
        allowed_tools: [],
        max_turns: 1,
        turn_timeout_ms: 5000,
        stall_timeout_ms: 0,
      });
      const runner = new AgentRunner(config, "test");
      const issue = makeIssue();

      const result = await runner.run(issue, "/tmp", null);

      expect(result.outcome).toBe("failed");
      expect(result.error).toContain("exited with code");
    });

    it("increments turn on continuation", async () => {
      const config = makeAgentConfig({
        command: "echo",
        allowed_tools: [],
        max_turns: 1,
        turn_timeout_ms: 5000,
        stall_timeout_ms: 0,
      });
      const runner = new AgentRunner(config, "test");
      const issue = makeIssue();

      const { session: firstSession } = await runner.run(issue, "/tmp", null);
      const result = await runner.run(issue, "/tmp", firstSession);

      expect(result.session.turn).toBe(2);
      expect(result.session.threadId).toBe(firstSession.threadId);
    });

    it("invokes onEvent callback", async () => {
      const config = makeAgentConfig({
        command: "echo",
        allowed_tools: [],
        max_turns: 1,
        turn_timeout_ms: 5000,
        stall_timeout_ms: 0,
      });
      const runner = new AgentRunner(config, "test");
      const onEvent = vi.fn();

      await runner.run(makeIssue(), "/tmp", null, { onEvent });

      // echo outputs text that won't parse as JSON, so it triggers the raw output path
      expect(onEvent).toHaveBeenCalled();
    });
  });
});
