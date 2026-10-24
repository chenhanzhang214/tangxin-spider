import { createReadStream, lstatSync, readdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { extname, join } from "node:path";
import { Readable } from "node:stream";
import {
  getServerDownloadDirectory,
  setServerDownloadDirectory,
  getLocalIpv4Addresses,
} from "./download-settings.server.ts";
import type { ActorFolder, FileEntry } from "./types.ts";

export type { ActorFolder, FileEntry };

const responseHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: responseHeaders });
}

function validName(name: string) {
  return (
    name !== "." &&
    name !== ".." &&
    !/[\\/:]/.test(name) &&
    ![...name].some((character) => character.charCodeAt(0) < 32)
  );
}

function entryInfo(path: string, kind: "file" | "directory") {
  try {
    const info = lstatSync(path);
    if (info.isSymbolicLink()) return null;
    return (kind === "file" ? info.isFile() : info.isDirectory()) ? info : null;
  } catch {
    return null;
  }
}

function listMp4Files(directory: string): FileEntry[] {
  try {
    return readdirSync(directory)
      .flatMap((name) => {
        if (!validName(name) || extname(name).toLowerCase() !== ".mp4") return [];
        const info = entryInfo(join(directory, name), "file");
        return info
          ? [
              {
                name,
                size: info.size,
                sizeMB: Math.round((info.size / 1024 / 1024) * 10) / 10,
                mtime: info.mtimeMs,
              },
            ]
          : [];
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch {
    return [];
  }
}

export async function handleFilesRequest(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    return json({ error: "不允许跨站访问媒体库" }, 403);
  }
  const root = getServerDownloadDirectory();
  if (request.method === "POST") {
    try {
      const body = (await request.json()) as { downloadDir?: string };
      if (typeof body?.downloadDir !== "string")
        return json({ error: "缺少 downloadDir 参数" }, 400);
      return setServerDownloadDirectory(body.downloadDir)
        ? json({ ok: true, root: getServerDownloadDirectory() })
        : json({ error: "无效的目录路径，必须是绝对路径" }, 400);
    } catch {
      return json({ error: "请求格式错误" }, 400);
    }
  }
  if (request.method !== "GET" && request.method !== "DELETE")
    return json({ error: "不支持的请求方式" }, 405);
  if (request.method === "GET" && url.searchParams.get("dir") === "1") {
    return json({
      root,
      localIps: getLocalIpv4Addresses(),
      port: Number(process.env.PORT || process.env.NITRO_PORT || 8080),
    });
  }
  if (request.method === "GET" && url.searchParams.get("list") === "1") {
    let names: string[];
    try {
      names = readdirSync(root);
    } catch {
      return json([]);
    }
    const actors: ActorFolder[] = names
      .filter((name) => validName(name) && entryInfo(join(root, name), "directory"))
      .map((actor) => {
        const files = listMp4Files(join(root, actor));
        return {
          actor,
          count: files.length,
          totalSizeMB: Math.round(files.reduce((sum, file) => sum + file.sizeMB, 0) * 10) / 10,
          files,
        };
      })
      .filter((actor) => actor.count > 0)
      .sort((a, b) => b.count - a.count);
    return json(actors);
  }
  const actor = url.searchParams.get("actor")?.trim();
  if (!actor) return json({ error: "请指定 actor 参数或 list=1" }, 400);
  if (!validName(actor)) return json({ error: "演员文件夹不存在" }, 404);
  const actorDir = join(root, actor);
  if (!entryInfo(actorDir, "directory")) return json({ error: "演员文件夹不存在" }, 404);
  const file = url.searchParams.get("file")?.trim();
  if (!file)
    return request.method === "GET"
      ? json(listMp4Files(actorDir))
      : json({ error: "缺少 file 参数" }, 400);
  if (!validName(file)) return json({ error: "文件不存在" }, 404);
  if (extname(file).toLowerCase() !== ".mp4") return json({ error: "只支持 MP4 文件" }, 400);
  const filePath = join(actorDir, file);
  const info = entryInfo(filePath, "file");
  if (!info) return json({ error: "文件不存在" }, 404);
  if (request.method === "DELETE") {
    try {
      await rm(filePath);
      return json({ ok: true });
    } catch {
      return json({ error: "删除失败，请检查文件占用和权限" }, 500);
    }
  }
  const headers = new Headers({
    ...responseHeaders,
    "Accept-Ranges": "bytes",
    "Content-Type": "video/mp4",
    "Content-Disposition": `inline; filename="${encodeURIComponent(file)}"`,
  });
  const range = request.headers.get("range");
  let start = 0,
    end = info.size - 1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    const invalid = () =>
      new Response(null, {
        status: 416,
        headers: { ...responseHeaders, "Content-Range": `bytes */${info.size}` },
      });
    if (!match || (!match[1] && !match[2]) || info.size === 0) return invalid();
    if (!match[1]) {
      const suffix = Number(match[2]);
      if (!Number.isSafeInteger(suffix) || suffix <= 0) return invalid();
      start = Math.max(0, info.size - suffix);
    } else {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : end;
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= info.size
      )
        return invalid();
      end = Math.min(end, info.size - 1);
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${info.size}`);
  }
  headers.set("Content-Length", String(end - start + 1));
  if (info.size === 0) return new Response(null, { headers });
  const stream = createReadStream(filePath, { start, end });
  const abort = () => stream.destroy();
  request.signal.addEventListener("abort", abort, { once: true });
  stream.once("close", () => request.signal.removeEventListener("abort", abort));
  if (request.signal.aborted) stream.destroy();
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    status: range ? 206 : 200,
    headers,
  });
}
