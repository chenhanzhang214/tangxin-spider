import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const launcher = new URL("../start-server.bat", import.meta.url);

test("LAN batch entry uses ASCII and CRLF while enabling UTF-8 application output", () => {
  const source = readFileSync(launcher, "utf8");
  assert.ok(!source.startsWith("\uFEFF"));
  assert.doesNotMatch(source, /(?<!\r)\n/);
  assert.ok([...source].every((character) => character.charCodeAt(0) < 128));
  assert.ok(source.indexOf("chcp 65001") < source.indexOf("node scripts\\lan-server.mjs"));
});

for (const exitCode of [0, 23]) {
  test(
    `real CMD forwards a custom port and preserves exit code ${exitCode}`,
    { skip: process.platform !== "win32" },
    () => {
      const directory = mkdtempSync(join(tmpdir(), "tangxin launcher space "));
      try {
        copyFileSync(launcher, join(directory, "start-server.bat"));
        mkdirSync(join(directory, "scripts"));
        writeFileSync(
          join(directory, "scripts", "lan-server.mjs"),
          `console.log('LAUNCH_PORT:' + process.argv[2]);process.exit(${exitCode});`,
        );
        const result = spawnSync(
          process.env.ComSpec ?? "cmd.exe",
          ["/d", "/c", "start-server.bat 8123"],
          {
            cwd: directory,
            input: "\r\n",
            encoding: "utf8",
            windowsHide: true,
            timeout: 10000,
          },
        );
        assert.ifError(result.error);
        assert.equal(result.status, exitCode, result.stdout + result.stderr);
        assert.match(result.stdout, /Tangxin LAN Server/);
        assert.match(result.stdout, /LAUNCH_PORT:8123/);
        assert.equal(result.stderr, "");
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
}
