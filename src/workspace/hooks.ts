import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("hooks");

export interface HookResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
}

export async function runHook(
  hookCommand: string,
  workspacePath: string,
  timeoutMs: number,
  hookName: string,
): Promise<HookResult> {
  if (!hookCommand || hookCommand.trim() === "") {
    return { success: true, stdout: "", stderr: "", exitCode: 0 };
  }

  if (!existsSync(workspacePath)) {
    return { success: false, stdout: "", stderr: `Workspace not found: ${workspacePath}`, exitCode: null };
  }

  logger.info({ hook: hookName, workspace: workspacePath }, "running hook");

  return new Promise<HookResult>((resolve) => {
    const child = execFile("bash", ["-lc", hookCommand], {
      cwd: workspacePath,
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, SINFONIA_WORKSPACE: workspacePath },
    }, (error, stdout, stderr) => {
      if (error) {
        logger.error({ hook: hookName, error: error.message, stderr: stderr.slice(0, 500) }, "hook failed");
        resolve({ success: false, stdout, stderr, exitCode: child.exitCode });
      } else {
        logger.info({ hook: hookName }, "hook succeeded");
        resolve({ success: true, stdout, stderr, exitCode: 0 });
      }
    });
  });
}
