import { createHash } from "node:crypto";
import type { Scanner, FileChunk } from "./base.js";
import type { Finding } from "../../shared/types.js";
import type { ScannerModuleConfig } from "../../config/schema.js";

const SIMPLIFY_PROMPT = `Analyze the following code for simplification opportunities. Look for:
- Overly complex functions (high cyclomatic complexity)
- Deep nesting that could be flattened
- Long parameter lists
- Dead code or unused variables
- Overly abstract code that could be simplified
- Complex conditionals that could use early returns

For each finding, respond with a JSON array:
[{
  "file": "path/to/file.ts",
  "line": 42,
  "title": "Short description",
  "description": "What to simplify and how",
  "severity": "medium|low"
}]

If no issues found, respond with: []

Code to analyze:
`;

export const simplifyScanner: Scanner = {
  name: "simplify",
  description: "Finds code that can be simplified",

  async analyze(files: FileChunk[], _config: ScannerModuleConfig): Promise<Finding[]> {
    const findings: Finding[] = [];

    const codeContext = files
      .map((f) => `--- ${f.path} (lines ${f.startLine}-${f.endLine}) ---\n${f.content}`)
      .join("\n\n");

    const prompt = SIMPLIFY_PROMPT + codeContext;

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
          .update(`simplify:${raw.file}:${raw.title}`)
          .digest("hex")
          .slice(0, 16);

        findings.push({
          type: "simplify",
          severity: raw.severity as Finding["severity"],
          file: raw.file,
          line: raw.line,
          title: raw.title,
          description: raw.description,
          fingerprint,
          source: "scanner:simplify",
        });
      }
    } catch {
      // Non-fatal
    }

    return findings;
  },
};
