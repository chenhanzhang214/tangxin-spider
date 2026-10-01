#!/usr/bin/env node
/**
 * Windows one-click launcher for the 糖心图谱 desktop GUI.
 * start.bat calls this so the desktop process and its local server share one
 * visible lifecycle.
 */
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "./with-app-env.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = 8080;
const OPEN_URL = `http://localhost:${PORT}/`;
const APP_TITLE = "糖心图谱";
const logFile = join(root, "start-error.log");

function log(line) {
  const text = `[${new Date().toISOString()}] ${line}`;
  console.log(line);
  try {
    appendFileSync(logFile, `${text}\n`, "utf8");
  } catch {
    // ignore disk errors
  }
}

function fail(line) {
  log(`[ERROR] ${line}`);
  process.exit(1);
}

const nodeDir = dirname(process.execPath);
const env = {
  ...process.env,
  PATH: `${nodeDir};${process.env.PATH ?? ""}`,
};

function npmCmd() {
  const sibling = join(nodeDir, "npm.cmd");
  if (existsSync(sibling)) return sibling;
  return "npm";
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : cmd;
    const shellCommand =
      process.platform === "win32" && cmd.toLowerCase().endsWith(".cmd") ? "npm" : quoteIfNeeded(cmd);
    const commandArgs =
      process.platform === "win32"
        ? ["/d", "/s", "/c", [shellCommand, ...args].join(" ")]
        : args;
    const child = spawn(command, commandArgs, {
      cwd: root,
      stdio: "inherit",
      env,
      windowsHide: true,
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exit ${code}`));
    });
  });
}

function quoteIfNeeded(cmd) {
  if (cmd.includes(" ") && !cmd.startsWith('"')) return `"${cmd}"`;
  return cmd;
}

export function isTangxinDocument(body) {
  const html = String(body ?? "");
  return (
    new RegExp(`<title>\\s*${APP_TITLE}\\s*</title>`, "i").test(html) &&
    html.includes("tangxinvlog.app")
  );
}

export function classifyResponse(status, body) {
  if (status >= 200 && status < 400 && isTangxinDocument(body)) {
    return { kind: "ready" };
  }
  if (status > 0) {
    return {
      kind: "occupied",
      message: `端口 ${PORT} 已被其他程序占用，返回的页面不是「${APP_TITLE}」。请关闭占用 ${PORT} 的程序后重试。`,
    };
  }
  return { kind: "not-ready", message: `服务尚未响应 ${OPEN_URL}。` };
}

function viteBin() {
  return process.platform === "win32"
    ? join(root, "node_modules", ".bin", "vite.cmd")
    : join(root, "node_modules", ".bin", "vite");
}

async function main() {
  try {
    writeFileSync(logFile, "", "utf8");
  } catch {
    // ignore
  }
  log(`launcher ok  node=${process.version}  root=${root}`);

  if (!existsSync(join(root, "package.json"))) {
    fail("package.json missing. Put start.bat in the unzipped project root.");
  }

  const major = Number.parseInt(process.versions.node, 10);
  if (Number.isFinite(major) && major < 20) {
    fail(`Node ${process.versions.node} is too old. Install 20 LTS from https://nodejs.org/`);
  }

  if (!existsSync(viteBin()) || !existsSync(electronBin())) {
    log("First run: npm install (may take a few minutes)...");
    await run(npmCmd(), ["install"]);
    if (!existsSync(viteBin()) || !existsSync(electronBin())) {
      fail("npm install finished but desktop dependencies are still missing. Check network and retry.");
    }
  }

  log("Starting desktop GUI. Leave this window open while the app is running.");
  await run(npmCmd(), ["run", "desktop:dev"]);
}

function electronBin() {
  return process.platform === "win32"
    ? join(root, "node_modules", ".bin", "electron.cmd")
    : join(root, "node_modules", ".bin", "electron");
}

if (isMainModule(import.meta.url)) {
  main().catch((err) => {
    fail(err instanceof Error ? err.message : String(err));
  });
}
