import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "./with-app-env.mjs";
import { projectIdentity } from "./lan-status-plugin.mjs";

export function portCandidates(preferred = 8080, count = 24) {
  if (!Number.isInteger(preferred) || preferred < 1024 || preferred > 65535)
    throw new Error("Port must be an integer between 1024 and 65535.");
  const ports = [];
  for (let port = preferred; port <= 65535 && ports.length < count; port++) ports.push(port);
  for (let port = 8080; ports.length < count; port++) if (!ports.includes(port)) ports.push(port);
  return ports;
}

export async function chooseLanPort(preferred = 8080) {
  for (const port of portCandidates(preferred)) {
    const available = await new Promise((resolve, reject) => {
      const server = createServer();
      server.once("error", (error) => {
        if (["EADDRINUSE", "EACCES"].includes(error.code)) resolve(false);
        else reject(error);
      });
      server.listen({ host: "0.0.0.0", port, exclusive: true }, () =>
        server.close(() => resolve(true)),
      );
    });
    if (available) return port;
  }
  throw new Error("No LAN port is available. Check port usage and network permissions.");
}

export async function inspectLanServer(port, expected) {
  try {
    const base = `http://127.0.0.1:${port}`;
    const response = await fetch(base + "/__tangxin/server-info", {
      signal: AbortSignal.timeout(1500),
      redirect: "error",
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json"))
      return false;
    const info = await response.json();
    if (
      info.app !== "tangxin" ||
      info.projectId !== expected.projectId ||
      info.version !== expected.version ||
      info.managed !== true ||
      info.lan !== true
    )
      return false;
    const page = await fetch(base + "/", { signal: AbortSignal.timeout(5000), redirect: "error" });
    const html = await page.text();
    return (
      page.ok &&
      html.includes("糖心图谱") &&
      html.includes("tangxinvlog.app") &&
      html.includes(expected.version)
    );
  } catch {
    return false;
  }
}

export function lanUrls(port, interfaces = networkInterfaces()) {
  return [
    ...new Set(
      Object.values(interfaces)
        .flat()
        .filter((entry) => entry && entry.family === "IPv4" && !entry.internal)
        .map((entry) => `http://${entry.address}:${port}/`),
    ),
  ];
}

function showAddresses(port) {
  console.log(`Local: http://127.0.0.1:${port}/`);
  for (const url of lanUrls(port)) console.log(`LAN:   ${url}`);
}

async function main() {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const preferred = process.argv[2] === undefined ? 8080 : Number(process.argv[2]);
  const candidates = portCandidates(preferred);
  console.log(`Tangxin LAN Server v${version}`);
  console.log(`Source: ${root}`);
  if (Number(process.versions.node.split(".")[0]) < 20)
    throw new Error("Node.js 20 or newer is required.");
  if (!existsSync(join(root, "node_modules", "vite", "bin", "vite.js")))
    throw new Error("Dependencies are missing. Run npm install in this source directory first.");
  const expected = { projectId: projectIdentity(root), version };
  const running = await Promise.all(
    candidates.map(async (port) => ((await inspectLanServer(port, expected)) ? port : null)),
  );
  const existing = running.find((port) => port !== null);
  if (existing !== undefined) {
    console.log("This project's server is already running. No additional server was started.");
    showAddresses(existing);
    console.log("Stop the server from its original terminal window.");
    return 0;
  }
  const port = await chooseLanPort(preferred);
  if (port !== preferred) console.log(`Port ${preferred} is occupied; using port ${port}.`);
  console.log("Starting server. Open these addresses after Vite reports ready:");
  showAddresses(port);
  console.log("Keep this window open while using the service.");
  const windows = process.platform === "win32";
  const child = spawn(
    windows ? (process.env.ComSpec ?? "cmd.exe") : "npm",
    windows
      ? ["/d", "/s", "/c", `npm run dev -- --port ${port}`]
      : ["run", "dev", "--", "--port", String(port)],
    {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
      env: { ...process.env, TX_LAN_MANAGED: "1" },
    },
  );
  const stop = () => {
    if (windows && child.pid)
      spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    else child.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    return await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(code ?? 1));
    });
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

if (isMainModule(import.meta.url)) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(`[ERROR] ${error.message}`);
      process.exitCode = 1;
    });
}
