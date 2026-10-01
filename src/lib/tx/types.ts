export const SITE_ORIGIN = "https://tangxinvlog.app";
export const CDN_ORIGIN = "https://t.5gcdn.xyz";
export const PAGE_SIZE = 24;

export type NamedCount = {
  slug: string;
  name: string;
  count: number;
  href: string;
};

export type VideoCard = {
  id: string;
  title: string;
  duration: string;
  cover: string;
  actor: string;
  actorSlug: string;
  pageUrl: string;
  hls: string;
};

export type HomeSection = {
  title: string;
  moreHref: string;
  videos: VideoCard[];
};

export type HomeData = {
  title: string;
  sections: HomeSection[];
};

export type ActorPage = {
  name: string;
  slug: string;
  total: number;
  page: number;
  hasNext: boolean;
  videos: VideoCard[];
};

export type TagPage = ActorPage;

export type SearchVideosResult = {
  query: string;
  total: number;
  videos: VideoCard[];
};

export type VideoDetail = VideoCard & {
  tags: NamedCount[];
  description: string;
  uploadDate: string;
};

export type ActorBundle = {
  name: string;
  slug: string;
  listed: number;
  videos: VideoCard[];
};

export function hlsUrl(id: string) {
  return `${CDN_ORIGIN}/videos/${id}/index.m3u8`;
}

export function coverUrl(id: string) {
  return `${CDN_ORIGIN}/videos/${id}/cover.jpg`;
}

export function videoPageUrl(id: string) {
  return `${SITE_ORIGIN}/v/${id}/`;
}

export function actorPageUrl(slug: string, page = 1) {
  const encoded = encodeURIComponent(slug);
  return page <= 1 ? `${SITE_ORIGIN}/a/${encoded}/` : `${SITE_ORIGIN}/a/${encoded}/${page}/`;
}

export function numberedName(index: number, ext = "m3u8") {
  return `${index}.${ext}`;
}
