import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function sanitizeRouteManifest(text) {
  return text.replace(
    /(filePath:\s*["'])(?:[A-Za-z]:[\\/]|\/)[^"'\r\n]*?[\\/]src[\\/]routes[\\/]/g,
    "$1src/routes/",
  );
}

export function sanitizeBuildPaths(outputRoot = resolve(".output")) {
  const directory = join(outputRoot, "server");
  let changed = 0;
  for (const file of readdirSync(directory)) {
    if (!file.startsWith("_tanstack-start-manifest") || !file.endsWith(".mjs")) continue;
    const target = join(directory, file);
    const original = readFileSync(target, "utf8");
    const sanitized = sanitizeRouteManifest(original);
    if (original !== sanitized) {
      writeFileSync(target, sanitized);
      changed += 1;
    }
  }
  console.log(`[desktop] Sanitized ${changed} route manifest(s)`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  sanitizeBuildPaths(process.argv[2] ? resolve(process.argv[2]) : undefined);
}
