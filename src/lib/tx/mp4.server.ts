import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, open, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  DEFAULT_DOWNLOAD_DIRECTORY,
  isValidDownloadDirectory,
  normalizeDownloadDirectory,
} from "./download-settings.ts";
import {
  mapHlsProgressToDownloadProgress,
  type DownloadProgressUpdate,
} from "./download-progress.ts";
import { prefetchHlsToTransportStream } from "./hls-prefetch.server.ts";
import {
  buildFfmpegArgs,
  buildLocalFfmpegArgs,
  sanitizeFilename,
  sanitizeVideoTitle,
} from "./mp4-utils.ts";
import { hlsUrl } from "./types.ts";

const FFMPEG_CHECK_TIMEOUT_MS = 4_000;
export const DEFAULT_MP4_DOWNLOAD_DIR = DEFAULT_DOWNLOAD_DIRECTORY;
const MAX_MP4_INDEX = 100_000;
const DEFAULT_HLS_CONCURRENCY = 8;

type Mp4DownloadLocation = {
  directory: string;
  filename: string;
  path: string;
};

type FfmpegStatus = {
  available: boolean;
  command: string;
  version?: string;
  hlsConcurrency?: number;
  error?: string;
};

type Mp4TransferMode = "parallel" | "direct";
type Mp4ProgressCallback = (progress: DownloadProgressUpdate) => void;

function bundledFfmpegPath() {
  const executable = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const platformPackage = `${process.platform}-${process.arch}`;
  const candidates = [
    join(process.cwd(), "node_modules", "@ffmpeg-installer", platformPackage, executable),
    join(process.cwd(), "node_modules", "ffmpeg-static", executable),
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function ffmpegCommand() {
  const configured = process.env.FFMPEG_PATH?.trim();
  if (configured) return configured;
  if (process.env.VERCEL !== "1") {
    const bundled = bundledFfmpegPath();
    if (bundled) return bundled;
  }
  return "ffmpeg";
}

function deploymentOnlyMessage() {
  return "MP4 转换仅支持 Windows 本机启动模式，部署环境不能调用你的电脑 ffmpeg。";
}

function downloadRoot(downloadDirectory?: string) {
  if (downloadDirectory !== undefined) {
    const normalized = normalizeDownloadDirectory(downloadDirectory);
    if (!isValidDownloadDirectory(normalized)) {
      throw new Error("下载目录必须是绝对路径，且长度不能超过 512 个字符。");
    }
    return normalized;
  }
  const configured = normalizeDownloadDirectory(process.env.TX_DOWNLOAD_DIR ?? "");
  if (isValidDownloadDirectory(configured)) return configured;
  return process.platform === "win32"
    ? DEFAULT_MP4_DOWNLOAD_DIR
    : join(process.cwd(), "downloads", "spider");
}

export function getHlsConcurrency() {
  const parsed = Number(process.env.TX_HLS_CONCURRENCY);
  return Number.isSafeInteger(parsed) ? Math.max(1, Math.min(16, parsed)) : DEFAULT_HLS_CONCURRENCY;
}

export function resolveMp4Download(
  actor: string,
  index: number,
  downloadDirectory?: string,
  title?: string,
): Mp4DownloadLocation {
  if (!Number.isSafeInteger(index) || index < 1 || index > MAX_MP4_INDEX) {
    throw new Error("MP4 编号无效");
  }
  const folder = sanitizeFilename(actor, "未分类演员");
  const directory = join(downloadRoot(downloadDirectory), folder);
  // Older clients may omit title, but even then never fall back to a numeric filename.
  const filename = `${sanitizeVideoTitle(title ?? "")}.mp4`;
  return { directory, filename, path: join(directory, filename) };
}

function parseVersion(output: string) {
  return output.match(/ffmpeg version\s+([^\s]+)/i)?.[1] ?? output.trim().split(/\r?\n/, 1)[0];
}

export function getFfmpegStatus(): Promise<FfmpegStatus> {
  const command = ffmpegCommand();
  if (process.env.VERCEL === "1") {
    return Promise.resolve({ available: false, command, error: deploymentOnlyMessage() });
  }
  return new Promise((resolve) => {
    const child = spawn(command, ["-version"], { windowsHide: true });
    let output = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({ available: false, command, error: "ffmpeg 检测超时" });
    }, FFMPEG_CHECK_TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
      resolve({
        available: false,
        command,
        error: code === "ENOENT" ? "未找到 ffmpeg" : error.message,
      });
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({
          available: true,
          command,
          version: parseVersion(output),
          hlsConcurrency: getHlsConcurrency(),
        });
      } else {
        resolve({ available: false, command, error: output.trim() || `ffmpeg 退出码 ${code}` });
      }
    });
  });
}

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function validId(id: string | null): id is string {
  return !!id && /^\d{1,20}$/.test(id);
}

