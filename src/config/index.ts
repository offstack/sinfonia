export { sinfoniaConfigSchema, type SinfoniaConfig } from "./schema.js";
export type {
  TrackerConfig,
  OrchestratorConfig,
  WorkspaceConfig,
  AgentConfig,
  ScannersConfig,
  ScannerModuleConfig,
  IntegrationsConfig,
  IntegrationSourceConfig,
  DashboardConfig,
} from "./schema.js";
export { loadConfig, findConfigFile, validateConfig } from "./loader.js";
export { ConfigWatcher, type ConfigChangeHandler } from "./watcher.js";
