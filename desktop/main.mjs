import { app, BrowserWindow, dialog, session, shell, utilityProcess } from "electron";
import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import {
  APP_TITLE,
  buildServerEnvironment,
  desktopPortCandidates,
  desktopServerUrl,
  findDesktopAssetPath,
  getDesktopPort,
  isTangxinDocument,
  resolveDesktopRuntimePaths,
  resolveDesktopPaths,
} from "./desktop-config.mjs";

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

let mainWindow = null;
let localServer = null;
let ownsLocalServer = false;
let isQuitting = false;
let port = getDesktopPort();
let serverUrl = desktopServerUrl(port);

function logFilePath() {
  try {
    return join(app.getPath("userData"), "desktop.log");
  } catch {
    return null;
  }
}

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  const filePath = logFilePath();
  if (!filePath) return;
  try {
    mkdirSync(dirname(filePath), { recursive: true });
    appendFileSync(filePath, `${line}\n`, "utf8");
  } catch {
    // Logging must never prevent the desktop UI from starting.
  }
}

async function probeServer(candidatePort = port) {
  const candidateUrl = desktopServerUrl(candidatePort);
  try {
    const response = await fetch(candidateUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(1_500),
    });
    const body = await response.text();
    if (response.status >= 200 && response.status < 400 && isTangxinDocument(body)) {
      const assetPath = findDesktopAssetPath(body);
      if (!assetPath) {
        return { kind: "unhealthy", message: `端口 ${candidatePort} 的页面没有可用静态资源。` };
      }
      try {
        const asset = await fetch(new URL(assetPath, candidateUrl), {
          redirect: "manual",
          signal: AbortSignal.timeout(1_500),
        });
        const bytes = await asset.arrayBuffer();
        if (asset.status >= 200 && asset.status < 400 && bytes.byteLength > 0) {
          return { kind: "ready" };
        }
      } catch {
        // The port is occupied by a Tangxin shell whose static files are not ready.
      }
      return { kind: "unhealthy", message: `端口 ${candidatePort} 的本地服务静态资源异常。` };
    }
    return {
      kind: "occupied",
      message: `端口 ${candidatePort} 已被其他程序占用。`,
    };
  } catch {
    return { kind: "free" };
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForServer(child, timeoutMs = 120_000) {
  const startedAt = Date.now();
  let childFailure = null;
  const onExit = (code) => {
    if (!isQuitting && Date.now() - startedAt < timeoutMs) {
      childFailure = `本地服务提前退出（代码 ${code}）。`;
    }
  };
  child.once("exit", onExit);

  try {
    while (Date.now() - startedAt < timeoutMs) {
      if (childFailure) throw new Error(childFailure);
      const status = await probeServer();
      if (status.kind === "ready") return;
      if (status.kind === "occupied") throw new Error(status.message);
      await wait(300);
    }
    throw new Error(`等待本地服务超时：${serverUrl}`);
  } finally {
    child.off("exit", onExit);
  }
}

function serverPaths() {
  const sourcePaths = resolveDesktopPaths({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    projectRoot: join(import.meta.dirname, ".."),
  });

  if (!app.isPackaged) return sourcePaths;

  const runtimePaths = resolveDesktopRuntimePaths(app.getPath("userData"), app.getVersion());
  const runtimeReady =
    existsSync(runtimePaths.serverEntry) &&
    existsSync(join(runtimePaths.serverCwd, "public", "favicon.svg"));
  if (!runtimeReady) {
    const sourceReady =
      existsSync(sourcePaths.serverEntry) &&
      existsSync(join(sourcePaths.serverCwd, "public", "favicon.svg"));
    if (!sourceReady) {
      throw new Error(
        `桌面资源不完整：找不到本地服务静态文件。请重新解压或重新下载程序后再试。\n${sourcePaths.serverCwd}`,
      );
    }
    mkdirSync(runtimePaths.root, { recursive: true });
    cpSync(sourcePaths.serverCwd, runtimePaths.serverCwd, { recursive: true, force: true });
    if (existsSync(sourcePaths.ffmpegPath) && !existsSync(runtimePaths.ffmpegPath)) {
      mkdirSync(dirname(runtimePaths.ffmpegPath), { recursive: true });
      copyFileSync(sourcePaths.ffmpegPath, runtimePaths.ffmpegPath);
    }
  }

  return {
    ...runtimePaths,
    ffmpegPath: existsSync(runtimePaths.ffmpegPath) ? runtimePaths.ffmpegPath : sourcePaths.ffmpegPath,
  };
}

async function ensureLocalServer() {
  const paths = serverPaths();
  if (!existsSync(paths.serverEntry)) {
    throw new Error(`找不到桌面服务文件：${paths.serverEntry}。请先执行桌面版构建。`);
  }

  let selectedPort = null;
  for (const candidate of desktopPortCandidates(getDesktopPort())) {
    const status = await probeServer(candidate);
    if (status.kind === "free") {
      selectedPort = candidate;
      break;
    }
    log(status.message ?? `跳过端口 ${candidate}。`);
  }
  if (selectedPort === null) {
    throw new Error(`没有找到可用的本地端口（已尝试 ${desktopPortCandidates(getDesktopPort()).length} 个端口）。`);
  }
  port = selectedPort;
  serverUrl = desktopServerUrl(port);
  log(`使用本地端口：${serverUrl}`);

  const child = utilityProcess.fork(paths.serverEntry, [], {
    cwd: paths.serverCwd,
    env: buildServerEnvironment(process.env, port, existsSync(paths.ffmpegPath) ? paths.ffmpegPath : ""),
    stdio: "pipe",
    serviceName: "Tangxin local server",
  });
  localServer = child;
  ownsLocalServer = true;
  child.stdout?.on("data", (chunk) => log(`[server] ${String(chunk).trimEnd()}`));
  child.stderr?.on("data", (chunk) => log(`[server:error] ${String(chunk).trimEnd()}`));
  child.on("error", (type, location, report) => {
    log(`[server:fatal] ${type} ${location} ${report}`);
  });
  child.on("exit", (code) => log(`[server] exited with code ${code}`));
  await waitForServer(child);
  log(`本地服务已就绪：${serverUrl}`);
}

function configureDownloads() {
  session.defaultSession.on("will-download", (_event, item) => {
    const downloadsDirectory = app.getPath("downloads");
    item.setSavePath(join(downloadsDirectory, item.getFilename()));
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: APP_TITLE,
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    show: false,
    backgroundColor: "#0f0d0c",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== serverUrl && !url.startsWith(`${serverUrl}`)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  void mainWindow.loadURL(serverUrl);
}

async function stopLocalServer() {
  if (!ownsLocalServer || !localServer) return;
  const child = localServer;
  localServer = null;
  ownsLocalServer = false;
  child.kill();
  await wait(250);
}

async function start() {
  app.setAppUserModelId("com.tangxin.map");
  configureDownloads();
  await ensureLocalServer();
  createWindow();
}

if (gotSingleInstanceLock) {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.on("before-quit", (event) => {
    if (isQuitting || !ownsLocalServer) return;
    event.preventDefault();
    isQuitting = true;
    void stopLocalServer().finally(() => app.exit(0));
  });

  app.whenReady().then(() => start()).catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);
    log(`[fatal] ${message}`);
    await dialog.showMessageBox({
      type: "error",
      title: APP_TITLE,
      message: "桌面程序启动失败",
      detail: message,
    });
    app.exit(1);
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
