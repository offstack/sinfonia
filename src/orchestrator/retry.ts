import type { RetryEntry } from "../shared/types.js";

const BASE_FAILURE_DELAY_MS = 10000;
const CONTINUATION_DELAY_MS = 1000;

export function calculateRetryDelay(
  attempt: number,
  maxBackoffMs: number,
  isContinuation: boolean,
): number {
  if (isContinuation) {
    return CONTINUATION_DELAY_MS;
  }
  return Math.min(BASE_FAILURE_DELAY_MS * Math.pow(2, attempt - 1), maxBackoffMs);
}

export function createRetryEntry(
  issueId: string,
  issueIdentifier: string,
  attempt: number,
  delayMs: number,
  isContinuation: boolean,
  error?: string,
): RetryEntry {
  return {
    issueId,
    issueIdentifier,
    attempt,
    dueAt: Date.now() + delayMs,
    timer: null,
    error,
    isContinuation,
  };
}
