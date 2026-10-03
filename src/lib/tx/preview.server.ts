import { FFMPEG_USER_AGENT } from "./mp4-utils.ts";
import { videoPreviewUrl } from "./preview.ts";
import { CDN_ORIGIN, SITE_ORIGIN, hlsUrl } from "./types.ts";

const MAX_PLAYLIST_BYTES = 2 * 1024 * 1024;
const MAX_RESOURCE_BYTES = 64 * 1024 * 1024;
const RESPONSE_HEADERS = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

// Only media belonging to this work may pass through the local preview service.
function resourceUrl(id: string, path: string, base = hlsUrl(id)) {
  if (!/^\d{1,20}$/.test(id) || path.length > 4096) throw new Error("无效的预览地址");
  const url = new URL(path, base);
  if (
    url.origin !== CDN_ORIGIN ||
    url.username ||
    url.password ||
    url.hash ||
    !url.pathname.startsWith(`/videos/${id}/`) ||
    !/^[\w/.-]+\.(?:m3u8|ts|m4s|mp4|aac|key|jpg)$/i.test(url.pathname)
  )
    throw new Error("预览资源不在允许范围内");
  return url;
}

export function rewritePreviewPlaylist(id: string, playlist: string, base = hlsUrl(id)) {
  if (!playlist.trimStart().startsWith("#EXTM3U")) throw new Error("无效的播放列表");
  const localUrl = (path: string) => {
    const url = resourceUrl(id, path, base);
    return videoPreviewUrl(id, url.pathname.slice(`/videos/${id}/`.length) + url.search);
  };
  return playlist
    .split(/\r?\n/)
    .map((line) => {
      const value = line.trim();
      if (!value) return "";
      return value.startsWith("#")
        ? value.replace(/URI="([^"]+)"/g, (_match, uri: string) => `URI="${localUrl(uri)}"`)
        : localUrl(value);
    })
    .join("\n");
}

async function readPlaylist(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("播放列表为空");
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > MAX_PLAYLIST_BYTES) throw new Error("播放列表过大");
      text += decoder.decode(result.value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function handlePreviewRequest(request: Request, fetchImpl: typeof fetch = fetch) {
  const fail = (error: string, status: number) =>
    Response.json({ error }, { status, headers: RESPONSE_HEADERS });
  const incoming = new URL(request.url);
  const origin = request.headers.get("origin");
  if (
    (origin && origin !== incoming.origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    return fail("不允许跨站请求预览资源", 403);
  }
  const id = incoming.searchParams.get("id") ?? "";
  let target: URL;
  try {
    target = resourceUrl(id, incoming.searchParams.get("path") ?? "index.m3u8");
  } catch {
    return fail("无效的预览资源", 400);
  }
  const range = request.headers.get("range");
  if (range && !/^bytes=(?:\d+-\d*|-\d+)$/.test(range)) return fail("无效的播放范围", 416);
  const headers = new Headers({ Referer: `${SITE_ORIGIN}/`, "User-Agent": FFMPEG_USER_AGENT });
  if (range) headers.set("Range", range);
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]);

  try {
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      const response = await fetchImpl(target, { headers, signal, redirect: "manual" });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) return fail("预览地址重定向失败", 502);
        target = resourceUrl(id, location, target.href);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        return fail(`视频源暂时不可用（${response.status}）`, response.status === 404 ? 404 : 502);
      }
      if (Number(response.headers.get("content-length")) > MAX_RESOURCE_BYTES) {
        await response.body?.cancel();
        return fail("预览资源过大", 502);
      }
      if (/\.m3u8$/i.test(target.pathname)) {
        return new Response(rewritePreviewPlaylist(id, await readPlaylist(response), target.href), {
          headers: { ...RESPONSE_HEADERS, "Content-Type": "application/vnd.apple.mpegurl" },
        });
      }
      const outgoing = new Headers(RESPONSE_HEADERS);
      outgoing.set(
        "Content-Type",
        target.pathname.endsWith(".jpg") ? "image/jpeg" : "application/octet-stream",
      );
      for (const header of ["content-range", "accept-ranges"]) {
        const value = response.headers.get(header);
        if (value) outgoing.set(header, value);
      }
      // Stream only the requested resource; never assemble or save a whole video here.
      return new Response(response.body, { status: response.status, headers: outgoing });
    }
    return fail("预览地址重定向过多", 502);
  } catch {
    return fail(
      signal.aborted ? "预览请求已取消或超时" : "无法读取视频源，请稍后重试",
      signal.aborted ? 504 : 502,
    );
  }
}
