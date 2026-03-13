import { describe, it, expect } from "vitest";
import { ScannerRegistry } from "./registry.js";
import type { Scanner } from "./modules/base.js";

function makeScanner(name: string): Scanner {
  return {
    name,
    description: `${name} scanner`,
    analyze: async () => [],
  };
}

describe("ScannerRegistry", () => {
  it("has builtin scanners registered", () => {
    const registry = new ScannerRegistry();
    const names = registry.names();
    expect(names).toContain("security");
    expect(names).toContain("performance");
    expect(names).toContain("dry");
    expect(names).toContain("simplify");
    expect(names).toContain("custom");
  });

  it("retrieves a scanner by name", () => {
    const registry = new ScannerRegistry();
    const scanner = registry.get("security");
    expect(scanner).toBeDefined();
    expect(scanner!.name).toBe("security");
  });

  it("returns undefined for unknown scanner", () => {
    const registry = new ScannerRegistry();
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("registers a custom scanner", () => {
    const registry = new ScannerRegistry();
    const custom = makeScanner("my-scanner");
    registry.register(custom);
    expect(registry.get("my-scanner")).toBe(custom);
    expect(registry.names()).toContain("my-scanner");
  });

  it("overrides builtin scanner when registering with same name", () => {
    const registry = new ScannerRegistry();
    const override = makeScanner("security");
    registry.register(override);
    expect(registry.get("security")).toBe(override);
  });

  it("lists all scanners", () => {
    const registry = new ScannerRegistry();
    const scanners = registry.list();
    expect(scanners.length).toBe(5); // 5 builtins
    expect(scanners.every((s) => s.name && s.description)).toBe(true);
  });
});
