import { describe, it, expect } from "vitest";
import { runHook } from "./hooks.js";
import { mkdtempSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("runHook", () => {
  it("returns success for empty command", async () => {
    const result = await runHook("", "/tmp", 5000, "test");
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it("returns success for whitespace-only command", async () => {
    const result = await runHook("   ", "/tmp", 5000, "test");
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it("returns failure when workspace path does not exist", async () => {
    const result = await runHook("echo hello", "/nonexistent/path/xyz", 5000, "test");
    expect(result.success).toBe(false);
    expect(result.stderr).toContain("Workspace not found");
  });

  it("executes a simple command successfully", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "sinfonia-test-"));
    try {
      const result = await runHook("echo hello", tmpDir, 5000, "test");
      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe("hello");
      expect(result.exitCode).toBe(0);
    } finally {
      rmdirSync(tmpDir);
    }
  });

  it("sets SINFONIA_WORKSPACE env var", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "sinfonia-test-"));
    try {
      const result = await runHook("echo $SINFONIA_WORKSPACE", tmpDir, 5000, "test");
      expect(result.success).toBe(true);
      expect(result.stdout.trim()).toBe(tmpDir);
    } finally {
      rmdirSync(tmpDir);
    }
  });

  it("returns failure for a failing command", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "sinfonia-test-"));
    try {
      const result = await runHook("exit 1", tmpDir, 5000, "test");
      expect(result.success).toBe(false);
    } finally {
      rmdirSync(tmpDir);
    }
  });
});
