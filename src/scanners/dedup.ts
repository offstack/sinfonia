import type { Finding, Issue } from "../shared/types.js";
import type { TrackerAdapter } from "../tracker/types.js";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("dedup");

export async function deduplicateFindings(
  findings: Finding[],
  tracker: TrackerAdapter,
  existingLabels: string[],
): Promise<Finding[]> {
  if (findings.length === 0) return [];

  // Fetch existing issues to check for duplicates
  const existingIssues = await tracker.searchIssues("auto-detected");
  const existingFingerprints = new Set<string>();
  const existingTitlePrefixes = new Set<string>();

  for (const issue of existingIssues) {
    // Check labels for fingerprints
    for (const label of issue.labels) {
      if (label.startsWith("fp:")) {
        existingFingerprints.add(label.slice(3));
      }
    }
    // Fuzzy match on title prefix (first 50 chars normalized)
    existingTitlePrefixes.add(normalizeTitle(issue.title));
  }

  const deduplicated: Finding[] = [];
  const seenFingerprints = new Set<string>();

  for (const finding of findings) {
    // Skip exact fingerprint match
    if (existingFingerprints.has(finding.fingerprint)) {
      logger.debug({ fingerprint: finding.fingerprint, title: finding.title }, "skipped: exact fingerprint match");
      continue;
    }

    // Skip duplicate within this batch
    if (seenFingerprints.has(finding.fingerprint)) {
      continue;
    }

    // Skip fuzzy title match
    const normalizedTitle = normalizeTitle(finding.title);
    if (existingTitlePrefixes.has(normalizedTitle)) {
      logger.debug({ title: finding.title }, "skipped: fuzzy title match");
      continue;
    }

    seenFingerprints.add(finding.fingerprint);
    deduplicated.push(finding);
  }

  logger.info({ total: findings.length, after: deduplicated.length, skipped: findings.length - deduplicated.length }, "deduplication complete");
  return deduplicated;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 50);
}
