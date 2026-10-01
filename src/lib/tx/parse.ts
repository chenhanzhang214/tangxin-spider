import {
  coverUrl,
  hlsUrl,
  SITE_ORIGIN,
  type ActorPage,
  type HomeData,
  type HomeSection,
  type NamedCount,
  type VideoCard,
  type VideoDetail,
} from "./types.ts";

function stripTags(html: string) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHrefSlug(raw: string) {
  try {
    return decodeURIComponent(raw.replace(/\/+$/, ""));
  } catch {
    return raw;
  }
}

function absUrl(href: string) {
  if (href.startsWith("http")) return href;
  if (!href.startsWith("/")) return `${SITE_ORIGIN}/${href}`;
  return `${SITE_ORIGIN}${href}`;
}

export function parseNamedCloud(html: string, kind: "a" | "tag"): NamedCount[] {
  const out: NamedCount[] = [];
  const seen = new Set<string>();
  const re = new RegExp(`href="/(${kind})/([^"]+)/"(?:[^>]*)>([\\s\\S]*?)</a>`, "g");
  for (const match of html.matchAll(re)) {
    const slugRaw = match[2] ?? "";
    if (!slugRaw || /^\d+$/.test(slugRaw)) continue;
    const inner = match[3] ?? "";
    const nameMatch = inner.match(/class="name"[^>]*>\s*([^<]+?)\s*</);
    const numMatch = inner.match(/class="num"[^>]*>\s*(\d+)\s*</);
    const fallback = stripTags(inner);
    const name = (nameMatch?.[1] ?? fallback.replace(/\d+\s*$/, "")).trim();
    const count = Number(numMatch?.[1] ?? fallback.match(/(\d+)\s*$/)?.[1] ?? 0);
    const slug = decodeHrefSlug(slugRaw);
    if (!name || seen.has(slug)) continue;
    seen.add(slug);
    out.push({
      slug,
      name,
      count,
      href: `/${kind}/${encodeURIComponent(slug)}/`,
    });
  }
  return out;
}

export function parseVideoCard(articleHtml: string): VideoCard | null {
  const id = articleHtml.match(/href="\/v\/(\d+)\//)?.[1];
  if (!id) return null;
  const title =
    stripTags(
      articleHtml.match(/<h3 class="title"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/)?.[1] ??
        articleHtml.match(/aria-label="([^"]+)"/)?.[1] ??
        "",
    ) || `视频 ${id}`;
  const duration = articleHtml.match(/class="duration"[^>]*>([^<]+)/)?.[1]?.trim() ?? "";
  const actorHref = articleHtml.match(/href="(\/a\/[^"]+\/)"/)?.[1] ?? "";
  const actor = stripTags(articleHtml.match(/class="nickname"[^>]*>([\s\S]*?)<\/a>/)?.[1] ?? "")
    .replace(/^@/, "")
    .trim();
  const actorSlug = decodeHrefSlug(actorHref.replace(/^\/a\//, ""));
  const cover = articleHtml.match(/src="(https?:\/\/[^"]+cover\.jpg)"/)?.[1] ?? coverUrl(id);
  return {
    id,
    title,
    duration,
    cover,
    actor,
    actorSlug,
    pageUrl: `${SITE_ORIGIN}/v/${id}/`,
    hls: hlsUrl(id),
  };
}

export function parseVideoCards(html: string): VideoCard[] {
  const cards: VideoCard[] = [];
  const seen = new Set<string>();
  for (const article of html.matchAll(/<article class="card"[\s\S]*?<\/article>/g)) {
    const card = parseVideoCard(article[0]);
    if (!card || seen.has(card.id)) continue;
    seen.add(card.id);
    cards.push(card);
  }
  return cards;
}

export function parseHome(html: string): HomeData {
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1]?.trim() ?? "糖心Vlog";
  const sections: HomeSection[] = [];
  for (const block of html.matchAll(/<section class="section"[\s\S]*?<\/section>/g)) {
    const chunk = block[0];
    const heading = stripTags(chunk.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1] ?? "");
    const moreHref = chunk.match(/<a class="more"[^>]+href="([^"]+)"/)?.[1] ?? "";
    if (!heading) continue;
    sections.push({
      title: heading.replace(/\s+/g, " "),
      moreHref,
      videos: parseVideoCards(chunk),
    });
  }
  return { title, sections };
}

