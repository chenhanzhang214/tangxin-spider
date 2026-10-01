import { join, resolve } from "node:path";

export const APP_TITLE = "糖心图谱";
export const DEFAULT_DESKTOP_PORT = 8080;

export function getDesktopPort(environment = process.env) {
  const parsed = Number(environment.TX_DESKTOP_PORT);
  return Number.isInteger(parsed) && parsed >= 1024 && parsed <= 65535
    ? parsed
    : DEFAULT_DESKTOP_PORT;
}

export function desktopServerUrl(port = DEFAULT_DESKTOP_PORT) {
  return `http://127.0.0.1:${port}/`;
}

export function desktopPortCandidates(preferredPort, limit = 24) {
  const candidates = [];
  const add = (candidate) => {
    if (candidate < 1024 || candidate > 65535 || candidates.includes(candidate)) return;
    candidates.push(candidate);
  };

  for (let offset = 0; candidates.length < limit && preferredPort + offset <= 65535; offset += 1) {
    add(preferredPort + offset);
  }
  for (let offset = 0; candidates.length < limit; offset += 1) {
    add(DEFAULT_DESKTOP_PORT + offset);
  }
  return candidates;
}

export function isTangxinDocument(body) {
  const html = String(body ?? "");
  return (
    new RegExp(`<title>\\s*${APP_TITLE}\\s*</title>`, "i").test(html) &&
    html.includes("tangxinvlog.app")
  );
}

export function findDesktopAssetPath(body) {
  const match = String(body ?? "").match(/(?:src|href)=["'](\/assets\/[^"']+\.(?:css|js)(?:\?[^"']*)?)["']/i);
  return match?.[1] ?? null;
}

export function resolveDesktopPaths({ packaged, resourcesPath, projectRoot }) {
  if (packaged) {
    const resourceRoot = resolve(resourcesPath);
    return {
      serverEntry: join(resourceRoot, "desktop-server", "server", "index.mjs"),
      serverCwd: join(resourceRoot, "desktop-server"),
      ffmpegPath: join(resourceRoot, "ffmpeg", "ffmpeg.exe"),
    };
  }

  const root = resolve(projectRoot);
  return {
    serverEntry: join(root, ".output", "server", "index.mjs"),
    serverCwd: join(root, ".output"),
    ffmpegPath: join(root, "node_modules", "@ffmpeg-installer", "win32-x64", "ffmpeg.exe"),
  };
}

export function resolveDesktopRuntimePaths(userDataPath, version) {
  const root = join(resolve(userDataPath), "runtime", String(version));
  return {
    root,
    serverEntry: join(root, "desktop-server", "server", "index.mjs"),
    serverCwd: join(root, "desktop-server"),
    ffmpegPath: join(root, "ffmpeg", "ffmpeg.exe"),
  };
}

export function buildServerEnvironment(environment, port, ffmpegPath) {
  return {
    ...environment,
    HOST: "127.0.0.1",
    NITRO_HOST: "127.0.0.1",
    PORT: String(port),
    NITRO_PORT: String(port),
    ...(ffmpegPath ? { FFMPEG_PATH: ffmpegPath } : {}),
  };
}
