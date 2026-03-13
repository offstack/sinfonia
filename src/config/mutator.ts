/**
 * Config mutation helpers — shared between CLI and Web API.
 * All functions read/write sinfonia.yaml directly and rely on
 * ConfigWatcher to hot-reload changes.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export function toggleScanner(configPath: string, name: string, enabled: boolean): void {
  const parsed = readConfig(configPath);

  const scanners = (parsed.scanners ?? {}) as Record<string, unknown>;
  const modules = (scanners.modules ?? {}) as Record<string, Record<string, unknown>>;

  if (!modules[name]) {
    modules[name] = { enabled };
  } else {
    modules[name].enabled = enabled;
  }

  scanners.modules = modules;
  parsed.scanners = scanners;

  writeConfig(configPath, parsed);
}

export function toggleIntegration(configPath: string, name: string, enabled: boolean): void {
  const parsed = readConfig(configPath);

  const integrations = (parsed.integrations ?? {}) as Record<string, unknown>;
  const sources = (integrations.sources ?? {}) as Record<string, Record<string, unknown>>;

  if (!sources[name]) {
    sources[name] = { enabled };
  } else {
    sources[name].enabled = enabled;
  }

  integrations.sources = sources;
  parsed.integrations = integrations;

  writeConfig(configPath, parsed);
}

export function updateStateFlow(
  configPath: string,
  flow: { on_dispatch?: string; on_success?: string; on_failure?: string },
): void {
  const parsed = readConfig(configPath);

  const orchestrator = (parsed.orchestrator ?? {}) as Record<string, unknown>;
  const stateFlow = (orchestrator.state_flow ?? {}) as Record<string, unknown>;

  if (flow.on_dispatch !== undefined) stateFlow.on_dispatch = flow.on_dispatch;
  if (flow.on_success !== undefined) stateFlow.on_success = flow.on_success;
  if (flow.on_failure !== undefined) {
    if (flow.on_failure === "") {
      delete stateFlow.on_failure;
    } else {
      stateFlow.on_failure = flow.on_failure;
    }
  }

  orchestrator.state_flow = stateFlow;
  parsed.orchestrator = orchestrator;

  writeConfig(configPath, parsed);
}

export function switchProject(configPath: string, slug: string): void {
  const parsed = readConfig(configPath);

  const tracker = (parsed.tracker ?? {}) as Record<string, unknown>;
  tracker.project_slug = slug;
  parsed.tracker = tracker;

  writeConfig(configPath, parsed);
}

export function updateOrchestratorSettings(
  configPath: string,
  settings: { polling_interval_ms?: number; max_concurrent_agents?: number },
): void {
  const parsed = readConfig(configPath);

  const orchestrator = (parsed.orchestrator ?? {}) as Record<string, unknown>;

  if (settings.polling_interval_ms !== undefined) {
    orchestrator.polling_interval_ms = settings.polling_interval_ms;
  }
  if (settings.max_concurrent_agents !== undefined) {
    orchestrator.max_concurrent_agents = settings.max_concurrent_agents;
  }

  parsed.orchestrator = orchestrator;
  writeConfig(configPath, parsed);
}

export function updateIntegrationConfig(
  configPath: string,
  name: string,
  fields: Record<string, unknown>,
): void {
  const parsed = readConfig(configPath);

  const integrations = (parsed.integrations ?? {}) as Record<string, unknown>;
  const sources = (integrations.sources ?? {}) as Record<string, Record<string, unknown>>;

  if (!sources[name]) {
    sources[name] = { enabled: false };
  }

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    sources[name][key] = value;
  }

  integrations.sources = sources;
  parsed.integrations = integrations;

  writeConfig(configPath, parsed);
}

export function updateScannerConfig(
  configPath: string,
  name: string,
  fields: Record<string, unknown>,
): void {
  const parsed = readConfig(configPath);

  const scanners = (parsed.scanners ?? {}) as Record<string, unknown>;
  const modules = (scanners.modules ?? {}) as Record<string, Record<string, unknown>>;

  if (!modules[name]) {
    modules[name] = { enabled: false };
  }

  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    modules[name][key] = value;
  }

  scanners.modules = modules;
  parsed.scanners = scanners;

  writeConfig(configPath, parsed);
}

export function updateIntegrationPort(configPath: string, port: number): void {
  const parsed = readConfig(configPath);
  const integrations = (parsed.integrations ?? {}) as Record<string, unknown>;
  integrations.server_port = port;
  parsed.integrations = integrations;
  writeConfig(configPath, parsed);
}

// ── Internal Helpers ────────────────────────────────────────────────────

function readConfig(configPath: string): Record<string, unknown> {
  const raw = readFileSync(configPath, "utf-8");
  return parseYaml(raw) as Record<string, unknown>;
}

function writeConfig(configPath: string, parsed: Record<string, unknown>): void {
  writeFileSync(configPath, stringifyYaml(parsed));
}
