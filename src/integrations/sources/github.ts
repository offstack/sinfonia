import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import type { Integration } from "./base.js";
import type { Finding } from "../../shared/types.js";
import type { IntegrationSourceConfig } from "../../config/schema.js";

interface GitHubPayload {
  action: string;
  alert?: {
    number: number;
    state: string;
    security_advisory?: {
      summary: string;
      description: string;
      severity: string;
      cve_id: string;
    };
    security_vulnerability?: {
      package: { name: string; ecosystem: string };
      severity: string;
      vulnerable_version_range: string;
      first_patched_version?: { identifier: string };
    };
    dependency?: {
      package: { name: string; ecosystem: string };
      manifest_path: string;
    };
  };
  check_run?: {
    id: number;
    name: string;
    conclusion: string;
    output: { title: string; summary: string };
    html_url: string;
  };
  repository?: { full_name: string };
}

function mapGithubSeverity(data: GitHubPayload): Finding["severity"] {
  const severity = data.alert?.security_advisory?.severity ?? data.alert?.security_vulnerability?.severity ?? "medium";
  switch (severity) {
    case "critical": return "critical";
    case "high": return "high";
    case "moderate":
    case "medium": return "medium";
    default: return "low";
  }
}

function transformDependabotAlert(data: GitHubPayload): Finding | null {
  const alert = data.alert!;
  const advisory = alert.security_advisory!;
  const vuln = alert.security_vulnerability;
  const dep = alert.dependency;

  const description = [
    `## ${advisory.summary}`,
    "",
    `**CVE:** ${advisory.cve_id ?? "N/A"}`,
    `**Severity:** ${advisory.severity}`,
    vuln ? `**Package:** ${vuln.package.name} (${vuln.package.ecosystem})` : "",
    vuln ? `**Vulnerable range:** ${vuln.vulnerable_version_range}` : "",
    vuln?.first_patched_version ? `**Fix available:** ${vuln.first_patched_version.identifier}` : "",
    dep ? `**Manifest:** ${dep.manifest_path}` : "",
    "",
    advisory.description ? `## Details\n${advisory.description.slice(0, 500)}` : "",
    "",
    "---",
    `*Auto-created by Sinfonia from GitHub Dependabot alert #${alert.number}*`,
  ].filter(Boolean).join("\n");

  const fingerprint = createHash("sha256")
    .update(`github:dependabot:${alert.number}`)
    .digest("hex")
    .slice(0, 16);

  return {
    type: "security",
    severity: mapGithubSeverity(data),
    file: dep?.manifest_path ?? "package.json",
    title: `Dependency: ${advisory.summary}`,
    description,
    fingerprint,
    source: "integration:github",
  };
}

function transformCheckRunFailure(data: GitHubPayload): Finding | null {
  const check = data.check_run!;

  const fingerprint = createHash("sha256")
    .update(`github:check:${check.id}`)
    .digest("hex")
    .slice(0, 16);

  const description = [
    `## CI Failure: ${check.name}`,
    "",
    `**Status:** ${check.conclusion}`,
    check.output.title ? `**Title:** ${check.output.title}` : "",
    check.output.summary ? `\n## Summary\n${check.output.summary.slice(0, 500)}` : "",
    check.html_url ? `\n[View on GitHub](${check.html_url})` : "",
    "",
    "---",
    `*Auto-created by Sinfonia from GitHub check run failure*`,
  ].filter(Boolean).join("\n");

  return {
    type: "bug",
    severity: "high",
    file: "CI",
    title: `CI Failure: ${check.name}`,
    description,
    fingerprint,
    source: "integration:github",
  };
}

export const githubIntegration: Integration = {
  name: "github",
  description: "Receives GitHub webhooks (Dependabot alerts, check failures)",

  verifySignature(headers: Record<string, string>, body: string, config: IntegrationSourceConfig): boolean {
    const signature = headers["x-hub-signature-256"];
    if (!signature || !config.secret) return false;

    const expected = "sha256=" + createHmac("sha256", config.secret).update(body).digest("hex");
    try {
      return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    } catch {
      return false; // length mismatch
    }
  },

  transform(payload: unknown, _config: IntegrationSourceConfig): Finding | null {
    const data = payload as GitHubPayload;

    if (data.alert?.security_advisory) {
      return transformDependabotAlert(data);
    }

    if (data.check_run?.conclusion === "failure") {
      return transformCheckRunFailure(data);
    }

    return null;
  },

  mapSeverity(payload: unknown): Finding["severity"] {
    return mapGithubSeverity(payload as GitHubPayload);
  },
};
