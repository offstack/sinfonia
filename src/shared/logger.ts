import pino from "pino";
import { createWriteStream } from "node:fs";
import { resolve } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

// Log file path — all modes write to file for debugging.
// In TUI mode, stdout output is suppressed to avoid corrupting the display.
const logDir = resolve(process.env.SINFONIA_LOG_DIR ?? ".sinfonia/logs");
if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });
const logStream = createWriteStream(resolve(logDir, "sinfonia.log"), { flags: "a" });

const rootLogger = pino({
  level: process.env.LOG_LEVEL ?? "info",
}, logStream);

/**
 * Secondary logger that writes pretty-printed output to stdout.
 * Only activated when stdout is a TTY and TUI is not running.
 * Call `enableStdoutLogging()` to activate, `disableStdoutLogging()` to suppress.
 */
let stdoutLogger: pino.Logger | null = null;
let stdoutEnabled = process.stdout.isTTY;

if (stdoutEnabled) {
  stdoutLogger = pino({
    transport: { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } },
    level: process.env.LOG_LEVEL ?? "info",
  });
}

export function disableStdoutLogging(): void {
  stdoutEnabled = false;
}

export function enableStdoutLogging(): void {
  stdoutEnabled = true;
}

/**
 * Wraps pino child loggers to dual-write: always to file, optionally to stdout.
 */
function createDualLogger(module: string, context?: Record<string, unknown>): pino.Logger {
  const fileChild = rootLogger.child({ module, ...context });

  // Return a proxy that logs to both file and stdout
  return new Proxy(fileChild, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function" && ["trace", "debug", "info", "warn", "error", "fatal"].includes(prop as string)) {
        return (...args: unknown[]) => {
          (value as Function).apply(target, args);
          if (stdoutEnabled && stdoutLogger) {
            const stdChild = stdoutLogger.child({ module, ...context });
            (stdChild[prop as keyof pino.Logger] as Function)?.apply(stdChild, args);
          }
        };
      }
      return value;
    },
  }) as pino.Logger;
}

export function createLogger(module: string, context?: Record<string, unknown>) {
  return createDualLogger(module, context);
}

export function createIssueLogger(issueId: string, issueIdentifier: string) {
  return createDualLogger("agent", { issue_id: issueId, issue_identifier: issueIdentifier });
}

export function createSessionLogger(sessionId: string, issueId: string, issueIdentifier: string) {
  return createDualLogger("agent", {
    session_id: sessionId,
    issue_id: issueId,
    issue_identifier: issueIdentifier,
  });
}

export { rootLogger };
