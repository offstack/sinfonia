import type { Issue } from "../shared/types.js";
import type { OrchestratorConfig } from "../config/schema.js";
import type { OrchestratorState } from "./state.js";

export function sortCandidates(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    // Priority ascending (1 = urgent, 4 = low)
    if (a.priority !== b.priority) return a.priority - b.priority;
    // Created at ascending (oldest first)
    if (a.created_at !== b.created_at) return a.created_at.localeCompare(b.created_at);
    // Identifier as tiebreaker
    return a.identifier.localeCompare(b.identifier);
  });
}

export function getAvailableSlots(
  config: OrchestratorConfig,
  state: OrchestratorState,
): number {
  return Math.max(config.max_concurrent_agents - state.runningCount, 0);
}

export function isEligibleForDispatch(
  issue: Issue,
  config: OrchestratorConfig,
  state: OrchestratorState,
  terminalStates: Set<string>,
): boolean {
  // Already claimed or running
  if (state.isClaimed(issue.id)) return false;

  // Check per-state concurrency limit
  const stateKey = issue.state.toLowerCase();
  const stateLimit = config.max_concurrent_by_state[stateKey];
  if (stateLimit !== undefined) {
    if (state.runningCountForState(issue.state) >= stateLimit) return false;
  }

  // Blocker check: Todo issues only dispatch when all blockers are terminal
  if (issue.state.toLowerCase() === "todo" && issue.blockers.length > 0) {
    // We'd need to check blocker states — for now, skip issues with blockers
    // The orchestrator will check this with tracker data
    return false;
  }

  return true;
}

export function selectDispatchCandidates(
  issues: Issue[],
  config: OrchestratorConfig,
  state: OrchestratorState,
  terminalStates: Set<string>,
): Issue[] {
  const sorted = sortCandidates(issues);
  const available = getAvailableSlots(config, state);
  const selected: Issue[] = [];

  for (const issue of sorted) {
    if (selected.length >= available) break;
    if (isEligibleForDispatch(issue, config, state, terminalStates)) {
      selected.push(issue);
    }
  }

  return selected;
}
