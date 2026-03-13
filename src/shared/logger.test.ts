import { describe, it, expect } from "vitest";
import { createLogger, createIssueLogger, createSessionLogger, rootLogger } from "./logger.js";

describe("logger", () => {
  describe("rootLogger", () => {
    it("is a pino logger instance", () => {
      expect(rootLogger).toBeDefined();
      expect(typeof rootLogger.info).toBe("function");
      expect(typeof rootLogger.error).toBe("function");
      expect(typeof rootLogger.child).toBe("function");
    });
  });

  describe("createLogger", () => {
    it("creates a child logger with module binding", () => {
      const log = createLogger("test-module");
      expect(log).toBeDefined();
      expect(typeof log.info).toBe("function");
      // pino child loggers bind context through the `bindings()` method
      expect(log.bindings().module).toBe("test-module");
    });

    it("includes extra context when provided", () => {
      const log = createLogger("test-module", { foo: "bar" });
      const bindings = log.bindings();
      expect(bindings.module).toBe("test-module");
      expect(bindings.foo).toBe("bar");
    });
  });

  describe("createIssueLogger", () => {
    it("creates a child logger with issue context", () => {
      const log = createIssueLogger("issue-123", "SIN-1");
      const bindings = log.bindings();
      expect(bindings.module).toBe("agent");
      expect(bindings.issue_id).toBe("issue-123");
      expect(bindings.issue_identifier).toBe("SIN-1");
    });
  });

  describe("createSessionLogger", () => {
    it("creates a child logger with session context", () => {
      const log = createSessionLogger("session-abc", "issue-123", "SIN-1");
      const bindings = log.bindings();
      expect(bindings.module).toBe("agent");
      expect(bindings.session_id).toBe("session-abc");
      expect(bindings.issue_id).toBe("issue-123");
      expect(bindings.issue_identifier).toBe("SIN-1");
    });
  });
});