function parseIndex(value: string | null) {
  if (!value || !/^\d+$/.test(value)) return null;
  const index = Number(value);
  return Number.isSafeInteger(index) && index >= 1 && index <= MAX_MP4_INDEX ? index : null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function reportMp4Progress(
  callback: Mp4ProgressCallback | undefined,
  progress: DownloadProgressUpdate,
) {
  try {
    callback?.(progress);
  } catch {
    // Progress reporting must never interrupt the local conversion.
  }
}

function runFfmpeg(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let stderr = "";
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      if (error) reject(error);
      else resolve();
    };

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-4_000);
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code === 0) finish();
      else finish(new Error(stderr.trim() || `ffmpeg 退出码 ${code}`));
    });
  });
}

async function assertCompleteMp4(filePath: string) {
  const info = await stat(filePath);
  if (info.size < 16) throw new Error("ffmpeg 输出了空的 MP4 文件");

  const file = await open(filePath, "r");
  try {
    const scanLength = Math.min(info.size, 8 * 1024 * 1024);
    const buffer = Buffer.alloc(scanLength);
    const { bytesRead } = await file.read(buffer, 0, scanLength, 0);
    const header = buffer.subarray(0, bytesRead).toString("latin1");
    if (!header.includes("ftyp") || !header.includes("moov")) {
      throw new Error("ffmpeg 输出缺少可播放的 MP4 索引");
    }
  } finally {
    await file.close();
  }
  return info.size;
}

