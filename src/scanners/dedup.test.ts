import { describe, it, expect, vi } from "vitest";
import { deduplicateFindings } from "./dedup.js";
import type { Finding, Issue } from "../shared/types.js";
import type { TrackerAdapter } from "../tracker/types.js";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    type: "security",
    severity: "high",
    file: "src/index.ts",
    title: "SQL injection vulnerability",
    description: "Unsanitized input in query",
    fingerprint: "fp-unique-1",
    source: "security",
    ...overrides,
  };
}

function makeTracker(existingIssues: Partial<Issue>[] = []): TrackerAdapter {
  return {
    searchIssues: vi.fn().mockResolvedValue(
      existingIssues.map((i) => ({
        id: "existing-1",
        identifier: "SIN-99",
        title: "Existing issue",
        description: "",
        state: "Backlog",
        priority: 3,
        created_at: "2025-01-01T00:00:00Z",
        labels: [],
        blockers: [],
        ...i,
      })),
    ),
    fetchCandidateIssues: vi.fn(),
    fetchIssueStatesByIds: vi.fn(),
    updateIssueState: vi.fn(),
    createComment: vi.fn(),
    createIssue: vi.fn(),
    listTeams: vi.fn(),
  };
}

describe("deduplicateFindings", () => {
  it("returns empty array for empty input", async () => {
    const result = await deduplicateFindings([], makeTracker(), []);
    expect(result).toEqual([]);
  });

  it("passes through findings with no existing matches", async () => {
    const findings = [makeFinding({ fingerprint: "fp-1" }), makeFinding({ fingerprint: "fp-2" })];
    const result = await deduplicateFindings(findings, makeTracker(), []);
    expect(result).toHaveLength(2);
  });

  it("removes findings with matching fingerprints in existing issues", async () => {
    const findings = [makeFinding({ fingerprint: "abc123" })];
    const tracker = makeTracker([{ labels: ["fp:abc123"] }]);
    const result = await deduplicateFindings(findings, tracker, []);
    expect(result).toHaveLength(0);
  });

  it("removes duplicate fingerprints within the same batch", async () => {
    const findings = [
      makeFinding({ fingerprint: "same-fp", title: "First" }),
      makeFinding({ fingerprint: "same-fp", title: "Second" }),
    ];
    const result = await deduplicateFindings(findings, makeTracker(), []);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("First");
  });

  it("removes findings with fuzzy title match against existing issues", async () => {
    // normalizeTitle takes first 50 chars lowercased — titles must match on that prefix
    const findings = [makeFinding({ title: "SQL injection vulnerability" })];
    const tracker = makeTracker([{ title: "SQL injection vulnerability" }]);
    const result = await deduplicateFindings(findings, tracker, []);
    expect(result).toHaveLength(0);
  });
});
