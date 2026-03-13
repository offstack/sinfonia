import type { SinfoniaConfig } from "../config/schema.js";
import type { TrackerAdapter } from "../tracker/types.js";
import type { Issue, RunningSession, OrchestratorSnapshot } from "../shared/types.js";
import { OrchestratorState } from "./state.js";
import { selectDispatchCandidates } from "./dispatcher.js";
import { reconcileRunning } from "./reconciler.js";
import { calculateRetryDelay, createRetryEntry } from "./retry.js";
import { WorkspaceManager } from "../workspace/manager.js";
import { AgentRunner } from "../agent/runner.js";
import { formatAgentEvent } from "../agent/event-formatter.js";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("orchestrator");

export type OrchestratorEventHandler = (event: string, data?: unknown) => void;

export class Orchestrator {
  private config: SinfoniaConfig;
  private tracker: TrackerAdapter;
  private workspace: WorkspaceManager;
  private agentRunner: AgentRunner;
  private state: OrchestratorState;

  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private stopFlags = new Map<string, boolean>();
  private eventHandlers: OrchestratorEventHandler[] = [];

  constructor(config: SinfoniaConfig, tracker: TrackerAdapter) {
    this.config = config;
    this.tracker = tracker;
    this.state = new OrchestratorState();
    this.workspace = new WorkspaceManager(config.workspace, config.project.repo);
    this.agentRunner = new AgentRunner(config.agent, config.prompt);
  }

  onEvent(handler: OrchestratorEventHandler): void {
    this.eventHandlers.push(handler);
  }

  private emit(event: string, data?: unknown): void {
    for (const handler of this.eventHandlers) {
      handler(event, data);
    }
  }

  updateConfig(config: SinfoniaConfig): void {
    this.config = config;
    this.workspace.updateConfig(config.workspace);
    this.agentRunner.updateConfig(config.agent, config.prompt);
    logger.info("orchestrator config updated (hot-reload)");
  }

  start(): void {
    logger.info(
      {
        maxAgents: this.config.orchestrator.max_concurrent_agents,
        pollingMs: this.config.orchestrator.polling_interval_ms,
        activeStates: this.config.tracker.active_states,
      },
      "orchestrator starting",
    );

    // Run first tick immediately
    this.pollTick();

    // Schedule subsequent ticks
    this.pollTimer = setInterval(
      () => this.pollTick(),
      this.config.orchestrator.polling_interval_ms,
    );

    this.emit("started");
  }

  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    // Signal all running agents to stop
    for (const issueId of this.state.getRunningIssueIds()) {
      this.stopFlags.set(issueId, true);
    }

    // Clear retry timers
    for (const [, entry] of this.state.retryQueue) {
      if (entry.timer) clearTimeout(entry.timer);
    }

