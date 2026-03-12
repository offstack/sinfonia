import { mkdirSync, existsSync, rmSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { simpleGit } from "simple-git";
import type { WorkspaceConfig } from "../config/schema.js";
import type { Issue } from "../shared/types.js";
import { buildWorkspacePath, sanitizeIdentifier, slugify } from "./sanitizer.js";
import { runHook } from "./hooks.js";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("workspace");

export class WorkspaceManager {
  private config: WorkspaceConfig;
  private repoRoot: string;

  constructor(config: WorkspaceConfig, repoRoot: string) {
    this.config = config;
    this.repoRoot = resolve(repoRoot);
  }

  updateConfig(config: WorkspaceConfig): void {
    this.config = config;
  }

  async createForIssue(issue: Issue): Promise<string> {
    const wsPath = buildWorkspacePath(this.config.root, issue.identifier);
    const branchName = `${sanitizeIdentifier(issue.identifier)}-${slugify(issue.title)}`;
    const isNew = !existsSync(wsPath);

    if (this.config.strategy === "worktree") {
      await this.createWorktree(wsPath, branchName, isNew);
    } else {
      this.createDirectory(wsPath);
    }

    if (isNew) {
      const hookResult = await runHook(
        this.config.hooks.after_create,
        wsPath,
        this.config.hooks_timeout_ms,
        "after_create",
      );
      if (!hookResult.success) {
        logger.error({ issue: issue.identifier }, "after_create hook failed, aborting workspace");
        this.remove(wsPath);
        throw new Error(`after_create hook failed for ${issue.identifier}: ${hookResult.stderr}`);
      }
    }

    logger.info({ issue: issue.identifier, path: wsPath, isNew }, "workspace ready");
    return wsPath;
  }

  async runBeforeRunHook(wsPath: string): Promise<void> {
    const result = await runHook(
      this.config.hooks.before_run,
      wsPath,
      this.config.hooks_timeout_ms,
      "before_run",
    );
    if (!result.success) {
      throw new Error(`before_run hook failed: ${result.stderr}`);
    }
  }

  async runAfterRunHook(wsPath: string): Promise<void> {
    await runHook(
      this.config.hooks.after_run,
      wsPath,
      this.config.hooks_timeout_ms,
      "after_run",
    );
  }

  remove(wsPath: string): void {
    if (!existsSync(wsPath)) return;

    // Run before_remove hook (non-fatal)
    runHook(this.config.hooks.before_remove, wsPath, this.config.hooks_timeout_ms, "before_remove").catch(() => {});

    if (this.config.strategy === "worktree") {
      this.removeWorktree(wsPath);
    } else {
      rmSync(wsPath, { recursive: true, force: true });
    }

    logger.info({ path: wsPath }, "workspace removed");
  }

  getWorkspacePath(issueIdentifier: string): string {
    return buildWorkspacePath(this.config.root, issueIdentifier);
  }

  listWorkspaces(): string[] {
    const rootPath = resolve(this.config.root);
    if (!existsSync(rootPath)) return [];

    return readdirSync(rootPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  }

  private async createWorktree(wsPath: string, branchName: string, isNew: boolean): Promise<void> {
    if (!isNew) return;

    const root = resolve(this.config.root);
    if (!existsSync(root)) {
      mkdirSync(root, { recursive: true });
    }

    const git = simpleGit(this.repoRoot);

    try {
      await git.raw(["worktree", "add", "-b", branchName, wsPath]);
    } catch (err: unknown) {
      // Branch may already exist
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("already exists")) {
        await git.raw(["worktree", "add", wsPath, branchName]);
      } else {
        throw err;
      }
    }
  }

  private createDirectory(wsPath: string): void {
    if (!existsSync(wsPath)) {
      mkdirSync(wsPath, { recursive: true });
    }
  }

  private removeWorktree(wsPath: string): void {
    try {
      const git = simpleGit(this.repoRoot);
      git.raw(["worktree", "remove", "--force", wsPath]).catch(() => {
        rmSync(wsPath, { recursive: true, force: true });
      });
    } catch {
      rmSync(wsPath, { recursive: true, force: true });
    }
  }
}
