import Fastify, { type FastifyInstance } from "fastify";
import type { Orchestrator } from "../../orchestrator/index.js";
import type { ScannerRunner } from "../../scanners/runner.js";
import type { IntegrationServer } from "../../integrations/server.js";
import { createLogger } from "../../shared/logger.js";
import { dashboardHtml } from "./ui.js";

const logger = createLogger("web-dashboard");

export class WebDashboard {
  private app: FastifyInstance | null = null;
  private orchestrator: Orchestrator;
  private scannerRunner: ScannerRunner | null;
  private integrationServer: IntegrationServer | null;
  private port: number;
  private projectName: string;
  private projectSlug: string;

  constructor(opts: {
    orchestrator: Orchestrator;
    scannerRunner?: ScannerRunner | null;
    integrationServer?: IntegrationServer | null;
    port: number;
    projectName: string;
    projectSlug: string;
  }) {
    this.orchestrator = opts.orchestrator;
    this.scannerRunner = opts.scannerRunner ?? null;
    this.integrationServer = opts.integrationServer ?? null;
    this.port = opts.port;
    this.projectName = opts.projectName;
    this.projectSlug = opts.projectSlug;
  }

  async start(): Promise<void> {
    this.app = Fastify({ logger: false });

    // Serve the dashboard HTML
    this.app.get("/", async (_req, reply) => {
      reply.type("text/html").send(dashboardHtml(this.projectName, this.projectSlug));
    });

    // State snapshot API
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
        scanners: this.scannerRunner?.listModules() ?? [],
        integrations: this.integrationServer?.listSources() ?? [],
      };
    });

    // Trigger refresh
    this.app.post("/api/v1/refresh", async () => {
      this.orchestrator.requestRefresh();
      return { status: "queued" };
    });

    // Health check
    this.app.get("/health", async () => ({ status: "ok" }));

    await this.app.listen({ port: this.port, host: "0.0.0.0" });
    logger.info({ port: this.port }, "web dashboard started");
  }

  async stop(): Promise<void> {
    if (this.app) {
      await this.app.close();
      this.app = null;
    }
  }
}
