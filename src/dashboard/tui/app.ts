import type { OrchestratorSnapshot, RunningSession, RetryEntry } from "../../shared/types.js";

// ANSI escape codes for terminal formatting
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const CYAN = "\x1b[36m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const WHITE = "\x1b[37m";
const BG_DARK = "\x1b[48;5;235m";

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function padRight(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : s + " ".repeat(len - s.length);
}

function padLeft(s: string, len: number): string {
  return s.length >= len ? s.slice(0, len) : " ".repeat(len - s.length) + s;
}

export function renderDashboard(snapshot: OrchestratorSnapshot): string {
  const lines: string[] = [];
  const totalTokens = snapshot.totalTokens.input + snapshot.totalTokens.output;

  // Header
  lines.push(`${BG_DARK}${BOLD}${CYAN} SINFONIA STATUS${RESET}`);
  lines.push(`${BOLD}  Agents:${RESET} ${GREEN}${snapshot.running.length}${RESET}/${snapshot.maxAgents}`);
  lines.push(`${BOLD}  Runtime:${RESET} ${formatDuration(snapshot.runtimeMs)}`);
  lines.push(
    `${BOLD}  Tokens:${RESET} in ${formatTokens(snapshot.totalTokens.input)} | out ${formatTokens(snapshot.totalTokens.output)} | total ${formatTokens(totalTokens)}`,
  );
  lines.push(`${BOLD}  Completed:${RESET} ${snapshot.completed.length} issues`);
  lines.push("");

  // Running table
  if (snapshot.running.length > 0) {
    lines.push(`${BOLD}  Running${RESET}`);
    lines.push(
      `${DIM}  ${padRight("ID", 12)} ${padRight("STAGE", 14)} ${padRight("AGE / TURN", 12)} ${padRight("TOKENS", 12)} ${padRight("SESSION", 16)} EVENT${RESET}`,
    );

    for (const session of snapshot.running) {
      const age = formatDuration(Date.now() - session.startedAt.getTime());
      const stageColor = getStageColor(session.state);
      const truncSession = session.sessionId.length > 10
        ? session.sessionId.slice(0, 4) + "..." + session.sessionId.slice(-4)
        : session.sessionId || "—";
      const truncEvent = (session.lastEvent ?? "").slice(0, 50);

      lines.push(
        `  ${GREEN}*${RESET} ${padRight(session.issueIdentifier, 11)} ${stageColor}${padRight(session.state, 13)}${RESET} ${padRight(`${age} / ${session.turn}`, 12)} ${padRight(formatTokens(session.tokens.input + session.tokens.output), 12)} ${padRight(truncSession, 16)} ${DIM}${truncEvent}${RESET}`,
      );
    }
  } else {
    lines.push(`${DIM}  No running agents${RESET}`);
  }

  lines.push("");

  // Retry / Backoff queue
  lines.push(`${BOLD}  Backoff queue${RESET}`);
  if (snapshot.retryQueue.length > 0) {
    for (const entry of snapshot.retryQueue) {
      const dueIn = Math.max(0, entry.dueAt - Date.now());
      const type = entry.isContinuation ? "continuation" : "retry";
      lines.push(
        `  ${YELLOW}*${RESET} ${padRight(entry.issueIdentifier, 12)} attempt=${entry.attempt} ${type} due_in=${formatDuration(dueIn)}${entry.error ? ` ${RED}${entry.error.slice(0, 40)}${RESET}` : ""}`,
      );
    }
  } else {
    lines.push(`${DIM}  No queued retries${RESET}`);
  }

  return lines.join("\n");
}

function getStageColor(state: string): string {
  switch (state.toLowerCase()) {
    case "todo": return CYAN;
    case "in progress": return GREEN;
    case "rework": return YELLOW;
    case "merging": return GREEN;
    default: return WHITE;
  }
}
