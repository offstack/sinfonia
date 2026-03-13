import { describe, it, expect } from "vitest";
import { ScannerRegistry } from "./registry.js";
import type { Scanner, FileChunk } from "./modules/base.js";

function makeScanner(name: string): Scanner {
  return {
    name,
    description: `${name} scanner`,
    analyze: async (_files: FileChunk[]) => [],
  };
}

describe("ScannerRegistry", () => {
  it("includes all five built-in scanners", () => {
    const registry = new ScannerRegistry();
    const names = registry.names();
    expect(names).toContain("security");
    expect(names).toContain("performance");
    expect(names).toContain("dry");
    expect(names).toContain("simplify");
    expect(names).toContain("custom");
  });

  it("list() returns all registered scanners", () => {
    const registry = new ScannerRegistry();
    const list = registry.list();
    expect(list.length).toBeGreaterThanOrEqual(5);
  });

  it("get() returns a scanner by name", () => {
    const registry = new ScannerRegistry();
    const scanner = registry.get("security");
    expect(scanner).toBeDefined();
    expect(scanner?.name).toBe("security");
  });

  it("get() returns undefined for unknown scanner", () => {
    const registry = new ScannerRegistry();
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("register() adds a new scanner", () => {
    const registry = new ScannerRegistry();
    const custom = makeScanner("my-custom");
    registry.register(custom);
    expect(registry.get("my-custom")).toBe(custom);
  });

  it("register() overwrites an existing scanner with the same name", () => {
    const registry = new ScannerRegistry();
    const replacement = makeScanner("security");
    registry.register(replacement);
    expect(registry.get("security")).toBe(replacement);
  });

  it("each ScannerRegistry instance is independent", () => {
    const r1 = new ScannerRegistry();
    const r2 = new ScannerRegistry();
    r1.register(makeScanner("exclusive"));
    expect(r1.get("exclusive")).toBeDefined();
    expect(r2.get("exclusive")).toBeUndefined();
  });
});
