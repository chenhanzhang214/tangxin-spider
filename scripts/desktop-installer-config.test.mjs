import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

test("desktop release exposes a reproducible assisted installer", () => {
  assert.equal(packageJson.scripts["desktop:installer"], "node scripts/desktop-package.mjs --installer");
  assert.equal(packageJson.scripts["desktop:installer:raw"], "electron-builder --win nsis");
  assert.equal(packageJson.build.nsis.oneClick, false);
  assert.equal(packageJson.build.nsis.allowToChangeInstallationDirectory, true);
  assert.equal(packageJson.build.nsis.createDesktopShortcut, true);
  assert.equal(packageJson.build.nsis.createStartMenuShortcut, true);
  assert.equal(packageJson.build.nsis.artifactName, "Tangxin-${version}-Setup-${arch}.${ext}");
});

test("portable and installer artifacts use distinct names", () => {
  assert.equal(packageJson.build.portable.artifactName, "Tangxin-${version}-${arch}-portable.${ext}");
  assert.deepEqual(packageJson.build.win.target, [
    { target: "portable", arch: ["x64"] },
  ]);
});
