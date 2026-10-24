import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APP_TITLE,
  buildServerEnvironment,
  desktopServerUrl,
  desktopPortCandidates,
  getDesktopPort,
  isTangxinDocument,
  findDesktopAssetPath,
  resolveDesktopRuntimePaths,
  resolveDesktopPaths,
} from "./desktop-config.mjs";

test("uses a safe fixed port unless the desktop override is valid", () => {
  assert.equal(getDesktopPort({}), 8080);
  assert.equal(getDesktopPort({ TX_DESKTOP_PORT: "8099" }), 8099);
  assert.equal(getDesktopPort({ TX_DESKTOP_PORT: "80" }), 8080);
  assert.equal(getDesktopPort({ TX_DESKTOP_PORT: "not-a-port" }), 8080);
});

test("builds the local desktop server URL and recognizes the app shell", () => {
  assert.equal(desktopServerUrl(8099), "http://127.0.0.1:8099/");
  assert.equal(isTangxinDocument(`<title>${APP_TITLE}</title> tangxinvlog.app`), true);
  assert.equal(isTangxinDocument("<title>Other app</title>"), false);
  assert.equal(
    findDesktopAssetPath('<link rel="stylesheet" href="/assets/styles-abc.css">'),
    "/assets/styles-abc.css",
  );
  assert.equal(findDesktopAssetPath("<title>no assets</title>"), null);
});

test("offers deterministic fallback ports and a stable packaged runtime", () => {
  assert.deepEqual(desktopPortCandidates(65535, 3), [65535, 8080, 8081]);
  assert.deepEqual(resolveDesktopRuntimePaths("C:\\Users\\Example\\AppData\\Roaming\\tx", "0.3.1"), {
    root: "C:\\Users\\Example\\AppData\\Roaming\\tx\\runtime\\0.3.1",
    serverEntry:
      "C:\\Users\\Example\\AppData\\Roaming\\tx\\runtime\\0.3.1\\desktop-server\\server\\index.mjs",
    serverCwd: "C:\\Users\\Example\\AppData\\Roaming\\tx\\runtime\\0.3.1\\desktop-server",
    ffmpegPath:
      "C:\\Users\\Example\\AppData\\Roaming\\tx\\runtime\\0.3.1\\ffmpeg\\ffmpeg.exe",
  });
});

test("resolves development and packaged resource layouts", () => {
  assert.deepEqual(
    resolveDesktopPaths({
      packaged: false,
      projectRoot: "C:\\project",
      resourcesPath: "ignored",
    }),
    {
      serverEntry: "C:\\project\\.output\\server\\index.mjs",
      serverCwd: "C:\\project\\.output",
      ffmpegPath: "C:\\project\\node_modules\\@ffmpeg-installer\\win32-x64\\ffmpeg.exe",
    },
  );
  assert.deepEqual(
    resolveDesktopPaths({
      packaged: true,
      projectRoot: "ignored",
      resourcesPath: "C:\\Program Files\\Tangxin\\resources",
    }),
    {
      serverEntry: "C:\\Program Files\\Tangxin\\resources\\desktop-server\\server\\index.mjs",
      serverCwd: "C:\\Program Files\\Tangxin\\resources\\desktop-server",
      ffmpegPath: "C:\\Program Files\\Tangxin\\resources\\ffmpeg\\ffmpeg.exe",
    },
  );
});

test("passes the port and packaged ffmpeg path to the server", () => {
  assert.deepEqual(
    buildServerEnvironment({ VITE_AUTH_ENABLED: "false" }, 8099, "C:\\app\\ffmpeg.exe"),
    {
      VITE_AUTH_ENABLED: "false",
      HOST: "127.0.0.1",
      NITRO_HOST: "127.0.0.1",
      PORT: "8099",
      NITRO_PORT: "8099",
      FFMPEG_PATH: "C:\\app\\ffmpeg.exe",
    },
  );
});
