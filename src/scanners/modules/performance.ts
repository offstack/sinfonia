import { createHash } from "node:crypto";
import type { Scanner, FileChunk } from "./base.js";
import type { Finding } from "../../shared/types.js";
import type { ScannerModuleConfig } from "../../config/schema.js";

const PERFORMANCE_PROMPT = `Analyze the following code for performance issues. Look for:
- N+1 query patterns
- Unnecessary re-renders or computations
- Missing memoization or caching opportunities
- Inefficient loops or data structures
- Blocking operations on the main thread
- Unoptimized database queries (missing indexes, full table scans)
- Memory leaks

For each finding, respond with a JSON array:
[{
  "file": "path/to/file.ts",
  "line": 42,
  "title": "Short description",
  "description": "Detailed explanation and optimization suggestion",
  "severity": "critical|high|medium|low"
}]

If no issues found, respond with: []

Code to analyze:
`;

export const performanceScanner: Scanner = {
  name: "performance",
  description: "Detects performance issues using LLM analysis",

  async analyze(files: FileChunk[], _config: ScannerModuleConfig): Promise<Finding[]> {
    const findings: Finding[] = [];

    const codeContext = files
      .map((f) => `--- ${f.path} (lines ${f.startLine}-${f.endLine}) ---\n${f.content}`)
      .join("\n\n");

    const prompt = PERFORMANCE_PROMPT + codeContext;

    const { execSync } = await import("node:child_process");
    try {
      const result = execSync(
        `claude -p ${JSON.stringify(prompt)} --output-format json --max-turns 1`,
        { encoding: "utf-8", timeout: 120000, maxBuffer: 50 * 1024 * 1024 },
      );

      const parsed = JSON.parse(result);
      const resultText = String(parsed.result ?? parsed.text ?? result);
      const jsonMatch = resultText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return findings;

      const rawFindings = JSON.parse(jsonMatch[0]) as Array<{
        file: string;
        line?: number;
        title: string;
        description: string;
        severity: string;
      }>;

      for (const raw of rawFindings) {
        const fingerprint = createHash("sha256")
          .update(`performance:${raw.file}:${raw.title}`)
          .digest("hex")
          .slice(0, 16);

        findings.push({
          type: "performance",
          severity: raw.severity as Finding["severity"],
          file: raw.file,
          line: raw.line,
          title: raw.title,
          description: raw.description,
          fingerprint,
          source: "scanner:performance",
        });
      }
    } catch {
      // Non-fatal
    }

    return findings;
  },
};