export function parseActorPage(html: string, slug: string, page: number): ActorPage {
  const h1 = stripTags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "")
    .replace(/^@\s*/, "")
    .trim();
  const total = Number(html.match(/共\s*(\d+)\s*部/)?.[1] ?? html.match(/共(\d+)部/)?.[1] ?? 0);
  const hasNext = /rel="next"/i.test(html) || new RegExp(`/${page + 1}(?:/|" )`).test(html);
  const videos = parseVideoCards(html);
  const name = h1 || videos[0]?.actor || slug;
  return { name, slug, total, page, hasNext: hasNext && videos.length > 0, videos };
}

export function parseTagPage(html: string, slug: string, page: number): ActorPage {
  const h1 = stripTags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? "")
    .replace(/^#\s*/, "")
    .trim();
  const total = Number(html.match(/共\s*(\d+)\s*部(?:视频)?/)?.[1] ?? 0);
  const hasNext = /rel=["']next["']/i.test(html) || /下一页/.test(html);
  const videos = parseVideoCards(html);
  const name = h1 || videos[0]?.actor || slug;
  return { name, slug, total, page, hasNext: hasNext && videos.length > 0, videos };
}

export function parseVideoDetail(html: string, id: string): VideoDetail {
  const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => {
      try {
        return JSON.parse(m[1] ?? "") as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .find((j) => j && j["@type"] === "VideoObject");

  const m3u8 =
    html.match(/const m3u8 = "([^"]+)"/)?.[1] ??
    (typeof jsonLd?.contentUrl === "string" ? jsonLd.contentUrl : null) ??
    hlsUrl(id);

  const title =
    (typeof jsonLd?.name === "string" ? jsonLd.name : null) ??
    html
      .match(/<title>([^<]+)<\/title>/)?.[1]
      ?.replace(/\s*-.*$/, "")
      .trim() ??
    `视频 ${id}`;

  const description = (typeof jsonLd?.description === "string" ? jsonLd.description : "") || "";
  const uploadDate = (typeof jsonLd?.uploadDate === "string" ? jsonLd.uploadDate : "") || "";
  const durationRaw =
    html.match(/class="duration"[^>]*>([^<]+)/)?.[1]?.trim() ??
    (typeof jsonLd?.duration === "string" ? jsonLd.duration : "");

  const actorLink = html.match(/href="(\/a\/[^"]+\/)"[^>]*>[\s\S]*?@?\s*([^<]+)/);
  const actorSlug = decodeHrefSlug((actorLink?.[1] ?? "").replace(/^\/a\//, ""));
  const actor = stripTags(actorLink?.[2] ?? "").replace(/^@/, "");

  const tags = parseNamedCloud(html, "tag");
  if (tags.length === 0) {
    for (const m of html.matchAll(/href="(\/tag\/([^"]+)\/)"[^>]*>\s*([^<]+)\s*</g)) {
      const slug = decodeHrefSlug(m[2] ?? "");
      const name = stripTags(m[3] ?? "");
      if (slug && name) tags.push({ slug, name, count: 0, href: m[1] ?? "" });
    }
  }

  return {
    id,
    title,
    duration: durationRaw,
    cover: (typeof jsonLd?.thumbnailUrl === "string" ? jsonLd.thumbnailUrl : null) ?? coverUrl(id),
    actor,
    actorSlug,
    pageUrl: absUrl(`/v/${id}/`),
    hls: m3u8,
    tags,
    description,
    uploadDate,
  };
}

export function rewritePlaylist(id: string, playlist: string) {
  const base = `https://t.5gcdn.xyz/videos/${id}/`;
  return playlist
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        return trimmed.replace(
          /URI="([^"]+)"/,
          (_m, uri: string) => `URI="${uri.startsWith("http") ? uri : `${base}${uri}`}"`,
        );
      }
      if (trimmed.startsWith("http")) return trimmed;
      return `${base}${trimmed}`;
    })
    .join("\n");
}

export function formatActorTree(
  bundles: Array<{ name: string; videos: VideoCard[] }>,
  ext = "m3u8",
) {
  const lines: string[] = [];
  for (const bundle of bundles) {
    lines.push(`演员: ${bundle.name}`);
    bundle.videos.forEach((video, i) => {
      const file = `${i + 1}.${ext}`;
      lines.push(`      ${file.padEnd(10)} ${video.duration.padEnd(7)} ${video.title}`);
    });
    if (bundle.videos.length === 0) lines.push("      (空)");
    lines.push("");
  }
  return lines.join("\n").trimEnd() + "\n";
}
