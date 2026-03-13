import type { ClaimState, RunningSession, RetryEntry } from "../shared/types.js";

export class OrchestratorState {
  private claims = new Map<string, ClaimState>();
  private _running = new Map<string, RunningSession>();
  private _retryQueue = new Map<string, RetryEntry>();
  private _completed: string[] = [];
  private _totalTokens = { input: 0, output: 0 };
  private _startedAt = Date.now();

  get running(): Map<string, RunningSession> {
    return this._running;
  }

  get retryQueue(): Map<string, RetryEntry> {
    return this._retryQueue;
  }

  get completed(): string[] {
    return this._completed;
  }

  get totalTokens(): { input: number; output: number } {
    return { ...this._totalTokens };
  }

  get runtimeMs(): number {
    return Date.now() - this._startedAt;
  }

  get runningCount(): number {
    return this._running.size;
  }

  // Claims
  isClaimed(issueId: string): boolean {
    const state = this.claims.get(issueId);
    return state === "claimed" || state === "running" || state === "retry_queued" || state === "completed";
  }

  claim(issueId: string): boolean {
    if (this.isClaimed(issueId)) return false;
    this.claims.set(issueId, "claimed");
    return true;
  }

  release(issueId: string): void {
    this.claims.set(issueId, "released");
    this._running.delete(issueId);
    this._retryQueue.delete(issueId);
  }

  // Running sessions
  setRunning(issueId: string, session: RunningSession): void {
    this.claims.set(issueId, "running");
    this._running.set(issueId, session);
  }

  removeRunning(issueId: string): void {
    this._running.delete(issueId);
  }

  updateRunningEvent(issueId: string, event: string): void {
    const session = this._running.get(issueId);
    if (session) {
      session.lastEvent = event;
      session.lastEventAt = new Date();
    }
  }

  updateRunningTokens(issueId: string, input: number, output: number): void {
    const session = this._running.get(issueId);
    if (session) {
      session.tokens = { input, output };
    }
  }

  // Retry queue
  queueRetry(entry: RetryEntry): void {
    this.claims.set(entry.issueId, "retry_queued");
    this._retryQueue.set(entry.issueId, entry);
  }

  removeRetry(issueId: string): void {
    const entry = this._retryQueue.get(issueId);
    if (entry?.timer) clearTimeout(entry.timer);
    this._retryQueue.delete(issueId);
    // Release the claim so the retry timer can re-dispatch
    if (this.claims.get(issueId) === "retry_queued") {
      this.claims.set(issueId, "released");
    }
  }

  // Completed
  markCompleted(issueId: string): void {
    this.claims.set(issueId, "completed");
    this._running.delete(issueId);
    const retryEntry = this._retryQueue.get(issueId);
    if (retryEntry?.timer) clearTimeout(retryEntry.timer);
    this._retryQueue.delete(issueId);
    if (!this._completed.includes(issueId)) {
      this._completed.push(issueId);
    }
  }

  // Tokens
  addTokens(input: number, output: number): void {
    this._totalTokens.input += input;
    this._totalTokens.output += output;
  }

  // Concurrency
  runningCountForState(state: string): number {
    let count = 0;
    for (const session of this._running.values()) {
      if (session.state.toLowerCase() === state.toLowerCase()) count++;
    }
    return count;
  }

  getRunningIssueIds(): string[] {
    return Array.from(this._running.keys());
  }
}
