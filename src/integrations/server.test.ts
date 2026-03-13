import { describe, it, expect, vi, beforeEach } from "vitest";
import { IntegrationServer } from "./server.js";
import type { IntegrationsConfig, ScannersConfig } from "../config/schema.js";
import type { TrackerAdapter } from "../tracker/types.js";
import type { Issue } from "../shared/types.js";

vi.mock("../shared/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

function makeIntegrationsConfig(
  overrides: Partial<IntegrationsConfig> = {},
): IntegrationsConfig {
  return {
    server_port: 0, // Use random port for tests
    sources: {},
    ...overrides,
  };
}

function makeScannersConfig(): ScannersConfig {
  return {
    schedule: "",
    on_push: false,
    modules: {},
    linear: { target_state: "Backlog", labels: ["auto-detected"], dedup: true },
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

describe("IntegrationServer", () => {
  let tracker: TrackerAdapter;
  let scannersConfig: ScannersConfig;

  beforeEach(() => {
    tracker = makeTracker();
    scannersConfig = makeScannersConfig();
  });

  describe("constructor", () => {
    it("creates an instance", () => {
      const server = new IntegrationServer(
        makeIntegrationsConfig(),
        scannersConfig,
        tracker,
      );
      expect(server).toBeDefined();
    });
  });

  describe("listSources", () => {
    it("lists all registered integration sources", () => {
      const server = new IntegrationServer(
        makeIntegrationsConfig(),
        scannersConfig,
        tracker,
      );
      const sources = server.listSources();
      expect(sources.length).toBeGreaterThan(0);
      for (const source of sources) {
        expect(source).toHaveProperty("name");
        expect(source).toHaveProperty("enabled");
        expect(source).toHaveProperty("description");
      }
    });

    it("marks configured sources as enabled", () => {
      const config = makeIntegrationsConfig({
        sources: {
          sentry: {
            enabled: true,
            secret: "test-secret",
            auto_triage: false,
            ignore_environments: [],
            ignore_patterns: [],
            events: [],
          },
        },
      });
      const server = new IntegrationServer(config, scannersConfig, tracker);
      const sources = server.listSources();
      const sentry = sources.find((s) => s.name === "sentry");
      expect(sentry?.enabled).toBe(true);
    });
  });

  describe("updateConfig", () => {
    it("updates config without error", () => {
      const server = new IntegrationServer(
        makeIntegrationsConfig(),
        scannersConfig,
        tracker,
      );
      const newConfig = makeIntegrationsConfig({ server_port: 4000 });
      expect(() => server.updateConfig(newConfig, scannersConfig)).not.toThrow();
    });
  });

  describe("start and stop", () => {
    it("does not start server when no sources are enabled", async () => {
      const server = new IntegrationServer(
        makeIntegrationsConfig(),
        scannersConfig,
        tracker,
      );
      // Should resolve without starting any server
      await server.start();
      await server.stop();
    });

    it("starts and stops server with enabled source", async () => {
      const config = makeIntegrationsConfig({
        server_port: 0,
        sources: {
          sentry: {
            enabled: true,
            secret: "test-secret",
            auto_triage: false,
            ignore_environments: [],
            ignore_patterns: [],
            events: [],
          },
        },
      });
      const server = new IntegrationServer(config, scannersConfig, tracker);

      await server.start();
      await server.stop();
    });
  });
});
