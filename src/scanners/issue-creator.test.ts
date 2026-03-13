import { describe, it, expect, vi } from "vitest";
import { createIssuesFromFindings } from "./issue-creator.js";
import type { Finding } from "../shared/types.js";
import type { TrackerAdapter } from "../tracker/types.js";
import type { ScannersConfig } from "../config/schema.js";

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    type: "security",
    severity: "high",
    file: "src/index.ts",
    line: 42,
    title: "SQL injection vulnerability",
    description: "Unsanitized input in query",
    fingerprint: "fp-abc123",
    source: "scanner:security",
    ...overrides,
  };
}

function makeTracker(): TrackerAdapter & { createIssue: ReturnType<typeof vi.fn> } {
  return {
    fetchCandidateIssues: vi.fn(),
    fetchIssueStatesByIds: vi.fn(),
    updateIssueState: vi.fn(),
    createComment: vi.fn(),
    createIssue: vi.fn().mockResolvedValue(undefined),
    searchIssues: vi.fn(),
    listTeams: vi.fn(),
  };
}

function makeScannersConfig(overrides: Partial<ScannersConfig["linear"]> = {}): ScannersConfig {
  return {
    schedule: "0 2 * * *",
    on_push: false,
    modules: {},
    linear: {
      target_state: "Backlog",
      labels: ["auto-detected"],
      dedup: true,
      ...overrides,
    },
  };
}

describe("createIssuesFromFindings", () => {
  it("creates issues for each finding", async () => {
    const tracker = makeTracker();
    const findings = [makeFinding(), makeFinding({ title: "XSS attack", fingerprint: "fp-2" })];
    const created = await createIssuesFromFindings(findings, tracker, makeScannersConfig());

    expect(created).toBe(2);
    expect(tracker.createIssue).toHaveBeenCalledTimes(2);
  });

  it("returns 0 for empty findings", async () => {
    const tracker = makeTracker();
    const created = await createIssuesFromFindings([], tracker, makeScannersConfig());
    expect(created).toBe(0);
    expect(tracker.createIssue).not.toHaveBeenCalled();
  });

  it("formats issue title with type prefix", async () => {
    const tracker = makeTracker();
    await createIssuesFromFindings([makeFinding()], tracker, makeScannersConfig());

    const call = tracker.createIssue.mock.calls[0][0];
    expect(call.title).toBe("[security] SQL injection vulnerability");
  });

  it("sets correct priority from severity", async () => {
    const tracker = makeTracker();
    const findings = [
      makeFinding({ severity: "critical" }),
      makeFinding({ severity: "high", fingerprint: "fp-2" }),
      makeFinding({ severity: "medium", fingerprint: "fp-3" }),
      makeFinding({ severity: "low", fingerprint: "fp-4" }),
    ];
    await createIssuesFromFindings(findings, tracker, makeScannersConfig());

    expect(tracker.createIssue.mock.calls[0][0].priority).toBe(1); // critical
    expect(tracker.createIssue.mock.calls[1][0].priority).toBe(2); // high
    expect(tracker.createIssue.mock.calls[2][0].priority).toBe(3); // medium
    expect(tracker.createIssue.mock.calls[3][0].priority).toBe(4); // low
  });

  it("includes fingerprint and source labels", async () => {
    const tracker = makeTracker();
    await createIssuesFromFindings([makeFinding()], tracker, makeScannersConfig());

    const call = tracker.createIssue.mock.calls[0][0];
    expect(call.labels).toContain("auto-detected");
    expect(call.labels).toContain("fp:fp-abc123");
    expect(call.labels).toContain("source:scanner:security");
    expect(call.labels).toContain("severity:high");
  });

  it("uses configured target_state", async () => {
    const tracker = makeTracker();
    const config = makeScannersConfig({ target_state: "Todo" });
    await createIssuesFromFindings([makeFinding()], tracker, config);

    expect(tracker.createIssue.mock.calls[0][0].state).toBe("Todo");
  });

  it("includes file and line info in description", async () => {
    const tracker = makeTracker();
    await createIssuesFromFindings([makeFinding()], tracker, makeScannersConfig());

    const call = tracker.createIssue.mock.calls[0][0];
    expect(call.description).toContain("src/index.ts");
    expect(call.description).toContain(":42");
    expect(call.description).toContain("Unsanitized input in query");
    expect(call.description).toContain("fp-abc123");
  });

  it("handles file without line number", async () => {
    const tracker = makeTracker();
    await createIssuesFromFindings(
      [makeFinding({ line: undefined })],
      tracker,
      makeScannersConfig(),
    );

    const call = tracker.createIssue.mock.calls[0][0];
    expect(call.description).toContain("src/index.ts");
    expect(call.description).not.toContain(":undefined");
  });

  it("continues creating issues when one fails", async () => {
    const tracker = makeTracker();
    tracker.createIssue
      .mockRejectedValueOnce(new Error("API error"))
      .mockResolvedValueOnce(undefined);

    const findings = [makeFinding(), makeFinding({ fingerprint: "fp-2" })];
    const created = await createIssuesFromFindings(findings, tracker, makeScannersConfig());

    expect(created).toBe(1); // only the second succeeded
    expect(tracker.createIssue).toHaveBeenCalledTimes(2);
  });
});
