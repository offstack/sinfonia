import type { Scanner } from "./modules/base.js";
import { securityScanner } from "./modules/security.js";
import { performanceScanner } from "./modules/performance.js";
import { dryScanner } from "./modules/dry.js";
import { simplifyScanner } from "./modules/simplify.js";
import { customScanner } from "./modules/custom.js";

const builtinScanners = new Map<string, Scanner>([
  ["security", securityScanner],
  ["performance", performanceScanner],
  ["dry", dryScanner],
  ["simplify", simplifyScanner],
  ["custom", customScanner],
]);

export class ScannerRegistry {
  private scanners = new Map<string, Scanner>(builtinScanners);

  register(scanner: Scanner): void {
    this.scanners.set(scanner.name, scanner);
  }

  get(name: string): Scanner | undefined {
    return this.scanners.get(name);
  }

  list(): Scanner[] {
    return Array.from(this.scanners.values());
  }

  names(): string[] {
    return Array.from(this.scanners.keys());
  }
}
