// Node module resolve hook for running TypeScript unit tests with --experimental-strip-types.
// Maps "@/x" to "src/x" and resolves extensionless relative imports to ".ts" files.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function withTsExtension(absPath) {
  if (path.extname(absPath) && existsSync(absPath)) return absPath;
  for (const candidate of [`${absPath}.ts`, `${absPath}.tsx`, path.join(absPath, "index.ts")]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  let abs = null;
  if (specifier.startsWith("@/")) {
    abs = path.join(root, "src", specifier.slice(2));
  } else if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    abs = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
  }
  if (abs) {
    const found = withTsExtension(abs);
    if (found) return nextResolve(pathToFileURL(found).href, context);
  }
  return nextResolve(specifier, context);
}
