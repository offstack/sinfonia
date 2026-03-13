import { describe, it, expect } from "vitest";
import { calculateRetryDelay, createRetryEntry } from "./retry.js";

describe("calculateRetryDelay", () => {
  it("returns fixed delay for continuations", () => {
    expect(calculateRetryDelay(1, 300000, true)).toBe(1000);
    expect(calculateRetryDelay(5, 300000, true)).toBe(1000);
  });

  it("returns base delay for first failure attempt", () => {
    expect(calculateRetryDelay(1, 300000, false)).toBe(10000);
  });

  it("doubles delay with each attempt", () => {
    expect(calculateRetryDelay(2, 300000, false)).toBe(20000);
    expect(calculateRetryDelay(3, 300000, false)).toBe(40000);
  });

  it("caps at maxBackoffMs", () => {
    expect(calculateRetryDelay(10, 60000, false)).toBe(60000);
  });
});

describe("createRetryEntry", () => {
  it("creates a valid retry entry", () => {
    const before = Date.now();
    const entry = createRetryEntry("id-1", "SIN-1", 2, 5000, false, "timeout");
    expect(entry.issueId).toBe("id-1");
    expect(entry.issueIdentifier).toBe("SIN-1");
    expect(entry.attempt).toBe(2);
    expect(entry.dueAt).toBeGreaterThanOrEqual(before + 5000);
    expect(entry.timer).toBeNull();
    expect(entry.error).toBe("timeout");
    expect(entry.isContinuation).toBe(false);
  });

  it("creates a continuation entry", () => {
    const entry = createRetryEntry("id-1", "SIN-1", 1, 1000, true);
    expect(entry.isContinuation).toBe(true);
    expect(entry.error).toBeUndefined();
  });
});
