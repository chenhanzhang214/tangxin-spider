import { PAGE_SIZE, type ActorPage, type HomeData, type NamedCount, type VideoCard, type VideoDetail } from "./types.ts";

export type RxrinaPublicConfig = {
  title: string;
  version: string;
  resimgcdn: string;
  bufnamecdn: string;
  bufdomaincdn: string;
  resimgdomaincdn: string;
};

export const EMPTY_RXRINA_CONFIG: RxrinaPublicConfig = {
  title: "3drxrina 目录站",
  version: "1",
  resimgcdn: "",
  bufnamecdn: "",
  bufdomaincdn: "",
  resimgdomaincdn: "",
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

export function numericId(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return String(value);
  if (typeof value === "string" && /^\d{1,20}$/.test(value)) return value;
  return null;
}

export function formatRxrinaDuration(value: unknown) {
  if (typeof value === "string" && value.includes(":")) return value.trim();
  const raw =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(raw) || raw < 0) return "";
  const seconds = Math.round(raw >= 1_000 ? raw / 1000 : raw);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const clock = `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${clock}` : `${minutes}:${String(secs).padStart(2, "0")}`;
}

function extractJsonObject(source: string, markerAt: number) {
  const start = source.indexOf("{", markerAt);
  if (start < 0) throw new Error("内容源配置缺少站点参数");
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error("内容源配置缺少站点参数");
}

export function parseSiteConfigScript(source: string): RxrinaPublicConfig {
  const marker = source.indexOf("window.__SITE_CONFIG__");
  if (marker < 0) throw new Error("内容源配置缺少站点参数");
  const parsed = record(JSON.parse(extractJsonObject(source, marker)));
  if (!parsed) throw new Error("内容源配置无法识别");
  return {
    title: text(parsed.title) || EMPTY_RXRINA_CONFIG.title,
    version: text(parsed.version) || "1",
    resimgcdn: text(parsed.resimgcdn),
    bufnamecdn: text(parsed.bufnamecdn),
    bufdomaincdn: text(parsed.bufdomaincdn),
    resimgdomaincdn: text(parsed.resimgdomaincdn),
  };
}

export function resolveRxrinaCover(poster: string, config: RxrinaPublicConfig) {
  let value = poster.trim();
  if (!value) return "";
  if (config.bufnamecdn && config.resimgcdn) value = value.split(config.bufnamecdn).join(config.resimgcdn);
  if (config.bufdomaincdn && config.resimgdomaincdn) {
    value = value.split(config.bufdomaincdn).join(config.resimgdomaincdn);
  }
  if (value.startsWith("//")) return `https:${value}`;
  return value;
}

function pageUrl(origin: string, columnValue: string, id: string) {
  const url = new URL(
    `/column/${encodeURIComponent(columnValue)}/video/${encodeURIComponent(id)}`,
    origin,
  );
  if (url.origin !== origin) throw new Error("内容源地址无效");
  return url.href;
}

export function mapRxrinaRow(
  value: unknown,
  origin: string,
  columnName: string,
  config: RxrinaPublicConfig,
): VideoCard | null {
  const row = record(value);
  if (!row) return null;
  const videos = Array.isArray(row.movieVideos) ? row.movieVideos : [];
  const first = record(videos[0]);
  const id = numericId(first?.id) ?? numericId(row.id);
  const columnValue = text(row.columnValue);
  if (!id || !columnValue) return null;
  const title = text(row.title) || `视频 ${id}`;
  return {
    id,
    title,
    duration: formatRxrinaDuration(row.duration),
    cover: resolveRxrinaCover(text(row.poster), config),
    actor: columnName || columnValue,
    actorSlug: columnValue,
    pageUrl: pageUrl(origin, columnValue, id),
    hls: "",
  };
}

function namedLink(name: string, href: string): NamedCount {
  return { slug: name, name, count: 0, href };
}

export function mapRxrinaHome(payload: unknown, origin: string, config: RxrinaPublicConfig): {
  home: HomeData;
  actors: NamedCount[];
  tags: NamedCount[];
} {
  const root = record(payload);
  const data = record(root?.data) ?? root;
  const queryData = Array.isArray(data?.queryData) ? data.queryData : [];
  const actors: NamedCount[] = [];
  const tags: NamedCount[] = [];
  const seenTags = new Set<string>();
  const sections = queryData.flatMap((entry) => {
    const section = record(entry);
    if (!section) return [];
    const name = text(section.name);
    const value = text(section.value);
    if (!name || !value) return [];
    actors.push({
      slug: value,
      name,
      count: 0,
      href: `/column/${encodeURIComponent(value)}`,
    });
    for (const genre of Array.isArray(section.genres) ? section.genres : []) {
      const genreName = text(record(genre)?.name);
      if (!genreName || seenTags.has(genreName)) continue;
      seenTags.add(genreName);
      tags.push(namedLink(genreName, `/search?keyword=${encodeURIComponent(genreName)}`));
    }
    const videos = (Array.isArray(section.rows) ? section.rows : [])
      .map((row) => mapRxrinaRow(row, origin, name, config))
      .filter((video): video is VideoCard => Boolean(video));
    return [
      {
        title: name,
        moreHref: `/column/${encodeURIComponent(value)}`,
        videos,
      },
    ];
  });
  return {
    home: { title: config.title || EMPTY_RXRINA_CONFIG.title, sections },
    actors,
    tags,
  };
}

function totalOf(payload: Record<string, unknown>) {
  const total = payload.total;
  return typeof total === "number" && Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
}

export function mapRxrinaList(
  payload: unknown,
  origin: string,
  slug: string,
  page: number,
  config: RxrinaPublicConfig,
  name = "",
): ActorPage {
  const root = record(payload) ?? {};
  const rows = Array.isArray(root.rows) ? root.rows : [];
  const seen = new Set<string>();
  const videos: VideoCard[] = [];
  for (const row of rows) {
    const video = mapRxrinaRow(row, origin, name, config);
    if (!video || seen.has(video.id)) continue;
    seen.add(video.id);
    videos.push(video);
  }
  const total = totalOf(root);
  return {
    name,
    slug,
    total,
    page,
    hasNext: videos.length > 0 && page * PAGE_SIZE < total,
    videos,
  };
}

export function mapRxrinaSearch(
  payload: unknown,
  origin: string,
  query: string,
  limit: number,
  config: RxrinaPublicConfig,
) {
  const page = mapRxrinaList(payload, origin, "", 1, config);
  return {
    query,
    total: page.total,
    videos: page.videos.slice(0, limit),
  };
}

export function mapRxrinaDetail(
  payload: unknown,
  origin: string,
  id: string,
  config: RxrinaPublicConfig,
): VideoDetail {
  const root = record(payload) ?? {};
  const data = record(root.data) ?? root;
  const movie = record(data.movie) ?? data;
  const video = mapRxrinaRow(movie, origin, "", config);
  if (!video) throw new Error("内容源没有返回这条目录");
  const tags = text(movie.tags)
    .split(/[,，]/)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => namedLink(name, `/search?keyword=${encodeURIComponent(name)}`));
  return {
    ...video,
    id,
    pageUrl: pageUrl(origin, video.actorSlug, id),
    hls: "",
    tags,
    description: text(movie.summary),
    uploadDate: text(movie.createTime),
  };
}
