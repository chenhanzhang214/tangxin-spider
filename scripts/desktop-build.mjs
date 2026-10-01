#!/usr/bin/env node
/**
 * Build the local Node-server variant used by the Electron desktop shell.
 * The normal `npm run build` keeps producing the Vercel output.
 */
import { spawn } from "node:child_process";

const env = { ...process.env, DESKTOP_BUILD: "1" };
const command = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : "npm";
const args =
  process.platform === "win32"
    ? ["/d", "/s", "/c", "npm run desktop:build:raw"]
    : ["run", "desktop:build:raw"];

const child = spawn(command, args, {
  cwd: process.cwd(),
  env,
  stdio: "inherit",
  windowsHide: false,
});

child.on("error", (error) => {
  console.error(`[desktop-build] ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 1);
});
