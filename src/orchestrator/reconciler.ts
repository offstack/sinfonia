import type { TrackerAdapter } from "../tracker/types.js";
import type { OrchestratorState } from "./state.js";
import type { WorkspaceManager } from "../workspace/manager.js";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("reconciler");

export interface ReconcileResult {
  staleIssues: string[];
  terminalIssues: string[];
  stateChanges: Map<string, string>;
}

export async function reconcileRunning(
  state: OrchestratorState,
  tracker: TrackerAdapter,
  workspace: WorkspaceManager,
  activeStates: string[],
  stallTimeoutMs: number,
): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    staleIssues: [],
    terminalIssues: [],
    stateChanges: new Map(),
  };

  const runningIds = state.getRunningIssueIds();
  if (runningIds.length === 0) return result;

  // Part A: Stall detection
  if (stallTimeoutMs > 0) {
    const now = Date.now();
    for (const [issueId, session] of state.running) {
      const elapsed = now - session.lastEventAt.getTime();
      if (elapsed > stallTimeoutMs) {
        logger.warn({ issueId, identifier: session.issueIdentifier, elapsedMs: elapsed }, "session stalled");
        result.staleIssues.push(issueId);
      }
    }
  }

  // Part B: Tracker state refresh
  try {
    const currentStates = await tracker.fetchIssueStatesByIds(runningIds);
    const activeSet = new Set(activeStates.map((s) => s.toLowerCase()));

    for (const [issueId, currentState] of currentStates) {
      const session = state.running.get(issueId);
      if (!session) continue;

      const isActive = activeSet.has(currentState.toLowerCase());
      if (!isActive) {
        logger.info(
          { issueId, identifier: session.issueIdentifier, currentState },
          "issue no longer in active state",
        );
        result.terminalIssues.push(issueId);
      } else if (currentState !== session.state) {
        result.stateChanges.set(issueId, currentState);
      }
    }
  } catch (err) {
    logger.error({ err }, "state refresh failed, keeping workers running");
  }

  return result;
}
