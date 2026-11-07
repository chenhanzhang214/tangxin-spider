import { CDN_ORIGIN, SITE_ORIGIN } from "./types.ts";

/** Public catalog host. It is a different site from tangxinvlog.app. */
export const RXRINA_SITE_ORIGIN = "https://1792682274428z1281480769st1.3drxrina.com";
export const SITE_ORIGIN_STORAGE_KEY = "tangxin.site-origin";

export const CATALOG_ONLY_MEDIA_MESSAGE =
  "这个内容源只提供公开目录。播放地址由站点 videoAuth 控制，程序不会请求播放接口，也不会保存媒体文件。";

export type SiteKind = "tangxin" | "rxrina";

export type SiteProfile = {
  kind: SiteKind;
  origin: string;
  label: string;
  description: string;
  groupNoun: "演员" | "栏目";
  media: "hls" | "catalog-only";
};

export const SITE_PROFILES: readonly SiteProfile[] = [
  {
    kind: "tangxin",
    origin: SITE_ORIGIN,
    label: "糖心 Vlog",
    description: "默认内容源。读取公开 HTML，并可预览和保存 HLS。",
    groupNoun: "演员",
    media: "hls",
  },
  {
    kind: "rxrina",
    origin: RXRINA_SITE_ORIGIN,
    label: "3drxrina 目录站",
    description: "公开目录接口。按栏目、标签和搜索整理作品信息，不下载媒体。",
    groupNoun: "栏目",
    media: "catalog-only",
  },
];

export function normalizeSiteOrigin(value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  return url.origin;
}

export function siteProfileForOrigin(value: string | null | undefined) {
  const origin = normalizeSiteOrigin(value);
  if (!origin) return null;
  return SITE_PROFILES.find((profile) => profile.origin === origin) ?? null;
}

export function resolveRequestedSiteOrigin(explicit?: string | null, envValue?: string | null) {
  const requested = explicit?.trim() ? explicit : envValue;
  if (!requested?.trim()) return SITE_ORIGIN;
  const profile = siteProfileForOrigin(requested);
  if (!profile) {
    throw new Error(
      explicit?.trim()
        ? "内容源不在支持列表中"
        : "TX_SITE_ORIGIN 不在支持列表中",
    );
  }
  return profile.origin;
}

export function siteAllowsLocalMedia(origin: string | null | undefined) {
  return siteProfileForOrigin(origin)?.media === "hls";
}

export function videoSupportsLocalMedia(video: { hls?: string | null }) {
  if (!video.hls) return false;
  try {
    const url = new URL(video.hls);
    return url.origin === CDN_ORIGIN && url.pathname.startsWith("/videos/");
  } catch {
    return false;
  }
}

export function loadStoredSiteOrigin() {
  if (typeof window === "undefined") return null;
  try {
    return siteProfileForOrigin(window.localStorage.getItem(SITE_ORIGIN_STORAGE_KEY))?.origin ?? null;
  } catch {
    return null;
  }
}

export function persistSiteOrigin(value: string) {
  const profile = siteProfileForOrigin(value);
  if (!profile || typeof window === "undefined") return false;
  try {
    window.localStorage.setItem(SITE_ORIGIN_STORAGE_KEY, profile.origin);
    return true;
  } catch {
    return false;
  }
}
