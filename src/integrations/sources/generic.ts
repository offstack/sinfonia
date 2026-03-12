import { createHash } from "node:crypto";
import type { Integration } from "./base.js";
import type { Finding } from "../../shared/types.js";
import type { IntegrationSourceConfig } from "../../config/schema.js";

interface GenericPayload {
  title?: string;
  description?: string;
  severity?: string;
  file?: string;
  line?: number;
  type?: string;
}

export const genericIntegration: Integration = {
  name: "generic",
  description: "Accepts any JSON webhook payload and creates Linear issues",

  verifySignature(): boolean {
    // Generic webhooks don't require signature verification
    return true;
  },

  transform(payload: unknown, _config: IntegrationSourceConfig): Finding | null {
    const data = payload as GenericPayload;
    if (!data?.title) return null;

    const fingerprint = createHash("sha256")
      .update(`generic:${data.title}:${data.file ?? ""}`)
      .digest("hex")
      .slice(0, 16);

    return {
      type: (data.type as Finding["type"]) ?? "bug",
      severity: this.mapSeverity(payload),
      file: data.file ?? "unknown",
      line: data.line,
      title: data.title,
      description: data.description ?? data.title,
      fingerprint,
      source: "integration:generic",
    };
  },

  mapSeverity(payload: unknown): Finding["severity"] {
    const data = payload as GenericPayload;
    const severity = data?.severity?.toLowerCase() ?? "medium";
    if (["critical", "high", "medium", "low"].includes(severity)) {
      return severity as Finding["severity"];
    }
    return "medium";
  },
};
