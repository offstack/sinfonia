import type { Finding } from "../../shared/types.js";
import type { ScannerModuleConfig } from "../../config/schema.js";

export interface FileChunk {
  path: string;
  content: string;
  startLine: number;
  endLine: number;
}

export interface Scanner {
  name: string;
  description: string;
  analyze(files: FileChunk[], config: ScannerModuleConfig): Promise<Finding[]>;
}
