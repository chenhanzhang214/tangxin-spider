import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const siteOrigin = z.object({
  origin: z.string().trim().max(300).optional(),
});

export const getSiteOrigin = createServerFn({ method: "GET" }).handler(async () => {
  const { resolveRequestedSiteOrigin } = await import("./site-origin.ts");
  return resolveRequestedSiteOrigin(undefined, process.env.TX_SITE_ORIGIN);
});

export const getHome = createServerFn({ method: "POST" })
  .validator((input: unknown) => siteOrigin.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { fetchHome } = await import("./crawl.server");
    return fetchHome(data.origin);
  });

const archiveVideo = z.object({
  id: z.string().regex(/^\d+$/),
  title: z.string().max(4000),
  duration: z.string().max(100),
  cover: z.string().max(2000),
  actor: z.string().max(300),
  actorSlug: z.string().max(300),
  pageUrl: z.string().max(2000),
  hls: z.string().max(2000),
});

export const getArchivePlan = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        videos: z.array(archiveVideo).max(10000),
        bundles: z
          .array(
            z.object({
              name: z.string().max(300),
              slug: z.string().max(300),
              listed: z.number(),
              videos: z.array(archiveVideo).max(10000),
            }),
          )
          .max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { desktopWorkerEnabled, runPython } = await import("./worker.server.ts");
    const { planArchiveItems } = await import("./archive-utils.ts");
    return desktopWorkerEnabled()
      ? runPython<ReturnType<typeof planArchiveItems>>("archive", data)
      : planArchiveItems(data.videos, data.bundles);
  });

export const getActors = createServerFn({ method: "POST" })
  .validator((input: unknown) => siteOrigin.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { fetchActors } = await import("./crawl.server");
    return fetchActors(data.origin);
  });

export const getTags = createServerFn({ method: "POST" })
  .validator((input: unknown) => siteOrigin.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { fetchTags } = await import("./crawl.server");
    return fetchTags(data.origin);
  });

export const getActorPage = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        slug: z.string().min(1).max(120),
        page: z.number().int().min(1).max(200),
        origin: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { fetchActorPage } = await import("./crawl.server");
    return fetchActorPage(data.slug, data.page, data.origin);
  });

export const getTagPage = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        slug: z.string().min(1).max(120),
        page: z.number().int().min(1).max(200),
        origin: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { fetchTagPage } = await import("./crawl.server.ts");
    return fetchTagPage(data.slug, data.page, data.origin);
  });

export const searchVideos = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        query: z.string().trim().min(1).max(120),
        limit: z.number().int().min(1).max(100).optional(),
        origin: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { searchSiteVideos } = await import("./search.server.ts");
    return searchSiteVideos(data.query, data.limit, data.origin);
  });

export const getVideoDetail = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().regex(/^\d+$/),
        origin: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { fetchVideoDetail } = await import("./crawl.server");
    return fetchVideoDetail(data.id, data.origin);
  });

export const getPlaylist = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        id: z.string().regex(/^\d+$/),
        origin: z.string().trim().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { fetchPlaylist } = await import("./crawl.server");
    const { rewritePlaylist } = await import("./parse");
    const raw = await fetchPlaylist(data.id, data.origin);
    return { id: data.id, playlist: rewritePlaylist(data.id, raw) };
  });
