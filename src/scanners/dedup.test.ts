import { describe, it, expect, vi } from "vitest";
import { deduplicateFindings } from "./dedup.js";
import type { Finding } from "../shared/types.js";
import type { TrackerAdapter } from "../tracker/types.js";

function makeTracker(issues: Array<{ title: string; labels: string[] }>): TrackerAdapter {
  return {
    searchIssues: vi.fn().mockResolvedValue(
      issues.map((i, idx) => ({
        id: `id-${idx}`,
        identifier: `SIN-${idx}`,
        title: i.title,
        description: "",
        state: "In Progress",
        priority: 2,
        created_at: new Date().toISOString(),
        labels: i.labels,
        blockers: [],
      }))
    ),
    fetchCandidateIssues: vi.fn(),
    fetchIssueStatesByIds: vi.fn(),
    updateIssueState: vi.fn(),
    createComment: vi.fn(),
    createIssue: vi.fn(),
    listTeams: vi.fn(),
  } as unknown as TrackerAdapter;
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    type: "security",
    severity: "high",
    file: "src/foo.ts",
    title: "SQL Injection in foo",
    description: "Found a SQL injection vulnerability",
    fingerprint: "fp-abc123",
    source: "security-scanner",
    ...overrides,
  };
}

describe("deduplicateFindings", () => {
  it("returns empty array for empty input", async () => {
    const tracker = makeTracker([]);
    const result = await deduplicateFindings([], tracker, []);
    expect(result).toEqual([]);
  });

  it("passes through findings with no existing issues", async () => {
    const tracker = makeTracker([]);
    const finding = makeFinding();
    const result = await deduplicateFindings([finding], tracker, []);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(finding);
  });

  it("removes finding that matches an existing fingerprint label", async () => {
    const tracker = makeTracker([{ title: "Some issue", labels: ["fp:fp-abc123"] }]);
    const finding = makeFinding({ fingerprint: "fp-abc123" });
    const result = await deduplicateFindings([finding], tracker, []);
    expect(result).toHaveLength(0);
  });

  it("keeps finding when fingerprint does not match existing labels", async () => {
    const tracker = makeTracker([{ title: "Some issue", labels: ["fp:different-fp"] }]);
    const finding = makeFinding({ fingerprint: "fp-abc123" });
    const result = await deduplicateFindings([finding], tracker, []);
    expect(result).toHaveLength(1);
  });

  it("removes finding with a fuzzy title match (normalized)", async () => {
    const tracker = makeTracker([{ title: "SQL Injection in foo", labels: [] }]);
    const finding = makeFinding({ title: "SQL Injection in foo", fingerprint: "different-fp" });
    const result = await deduplicateFindings([finding], tracker, []);
    expect(result).toHaveLength(0);
  });

  it("fuzzy match is case-insensitive and ignores punctuation", async () => {
    const tracker = makeTracker([{ title: "SQL INJECTION IN FOO!!!", labels: [] }]);
    const finding = makeFinding({ title: "sql injection in foo", fingerprint: "new-fp" });
    const result = await deduplicateFindings([finding], tracker, []);
    expect(result).toHaveLength(0);
  });

  it("deduplicates within the same batch by fingerprint", async () => {
    const tracker = makeTracker([]);
    const f1 = makeFinding({ fingerprint: "fp-same", title: "Issue A" });
    const f2 = makeFinding({ fingerprint: "fp-same", title: "Issue A copy" });
    const result = await deduplicateFindings([f1, f2], tracker, []);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(f1);
  });

  it("keeps findings with unique fingerprints and titles", async () => {
    const tracker = makeTracker([]);
    const f1 = makeFinding({ fingerprint: "fp-1", title: "Issue A" });
    const f2 = makeFinding({ fingerprint: "fp-2", title: "Issue B" });
    const f3 = makeFinding({ fingerprint: "fp-3", title: "Issue C" });
    const result = await deduplicateFindings([f1, f2, f3], tracker, []);
    expect(result).toHaveLength(3);
  });

  it("only strips 'fp:' prefix from labels (not other labels)", async () => {
    const tracker = makeTracker([{ title: "Existing", labels: ["auto-detected", "priority:high"] }]);
    const finding = makeFinding({ fingerprint: "auto-detected", title: "New Issue" });
    // "auto-detected" is not prefixed with "fp:" so it's not a fingerprint match
    const result = await deduplicateFindings([finding], tracker, []);
    expect(result).toHaveLength(1);
  });
});
