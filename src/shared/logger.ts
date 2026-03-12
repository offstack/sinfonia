import pino from "pino";

const rootLogger = pino({
  transport: process.stdout.isTTY
    ? { target: "pino-pretty", options: { colorize: true, translateTime: "HH:MM:ss" } }
    : undefined,
  level: process.env.LOG_LEVEL ?? "info",
});

export function createLogger(module: string, context?: Record<string, unknown>) {
  return rootLogger.child({ module, ...context });
}

export function createIssueLogger(issueId: string, issueIdentifier: string) {
  return rootLogger.child({ module: "agent", issue_id: issueId, issue_identifier: issueIdentifier });
}

export function createSessionLogger(sessionId: string, issueId: string, issueIdentifier: string) {
  return rootLogger.child({
    module: "agent",
    session_id: sessionId,
    issue_id: issueId,
    issue_identifier: issueIdentifier,
  });
}

export { rootLogger };
