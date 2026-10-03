import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { desktopBuildId } from "./runtime-cache.mjs";
import { resolveDesktopRuntimePaths } from "./desktop-config.mjs";

test("same-version rebuilds cannot reuse old UI or server runtime caches", () => {
  const fixture = mkdtempSync(join(tmpdir(), "tangxin-runtime-test-"));
  try {
    mkdirSync(join(fixture, "server"));
    mkdirSync(join(fixture, "public", "assets"), { recursive: true });
    writeFileSync(join(fixture, "server", "index.mjs"), "server revision 1");
    const stylesheet = join(fixture, "public", "assets", "styles.css");
    writeFileSync(stylesheet, "body { overflow: auto }");
    const original = desktopBuildId(fixture);
    assert.equal(desktopBuildId(fixture), original);

    writeFileSync(stylesheet, "body { overflow: hidden }");
    const updatedUi = desktopBuildId(fixture);
    assert.notEqual(updatedUi, original);
    assert.notEqual(
      resolveDesktopRuntimePaths(fixture, "0.4.1", original).root,
      resolveDesktopRuntimePaths(fixture, "0.4.1", updatedUi).root,
    );

    writeFileSync(join(fixture, "server", "index.mjs"), "server revision 2");
    assert.notEqual(desktopBuildId(fixture), updatedUi);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
