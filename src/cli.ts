#!/usr/bin/env node

import { Command } from "commander";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { loadConfig, findConfigFile, validateConfig } from "./config/index.js";
import { Sinfonia } from "./index.js";
import { renderDashboard } from "./dashboard/index.js";
import { createLogger } from "./shared/logger.js";

const logger = createLogger("cli");

const program = new Command()
  .name("sinfonia")
  .description("Autonomous code improvement pipeline for Claude Code")
  .version("0.1.0");

// ── sinfonia start ──────────────────────────────────────────────────────

program
  .command("start")
  .description("Start the Sinfonia orchestration pipeline")
  .option("-c, --config <path>", "Path to sinfonia.yaml")
  .option("--orchestrator-only", "Start only the orchestrator (no scanners/integrations)")
  .option("--scanners-only", "Start only the scanners (no orchestrator)")
  .option("--web", "Launch web dashboard instead of TUI")
  .action(async (opts) => {
    const configPath = resolveConfigPath(opts.config);
    const config = loadConfig(configPath);

    const errors = validateConfig(config);
    if (errors.length > 0) {
      console.error("Configuration errors:");
      errors.forEach((e) => console.error(`  - ${e}`));
      process.exit(1);
    }

    const sinfonia = new Sinfonia(config, {
      configPath,
      orchestratorOnly: opts.orchestratorOnly,
      scannersOnly: opts.scannersOnly,
      web: opts.web,
    });

    // Graceful shutdown
    const shutdown = async () => {
      console.log("\nShutting down...");
      await sinfonia.stop();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    await sinfonia.start();
  });

// ── sinfonia status ─────────────────────────────────────────────────────

program
  .command("status")
  .description("Show current Sinfonia status")
  .option("--web", "Open web dashboard")
  .option("-c, --config <path>", "Path to sinfonia.yaml")
  .action(async (opts) => {
    if (opts.web) {
      const configPath = resolveConfigPath(opts.config);
      const config = loadConfig(configPath);
      console.log(`Open http://localhost:${config.dashboard.web_port} in your browser`);
      return;
    }
    console.log("Sinfonia is not running. Use 'sinfonia start' to begin.");
  });

// ── sinfonia scan ───────────────────────────────────────────────────────

program
  .command("scan")
  .description("Run code scanners manually")
  .option("-c, --config <path>", "Path to sinfonia.yaml")
  .option("-m, --modules <names>", "Comma-separated scanner modules to run")
  .option("-f, --files <glob>", "File filter (glob pattern)")
  .action(async (opts) => {
    const configPath = resolveConfigPath(opts.config);
    const config = loadConfig(configPath);

    const { LinearClient } = await import("./tracker/index.js");
    const { ScannerRunner } = await import("./scanners/index.js");

    const tracker = new LinearClient(config.tracker);
    const runner = new ScannerRunner(config.scanners, config.project.repo, tracker);

    const fileFilter = opts.files ? [opts.files] : undefined;

    if (opts.modules) {
      const modules = (opts.modules as string).split(",");
      for (const mod of modules) {
        console.log(`Running scanner: ${mod}...`);
        const findings = await runner.runModule(mod.trim(), fileFilter);
        console.log(`  Found ${findings.length} issues`);
        for (const f of findings) {
          console.log(`  [${f.severity}] ${f.file}${f.line ? `:${f.line}` : ""} — ${f.title}`);
        }
      }
    } else {
      console.log("Running all enabled scanners...");
      const { findings, created } = await runner.runAll(fileFilter);
      console.log(`Scan complete: ${findings.length} findings, ${created} issues created`);
    }
  });

// ── sinfonia dispatch ───────────────────────────────────────────────────

program
  .command("dispatch <issue-id>")
  .description("Force-dispatch a specific issue")
  .option("-c, --config <path>", "Path to sinfonia.yaml")
  .action(async (issueId, opts) => {
    console.log(`Force-dispatching ${issueId}...`);
    console.log("Note: This requires a running Sinfonia instance. Use 'sinfonia start' first.");
  });

// ── sinfonia integrations ───────────────────────────────────────────────

const integrationsCmd = program
  .command("integrations")
  .description("Manage external integrations");

integrationsCmd
  .command("list")
  .option("-c, --config <path>", "Path to sinfonia.yaml")
  .action((opts) => {
    const configPath = resolveConfigPath(opts.config);
    const config = loadConfig(configPath);

    console.log("\nIntegrations:");
    for (const [name, source] of Object.entries(config.integrations.sources)) {
      const status = source.enabled ? "\x1b[32m[ON]\x1b[0m" : "\x1b[31m[OFF]\x1b[0m";
      console.log(`  ${status}  ${name}`);
    }
    console.log();
  });

integrationsCmd
  .command("enable <name>")
  .option("-c, --config <path>", "Path to sinfonia.yaml")
  .action((name, opts) => {
    toggleIntegration(opts.config, name, true);
  });

integrationsCmd
  .command("disable <name>")
  .option("-c, --config <path>", "Path to sinfonia.yaml")
  .action((name, opts) => {
    toggleIntegration(opts.config, name, false);
  });

// ── sinfonia scanners ───────────────────────────────────────────────────

const scannersCmd = program
  .command("scanners")
  .description("Manage code scanners");

scannersCmd
  .command("list")
  .option("-c, --config <path>", "Path to sinfonia.yaml")
  .action((opts) => {
    const configPath = resolveConfigPath(opts.config);
    const config = loadConfig(configPath);

    console.log("\nScanners:");
    for (const [name, mod] of Object.entries(config.scanners.modules)) {
      const status = mod.enabled ? "\x1b[32m[ON]\x1b[0m" : "\x1b[31m[OFF]\x1b[0m";
      console.log(`  ${status}  ${name}`);
    }
    console.log();
  });

scannersCmd
  .command("enable <name>")
  .option("-c, --config <path>", "Path to sinfonia.yaml")
  .action((name, opts) => {
    toggleScanner(opts.config, name, true);
  });

scannersCmd
  .command("disable <name>")
  .option("-c, --config <path>", "Path to sinfonia.yaml")
  .action((name, opts) => {
    toggleScanner(opts.config, name, false);
  });

// ── sinfonia init ───────────────────────────────────────────────────────

program
  .command("init")
  .description("Initialize a new sinfonia.yaml config file")
  .option("--project <name>", "Project name")
  .option("--slug <slug>", "Linear project slug")
  .action((opts) => {
    if (existsSync("sinfonia.yaml")) {
      console.error("sinfonia.yaml already exists. Remove it first if you want to reinitialize.");
      process.exit(1);
    }

    const examplePath = resolve(import.meta.dirname ?? __dirname, "..", "sinfonia.example.yaml");
    if (existsSync(examplePath)) {
      let content = readFileSync(examplePath, "utf-8");
      if (opts.project) content = content.replace("my-project", opts.project);
      if (opts.slug) content = content.replace("MY-PROJECT", opts.slug);
      writeFileSync("sinfonia.yaml", content);
    } else {
      console.log("Creating minimal sinfonia.yaml...");
      const minimal = {
        project: { name: opts.project ?? "my-project", repo: "./" },
        tracker: {
          kind: "linear",
          api_key: "$LINEAR_API_KEY",
          project_slug: opts.slug ?? "MY-PROJECT",
          active_states: ["Todo", "In Progress", "Rework"],
        },
        prompt: "You are working on issue {{issue.identifier}}: {{issue.title}}\n\n{{issue.description}}",
      };
      writeFileSync("sinfonia.yaml", stringifyYaml(minimal));
    }

    console.log("Created sinfonia.yaml");
    console.log("Next steps:");
    console.log("  1. Set your LINEAR_API_KEY environment variable");
    console.log("  2. Edit sinfonia.yaml to configure your project");
    console.log("  3. Run: sinfonia start");
  });

// ── Helpers ─────────────────────────────────────────────────────────────

function resolveConfigPath(configOpt?: string): string {
  if (configOpt) return resolve(configOpt);
  const found = findConfigFile();
  if (!found) {
    console.error("No sinfonia.yaml found. Run 'sinfonia init' to create one.");
    process.exit(1);
  }
  return found;
}

function toggleIntegration(configOpt: string | undefined, name: string, enabled: boolean): void {
  const configPath = resolveConfigPath(configOpt);
  const raw = readFileSync(configPath, "utf-8");
  const parsed = parseYaml(raw) as Record<string, unknown>;

  const integrations = (parsed.integrations ?? {}) as Record<string, unknown>;
  const sources = (integrations.sources ?? {}) as Record<string, Record<string, unknown>>;

  if (!sources[name]) {
    sources[name] = { enabled };
  } else {
    sources[name].enabled = enabled;
  }

  integrations.sources = sources;
  parsed.integrations = integrations;

  writeFileSync(configPath, stringifyYaml(parsed));
  console.log(`Integration "${name}" ${enabled ? "enabled" : "disabled"}`);
}

function toggleScanner(configOpt: string | undefined, name: string, enabled: boolean): void {
  const configPath = resolveConfigPath(configOpt);
  const raw = readFileSync(configPath, "utf-8");
  const parsed = parseYaml(raw) as Record<string, unknown>;

  const scanners = (parsed.scanners ?? {}) as Record<string, unknown>;
  const modules = (scanners.modules ?? {}) as Record<string, Record<string, unknown>>;

  if (!modules[name]) {
    modules[name] = { enabled };
  } else {
    modules[name].enabled = enabled;
  }

  scanners.modules = modules;
  parsed.scanners = scanners;

  writeFileSync(configPath, stringifyYaml(parsed));
  console.log(`Scanner "${name}" ${enabled ? "enabled" : "disabled"}`);
}

// ── Run ─────────────────────────────────────────────────────────────────

program.parse();
