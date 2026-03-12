import { createHash } from "node:crypto";
import type { Scanner, FileChunk } from "./base.js";
import type { Finding } from "../../shared/types.js";
import type { ScannerModuleConfig } from "../../config/schema.js";
import { AgentRunner } from "../../agent/runner.js";

const SECURITY_PROMPT = `Analyze the following code for security vulnerabilities. Look for:
- SQL injection, XSS, command injection
- Hardcoded secrets or credentials
- Insecure cryptographic usage
- Path traversal vulnerabilities
- Insecure deserialization
- Missing input validation at system boundaries
- SSRF vulnerabilities

For each finding, respond with a JSON array of objects:
[{
  "file": "path/to/file.ts",
  "line": 42,
  "title": "Short description of the vulnerability",
  "description": "Detailed explanation and suggested fix",
  "severity": "critical|high|medium|low"
}]

If no vulnerabilities found, respond with an empty array: []

Code to analyze:
`;

export const securityScanner: Scanner = {
  name: "security",
  description: "Detects security vulnerabilities using LLM analysis",

  async analyze(files: FileChunk[], config: ScannerModuleConfig): Promise<Finding[]> {
    const findings: Finding[] = [];
    const threshold = config.severity_threshold ?? "medium";
    const severityOrder = ["critical", "high", "medium", "low"] as const;
    const thresholdIdx = severityOrder.indexOf(threshold as typeof severityOrder[number]);

    // Build code context
    const codeContext = files
      .map((f) => `--- ${f.path} (lines ${f.startLine}-${f.endLine}) ---\n${f.content}`)
      .join("\n\n");

    const prompt = SECURITY_PROMPT + codeContext;

    // Use Claude to analyze (via CLI)
    const { execSync } = await import("node:child_process");
    try {
      const result = execSync(
        `claude -p ${JSON.stringify(prompt)} --output-format json --max-turns 1`,
        { encoding: "utf-8", timeout: 120000, maxBuffer: 50 * 1024 * 1024 },
      );

      const parsed = JSON.parse(result);
      const resultText = parsed.result ?? parsed.text ?? result;

      // Extract JSON array from response
      const jsonMatch = String(resultText).match(/\[[\s\S]*\]/);
      if (!jsonMatch) return findings;

      const rawFindings = JSON.parse(jsonMatch[0]) as Array<{
        file: string;
        line?: number;
        title: string;
        description: string;
        severity: string;
      }>;

      for (const raw of rawFindings) {
        const severity = raw.severity as Finding["severity"];
        const sevIdx = severityOrder.indexOf(severity);
        if (sevIdx > thresholdIdx) continue;

        const fingerprint = createHash("sha256")
          .update(`security:${raw.file}:${raw.title}`)
          .digest("hex")
          .slice(0, 16);

        findings.push({
          type: "security",
          severity,
          file: raw.file,
          line: raw.line,
          title: raw.title,
          description: raw.description,
          fingerprint,
          source: "scanner:security",
        });
      }
    } catch {
      // Scanner failure is non-fatal
    }

    return findings;
  },
};
