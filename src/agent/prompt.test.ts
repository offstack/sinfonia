import { describe, it, expect } from "vitest";
import { renderPrompt } from "./prompt.js";
import type { Issue } from "../shared/types.js";

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: "id-1",
    identifier: "SIN-42",
    title: "Fix login bug",
    description: "Users cannot log in with SSO",
    state: "Todo",
    priority: 1,
    created_at: "2025-01-01T00:00:00Z",
    labels: ["bug", "auth"],
    blockers: [],
    ...overrides,
  };
}

describe("renderPrompt", () => {
  it("renders issue fields into template", () => {
    const template = "Fix {{issue.identifier}}: {{issue.title}}";
    const result = renderPrompt(template, makeIssue(), false);
    expect(result).toBe("Fix SIN-42: Fix login bug");
  });

  it("renders description and labels", () => {
    const template = "{{issue.description}} [{{issue.labels}}]";
    const result = renderPrompt(template, makeIssue(), false);
    expect(result).toContain("Users cannot log in with SSO");
    expect(result).toContain("bug");
  });

  it("exposes is_continuation flag", () => {
    const template = "{{#if is_continuation}}CONT{{else}}NEW{{/if}}";
    expect(renderPrompt(template, makeIssue(), false)).toBe("NEW");
    expect(renderPrompt(template, makeIssue(), true)).toContain("CONT");
  });

  it("appends continuation suffix when isContinuation is true", () => {
    const template = "Do the work.";
    const result = renderPrompt(template, makeIssue(), true);
    expect(result).toContain("This is a continuation");
    expect(result).toContain("Review your previous work");
  });

  it("does not append continuation suffix when isContinuation is false", () => {
    const template = "Do the work.";
    const result = renderPrompt(template, makeIssue(), false);
    expect(result).not.toContain("continuation");
  });
});
