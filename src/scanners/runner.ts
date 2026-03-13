import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, relative, extname } from "node:path";
import { Cron } from "croner";
import type { ScannersConfig, ScannerModuleConfig } from "../config/schema.js";
import type { TrackerAdapter } from "../tracker/types.js";
import type { Finding } from "../shared/types.js";
import type { FileChunk } from "./modules/base.js";
import { ScannerRegistry } from "./registry.js";
import { deduplicateFindings } from "./dedup.js";
import { createIssuesFromFindings } from "./issue-creator.js";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("scanner-runner");
const MAX_CHUNK_SIZE = 5000; // lines per chunk

export class ScannerRunner {
  private config: ScannersConfig;
  private repoRoot: string;
  private tracker: TrackerAdapter;
  private registry = new ScannerRegistry();
  private cronJob: Cron | null = null;

  constructor(config: ScannersConfig, repoRoot: string, tracker: TrackerAdapter) {
    this.config = config;
    this.repoRoot = resolve(repoRoot);
    this.tracker = tracker;
  }

  updateConfig(config: ScannersConfig): void {
    this.config = config;
  }

  start(): void {
    if (this.config.schedule) {
      this.cronJob = new Cron(this.config.schedule, () => {
        logger.info("scheduled scan triggered");
        this.runAll().catch((err) => logger.error({ err }, "scheduled scan failed"));
      });
      logger.info({ schedule: this.config.schedule }, "scanner schedule started");
    }
  }

  stop(): void {
    this.cronJob?.stop();
    this.cronJob = null;
  }

  async runAll(fileFilter?: string[]): Promise<{ findings: Finding[]; created: number }> {
    const enabledModules = Object.entries(this.config.modules)
      .filter(([, cfg]) => cfg.enabled);

    if (enabledModules.length === 0) {
      logger.info("no scanners enabled");
      return { findings: [], created: 0 };
    }

    logger.info({ modules: enabledModules.map(([name]) => name) }, "starting scan");

    const allFindings: Finding[] = [];

    for (const [name, moduleConfig] of enabledModules) {
      const scanner = this.registry.get(name);
      if (!scanner) {
        logger.warn({ name }, "scanner module not found in registry");
        continue;
      }

      try {
        const files = this.collectFiles(moduleConfig, fileFilter);
        const chunks = this.chunkFiles(files);

        logger.info({ scanner: name, files: files.length, chunks: chunks.length }, "analyzing");

        for (const chunk of chunks) {
          const findings = await scanner.analyze(chunk, moduleConfig);
          allFindings.push(...findings);
        }
      } catch (err) {
        logger.error({ err, scanner: name }, "scanner failed");
      }
    }

    // Deduplicate
    let deduplicated = allFindings;
    if (this.config.linear.dedup) {
      deduplicated = await deduplicateFindings(allFindings, this.tracker, this.config.linear.labels);
    }

    // Create issues
    const created = await createIssuesFromFindings(deduplicated, this.tracker, this.config);

    logger.info({ totalFindings: allFindings.length, deduplicated: deduplicated.length, created }, "scan complete");
    return { findings: deduplicated, created };
  }

  async runModule(moduleName: string, fileFilter?: string[]): Promise<Finding[]> {
    const moduleConfig = this.config.modules[moduleName];
    if (!moduleConfig) throw new Error(`Scanner module "${moduleName}" not configured`);

    const scanner = this.registry.get(moduleName);
    if (!scanner) throw new Error(`Scanner module "${moduleName}" not found in registry`);

    const files = this.collectFiles(moduleConfig, fileFilter);
    const chunks = this.chunkFiles(files);
    const findings: Finding[] = [];

    for (const chunk of chunks) {
      findings.push(...await scanner.analyze(chunk, moduleConfig));
    }

    return findings;
  }

  listModules(): Array<{ name: string; enabled: boolean; description: string }> {
    return this.registry.list().map((s) => ({
      name: s.name,
      enabled: this.config.modules[s.name]?.enabled ?? false,
      description: s.description,
    }));
  }

  private collectFiles(
    config: ScannerModuleConfig,
    fileFilter?: string[],
  ): Array<{ path: string; content: string }> {
    const include = config.include ?? ["src/**/*.ts"];
    const exclude = new Set(config.exclude ?? []);
    const files: Array<{ path: string; content: string }> = [];

    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = resolve(dir, entry.name);
        const relPath = relative(this.repoRoot, fullPath);

        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        if (exclude.has(relPath)) continue;

        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          if (fileFilter && !fileFilter.some((f) => relPath.includes(f))) continue;
          if (!this.matchesGlob(relPath, include)) continue;

          try {
            const content = readFileSync(fullPath, "utf-8");
            files.push({ path: relPath, content });
          } catch {
            // Skip unreadable files
          }
        }
      }
    };

    walk(this.repoRoot);
    return files;
  }

  private chunkFiles(files: Array<{ path: string; content: string }>): FileChunk[][] {
    const chunks: FileChunk[][] = [];
    let currentChunk: FileChunk[] = [];
    let currentLines = 0;

    for (const file of files) {
      const lines = file.content.split("\n");
      const chunk: FileChunk = {
        path: file.path,
        content: file.content,
        startLine: 1,
        endLine: lines.length,
      };

      if (currentLines + lines.length > MAX_CHUNK_SIZE && currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentLines = 0;
      }

      currentChunk.push(chunk);
      currentLines += lines.length;
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  private matchesGlob(filePath: string, patterns: string[]): boolean {
    // Simple glob matching (supports ** and *)
    // IMPORTANT: escape dots FIRST, before replacing * and **
    for (const pattern of patterns) {
      const regex = pattern
        .replace(/\./g, "\\.")           // escape dots first
        .replace(/\*\*/g, "{{GLOBSTAR}}")
        .replace(/\*/g, "[^/]*")
        .replace(/{{GLOBSTAR}}/g, ".*");

      if (new RegExp(`^${regex}$`).test(filePath)) return true;
    }
    return false;
  }
}
