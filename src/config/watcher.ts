import { watch, type FSWatcher } from "chokidar";
import { loadConfig } from "./loader.js";
import type { SinfoniaConfig } from "./schema.js";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("config-watcher");

export type ConfigChangeHandler = (config: SinfoniaConfig) => void;

export class ConfigWatcher {
  private watcher: FSWatcher | null = null;
  private currentConfig: SinfoniaConfig;
  private listeners: ConfigChangeHandler[] = [];
  private configPath: string;

  constructor(configPath: string, initialConfig: SinfoniaConfig) {
    this.configPath = configPath;
    this.currentConfig = initialConfig;
  }

  get config(): SinfoniaConfig {
    return this.currentConfig;
  }

  onChange(handler: ConfigChangeHandler): void {
    this.listeners.push(handler);
  }

  start(): void {
    this.watcher = watch(this.configPath, {
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    });

    this.watcher.on("change", () => {
      this.reload();
    });

    logger.info({ path: this.configPath }, "watching config file");
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
  }

  reload(): boolean {
    try {
      const newConfig = loadConfig(this.configPath);
      this.currentConfig = newConfig;
      for (const listener of this.listeners) {
        listener(newConfig);
      }
      logger.info("config reloaded successfully");
      return true;
    } catch (err) {
      logger.error({ err }, "config reload failed, keeping previous config");
      return false;
    }
  }
}
