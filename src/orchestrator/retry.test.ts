import { describe, it, expect } from "vitest";
import { calculateRetryDelay, createRetryEntry } from "./retry.js";

describe("calculateRetryDelay", () => {
  const MAX_BACKOFF = 300_000; // 5 minutes

  it("returns CONTINUATION_DELAY_MS (1000) for continuations regardless of attempt", () => {
    expect(calculateRetryDelay(1, MAX_BACKOFF, true)).toBe(1000);
    expect(calculateRetryDelay(5, MAX_BACKOFF, true)).toBe(1000);
    expect(calculateRetryDelay(10, MAX_BACKOFF, true)).toBe(1000);
  });

  it("returns 10000ms for attempt 1 (base delay)", () => {
    expect(calculateRetryDelay(1, MAX_BACKOFF, false)).toBe(10_000);
  });

  it("doubles delay for each subsequent attempt (exponential backoff)", () => {
    expect(calculateRetryDelay(2, MAX_BACKOFF, false)).toBe(20_000);
    expect(calculateRetryDelay(3, MAX_BACKOFF, false)).toBe(40_000);
    expect(calculateRetryDelay(4, MAX_BACKOFF, false)).toBe(80_000);
  });

  it("caps at maxBackoffMs", () => {
    const smallMax = 15_000;
    expect(calculateRetryDelay(3, smallMax, false)).toBe(smallMax);
    expect(calculateRetryDelay(10, smallMax, false)).toBe(smallMax);
  });

  it("returns exactly maxBackoffMs when computed delay equals it", () => {
    // attempt=2 → 20000ms; cap at 20000
    expect(calculateRetryDelay(2, 20_000, false)).toBe(20_000);
  });
});

describe("createRetryEntry", () => {
  it("creates entry with correct fields", () => {
    const before = Date.now();
    const entry = createRetryEntry("SIN-1", "SIN-1", 2, 10_000, false, "timeout");
    const after = Date.now();

    expect(entry.issueId).toBe("SIN-1");
    expect(entry.issueIdentifier).toBe("SIN-1");
    expect(entry.attempt).toBe(2);
    expect(entry.isContinuation).toBe(false);
    expect(entry.error).toBe("timeout");
    expect(entry.timer).toBeNull();
    expect(entry.dueAt).toBeGreaterThanOrEqual(before + 10_000);
    expect(entry.dueAt).toBeLessThanOrEqual(after + 10_000);
  });

  it("creates continuation entry without error", () => {
    const entry = createRetryEntry("SIN-2", "SIN-2", 1, 1000, true);
    expect(entry.isContinuation).toBe(true);
    expect(entry.error).toBeUndefined();
  });
});
