import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { githubIntegration } from "./github.js";
import type { IntegrationSourceConfig } from "../../config/schema.js";

function makeConfig(overrides: Partial<IntegrationSourceConfig> = {}): IntegrationSourceConfig {
  return {
    enabled: true,
    secret: "gh-secret",
    auto_triage: false,
    ignore_environments: [],
    ignore_patterns: [],
    events: [],
    ...overrides,
  };
}

function makeDependabotPayload() {
  return {
    action: "created",
    alert: {
      number: 42,
      state: "open",
      security_advisory: {
        summary: "Prototype Pollution in lodash",
        description: "Versions of lodash before 4.17.21 are vulnerable to prototype pollution.",
        severity: "high",
        cve_id: "CVE-2021-23337",
      },
      security_vulnerability: {
        package: { name: "lodash", ecosystem: "npm" },
        severity: "high",
        vulnerable_version_range: "< 4.17.21",
        first_patched_version: { identifier: "4.17.21" },
      },
      dependency: {
        package: { name: "lodash", ecosystem: "npm" },
        manifest_path: "package.json",
      },
    },
    repository: { full_name: "org/repo" },
  };
}

function makeCheckRunPayload() {
  return {
    action: "completed",
    check_run: {
      id: 999,
      name: "ci/build",
      conclusion: "failure",
      output: {
        title: "Build failed",
        summary: "TypeScript compilation errors found",
      },
      html_url: "https://github.com/org/repo/runs/999",
    },
    repository: { full_name: "org/repo" },
  };
}

describe("githubIntegration", () => {
  describe("verifySignature", () => {
    it("returns true for valid sha256 signature", () => {
      const body = JSON.stringify({ test: true });
      const secret = "gh-secret";
      const signature = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
      const headers = { "x-hub-signature-256": signature };

      expect(githubIntegration.verifySignature(headers, body, makeConfig({ secret }))).toBe(true);
    });

    it("returns false for invalid signature", () => {
      const headers = { "x-hub-signature-256": "sha256=invalid" };
      expect(githubIntegration.verifySignature(headers, "body", makeConfig())).toBe(false);
    });

    it("returns false when signature header is missing", () => {
      expect(githubIntegration.verifySignature({}, "body", makeConfig())).toBe(false);
    });

    it("returns false when secret is empty", () => {
      const headers = { "x-hub-signature-256": "sha256=something" };
      expect(githubIntegration.verifySignature(headers, "body", makeConfig({ secret: "" }))).toBe(false);
    });
  });

  describe("transform", () => {
    it("transforms a Dependabot alert into a security finding", () => {
      const finding = githubIntegration.transform(makeDependabotPayload(), makeConfig());

      expect(finding).not.toBeNull();
      expect(finding!.type).toBe("security");
      expect(finding!.title).toContain("Prototype Pollution in lodash");
      expect(finding!.source).toBe("integration:github");
      expect(finding!.fingerprint).toHaveLength(16);
      expect(finding!.file).toBe("package.json");
      expect(finding!.description).toContain("CVE-2021-23337");
      expect(finding!.description).toContain("4.17.21");
    });

    it("transforms a check run failure into a bug finding", () => {
      const finding = githubIntegration.transform(makeCheckRunPayload(), makeConfig());

      expect(finding).not.toBeNull();
      expect(finding!.type).toBe("bug");
      expect(finding!.severity).toBe("high");
      expect(finding!.title).toContain("ci/build");
      expect(finding!.source).toBe("integration:github");
      expect(finding!.file).toBe("CI");
      expect(finding!.description).toContain("TypeScript compilation errors");
    });

    it("returns null for non-failure check runs", () => {
      const payload = makeCheckRunPayload();
      payload.check_run!.conclusion = "success";
      expect(githubIntegration.transform(payload, makeConfig())).toBeNull();
    });

    it("returns null for unrecognized payloads", () => {
      expect(githubIntegration.transform({ action: "opened" }, makeConfig())).toBeNull();
    });
  });

  describe("mapSeverity", () => {
    it("maps critical to critical", () => {
      const payload = makeDependabotPayload();
      payload.alert!.security_advisory!.severity = "critical";
      expect(githubIntegration.mapSeverity(payload)).toBe("critical");
    });

    it("maps high to high", () => {
      expect(githubIntegration.mapSeverity(makeDependabotPayload())).toBe("high");
    });

    it("maps moderate to medium", () => {
      const payload = makeDependabotPayload();
      payload.alert!.security_advisory!.severity = "moderate";
      expect(githubIntegration.mapSeverity(payload)).toBe("medium");
    });

    it("maps unknown to low", () => {
      const payload = makeDependabotPayload();
      payload.alert!.security_advisory!.severity = "info";
      expect(githubIntegration.mapSeverity(payload)).toBe("low");
    });
  });
});
