import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { sinfoniaConfigSchema, type SinfoniaConfig } from "./schema.js";

const ENV_VAR_PATTERN = /\$([A-Z_][A-Z0-9_]*)/g;

function expandEnvVars(value: string): string {
  return value.replace(ENV_VAR_PATTERN, (_, varName: string) => {
    return process.env[varName] ?? "";
  });
}

function expandEnvVarsDeep(obj: unknown): unknown {
  if (typeof obj === "string") {
    return expandEnvVars(obj);
  }
  if (Array.isArray(obj)) {
    return obj.map(expandEnvVarsDeep);
  }
  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = expandEnvVarsDeep(value);
    }
    return result;
  }
  return obj;
}

function getNestedValue(obj: unknown, path: (string | number)[]): unknown {
  let current = obj;
  for (const key of path) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function findConfigFile(startDir: string = process.cwd()): string | null {
  const candidates = ["sinfonia.yaml", "sinfonia.yml"];
  for (const name of candidates) {
    const path = resolve(startDir, name);
    if (existsSync(path)) return path;
  }
  return null;
}

export function loadConfig(configPath: string): SinfoniaConfig {
  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const raw = readFileSync(configPath, "utf-8");
  const parsed = parseYaml(raw);

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Invalid YAML in config file: ${configPath}`);
  }

  const expanded = expandEnvVarsDeep(parsed);

  // Check for unexpanded env vars (env var not set → empty string)
  // and provide a helpful hint
  const result = sinfoniaConfigSchema.safeParse(expanded);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => {
        const path = i.path.join(".");
        // Check if this field used an env var that wasn't set
        const rawValue = getNestedValue(parsed, i.path);
        const envVarCheck = /\$([A-Z_][A-Z0-9_]*)/;
        if (typeof rawValue === "string" && envVarCheck.test(rawValue)) {
          const envVar = rawValue.match(envVarCheck)?.[0];
          return `  - ${path}: environment variable ${envVar} is not set`;
        }
        return `  - ${path}: ${i.message}`;
      })
      .join("\n");
    throw new Error(`Config validation failed:\n${issues}`);
  }

  return result.data;
}

export function validateConfig(config: SinfoniaConfig): string[] {
  const errors: string[] = [];

  if (!config.tracker.api_key || config.tracker.api_key.startsWith("$")) {
    errors.push("tracker.api_key is not set (check your environment variables)");
  }

  if (!config.tracker.project_slug) {
    errors.push("tracker.project_slug is required");
  }

  if (config.tracker.active_states.length === 0) {
    errors.push("tracker.active_states must have at least one state");
  }

  if (!config.prompt) {
    errors.push("prompt template is empty");
  }

  return errors;
}
