import {
  parseActorPage,
  parseHome,
  parseNamedCloud,
  parseTagPage,
  parseVideoDetail,
} from "./parse.ts";
import {
  fetchRxrinaActorPage,
  fetchRxrinaTagPage,
  fetchRxrinaVideoDetail,
  loadRxrinaHomeBundle,
} from "./rxrina.server.ts";
import { CATALOG_ONLY_MEDIA_MESSAGE, resolveRequestedSiteOrigin, siteProfileForOrigin } from "./site-origin.ts";
import {
  SITE_ORIGIN,
  type TagPage,
  type ActorPage,
  type HomeData,
  type NamedCount,
  type VideoDetail,
} from "./types.ts";
import { desktopWorkerEnabled, runPython } from "./worker.server.ts";

function requestedOrigin(origin?: string) {
  return resolveRequestedSiteOrigin(origin, process.env.TX_SITE_ORIGIN);
}

function usesRxrina(origin: string) {
  return siteProfileForOrigin(origin)?.kind === "rxrina";
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchText(url: string, accept = "text/html") {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: accept,
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.6",
      Referer: `${SITE_ORIGIN}/`,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(18000),
  });
  if (!res.ok) {
    throw new Error(`请求失败 ${res.status} ${url}`);
  }
  return res.text();
}

export async function fetchHome(origin?: string) {
  const resolved = requestedOrigin(origin);
  if (usesRxrina(resolved)) return (await loadRxrinaHomeBundle(resolved)).home;
  const html = await fetchText(`${SITE_ORIGIN}/`);
  return desktopWorkerEnabled() ? runPython<HomeData>("home", { html }) : parseHome(html);
}

export async function fetchActors(origin?: string) {
  const resolved = requestedOrigin(origin);
  if (usesRxrina(resolved)) return (await loadRxrinaHomeBundle(resolved)).actors;
  const html = await fetchText(`${SITE_ORIGIN}/a/`);
  return desktopWorkerEnabled()
    ? runPython<NamedCount[]>("cloud", { html, kind: "a" })
    : parseNamedCloud(html, "a");
}

export async function fetchTags(origin?: string) {
  const resolved = requestedOrigin(origin);
  if (usesRxrina(resolved)) return (await loadRxrinaHomeBundle(resolved)).tags;
  const html = await fetchText(`${SITE_ORIGIN}/tag/`);
  return desktopWorkerEnabled()
    ? runPython<NamedCount[]>("cloud", { html, kind: "tag" })
    : parseNamedCloud(html, "tag");
}

export async function fetchActorPage(slug: string, page: number, origin?: string) {
  const resolved = requestedOrigin(origin);
  if (usesRxrina(resolved)) return fetchRxrinaActorPage(resolved, slug, page);
  const encoded = encodeURIComponent(slug);
  const path = page <= 1 ? `/a/${encoded}/` : `/a/${encoded}/${page}/`;
  const html = await fetchText(`${SITE_ORIGIN}${path}`);
  return desktopWorkerEnabled()
    ? runPython<ActorPage>("page", { html, slug, page, kind: "a" })
    : parseActorPage(html, slug, page);
}

export async function fetchTagPage(slug: string, page: number, origin?: string): Promise<TagPage> {
  const resolved = requestedOrigin(origin);
  if (usesRxrina(resolved)) return fetchRxrinaTagPage(resolved, slug, page);
  const encoded = encodeURIComponent(slug);
  const path = page <= 1 ? `/tag/${encoded}/` : `/tag/${encoded}/${page}/`;
  const html = await fetchText(`${SITE_ORIGIN}${path}`);
  return desktopWorkerEnabled()
    ? runPython<TagPage>("page", { html, slug, page, kind: "tag" })
    : parseTagPage(html, slug, page);
}

export async function fetchVideoDetail(id: string, origin?: string) {
  const resolved = requestedOrigin(origin);
  if (usesRxrina(resolved)) return fetchRxrinaVideoDetail(resolved, id);
  const html = await fetchText(`${SITE_ORIGIN}/v/${id}/`);
  return desktopWorkerEnabled()
    ? runPython<VideoDetail>("detail", { html, id })
    : parseVideoDetail(html, id);
}

export async function fetchPlaylist(id: string, origin?: string) {
  if (usesRxrina(requestedOrigin(origin))) throw new Error(CATALOG_ONLY_MEDIA_MESSAGE);
  const url = `https://t.5gcdn.xyz/videos/${id}/index.m3u8`;
  return fetchText(url, "application/vnd.apple.mpegurl,application/x-mpegURL,*/*");
}
