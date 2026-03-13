import { describe, it, expect } from "vitest";
import {
  sanitizeIdentifier,
  buildWorkspacePath,
  assertContainedInRoot,
  slugify,
} from "./sanitizer.js";
import { resolve } from "node:path";

describe("sanitizeIdentifier", () => {
  it("leaves safe characters unchanged", () => {
    expect(sanitizeIdentifier("SIN-1")).toBe("SIN-1");
    expect(sanitizeIdentifier("hello_world")).toBe("hello_world");
    expect(sanitizeIdentifier("v1.2.3")).toBe("v1.2.3");
  });

  it("replaces unsafe characters with underscores", () => {
    expect(sanitizeIdentifier("SIN/1")).toBe("SIN_1");
    expect(sanitizeIdentifier("hello world")).toBe("hello_world");
    expect(sanitizeIdentifier("foo@bar!baz")).toBe("foo_bar_baz");
  });

  it("handles empty string", () => {
    expect(sanitizeIdentifier("")).toBe("");
  });
});

describe("buildWorkspacePath", () => {
  it("returns an absolute path under root", () => {
    const root = "/tmp";
    const result = buildWorkspacePath(root, "SIN-1");
    expect(result).toBe(resolve("/tmp", "SIN-1"));
  });

  it("sanitizes the identifier in the output path", () => {
    const result = buildWorkspacePath("/tmp", "SIN/1 test");
    expect(result).toBe(resolve("/tmp", "SIN_1_test"));
  });

  it("neutralizes traversal attempts via sanitization (no throw)", () => {
    // sanitizeIdentifier replaces '/' with '_', so '../escape' becomes '.._escape'
    // The resulting path stays under root — no throw expected
    const result = buildWorkspacePath("/tmp/root", "../escape");
    expect(result).toBe(resolve("/tmp/root", ".._escape"));
  });

  it("neutralizes deeply nested traversal attempts via sanitization", () => {
    // '../../etc' → '.._.._etc' after sanitization — stays under root
    const result = buildWorkspacePath("/tmp/root", "../../etc");
    expect(result).toBe(resolve("/tmp/root", ".._.._etc"));
  });
});

describe("assertContainedInRoot", () => {
  it("passes for a path directly under root", () => {
    expect(() =>
      assertContainedInRoot("/tmp/root", "/tmp/root/child")
    ).not.toThrow();
  });

  it("passes when path equals root", () => {
    expect(() =>
      assertContainedInRoot("/tmp/root", "/tmp/root")
    ).not.toThrow();
  });

  it("throws when path is outside root", () => {
    expect(() =>
      assertContainedInRoot("/tmp/root", "/tmp/other")
    ).toThrow(/escapes root/);
  });

  it("throws for parent traversal", () => {
    expect(() =>
      assertContainedInRoot("/tmp/root", "/tmp/root/../escape")
    ).toThrow(/escapes root/);
  });
});

describe("slugify", () => {
  it("lowercases and replaces non-alphanumeric with hyphens", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("removes leading and trailing hyphens", () => {
    expect(slugify("  foo bar  ")).toBe("foo-bar");
  });

  it("collapses multiple separators into one hyphen", () => {
    expect(slugify("foo---bar")).toBe("foo-bar");
    expect(slugify("foo   bar")).toBe("foo-bar");
  });

  it("respects maxLength", () => {
    const result = slugify("a very long title that exceeds the limit", 10);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it("uses default maxLength of 50", () => {
    const long = "a".repeat(60);
    expect(slugify(long).length).toBeLessThanOrEqual(50);
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });
});
