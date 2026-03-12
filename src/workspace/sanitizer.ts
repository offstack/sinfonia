import { resolve, normalize } from "node:path";
import { realpathSync, existsSync } from "node:fs";

const SAFE_CHARS = /[^A-Za-z0-9._-]/g;

export function sanitizeIdentifier(identifier: string): string {
  return identifier.replace(SAFE_CHARS, "_");
}

export function buildWorkspacePath(root: string, identifier: string): string {
  const sanitized = sanitizeIdentifier(identifier);
  const absRoot = resolve(root);
  const wsPath = resolve(absRoot, sanitized);

  assertContainedInRoot(absRoot, wsPath);
  return wsPath;
}

export function assertContainedInRoot(root: string, path: string): void {
  const normalizedRoot = normalize(resolve(root));
  const normalizedPath = normalize(resolve(path));

  if (!normalizedPath.startsWith(normalizedRoot + "/") && normalizedPath !== normalizedRoot) {
    throw new Error(`Workspace path "${normalizedPath}" escapes root "${normalizedRoot}"`);
  }

  // Check symlink escape if path exists
  if (existsSync(path)) {
    const realPath = realpathSync(path);
    const realRoot = realpathSync(root);
    if (!realPath.startsWith(realRoot + "/") && realPath !== realRoot) {
      throw new Error(`Workspace symlink resolves outside root: "${realPath}"`);
    }
  }
}

export function slugify(text: string, maxLength: number = 50): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, maxLength);
}