async function remuxMp4(
  id: string,
  location: Mp4DownloadLocation,
  command: string,
  onProgress?: Mp4ProgressCallback,
) {
  await mkdir(location.directory, { recursive: true });
  const startedAt = performance.now();
  const temporaryPath = join(
    location.directory,
    `.${location.filename}.${id}.${randomUUID()}.part`,
  );
  const workingDirectory = await mkdtemp(join(location.directory, `.hls-${id}-`));
  let mode: Mp4TransferMode = "direct";
  let segmentCount: number | undefined;
  let concurrency: number | undefined;
  let downloadMs: number | undefined;
  try {
    reportMp4Progress(onProgress, {
      phase: "preparing",
      percent: 2,
      message: "正在读取 HLS 播放列表…",
    });
    try {
      const prefetched = await prefetchHlsToTransportStream({
        playlistUrl: hlsUrl(id),
        workingDirectory,
        concurrency: getHlsConcurrency(),
        onProgress: (progress) =>
          reportMp4Progress(onProgress, mapHlsProgressToDownloadProgress(progress)),
      });
      reportMp4Progress(onProgress, {
        phase: "remuxing",
        percent: 91,
        message: "分片已合并，正在使用 ffmpeg 无损转封装…",
      });
      await runFfmpeg(command, buildLocalFfmpegArgs(prefetched.transportPath, temporaryPath));
      mode = "parallel";
      segmentCount = prefetched.segmentCount;
      concurrency = prefetched.concurrency;
      downloadMs = prefetched.downloadMs;
    } catch (prefetchError) {
      const detail = errorMessage(prefetchError);
      console.warn(`[mp4] parallel prefetch unavailable for ${id}; using direct mode: ${detail}`);
      await rm(temporaryPath, { force: true });
      reportMp4Progress(onProgress, {
        phase: "remuxing",
        percent: 50,
        message: "当前播放列表切换到 ffmpeg 兼容模式…",
      });
      await runFfmpeg(command, buildFfmpegArgs(id, temporaryPath));
    }
    reportMp4Progress(onProgress, {
      phase: "checking",
      percent: 97,
      message: "正在检查 MP4 完整性…",
    });
    const bytes = await assertCompleteMp4(temporaryPath);
    await rm(location.path, { force: true });
    await rename(temporaryPath, location.path);
    reportMp4Progress(onProgress, {
      phase: "checking",
      percent: 99,
      message: "MP4 已通过检查，正在保存…",
    });
    return {
      ...location,
      bytes,
      mode,
      segmentCount,
      concurrency,
      downloadMs,
      elapsedMs: Math.round(performance.now() - startedAt),
    };
  } finally {
    await rm(temporaryPath, { force: true });
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

function savedMessage(saved: Awaited<ReturnType<typeof remuxMp4>>) {
  const speedDetail =
    saved.mode === "parallel"
      ? `（${saved.concurrency} 路并发下载 ${saved.segmentCount} 个分片，用时 ${formatElapsed(saved.elapsedMs)}）`
      : `（ffmpeg 兼容模式，用时 ${formatElapsed(saved.elapsedMs)}）`;
  return `已保存到 ${saved.path}${speedDetail}`;
}

type Mp4ProgressStreamMessage =
  | ({ type: "progress" } & DownloadProgressUpdate)
  | { type: "result"; data: Record<string, unknown> }
  | { type: "error"; error: string };

function streamMp4Response(
  id: string,
  actor: string,
  location: Mp4DownloadLocation,
  command: string,
) {
  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (message: Mp4ProgressStreamMessage) => {
        if (cancelled) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
        } catch {
          cancelled = true;
        }
      };

      void (async () => {
        try {
          const saved = await remuxMp4(id, location, command, (progress) =>
            emit({ type: "progress", ...progress }),
          );
          emit({
            type: "result",
            data: {
              ok: true,
              actor,
              ...saved,
              message: savedMessage(saved),
            },
          });
        } catch (error) {
          const detail = errorMessage(error);
          console.error(`[mp4] conversion failed for ${id}: ${detail}`);
          emit({
            type: "error",
            error: `MP4 转换失败，未保存不完整文件。${detail}`,
          });
        } finally {
          if (!cancelled) {
            try {
              controller.close();
            } catch {
              // The browser may have cancelled the stream while the job finished.
            }
          }
        }
      })();
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}

function formatElapsed(milliseconds: number) {
  const seconds = Math.max(1, Math.round(milliseconds / 1_000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分钟`;
}

export async function handleMp4Request(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("status") === "1") {
    return json(await getFfmpegStatus());
  }

  const id = url.searchParams.get("id");
  if (!validId(id)) {
    return json({ error: "视频 ID 无效，只允许数字 ID" }, 400);
  }

  const actor = url.searchParams.get("actor")?.trim();
  const index = parseIndex(url.searchParams.get("index"));
  if (!actor || index === null) {
    return json({ error: "演员和正整数编号是必需的" }, 400);
  }

  const requestedDownloadDirectory = url.searchParams.get("downloadDir");
  const title = url.searchParams.get("title")?.trim();
  const progressRequested = url.searchParams.get("progress") === "1";
  let location: Mp4DownloadLocation;
  try {
    location = resolveMp4Download(
      actor,
      index,
      requestedDownloadDirectory ?? undefined,
      title,
    );
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }

  const status = await getFfmpegStatus();
  if (!status.available) {
    return json(
      {
        error:
          status.error === deploymentOnlyMessage()
            ? status.error
            : "当前电脑未找到可用的 ffmpeg。请安装 ffmpeg 并加入 PATH，或设置 FFMPEG_PATH。",
        detail: status.error,
      },
      503,
    );
  }

  if (progressRequested) return streamMp4Response(id, actor, location, status.command);

  try {
    const saved = await remuxMp4(id, location, status.command);
    return json({
      ok: true,
      actor,
      ...saved,
      message: savedMessage(saved),
    });
  } catch (error) {
    const detail = errorMessage(error);
    console.error(`[mp4] conversion failed for ${id}: ${detail}`);
    return json(
      {
        error: `MP4 转换失败，未保存不完整文件。${detail}`,
        detail,
      },
      502,
    );
  }
}
