import { describe, it, expect } from "vitest";
import { sanitizeIdentifier, buildWorkspacePath, slugify, assertContainedInRoot } from "./sanitizer.js";

describe("sanitizeIdentifier", () => {
  it("preserves alphanumeric, dots, hyphens, underscores", () => {
    expect(sanitizeIdentifier("SIN-1")).toBe("SIN-1");
    expect(sanitizeIdentifier("v2.0.1")).toBe("v2.0.1");
  });

  it("replaces unsafe characters with underscores", () => {
    expect(sanitizeIdentifier("foo/bar")).toBe("foo_bar");
    expect(sanitizeIdentifier("a b c")).toBe("a_b_c");
    expect(sanitizeIdentifier("../../etc/passwd")).toBe(".._.._etc_passwd");
  });
});

describe("buildWorkspacePath", () => {
  it("builds a path under root", () => {
    const result = buildWorkspacePath("/tmp/ws", "SIN-1");
    expect(result).toBe("/tmp/ws/SIN-1");
  });

  it("sanitizes the identifier", () => {
    const result = buildWorkspacePath("/tmp/ws", "SIN 1");
    expect(result).toBe("/tmp/ws/SIN_1");
  });

  it("sanitizes away path traversal characters", () => {
    // ../../etc becomes .._.._etc after sanitization, which stays under root
    const result = buildWorkspacePath("/tmp/ws", "../../etc");
    expect(result).toBe("/tmp/ws/.._.._etc");
  });
});

describe("assertContainedInRoot", () => {
  it("accepts paths inside root", () => {
    expect(() => assertContainedInRoot("/tmp/ws", "/tmp/ws/sub")).not.toThrow();
  });

  it("accepts the root itself", () => {
    expect(() => assertContainedInRoot("/tmp/ws", "/tmp/ws")).not.toThrow();
  });

  it("rejects paths outside root", () => {
    expect(() => assertContainedInRoot("/tmp/ws", "/tmp/other")).toThrow("escapes root");
  });
});

describe("slugify", () => {
  it("converts to lowercase and replaces non-alphanumeric chars", () => {
    expect(slugify("Fix Login Bug")).toBe("fix-login-bug");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("--hello--")).toBe("hello");
  });

  it("truncates to maxLength", () => {
    const long = "a".repeat(100);
    expect(slugify(long, 10)).toHaveLength(10);
  });

  it("handles special characters", () => {
    expect(slugify("Hello, World! #42")).toBe("hello-world-42");
  });
});
