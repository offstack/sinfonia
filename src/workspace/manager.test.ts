import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WorkspaceManager } from "./manager.js";
import type { WorkspaceConfig } from "../config/schema.js";
import { mkdtempSync, mkdirSync, rmdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("../shared/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

function makeWorkspaceConfig(overrides: Partial<WorkspaceConfig> = {}): WorkspaceConfig {
  return {
    root: "./.sinfonia/workspaces",
    strategy: "directory",
    hooks: { after_create: "", before_run: "", after_run: "", before_remove: "" },
    hooks_timeout_ms: 60000,
    ...overrides,
  };
}

describe("WorkspaceManager", () => {
  describe("getWorkspacePath", () => {
    it("returns the workspace path for an issue identifier", () => {
      const config = makeWorkspaceConfig({ root: "/tmp/ws" });
      const manager = new WorkspaceManager(config, "/repo");

      const result = manager.getWorkspacePath("SIN-1");
      expect(result).toBe("/tmp/ws/SIN-1");
    });

    it("sanitizes identifiers with unsafe chars", () => {
      const config = makeWorkspaceConfig({ root: "/tmp/ws" });
      const manager = new WorkspaceManager(config, "/repo");

      const result = manager.getWorkspacePath("SIN 1");
      expect(result).toBe("/tmp/ws/SIN_1");
    });
  });

  describe("updateConfig", () => {
    it("updates the workspace config", () => {
      const config = makeWorkspaceConfig({ root: "/tmp/ws-old" });
      const manager = new WorkspaceManager(config, "/repo");

      const newConfig = makeWorkspaceConfig({ root: "/tmp/ws-new" });
      manager.updateConfig(newConfig);

      expect(manager.getWorkspacePath("SIN-1")).toBe("/tmp/ws-new/SIN-1");
    });
  });

  describe("listWorkspaces", () => {
    let tmpRoot: string;

    beforeEach(() => {
      tmpRoot = mkdtempSync(join(tmpdir(), "sinfonia-ws-test-"));
    });

    afterEach(() => {
      rmSync(tmpRoot, { recursive: true, force: true });
    });

    it("returns empty array when root does not exist", () => {
      const config = makeWorkspaceConfig({ root: "/nonexistent/path/xyz" });
      const manager = new WorkspaceManager(config, "/repo");

      expect(manager.listWorkspaces()).toEqual([]);
    });

    it("returns empty array for an empty root directory", () => {
      const config = makeWorkspaceConfig({ root: tmpRoot });
      const manager = new WorkspaceManager(config, "/repo");

      expect(manager.listWorkspaces()).toEqual([]);
    });

    it("lists subdirectories in the root", () => {
      mkdirSync(join(tmpRoot, "SIN-1"));
      mkdirSync(join(tmpRoot, "SIN-2"));

      const config = makeWorkspaceConfig({ root: tmpRoot });
      const manager = new WorkspaceManager(config, "/repo");

      const workspaces = manager.listWorkspaces();
      expect(workspaces).toContain("SIN-1");
      expect(workspaces).toContain("SIN-2");
      expect(workspaces).toHaveLength(2);
    });
  });

  describe("createForIssue", () => {
    let tmpRoot: string;

    beforeEach(() => {
      tmpRoot = mkdtempSync(join(tmpdir(), "sinfonia-ws-test-"));
    });

    afterEach(() => {
      rmSync(tmpRoot, { recursive: true, force: true });
    });

    it("creates a directory workspace for an issue", async () => {
      const config = makeWorkspaceConfig({ root: tmpRoot, strategy: "directory" });
      const manager = new WorkspaceManager(config, "/repo");

      const issue = {
        id: "id-1",
        identifier: "SIN-1",
        title: "Fix bug",
        description: "",
        state: "Todo",
        priority: 1,
        created_at: "2025-01-01T00:00:00Z",
        labels: [],
        blockers: [],
      };

      const wsPath = await manager.createForIssue(issue);
      expect(wsPath).toContain("SIN-1");

      // Verify workspace is listed
      const workspaces = manager.listWorkspaces();
      expect(workspaces.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("remove", () => {
    let tmpRoot: string;

    beforeEach(() => {
      tmpRoot = mkdtempSync(join(tmpdir(), "sinfonia-ws-test-"));
    });

    afterEach(() => {
      rmSync(tmpRoot, { recursive: true, force: true });
    });

    it("does nothing if the path does not exist", () => {
      const config = makeWorkspaceConfig({ root: tmpRoot, strategy: "directory" });
      const manager = new WorkspaceManager(config, "/repo");

      expect(() => manager.remove("/nonexistent/path")).not.toThrow();
    });

    it("removes a directory workspace", async () => {
      const wsDir = join(tmpRoot, "SIN-1");
      mkdirSync(wsDir);

      const config = makeWorkspaceConfig({ root: tmpRoot, strategy: "directory" });
      const manager = new WorkspaceManager(config, "/repo");

      manager.remove(wsDir);

      const { existsSync } = await import("node:fs");
      expect(existsSync(wsDir)).toBe(false);
    });
  });
});
