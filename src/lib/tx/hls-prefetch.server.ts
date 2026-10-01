import { open, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FFMPEG_USER_AGENT } from "./mp4-utils.ts";
import {
  decryptHlsSegment,
  parseHlsMediaPlaylist,
  selectHlsMediaUrl,
  type HlsMediaPlan,
} from "./hls-prefetch.ts";
import { SITE_ORIGIN } from "./types.ts";

const DEFAULT_CONCURRENCY = 8;
const DEFAULT_RETRIES = 3;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RESOURCE_BYTES = 64 * 1024 * 1024;
const MAX_MASTER_DEPTH = 3;

type PrefetchOptions = {
  playlistUrl: string;
  workingDirectory: string;
  concurrency?: number;
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
  onProgress?: (progress: HlsPrefetchProgress) => void;
};

export type HlsPrefetchProgress = {
  phase: "playlist" | "segments" | "merging";
  completedSegments: number;
  totalSegments: number;
};

export type HlsPrefetchResult = {
  transportPath: string;
  segmentCount: number;
  concurrency: number;
  bytes: number;
  downloadMs: number;
};

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  return Number.isSafeInteger(value) ? Math.max(min, Math.min(max, value as number)) : fallback;
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function reportProgress(callback: PrefetchOptions["onProgress"], progress: HlsPrefetchProgress) {
  try {
    callback?.(progress);
  } catch {
    // Progress reporting must never fail an otherwise valid media download.
  }
}

function responseSize(response: Response) {
  const raw = response.headers.get("content-length");
  if (!raw) return null;
  const size = Number(raw);
  return Number.isSafeInteger(size) && size >= 0 ? size : null;
}

async function fetchBuffer(
  url: string,
  options: {
    fetchImpl: typeof fetch;
    headers: Record<string, string>;
    allowedHostname: string;
    retries: number;
    retryDelayMs: number;
    timeoutMs: number;
  },
) {
  const parsedUrl = new URL(url);
  if (parsedUrl.hostname !== options.allowedHostname) {
    throw new Error(`HLS 资源主机不在允许范围：${parsedUrl.hostname}`);
  }
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.retries; attempt += 1) {
    try {
      const response = await options.fetchImpl(url, {
        headers: options.headers,
        redirect: "follow",
        signal: AbortSignal.timeout(options.timeoutMs),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (response.url && new URL(response.url).hostname !== options.allowedHostname) {
        throw new Error("HLS 请求重定向到了不受信任的主机");
      }
      const declaredSize = responseSize(response);
      if (declaredSize !== null && declaredSize > MAX_RESOURCE_BYTES) {
        throw new Error(`单个 HLS 资源超过 ${MAX_RESOURCE_BYTES} 字节安全上限`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length === 0) throw new Error("HLS 资源为空");
      if (buffer.length > MAX_RESOURCE_BYTES) {
        throw new Error(`单个 HLS 资源超过 ${MAX_RESOURCE_BYTES} 字节安全上限`);
      }
      return buffer;
    } catch (error) {
      lastError = error;
      if (attempt < options.retries) await wait(options.retryDelayMs * attempt);
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`HLS 资源下载失败：${url}（${detail}）`);
}

async function loadMediaPlan(
  playlistUrl: string,
  request: Parameters<typeof fetchBuffer>[1],
): Promise<HlsMediaPlan> {
  let currentUrl = playlistUrl;
  for (let depth = 0; depth < MAX_MASTER_DEPTH; depth += 1) {
    const playlist = (await fetchBuffer(currentUrl, request)).toString("utf8");
    const mediaUrl = selectHlsMediaUrl(currentUrl, playlist);
    if (!mediaUrl) return parseHlsMediaPlaylist(currentUrl, playlist);
    currentUrl = mediaUrl;
  }
  throw new Error("HLS 主播放列表嵌套过深");
}

export async function prefetchHlsToTransportStream(
  options: PrefetchOptions,
): Promise<HlsPrefetchResult> {
  const concurrency = clampInteger(options.concurrency, DEFAULT_CONCURRENCY, 1, 16);
  const retries = clampInteger(options.retries, DEFAULT_RETRIES, 1, 5);
  const retryDelayMs = clampInteger(options.retryDelayMs, 250, 0, 5_000);
  const timeoutMs = clampInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, 1_000, 120_000);
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = options.headers ?? {
    Accept: "application/vnd.apple.mpegurl,application/x-mpegURL,*/*",
    Referer: `${SITE_ORIGIN}/`,
    "User-Agent": FFMPEG_USER_AGENT,
  };
  const allowedHostname = new URL(options.playlistUrl).hostname;
  const request = { fetchImpl, headers, allowedHostname, retries, retryDelayMs, timeoutMs };
  const startedAt = performance.now();
  const plan = await loadMediaPlan(options.playlistUrl, request);
  const totalSegments = plan.segments.length;
  reportProgress(options.onProgress, {
    phase: "playlist",
    completedSegments: 0,
    totalSegments,
  });
  const segmentPaths = plan.segments.map((_, index) =>
    join(options.workingDirectory, `segment-${String(index).padStart(6, "0")}.ts`),
  );
  const keyCache = new Map<string, Promise<Buffer>>();

  const getKey = (url: string) => {
    let pending = keyCache.get(url);
    if (!pending) {
      pending = fetchBuffer(url, request).then((key) => {
        if (key.length !== 16) throw new Error(`HLS AES-128 密钥长度无效：${key.length}`);
        return key;
      });
      keyCache.set(url, pending);
    }
    return pending;
  };

  let nextSegment = 0;
  let completedSegments = 0;
  const workers = Array.from({ length: Math.min(concurrency, plan.segments.length) }, async () => {
    while (true) {
      const index = nextSegment;
      nextSegment += 1;
      const segment = plan.segments[index];
      const segmentPath = segmentPaths[index];
      if (!segment || !segmentPath) return;

      const downloaded = await fetchBuffer(segment.url, request);
      const content = segment.key
        ? decryptHlsSegment(downloaded, await getKey(segment.key.url), segment.key.ivHex)
        : downloaded;
      if (content.length === 0) throw new Error(`HLS 分片 ${index + 1} 解密后为空`);
      await writeFile(segmentPath, content);
      completedSegments += 1;
      reportProgress(options.onProgress, {
        phase: "segments",
        completedSegments,
        totalSegments,
      });
    }
  });
  await Promise.all(workers);

  const transportPath = join(options.workingDirectory, "input.ts");
  reportProgress(options.onProgress, {
    phase: "merging",
    completedSegments: totalSegments,
    totalSegments,
  });
  const transport = await open(transportPath, "w");
  let bytes = 0;
  try {
    for (const segmentPath of segmentPaths) {
      const segment = await readFile(segmentPath);
      await transport.writeFile(segment);
      bytes += segment.length;
      await rm(segmentPath, { force: true });
    }
  } finally {
    await transport.close();
  }

  return {
    transportPath,
    segmentCount: plan.segments.length,
    concurrency,
    bytes,
    downloadMs: Math.round(performance.now() - startedAt),
  };
}
