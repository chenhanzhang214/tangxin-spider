import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Content, rather than the release version alone, identifies the bundled UI.
// Rebuilding the same release version must not reuse an older server from userData.
export function desktopBuildId(serverDirectory) {
  const hash = createHash("sha256");
  function visit(relativePath) {
    const directory = join(serverDirectory, relativePath);
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      const relative = join(relativePath, entry.name);
      if (entry.isDirectory()) visit(relative);
      else if (entry.isFile()) {
        hash.update(relative).update("\0").update(readFileSync(join(serverDirectory, relative))).update("\0");
      }
    }
  }
  visit("server");
  visit("public");
  return hash.digest("hex").slice(0, 16);
}
