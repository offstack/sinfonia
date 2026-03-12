// Issue claim states (Symphony spec)
export type ClaimState = "unclaimed" | "claimed" | "running" | "retry_queued" | "released";

// Run attempt outcomes
export type RunOutcome = "succeeded" | "failed" | "timed_out" | "stalled" | "canceled";

// Issue from tracker
export interface Issue {
  id: string;
  identifier: string;
  title: string;
  description: string;
  state: string;
  priority: number;
  created_at: string;
  assignee_id?: string;
  labels: string[];
  blockers: string[];
}

// Running session metadata
export interface RunningSession {
  issueId: string;
  issueIdentifier: string;
  pid: number;
  sessionId: string;
  threadId: string;
  turnId: string;
  turn: number;
  startedAt: Date;
  lastEventAt: Date;
  tokens: { input: number; output: number };
  state: string;
  lastEvent: string;
}

// Retry queue entry
export interface RetryEntry {
  issueId: string;
  issueIdentifier: string;
  attempt: number;
  dueAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  error?: string;
  isContinuation: boolean;
}

// Scanner finding
export interface Finding {
  type: "security" | "performance" | "dry" | "simplify" | "bug" | "test-coverage" | "custom";
  severity: "critical" | "high" | "medium" | "low";
  file: string;
  line?: number;
  title: string;
  description: string;
  fingerprint: string;
  source: string;
}

// Integration event
export interface IntegrationEvent {
  source: string;
  finding: Finding;
  rawPayload: unknown;
  receivedAt: Date;
}

// Orchestrator snapshot (for dashboard)
export interface OrchestratorSnapshot {
  running: RunningSession[];
  retryQueue: RetryEntry[];
  completed: string[];
  totalTokens: { input: number; output: number };
  runtimeMs: number;
  maxAgents: number;
  pollingIntervalMs: number;
}
