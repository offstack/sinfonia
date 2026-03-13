import Fastify, { type FastifyInstance } from "fastify";
import type { Orchestrator } from "../../orchestrator/index.js";
import type { ScannerRunner } from "../../scanners/runner.js";
import type { IntegrationServer } from "../../integrations/server.js";
import type { TrackerAdapter } from "../../tracker/types.js";
import {
  toggleScanner,
  toggleIntegration,
  updateStateFlow,
  switchProject,
  updateOrchestratorSettings,
} from "../../config/mutator.js";
import { loadConfig } from "../../config/loader.js";
import { createLogger } from "../../shared/logger.js";
import { dashboardHtml } from "./ui.js";

const logger = createLogger("web-dashboard");

export class WebDashboard {
  private app: FastifyInstance | null = null;
  private orchestrator: Orchestrator;
  private scannerRunner: ScannerRunner | null;
  private integrationServer: IntegrationServer | null;
  private tracker: TrackerAdapter;
  private port: number;
  private projectName: string;
  private projectSlug: string;
  private configPath: string;

  constructor(opts: {
    orchestrator: Orchestrator;
    tracker: TrackerAdapter;
    scannerRunner?: ScannerRunner | null;
    integrationServer?: IntegrationServer | null;
    port: number;
    projectName: string;
    projectSlug: string;
    configPath: string;
  }) {
    this.orchestrator = opts.orchestrator;
    this.tracker = opts.tracker;
    this.scannerRunner = opts.scannerRunner ?? null;
    this.integrationServer = opts.integrationServer ?? null;
    this.port = opts.port;
    this.projectName = opts.projectName;
    this.projectSlug = opts.projectSlug;
    this.configPath = opts.configPath;
  }

  async start(): Promise<void> {
    this.app = Fastify({ logger: false });

    // ── HTML Dashboard ──────────────────────────────────────────────────
    this.app.get("/", async (_req, reply) => {
      reply.type("text/html").send(dashboardHtml(this.projectName, this.projectSlug));
    });

    // ── State Snapshot ──────────────────────────────────────────────────
    this.app.get("/api/v1/state", async () => {
      const snap = this.orchestrator.snapshot();
      return {
        project: { name: this.projectName, slug: this.projectSlug },
        running_sessions: snap.running.map((s) => ({
          session_id: s.sessionId,
          issue_id: s.issueId,
          issue_identifier: s.issueIdentifier,
          started_at: s.startedAt.toISOString(),
          elapsed_ms: Date.now() - s.startedAt.getTime(),
          turn: s.turn,
          state: s.state,
          tokens: s.tokens.input + s.tokens.output,
          tokens_in: s.tokens.input,
          tokens_out: s.tokens.output,
          last_event: s.lastEvent,
        })),
        retry_queue: snap.retryQueue.map((r) => ({
          issue_id: r.issueId,
          identifier: r.issueIdentifier,
          attempt: r.attempt,
          due_at_ms: r.dueAt,
          error: r.error,
          is_continuation: r.isContinuation,
        })),
        completed: snap.completed,
        token_usage: {
          input: snap.totalTokens.input,
          output: snap.totalTokens.output,
          total: snap.totalTokens.input + snap.totalTokens.output,
        },
        runtime_ms: snap.runtimeMs,
        max_agents: snap.maxAgents,
        polling_interval_ms: snap.pollingIntervalMs,
        scanners: this.scannerRunner?.listModules() ?? [],
        integrations: this.integrationServer?.listSources() ?? [],
      };
    });

    // ── Trigger Refresh ─────────────────────────────────────────────────
    this.app.post("/api/v1/refresh", async () => {
      this.orchestrator.requestRefresh();
      return { success: true };
    });

    // ── Config (safe subset) ────────────────────────────────────────────
    this.app.get("/api/v1/config", async () => {
      try {
        const config = loadConfig(this.configPath);
        return {
          success: true,
          config: {
            project: config.project,
            orchestrator: {
              polling_interval_ms: config.orchestrator.polling_interval_ms,
              max_concurrent_agents: config.orchestrator.max_concurrent_agents,
              state_flow: config.orchestrator.state_flow,
            },
            tracker: {
              kind: config.tracker.kind,
              project_slug: config.tracker.project_slug,
              active_states: config.tracker.active_states,
            },
          },
        };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    });

    // ── Toggle Scanner ──────────────────────────────────────────────────
    this.app.post<{
      Params: { name: string };
      Body: { enabled: boolean };
    }>("/api/v1/scanners/:name/toggle", async (req) => {
      try {
        const { name } = req.params;
        const { enabled } = req.body as { enabled: boolean };
        toggleScanner(this.configPath, name, enabled);
        logger.info({ name, enabled }, "scanner toggled via web");
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    });

    // ── Toggle Integration ──────────────────────────────────────────────
    this.app.post<{
      Params: { name: string };
      Body: { enabled: boolean };
    }>("/api/v1/integrations/:name/toggle", async (req) => {
      try {
        const { name } = req.params;
        const { enabled } = req.body as { enabled: boolean };
        toggleIntegration(this.configPath, name, enabled);
        logger.info({ name, enabled }, "integration toggled via web");
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    });

    // ── Update State Flow ───────────────────────────────────────────────
    this.app.post("/api/v1/config/state-flow", async (req) => {
      try {
        const body = req.body as { on_dispatch?: string; on_success?: string; on_failure?: string };
        updateStateFlow(this.configPath, body);
        logger.info({ flow: body }, "state flow updated via web");
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    });

    // ── Update Orchestrator Settings ────────────────────────────────────
    this.app.post("/api/v1/config/orchestrator", async (req) => {
      try {
        const body = req.body as { polling_interval_ms?: number; max_concurrent_agents?: number };
        updateOrchestratorSettings(this.configPath, body);
        logger.info({ settings: body }, "orchestrator settings updated via web");
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    });

    // ── List Projects ───────────────────────────────────────────────────
    this.app.get("/api/v1/projects", async () => {
      try {
        const teams = await this.tracker.listTeams();
        return {
          success: true,
          teams: teams.map((t) => ({
            id: t.id,
            key: t.key,
            name: t.name,
            states: t.states.map((s) => s.name),
          })),
          current: this.projectSlug,
        };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    });

    // ── Switch Project ──────────────────────────────────────────────────
    this.app.post("/api/v1/projects/use", async (req) => {
      try {
        const { slug } = req.body as { slug: string };
        if (!slug) return { success: false, error: "slug is required" };
        switchProject(this.configPath, slug);
        logger.info({ slug }, "project switched via web");
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    });

    // ── Force Dispatch ──────────────────────────────────────────────────
    this.app.post<{
      Params: { identifier: string };
    }>("/api/v1/dispatch/:identifier", async (req) => {
      try {
        const { identifier } = req.params;
        await this.orchestrator.forceDispatch(identifier);
        logger.info({ identifier }, "force dispatch via web");
        return { success: true };
      } catch (err) {
        return { success: false, error: String(err) };
      }
    });

    // ── Health Check ────────────────────────────────────────────────────
    this.app.get("/health", async () => ({ status: "ok" }));

    try {
      await this.app.listen({ port: this.port, host: "0.0.0.0" });
      logger.info({ port: this.port }, "web dashboard started");
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === "EADDRINUSE") {
        logger.error({ port: this.port }, `port ${this.port} is already in use — web dashboard disabled`);
        this.app = null;
      } else {
        throw err;
      }
    }
  }

  async stop(): Promise<void> {
    if (this.app) {
      await this.app.close();
      this.app = null;
    }
  }
}
