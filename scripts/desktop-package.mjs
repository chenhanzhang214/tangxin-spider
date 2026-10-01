#!/usr/bin/env node
/**
 * Build the desktop server and package it with a cache on the project drive.
 * A local cache avoids cross-volume rename failures seen with transient
 * electron-builder downloads on some Windows environments.
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const cacheDirectory = process.env.ELECTRON_BUILDER_CACHE?.trim() || join(process.cwd(), ".electron-builder-cache");
mkdirSync(cacheDirectory, { recursive: true });
const env = { ...process.env, ELECTRON_BUILDER_CACHE: cacheDirectory };
const installer = process.argv.includes("--installer");
const packageScript = installer ? "desktop:installer:raw" : "desktop:package:raw";

function runNpm(args) {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : "npm";
    const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", "npm", ...args] : args;
    const child = spawn(command, commandArgs, {
      cwd: process.cwd(),
      env,
      stdio: "inherit",
      windowsHide: false,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal || code !== 0) reject(new Error(`npm ${args.join(" ")} failed`));
      else resolve();
    });
  });
}

try {
  await runNpm(["run", "desktop:build"]);
  await runNpm(["run", packageScript]);
} catch (error) {
  console.error(`[desktop-package] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
