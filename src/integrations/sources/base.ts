import type { Finding } from "../../shared/types.js";
import type { IntegrationSourceConfig } from "../../config/schema.js";

export interface Integration {
  name: string;
  description: string;
  verifySignature(headers: Record<string, string>, body: string, config: IntegrationSourceConfig): boolean;
  transform(payload: unknown, config: IntegrationSourceConfig): Finding | null;
  mapSeverity(payload: unknown): Finding["severity"];
}
