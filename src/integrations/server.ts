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

    // Register webhook routes for each enabled integration
    for (const [name, sourceConfig] of enabledSources) {
      const integration = this.registry.get(name);
      if (!integration) {
        logger.warn({ name }, "integration not found in registry");
        continue;
      }

      this.app.post(`/webhooks/${name}`, async (request, reply) => {
        const headers = request.headers as Record<string, string>;
        const rawBody = JSON.stringify(request.body);

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

    await this.app.listen({ port: this.config.server_port, host: "0.0.0.0" });
    logger.info({ port: this.config.server_port }, "integration webhook server started");
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
