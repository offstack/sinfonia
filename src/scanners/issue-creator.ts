import type { Finding } from "../shared/types.js";
import type { TrackerAdapter } from "../tracker/types.js";
import type { ScannersConfig } from "../config/schema.js";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("issue-creator");

export async function createIssuesFromFindings(
  findings: Finding[],
  tracker: TrackerAdapter,
  config: ScannersConfig,
): Promise<number> {
  let created = 0;

  for (const finding of findings) {
    const labels = [
      ...config.linear.labels,
      `fp:${finding.fingerprint}`,
      `source:${finding.source}`,
      `severity:${finding.severity}`,
    ];

    const description = formatIssueDescription(finding);

    try {
      await tracker.createIssue({
        title: `[${finding.type}] ${finding.title}`,
        description,
        state: config.linear.target_state,
        priority: severityToPriority(finding.severity),
        labels,
      });
      created++;
      logger.info({ title: finding.title, type: finding.type }, "issue created");
    } catch (err) {
      logger.error({ err, title: finding.title }, "failed to create issue");
    }
  }

  return created;
}

function formatIssueDescription(finding: Finding): string {
  const lines = [
    `## ${finding.type.charAt(0).toUpperCase() + finding.type.slice(1)} Finding`,
    "",
    `**Severity:** ${finding.severity}`,
    `**File:** \`${finding.file}\`${finding.line ? `:${finding.line}` : ""}`,
    `**Detected by:** ${finding.source}`,
    "",
    "## Description",
    "",
    finding.description,
    "",
    "---",
    `*Auto-detected by Sinfonia scanner. Fingerprint: \`${finding.fingerprint}\`*`,
  ];

  return lines.join("\n");
}

function severityToPriority(severity: Finding["severity"]): number {
  switch (severity) {
    case "critical": return 1;
    case "high": return 2;
    case "medium": return 3;
    case "low": return 4;
  }
}
