import { describe, it, expect } from "vitest";
import { genericIntegration } from "./generic.js";
import type { IntegrationSourceConfig } from "../../config/schema.js";

function makeConfig(): IntegrationSourceConfig {
  return {
    enabled: true,
    secret: "",
    auto_triage: false,
    ignore_environments: [],
    ignore_patterns: [],
    events: [],
  };
}

describe("genericIntegration", () => {
  describe("verifySignature", () => {
    it("always returns true (no signature verification)", () => {
      expect(genericIntegration.verifySignature({}, "", makeConfig())).toBe(true);
    });
  });

  describe("transform", () => {
    it("transforms a payload with title into a finding", () => {
      const payload = {
        title: "Memory leak in worker",
        description: "Worker process grows unbounded",
        severity: "high",
        file: "src/worker.ts",
        line: 55,
        type: "performance",
      };

      const finding = genericIntegration.transform(payload, makeConfig());
      expect(finding).not.toBeNull();
      expect(finding!.title).toBe("Memory leak in worker");
      expect(finding!.description).toBe("Worker process grows unbounded");
      expect(finding!.severity).toBe("high");
      expect(finding!.file).toBe("src/worker.ts");
      expect(finding!.line).toBe(55);
      expect(finding!.type).toBe("performance");
      expect(finding!.source).toBe("integration:generic");
      expect(finding!.fingerprint).toHaveLength(16);
    });

    it("returns null when title is missing", () => {
      expect(genericIntegration.transform({}, makeConfig())).toBeNull();
      expect(genericIntegration.transform({ description: "no title" }, makeConfig())).toBeNull();
    });

    it("returns null for null/undefined payload", () => {
      expect(genericIntegration.transform(null, makeConfig())).toBeNull();
      expect(genericIntegration.transform(undefined, makeConfig())).toBeNull();
    });

    it("defaults file to 'unknown' when not provided", () => {
      const finding = genericIntegration.transform({ title: "test" }, makeConfig());
      expect(finding!.file).toBe("unknown");
    });

    it("defaults type to 'bug' when not provided", () => {
      const finding = genericIntegration.transform({ title: "test" }, makeConfig());
      expect(finding!.type).toBe("bug");
    });

    it("uses title as description fallback", () => {
      const finding = genericIntegration.transform({ title: "some issue" }, makeConfig());
      expect(finding!.description).toBe("some issue");
    });
  });

  describe("mapSeverity", () => {
    it("maps valid severities", () => {
      expect(genericIntegration.mapSeverity({ severity: "critical" })).toBe("critical");
      expect(genericIntegration.mapSeverity({ severity: "high" })).toBe("high");
      expect(genericIntegration.mapSeverity({ severity: "medium" })).toBe("medium");
      expect(genericIntegration.mapSeverity({ severity: "low" })).toBe("low");
    });

    it("is case-insensitive", () => {
      expect(genericIntegration.mapSeverity({ severity: "HIGH" })).toBe("high");
      expect(genericIntegration.mapSeverity({ severity: "Critical" })).toBe("critical");
    });

    it("defaults to medium for unknown severity", () => {
      expect(genericIntegration.mapSeverity({ severity: "urgent" })).toBe("medium");
      expect(genericIntegration.mapSeverity({})).toBe("medium");
      expect(genericIntegration.mapSeverity(null)).toBe("medium");
    });
  });
});
