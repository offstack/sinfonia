import type { SinfoniaConfig } from "./config/index.js";
import { ConfigWatcher } from "./config/index.js";
import { LinearClient } from "./tracker/index.js";
import { Orchestrator } from "./orchestrator/index.js";
import { ScannerRunner } from "./scanners/index.js";
import { IntegrationServer } from "./integrations/index.js";
import { WebDashboard, renderDashboard } from "./dashboard/index.js";
import { createLogger } from "./shared/logger.js";

const logger = createLogger("sinfonia");

export interface SinfoniaOptions {
  configPath: string;
  orchestratorOnly?: boolean;
  scannersOnly?: boolean;
  web?: boolean;
}

export class Sinfonia {
  private configWatcher: ConfigWatcher;
  private tracker: LinearClient;
  private orchestrator: Orchestrator | null = null;
  private scannerRunner: ScannerRunner | null = null;
  private integrationServer: IntegrationServer | null = null;
  private webDashboard: WebDashboard | null = null;
  private tuiInterval: ReturnType<typeof setInterval> | null = null;
  private options: SinfoniaOptions;

  constructor(config: SinfoniaConfig, options: SinfoniaOptions) {
    this.options = options;
    this.configWatcher = new ConfigWatcher(options.configPath, config);
    this.tracker = new LinearClient(config.tracker);
  }

  async start(): Promise<void> {
    const config = this.configWatcher.config;

    logger.info({ project: config.project.name }, "Sinfonia starting");

    // Start config watcher
    this.configWatcher.start();
    this.configWatcher.onChange((newConfig) => {
      this.orchestrator?.updateConfig(newConfig);
      this.scannerRunner?.updateConfig(newConfig.scanners);
      this.integrationServer?.updateConfig(newConfig.integrations, newConfig.scanners);
    });

    // Start orchestrator (unless scanners-only mode)
    if (!this.options.scannersOnly) {
      this.orchestrator = new Orchestrator(config, this.tracker);
      this.orchestrator.start();
    }

    // Start scanners (unless orchestrator-only mode)
    if (!this.options.orchestratorOnly) {
      this.scannerRunner = new ScannerRunner(config.scanners, config.project.repo, this.tracker);
      this.scannerRunner.start();
    }

    // Start integration webhook server
    if (!this.options.orchestratorOnly && !this.options.scannersOnly) {
      this.integrationServer = new IntegrationServer(config.integrations, config.scanners, this.tracker);
      await this.integrationServer.start();
    }

    // Start web dashboard if requested
    if (this.options.web && this.orchestrator) {
      this.webDashboard = new WebDashboard({
        orchestrator: this.orchestrator,
        scannerRunner: this.scannerRunner,
        integrationServer: this.integrationServer,
        port: config.dashboard.web_port,
        projectName: config.project.name,
        projectSlug: config.tracker.project_slug,
      });
      await this.webDashboard.start();
      logger.info({ url: `http://localhost:${config.dashboard.web_port}` }, "Web dashboard available");
      console.log(`\n  \x1b[1m\x1b[36m✦ Web dashboard:\x1b[0m http://localhost:${config.dashboard.web_port}\n`);
    }

    // Start TUI if enabled and not in web-only mode
    if (config.dashboard.tui && this.orchestrator && !this.options.web) {
      this.startTui();
    }

    logger.info("Sinfonia running");
  }

  async stop(): Promise<void> {
    this.stopTui();
    this.orchestrator?.stop();
    this.scannerRunner?.stop();
    await this.integrationServer?.stop();
    await this.webDashboard?.stop();
    this.configWatcher.stop();
    logger.info("Sinfonia stopped");
  }

  getOrchestrator(): Orchestrator | null {
    return this.orchestrator;
  }

  getScannerRunner(): ScannerRunner | null {
    return this.scannerRunner;
  }

  getIntegrationServer(): IntegrationServer | null {
    return this.integrationServer;
  }

  private startTui(): void {
    // Clear screen and render
    process.stdout.write("\x1b[2J\x1b[H");

    this.tuiInterval = setInterval(() => {
      if (!this.orchestrator) return;
      const snapshot = this.orchestrator.snapshot();
      const output = renderDashboard(snapshot);

      // Move cursor to top and redraw
      process.stdout.write("\x1b[H");
      process.stdout.write(output);
      process.stdout.write("\x1b[J"); // Clear remaining
    }, 1000);
  }

  private stopTui(): void {
    if (this.tuiInterval) {
      clearInterval(this.tuiInterval);
      this.tuiInterval = null;
    }
  }
}
