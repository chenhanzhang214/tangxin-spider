import { coverUrl, hlsUrl, SITE_ORIGIN, type SearchVideosResult, type VideoCard } from "./types.ts";

const PAGEFIND_BASE = `${SITE_ORIGIN}/pagefind/`;
const PAGEFIND_SCRIPT = `${PAGEFIND_BASE}pagefind.js`;
const MAX_RESULTS = 100;

type PagefindData = {
  url?: unknown;
  meta?: Record<string, unknown>;
};

type PagefindSearchResponse = {
  unfilteredResultCount?: number;
  results?: Array<{ data: () => Promise<PagefindData> }>;
};

type PagefindInstance = {
  init: () => Promise<unknown>;
  search: (query: string) => Promise<PagefindSearchResponse>;
};

type PagefindModule = {
  createInstance: (options?: { basePath?: string; noWorker?: boolean }) => PagefindInstance;
};

let pagefindPromise: Promise<PagefindInstance> | null = null;

async function loadPagefind() {
  if (!pagefindPromise) {
    pagefindPromise = (async () => {
      const response = await fetch(PAGEFIND_SCRIPT, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
          Accept: "text/javascript,*/*",
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        throw new Error(`搜索索引加载失败（${response.status}）`);
      }
      const source = await response.text();
      const moduleUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`;
      const runtime = (await import(/* @vite-ignore */ moduleUrl)) as unknown as PagefindModule;
      const instance = runtime.createInstance({ basePath: PAGEFIND_BASE, noWorker: true });
      await instance.init();
      return instance;
    })().catch((error) => {
      pagefindPromise = null;
      throw error;
    });
  }
  return pagefindPromise;
}

export function pagefindDataToVideoCard(data: unknown): VideoCard | null {
  if (!data || typeof data !== "object") return null;
  const candidate = data as PagefindData;
  if (typeof candidate.url !== "string") return null;
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(candidate.url, SITE_ORIGIN);
  } catch {
    return null;
  }
  if (parsedUrl.origin !== SITE_ORIGIN) return null;
  const id = parsedUrl.pathname.match(/^\/v\/(\d+)\/?$/)?.[1];
  if (!id) return null;

  const meta = candidate.meta ?? {};
  const stringMeta = (key: string) => (typeof meta[key] === "string" ? meta[key].trim() : "");
  const nickname = stringMeta("nickname").replace(/^@/, "").trim();
  return {
    id,
    title: stringMeta("title") || `视频 ${id}`,
    duration: stringMeta("duration"),
    cover: stringMeta("image") || coverUrl(id),
    actor: nickname || "未分类演员",
    actorSlug: "",
    pageUrl: `${SITE_ORIGIN}/v/${id}/`,
    hls: hlsUrl(id),
  };
}

export async function searchSiteVideos(query: string, limit = 60): Promise<SearchVideosResult> {
  const normalized = query.trim();
  if (!normalized) return { query: "", total: 0, videos: [] };
  const safeLimit = Math.max(1, Math.min(MAX_RESULTS, Math.floor(limit)));
  const result = await (await loadPagefind()).search(normalized);
  const videos: VideoCard[] = [];
  const seen = new Set<string>();
  for (const item of result.results ?? []) {
    const video = pagefindDataToVideoCard(await item.data());
    if (!video || seen.has(video.id)) continue;
    seen.add(video.id);
    videos.push(video);
    if (videos.length >= safeLimit) break;
  }
  return {
    query: normalized,
    total: result.unfilteredResultCount ?? videos.length,
    videos,
  };
}
