import { spawn, type ChildProcess } from "node:child_process";
import type { AgentConfig } from "../config/schema.js";
import type { Issue, RunOutcome, RunningSession } from "../shared/types.js";
import { renderPrompt } from "./prompt.js";
import { createSession, nextTurn, type Session } from "./session.js";
import { createSessionLogger } from "../shared/logger.js";

export interface AgentRunResult {
  outcome: RunOutcome;
  session: Session;
  tokens: { input: number; output: number };
  error?: string;
}

export interface AgentRunCallbacks {
  onEvent?: (event: string, data?: unknown) => void;
  onTokens?: (input: number, output: number) => void;
  shouldStop?: () => boolean;
}

export class AgentRunner {
  private config: AgentConfig;
  private promptTemplate: string;

  constructor(config: AgentConfig, promptTemplate: string) {
    this.config = config;
    this.promptTemplate = promptTemplate;
  }

  updateConfig(config: AgentConfig, promptTemplate: string): void {
    this.config = config;
    this.promptTemplate = promptTemplate;
  }

  async run(
    issue: Issue,
    workspacePath: string,
    existingSession: Session | null,
    callbacks: AgentRunCallbacks = {},
  ): Promise<AgentRunResult> {
    const isContinuation = existingSession !== null;
    const session = existingSession ? nextTurn(existingSession) : createSession();
    const logger = createSessionLogger(session.sessionId, issue.id, issue.identifier);
    const prompt = renderPrompt(this.promptTemplate, issue, isContinuation);

    const tokens = { input: 0, output: 0 };

    const args = this.buildArgs(prompt, isContinuation ? session.threadId : undefined);

    logger.info(
      { turn: session.turn, isContinuation, command: this.config.command, cwd: workspacePath, argsCount: args.length },
      "starting agent turn",
    );

    // Build env: inherit process env but remove CLAUDECODE to allow
    // nested Claude Code sessions (Sinfonia itself may run inside Claude Code)
    const childEnv = { ...process.env };
    delete childEnv.CLAUDECODE;

    const child = spawn(this.config.command, args, {
      cwd: workspacePath,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...childEnv,
        SINFONIA_ISSUE_ID: issue.id,
        SINFONIA_ISSUE_IDENTIFIER: issue.identifier,
        SINFONIA_SESSION_ID: session.sessionId,
      },
    });

    const result = await this.waitForCompletion(child, session, issue, tokens, callbacks, logger);
    return result;
  }

  getPid(child: ChildProcess): number {
    return child.pid ?? -1;
  }

  private buildArgs(prompt: string, resumeThreadId?: string): string[] {
    const args: string[] = [
      "-p", prompt,
      "--output-format", "stream-json",
      "--verbose",
      "--max-turns", String(this.config.max_turns),
    ];

    if (this.config.allowed_tools.length > 0) {
      args.push("--allowedTools", this.config.allowed_tools.join(","));
    }

    if (resumeThreadId) {
      args.push("--resume", resumeThreadId);
    }

    return args;
  }

  private async waitForCompletion(
    child: ChildProcess,
    session: Session,
    issue: Issue,
    tokens: { input: number; output: number },
    callbacks: AgentRunCallbacks,
    logger: ReturnType<typeof createSessionLogger>,
  ): Promise<AgentRunResult> {
    return new Promise<AgentRunResult>((resolve) => {
      let lastEventAt = Date.now();
      let stallTimer: ReturnType<typeof setInterval> | null = null;
      let turnTimer: ReturnType<typeof setTimeout> | null = null;
      let settled = false;

      const settle = (outcome: RunOutcome, error?: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        logger.info({ outcome, tokens, turn: session.turn }, "agent turn ended");
        resolve({ outcome, session, tokens, error });
      };

      const cleanup = () => {
        if (stallTimer) clearInterval(stallTimer);
        if (turnTimer) clearTimeout(turnTimer);
        if (child.exitCode === null) {
          child.kill("SIGTERM");
          setTimeout(() => { if (child.exitCode === null) child.kill("SIGKILL"); }, 5000);
        }
      };

      // Turn timeout
      turnTimer = setTimeout(() => {
        logger.warn("turn timed out");
        settle("timed_out", "Turn exceeded timeout");
      }, this.config.turn_timeout_ms);

      // Stall detection
      if (this.config.stall_timeout_ms > 0) {
        stallTimer = setInterval(() => {
          if (Date.now() - lastEventAt > this.config.stall_timeout_ms) {
            logger.warn("agent stalled");
            settle("stalled", "No output for stall timeout period");
          }
          if (callbacks.shouldStop?.()) {
            logger.info("stop requested by orchestrator");
            settle("canceled", "Canceled by reconciliation");
          }
        }, 5000);
      }

      // Read stdout (JSON output)
      let stdoutBuffer = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        lastEventAt = Date.now();
        stdoutBuffer += chunk.toString();

        // Try to parse JSON lines
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            this.handleEvent(event, session, tokens, callbacks, logger);
          } catch {
            // Not JSON — log as raw output
            callbacks.onEvent?.("output", line);
          }
        }
      });

      // Stderr for diagnostics — log at warn so issues are visible
      child.stderr?.on("data", (chunk: Buffer) => {
        lastEventAt = Date.now();
        const text = chunk.toString().trim();
        if (text) {
          logger.warn({ stderr: text.slice(0, 500) }, "agent stderr");
          callbacks.onEvent?.(`stderr: ${text.slice(0, 100)}`);
        }
      });

      // Process exit
      child.on("exit", (code) => {
        if (code === 0) {
          settle("succeeded");
        } else {
          settle("failed", `Agent exited with code ${code}`);
        }
      });

      child.on("error", (err) => {
        settle("failed", `Agent spawn error: ${err.message}`);
      });
    });
  }

  private handleEvent(
    event: Record<string, unknown>,
    session: Session,
    tokens: { input: number; output: number },
    callbacks: AgentRunCallbacks,
    logger: ReturnType<typeof createSessionLogger>,
  ): void {
    const type = (event.type as string) ?? "unknown";

    // stream-json: assistant messages contain message.usage with per-message tokens
    if (type === "assistant" && event.message && typeof event.message === "object") {
      const message = event.message as Record<string, unknown>;
      if (message.usage && typeof message.usage === "object") {
        const usage = message.usage as Record<string, number>;
        if (usage.input_tokens) tokens.input += usage.input_tokens;
        if (usage.output_tokens) tokens.output += usage.output_tokens;
        callbacks.onTokens?.(tokens.input, tokens.output);
      }
    }

    // stream-json: result event has session_id for --resume
    if (type === "result") {
      if (typeof event.session_id === "string") {
        session.threadId = event.session_id;
      }
    }

    // Fallback: top-level usage (for other event formats)
    if (event.usage && typeof event.usage === "object" && type !== "assistant") {
      const usage = event.usage as Record<string, number>;
      if (usage.input_tokens) tokens.input += usage.input_tokens;
      if (usage.output_tokens) tokens.output += usage.output_tokens;
      callbacks.onTokens?.(tokens.input, tokens.output);
    }

    callbacks.onEvent?.(type, event);
    logger.debug({ eventType: type }, "agent event");
  }
}
