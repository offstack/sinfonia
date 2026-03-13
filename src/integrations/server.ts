import Fastify, { type FastifyInstance } from "fastify";
import type { IntegrationsConfig } from "../config/schema.js";
import type { TrackerAdapter } from "../tracker/types.js";
import type { ScannersConfig } from "../config/schema.js";
import { IntegrationRegistry } from "./registry.js";
import { deduplicateFindings } from "../scanners/dedup.js";
import { createIssuesFromFindings } from "../scanners/issue-creator.js";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("integrations-server");

export class IntegrationServer {
  private config: IntegrationsConfig;
  private scannersConfig: ScannersConfig;
  private tracker: TrackerAdapter;
  private registry = new IntegrationRegistry();
  private app: FastifyInstance | null = null;

  constructor(config: IntegrationsConfig, scannersConfig: ScannersConfig, tracker: TrackerAdapter) {
    this.config = config;
    this.scannersConfig = scannersConfig;
    this.tracker = tracker;
  }

  updateConfig(config: IntegrationsConfig, scannersConfig: ScannersConfig): void {
    this.config = config;
    this.scannersConfig = scannersConfig;
  }

  async start(): Promise<void> {
    const enabledSources = Object.entries(this.config.sources)
      .filter(([, cfg]) => cfg.enabled);

    if (enabledSources.length === 0) {
      logger.info("no integrations enabled, skipping webhook server");
      return;
    }

    this.app = Fastify({ logger: false });

    // Capture raw request body for HMAC signature verification.
    // Webhook signatures are computed against the exact bytes sent over the wire.
    // Re-serializing parsed JSON with JSON.stringify may produce different bytes.
    // We override the JSON parser to stash the raw string on the request object.
    this.app.removeContentTypeParser("application/json");
    this.app.addContentTypeParser(
      "application/json",
      { parseAs: "string" },
      (req, body, done) => {
        try {
          (req as unknown as { rawBody: string }).rawBody = body as string;
          done(null, JSON.parse(body as string));
        } catch (err) {
          done(err as Error, undefined);
        }
      },
    );

    // Register webhook routes for each enabled integration
    for (const [name, sourceConfig] of enabledSources) {
      const integration = this.registry.get(name);
      if (!integration) {
        logger.warn({ name }, "integration not found in registry");
        continue;
      }

      this.app.post(`/webhooks/${name}`, async (request, reply) => {
        const headers = request.headers as Record<string, string>;
        const rawBody = (request as unknown as { rawBody?: string }).rawBody ?? JSON.stringify(request.body);

        // Verify signature
        if (!integration.verifySignature(headers, rawBody, sourceConfig)) {
          logger.warn({ integration: name }, "webhook signature verification failed");
          return reply.status(401).send({ error: "Invalid signature" });
        }

        // Transform to finding
        const finding = integration.transform(request.body, sourceConfig);
        if (!finding) {
          logger.debug({ integration: name }, "webhook ignored (filtered out)");
          return reply.status(200).send({ status: "ignored" });
        }

        // Deduplicate
        const deduplicated = await deduplicateFindings(
          [finding],
          this.tracker,
          this.scannersConfig.linear.labels,
        );

        if (deduplicated.length === 0) {
          logger.debug({ integration: name }, "webhook ignored (duplicate)");
          return reply.status(200).send({ status: "duplicate" });
        }

        // Determine target state based on auto_triage
        const targetConfig = { ...this.scannersConfig };
        if (sourceConfig.auto_triage) {
          targetConfig.linear = { ...targetConfig.linear, target_state: "Todo" };
        }

        // Create issue
        const created = await createIssuesFromFindings(deduplicated, this.tracker, targetConfig);
        logger.info({ integration: name, created, title: finding.title }, "webhook processed");

        return reply.status(201).send({ status: "created", count: created });
      });

      logger.info({ integration: name, path: `/webhooks/${name}` }, "webhook route registered");
    }

    // Health check
    this.app.get("/health", async () => ({ status: "ok" }));

    try {
      await this.app.listen({ port: this.config.server_port, host: "0.0.0.0" });
      logger.info({ port: this.config.server_port }, "integration webhook server started");
    } catch (err) {
      const error = err as NodeJS.ErrnoException;
      if (error.code === "EADDRINUSE") {
        logger.error({ port: this.config.server_port }, `port ${this.config.server_port} is already in use — webhook server disabled`);
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

  listSources(): Array<{ name: string; enabled: boolean; description: string }> {
    return this.registry.list().map((i) => ({
      name: i.name,
      enabled: this.config.sources[i.name]?.enabled ?? false,
      description: i.description,
    }));
  }
}