    logger.info("orchestrator stopped");
    this.emit("stopped");
  }

  requestRefresh(): void {
    logger.info("manual refresh requested");
    this.pollTick();
  }

  async forceDispatch(issueIdentifier: string): Promise<void> {
    const issues = await this.tracker.fetchCandidateIssues();
    const issue = issues.find((i) => i.identifier === issueIdentifier);
    if (!issue) throw new Error(`Issue ${issueIdentifier} not found`);
    await this.dispatchIssue(issue);
  }

  snapshot(): OrchestratorSnapshot {
    return {
      running: Array.from(this.state.running.values()),
      retryQueue: Array.from(this.state.retryQueue.values()),
      completed: [...this.state.completed],
      totalTokens: this.state.totalTokens,
      runtimeMs: this.state.runtimeMs,
      maxAgents: this.config.orchestrator.max_concurrent_agents,
      pollingIntervalMs: this.config.orchestrator.polling_interval_ms,
    };
  }

  private async pollTick(): Promise<void> {
    if (this.polling) {
      logger.debug("skipping poll tick, previous tick still running");
      return;
    }
    this.polling = true;
    try {
      // 1. Reconcile running issues
      await this.reconcile();

      // 2. Fetch candidate issues
      const candidates = await this.tracker.fetchCandidateIssues();

      // 3. Select and dispatch
      const terminalStates = new Set<string>(); // TODO: configure terminal states
      const toDispatch = selectDispatchCandidates(
        candidates,
        this.config.orchestrator,
        this.state,
        terminalStates,
      );

      for (const issue of toDispatch) {
        this.dispatchIssue(issue).catch((err) => {
          logger.error({ err, issue: issue.identifier }, "dispatch failed, releasing claim");
          this.state.release(issue.id);
        });
      }

      this.emit("poll_complete", {
        candidates: candidates.length,
        dispatched: toDispatch.length,
        running: this.state.runningCount,
      });
    } catch (err) {
      logger.error({ err }, "poll tick failed");
    } finally {
      this.polling = false;
    }
  }

  private async reconcile(): Promise<void> {
    const result = await reconcileRunning(
      this.state,
      this.tracker,
      this.workspace,
      this.config.tracker.active_states,
      this.config.agent.stall_timeout_ms,
    );

    // Handle stalled sessions
    for (const issueId of result.staleIssues) {
      const session = this.state.running.get(issueId);
      if (!session) continue;

      logger.warn({ issueId, identifier: session.issueIdentifier }, "terminating stalled session");
      this.stopFlags.set(issueId, true);
      this.state.removeRunning(issueId);
      this.scheduleRetry(issueId, session.issueIdentifier, 1, false, "stalled");
    }

    // Handle terminal issues
    for (const issueId of result.terminalIssues) {
      const session = this.state.running.get(issueId);
      if (!session) continue;

      logger.info({ issueId, identifier: session.issueIdentifier }, "issue reached terminal state");
      this.stopFlags.set(issueId, true);
      this.state.markCompleted(issueId);
      await this.workspace.remove(this.workspace.getWorkspacePath(session.issueIdentifier));
    }

    // Update state changes
    for (const [issueId, newState] of result.stateChanges) {
      this.state.updateRunningEvent(issueId, `state changed to ${newState}`);
    }
  }

  private async dispatchIssue(issue: Issue, attempt = 1): Promise<void> {
    if (!this.state.claim(issue.id)) {
      logger.debug({ issue: issue.identifier }, "issue already claimed, skipping");
      return;
    }

    logger.info({ issue: issue.identifier, state: issue.state }, "dispatching issue");
    this.emit("dispatch", { identifier: issue.identifier, state: issue.state });

    try {
      // Move issue to dispatch state (e.g. "In Progress") in tracker
      const stateFlow = this.resolveStateFlow();
      let currentState = issue.state;
      if (stateFlow.on_dispatch && currentState.toLowerCase() !== stateFlow.on_dispatch.toLowerCase()) {
        try {
          await this.tracker.updateIssueState(issue.id, stateFlow.on_dispatch);
          currentState = stateFlow.on_dispatch;
        } catch (err) {
          logger.warn({ err, issue: issue.identifier, target: stateFlow.on_dispatch }, "failed to transition issue on dispatch");
        }
      }

      // Create/reuse workspace
      const wsPath = await this.workspace.createForIssue(issue);

      // Run before_run hook
      await this.workspace.runBeforeRunHook(wsPath);

      // Set up running session
      const sessionInfo: RunningSession = {
        issueId: issue.id,
        issueIdentifier: issue.identifier,
        pid: -1,
        sessionId: "",
        threadId: "",
        turnId: "",
        turn: 1,
        startedAt: new Date(),
        lastEventAt: new Date(),
        tokens: { input: 0, output: 0 },
        state: currentState,
        lastEvent: "starting",
      };

      this.state.setRunning(issue.id, sessionInfo);
      this.stopFlags.set(issue.id, false);

      // Run agent
      const result = await this.agentRunner.run(issue, wsPath, null, {
        onEvent: (type, data) => {
          const formatted = formatAgentEvent(type, data as Record<string, unknown> | undefined);
          if (formatted !== null) {
            this.state.updateRunningEvent(issue.id, formatted);
          }
          this.emit("agent_event", { issueId: issue.id, type, data });
        },
        onTokens: (input, output) => {
          this.state.updateRunningTokens(issue.id, input, output);
        },
        shouldStop: () => this.stopFlags.get(issue.id) === true,
      });

      // Update session info from result
      sessionInfo.sessionId = result.session.sessionId;
      sessionInfo.threadId = result.session.threadId;
      sessionInfo.turnId = result.session.turnId;
      sessionInfo.turn = result.session.turn;
      sessionInfo.tokens = result.tokens;

      // Run after_run hook
      await this.workspace.runAfterRunHook(wsPath);

      // Accumulate tokens
      this.state.addTokens(result.tokens.input, result.tokens.output);

      // Handle outcome
      this.state.removeRunning(issue.id);

      if (result.outcome === "succeeded") {
        logger.info({ issue: issue.identifier, tokens: result.tokens }, "agent succeeded");

        // Post completion comment with branch/commit info
        try {
          const wsInfo = await this.workspace.getWorkspaceInfo(wsPath);
          if (wsInfo && wsInfo.branch) {
            const commitLink = wsInfo.repoUrl && wsInfo.commitSha
              ? `[\`${wsInfo.commitSha.slice(0, 7)}\`](${wsInfo.repoUrl}/commit/${wsInfo.commitSha})`
              : wsInfo.commitSha ? `\`${wsInfo.commitSha.slice(0, 7)}\`` : "";
            const totalTokens = result.tokens.input + result.tokens.output;
            const lines = [
              `🤖 Agent completed successfully.`,
              ``,
              `**Branch:** \`${wsInfo.branch}\``,
              commitLink ? `**Commit:** ${commitLink} — ${wsInfo.commitMessage}` : "",
              ``,
              `_Tokens: ${totalTokens.toLocaleString()} (in: ${result.tokens.input.toLocaleString()}, out: ${result.tokens.output.toLocaleString()})_`,
            ];
            await this.tracker.createComment(issue.id, lines.filter(Boolean).join("\n"));
            logger.info({ issue: issue.identifier, branch: wsInfo.branch }, "posted completion comment");
          }
        } catch (err) {
          logger.warn({ err, issue: issue.identifier }, "failed to post completion comment");
        }

        // Move issue to success state (e.g. "Ready for Review" or "Done")
        const successState = stateFlow.on_success;
        try {
          await this.tracker.updateIssueState(issue.id, successState);
          logger.info({ issue: issue.identifier, state: successState }, "issue transitioned to done state");
        } catch (err) {
          logger.warn({ err, issue: issue.identifier, state: successState }, "failed to transition issue to done state");
        }

        this.state.markCompleted(issue.id);
      } else {
        logger.warn({ issue: issue.identifier, outcome: result.outcome, error: result.error }, "agent ended");
        this.scheduleRetry(issue.id, issue.identifier, attempt, false, result.error);
      }

      this.emit("dispatch_complete", {
        identifier: issue.identifier,
        outcome: result.outcome,
        tokens: result.tokens,
      });
    } catch (err) {
      logger.error({ err, issue: issue.identifier }, "dispatch error");
      this.state.removeRunning(issue.id);
      this.scheduleRetry(issue.id, issue.identifier, attempt, false, String(err));
    }
  }

  private resolveStateFlow(): { on_dispatch: string; on_success: string; on_failure?: string } {
    const flow = this.config.orchestrator.state_flow;
    const legacyDone = this.config.orchestrator.done_state;

    // If state_flow.on_success is still the default ("Done") but done_state was explicitly set
    // to something else, honor the legacy setting for backward compatibility
    const on_success = flow.on_success === "Done" && legacyDone !== "Done"
      ? legacyDone
      : flow.on_success;

    return {
      on_dispatch: flow.on_dispatch,
      on_success,
      on_failure: flow.on_failure,
    };
  }

  private scheduleRetry(
    issueId: string,
    issueIdentifier: string,
    attempt: number,
    isContinuation: boolean,
    error?: string,
  ): void {
    const MAX_RETRY_ATTEMPTS = 10;
    const MAX_CONTINUATION_ATTEMPTS = 3;
    const maxAttempts = isContinuation ? MAX_CONTINUATION_ATTEMPTS : MAX_RETRY_ATTEMPTS;

    if (attempt > maxAttempts) {
      if (isContinuation) {
        logger.info({ issueId, identifier: issueIdentifier, attempt }, "max continuations reached, marking completed");
        this.state.markCompleted(issueId);
      } else {
        logger.warn({ issueId, identifier: issueIdentifier, attempt }, "max retry attempts reached, releasing issue");

        // Transition to failure state if configured
        const stateFlow = this.resolveStateFlow();
        if (stateFlow.on_failure) {
          this.tracker.updateIssueState(issueId, stateFlow.on_failure).catch((err) => {
            logger.warn({ err, issueId, state: stateFlow.on_failure }, "failed to transition issue to failure state");
          });
        }

        this.state.release(issueId);
      }
      return;
    }

    const delay = calculateRetryDelay(
      attempt,
      this.config.orchestrator.retry.max_backoff_ms,
      isContinuation,
    );

    const entry = createRetryEntry(issueId, issueIdentifier, attempt, delay, isContinuation, error);

    entry.timer = setTimeout(async () => {
      this.state.removeRetry(issueId);

      try {
        const candidates = await this.tracker.fetchCandidateIssues();
        const issue = candidates.find((i) => i.id === issueId);

        if (!issue) {
          logger.info({ issueId, identifier: issueIdentifier }, "issue no longer active, releasing");
          this.state.release(issueId);
          return;
        }

        const slots = this.config.orchestrator.max_concurrent_agents - this.state.runningCount;
        if (slots <= 0) {
          logger.info({ issueId, identifier: issueIdentifier }, "no slots available, requeuing");
          this.scheduleRetry(issueId, issueIdentifier, attempt + 1, isContinuation, "no slots");
          return;
        }

        await this.dispatchIssue(issue, attempt + 1);
      } catch (err) {
        logger.error({ err, issueId }, "retry dispatch failed");
        this.scheduleRetry(issueId, issueIdentifier, attempt + 1, false, String(err));
      }
    }, delay);

    this.state.queueRetry(entry);

    logger.info(
      { issueId, identifier: issueIdentifier, attempt, delayMs: delay, isContinuation },
      "retry scheduled",
    );
  }
}

export { OrchestratorState } from "./state.js";
export { selectDispatchCandidates, sortCandidates } from "./dispatcher.js";
export { reconcileRunning } from "./reconciler.js";
export { calculateRetryDelay, createRetryEntry } from "./retry.js";
