import { createHmac } from "node:crypto";
import { createHash } from "node:crypto";
import type { Integration } from "./base.js";
import type { Finding } from "../../shared/types.js";
import type { IntegrationSourceConfig } from "../../config/schema.js";

interface SentryPayload {
  action: string;
  data: {
    issue: {
      id: string;
      title: string;
      culprit: string;
      metadata: { type?: string; value?: string; filename?: string };
      count: string;
      firstSeen: string;
      level: string;
      project: { slug: string };
    };
    event?: {
      title: string;
      environment: string;
      exception?: {
        values: Array<{
          type: string;
          value: string;
          stacktrace?: { frames: Array<{ filename: string; lineno: number; function: string }> };
        }>;
      };
      breadcrumbs?: { values: Array<{ category: string; message: string; timestamp: string }> };
    };
  };
}

export const sentryIntegration: Integration = {
  name: "sentry",
  description: "Receives Sentry error webhooks and creates Linear issues",

  verifySignature(headers: Record<string, string>, body: string, config: IntegrationSourceConfig): boolean {
    const signature = headers["sentry-hook-signature"];
    if (!signature || !config.secret) return false;

    const expected = createHmac("sha256", config.secret).update(body).digest("hex");
    return signature === expected;
  },

  transform(payload: unknown, config: IntegrationSourceConfig): Finding | null {
    const data = payload as SentryPayload;
    if (!data?.data?.issue) return null;

    const issue = data.data.issue;
    const event = data.data.event;

    // Check min occurrences
    if (config.min_occurrences && parseInt(issue.count, 10) < config.min_occurrences) {
      return null;
    }

    // Check environment filter
    if (event?.environment && config.ignore_environments.includes(event.environment)) {
      return null;
    }

    // Check ignore patterns
    if (config.ignore_patterns.some((p) => issue.title.includes(p))) {
      return null;
    }

    // Build stack trace context
    let stackTrace = "";
    if (event?.exception?.values?.[0]?.stacktrace?.frames) {
      const frames = event.exception.values[0].stacktrace.frames.slice(-10);
      stackTrace = frames
        .map((f) => `  at ${f.function} (${f.filename}:${f.lineno})`)
        .join("\n");
    }

    // Build breadcrumbs
    let breadcrumbs = "";
    if (event?.breadcrumbs?.values) {
      const recent = event.breadcrumbs.values.slice(-5);
      breadcrumbs = recent
        .map((b) => `  [${b.category}] ${b.message}`)
        .join("\n");
    }

    const description = [
      `## Error: ${issue.title}`,
      "",
      `**Level:** ${issue.level}`,
      `**Occurrences:** ${issue.count}`,
      `**First seen:** ${issue.firstSeen}`,
      `**Culprit:** ${issue.culprit}`,
      issue.metadata.filename ? `**File:** ${issue.metadata.filename}` : "",
      "",
      stackTrace ? `## Stack Trace\n\`\`\`\n${stackTrace}\n\`\`\`\n` : "",
      breadcrumbs ? `## Breadcrumbs\n\`\`\`\n${breadcrumbs}\n\`\`\`\n` : "",
      "---",
      `*Auto-created by Sinfonia from Sentry issue ${issue.id}*`,
    ].filter(Boolean).join("\n");

    const fingerprint = createHash("sha256")
      .update(`sentry:${issue.id}`)
      .digest("hex")
      .slice(0, 16);

    const file = issue.metadata.filename ?? issue.culprit ?? "unknown";

    return {
      type: "bug",
      severity: this.mapSeverity(payload),
      file,
      title: `Fix: ${issue.title}`,
      description,
      fingerprint,
      source: "integration:sentry",
    };
  },

  mapSeverity(payload: unknown): Finding["severity"] {
    const data = payload as SentryPayload;
    const level = data?.data?.issue?.level ?? "error";
    switch (level) {
      case "fatal": return "critical";
      case "error": return "high";
      case "warning": return "medium";
      default: return "low";
    }
  },
};
