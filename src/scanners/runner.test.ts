import { describe, it, expect, vi, beforeEach } from "vitest";
import { ScannerRunner } from "./runner.js";
import type { ScannersConfig } from "../config/schema.js";
import type { TrackerAdapter } from "../tracker/types.js";
import type { Finding, Issue } from "../shared/types.js";

vi.mock("../shared/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("./dedup.js", () => ({
  deduplicateFindings: vi.fn(async (findings: Finding[]) => findings),
}));

vi.mock("./issue-creator.js", () => ({
  createIssuesFromFindings: vi.fn(async (findings: Finding[]) => findings.length),
}));

function makeScannersConfig(overrides: Partial<ScannersConfig> = {}): ScannersConfig {
  return {
    schedule: "",
    on_push: false,
    modules: {},
    linear: { target_state: "Backlog", labels: ["auto-detected"], dedup: true },
    ...overrides,
  };
}

function makeTracker(): TrackerAdapter {
  return {
    fetchCandidateIssues: vi.fn().mockResolvedValue([]),
    fetchIssueStatesByIds: vi.fn().mockResolvedValue(new Map()),
    updateIssueState: vi.fn(),
    createComment: vi.fn(),
    createIssue: vi.fn().mockResolvedValue({} as Issue),
    searchIssues: vi.fn().mockResolvedValue([]),
    listTeams: vi.fn().mockResolvedValue([]),
  };
}

describe("ScannerRunner", () => {
  let tracker: TrackerAdapter;

  beforeEach(() => {
    tracker = makeTracker();
  });

  describe("constructor", () => {
    it("creates an instance", () => {
      const runner = new ScannerRunner(makeScannersConfig(), "/tmp", tracker);
      expect(runner).toBeDefined();
    });
  });

  describe("listModules", () => {
    it("lists all registered scanner modules", () => {
      const runner = new ScannerRunner(makeScannersConfig(), "/tmp", tracker);
      const modules = runner.listModules();
      expect(modules.length).toBeGreaterThan(0);
      for (const mod of modules) {
        expect(mod).toHaveProperty("name");
        expect(mod).toHaveProperty("enabled");
        expect(mod).toHaveProperty("description");
      }
    });

    it("marks configured modules as enabled", () => {
      const config = makeScannersConfig({
        modules: {
          security: {
            enabled: true,
            include: ["src/**/*.ts"],
            exclude: [],
          },
        },
      });
      const runner = new ScannerRunner(config, "/tmp", tracker);
      const modules = runner.listModules();
      const security = modules.find((m) => m.name === "security");
      expect(security?.enabled).toBe(true);
    });
  });

  describe("runAll", () => {
    it("returns empty findings when no modules are enabled", async () => {
      const runner = new ScannerRunner(makeScannersConfig(), "/tmp", tracker);
      const result = await runner.runAll();
      expect(result.findings).toEqual([]);
      expect(result.created).toBe(0);
    });
  });

  describe("runModule", () => {
    it("throws for unconfigured module", async () => {
      const runner = new ScannerRunner(makeScannersConfig(), "/tmp", tracker);
      await expect(runner.runModule("nonexistent")).rejects.toThrow(
        'Scanner module "nonexistent" not configured',
      );
    });
  });

  describe("updateConfig", () => {
    it("updates config without error", () => {
      const runner = new ScannerRunner(makeScannersConfig(), "/tmp", tracker);
      const newConfig = makeScannersConfig({ schedule: "0 3 * * *" });
      expect(() => runner.updateConfig(newConfig)).not.toThrow();
    });
  });

  describe("start and stop", () => {
    it("starts without error when schedule is empty", () => {
      const runner = new ScannerRunner(makeScannersConfig(), "/tmp", tracker);
      expect(() => runner.start()).not.toThrow();
      runner.stop();
    });

    it("starts with cron schedule and stops cleanly", () => {
      const config = makeScannersConfig({ schedule: "0 2 * * *" });
      const runner = new ScannerRunner(config, "/tmp", tracker);
      expect(() => runner.start()).not.toThrow();
      runner.stop();
    });
  });
});
