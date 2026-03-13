import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { sentryIntegration } from "./sentry.js";
import type { IntegrationSourceConfig } from "../../config/schema.js";

function makeConfig(overrides: Partial<IntegrationSourceConfig> = {}): IntegrationSourceConfig {
  return {
    enabled: true,
    secret: "test-secret",
    auto_triage: false,
    ignore_environments: [],
    ignore_patterns: [],
    events: [],
    ...overrides,
  };
}

function makeSentryPayload(overrides: Record<string, unknown> = {}) {
  return {
    action: "created",
    data: {
      issue: {
        id: "123",
        title: "TypeError: Cannot read property 'foo' of null",
        culprit: "src/handler.ts",
        metadata: { type: "TypeError", value: "Cannot read property 'foo' of null", filename: "src/handler.ts" },
        count: "5",
        firstSeen: "2025-01-01T00:00:00Z",
        level: "error",
        project: { slug: "my-project" },
      },
      ...overrides,
    },
  };
}

describe("sentryIntegration", () => {
  describe("verifySignature", () => {
    it("returns true for valid HMAC signature", () => {
      const body = JSON.stringify({ test: true });
      const secret = "my-secret";
      const signature = createHmac("sha256", secret).update(body).digest("hex");
      const headers = { "sentry-hook-signature": signature };

      expect(sentryIntegration.verifySignature(headers, body, makeConfig({ secret }))).toBe(true);
    });

    it("returns false for invalid signature", () => {
      const headers = { "sentry-hook-signature": "bad-signature" };
      expect(sentryIntegration.verifySignature(headers, "body", makeConfig())).toBe(false);
    });

    it("returns false when signature header is missing", () => {
      expect(sentryIntegration.verifySignature({}, "body", makeConfig())).toBe(false);
    });

    it("returns false when secret is empty", () => {
      const headers = { "sentry-hook-signature": "something" };
      expect(sentryIntegration.verifySignature(headers, "body", makeConfig({ secret: "" }))).toBe(false);
    });
  });

  describe("transform", () => {
    it("transforms a sentry payload into a finding", () => {
      const payload = makeSentryPayload();
      const finding = sentryIntegration.transform(payload, makeConfig());

      expect(finding).not.toBeNull();
      expect(finding!.type).toBe("bug");
      expect(finding!.title).toContain("Fix:");
      expect(finding!.title).toContain("TypeError");
      expect(finding!.source).toBe("integration:sentry");
      expect(finding!.fingerprint).toHaveLength(16);
      expect(finding!.file).toBe("src/handler.ts");
    });

    it("returns null when issue data is missing", () => {
      expect(sentryIntegration.transform({}, makeConfig())).toBeNull();
      expect(sentryIntegration.transform(null, makeConfig())).toBeNull();
    });

    it("filters by min_occurrences", () => {
      const payload = makeSentryPayload();
      const config = makeConfig({ min_occurrences: 10 });
      expect(sentryIntegration.transform(payload, config)).toBeNull();
    });

    it("passes when occurrences meet threshold", () => {
      const payload = makeSentryPayload();
      const config = makeConfig({ min_occurrences: 3 });
      expect(sentryIntegration.transform(payload, config)).not.toBeNull();
    });

    it("filters by ignore_environments", () => {
      const payload = makeSentryPayload({
        event: {
          title: "error",
          environment: "staging",
          exception: undefined,
          breadcrumbs: undefined,
        },
      });
      const config = makeConfig({ ignore_environments: ["staging"] });
      expect(sentryIntegration.transform(payload, config)).toBeNull();
    });

    it("filters by ignore_patterns", () => {
      const payload = makeSentryPayload();
      const config = makeConfig({ ignore_patterns: ["TypeError"] });
      expect(sentryIntegration.transform(payload, config)).toBeNull();
    });

    it("includes stack trace in description when available", () => {
      const payload = makeSentryPayload({
        event: {
          title: "TypeError",
          environment: "production",
          exception: {
            values: [{
              type: "TypeError",
              value: "null ref",
              stacktrace: {
                frames: [{ filename: "src/index.ts", lineno: 42, function: "main" }],
              },
            }],
          },
        },
      });
      const finding = sentryIntegration.transform(payload, makeConfig());
      expect(finding!.description).toContain("Stack Trace");
      expect(finding!.description).toContain("src/index.ts:42");
    });
  });

  describe("mapSeverity", () => {
    it("maps fatal to critical", () => {
      const payload = makeSentryPayload();
      payload.data.issue.level = "fatal";
      expect(sentryIntegration.mapSeverity(payload)).toBe("critical");
    });

    it("maps error to high", () => {
      const payload = makeSentryPayload();
      payload.data.issue.level = "error";
      expect(sentryIntegration.mapSeverity(payload)).toBe("high");
    });

    it("maps warning to medium", () => {
      const payload = makeSentryPayload();
      payload.data.issue.level = "warning";
      expect(sentryIntegration.mapSeverity(payload)).toBe("medium");
    });

    it("maps info to low", () => {
      const payload = makeSentryPayload();
      payload.data.issue.level = "info";
      expect(sentryIntegration.mapSeverity(payload)).toBe("low");
    });
  });
});
