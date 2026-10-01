import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getHome = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchHome } = await import("./crawl.server");
  return fetchHome();
});

export const getActors = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchActors } = await import("./crawl.server");
  return fetchActors();
});

export const getTags = createServerFn({ method: "GET" }).handler(async () => {
  const { fetchTags } = await import("./crawl.server");
  return fetchTags();
});

export const getActorPage = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        slug: z.string().min(1).max(120),
        page: z.number().int().min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { fetchActorPage } = await import("./crawl.server");
    return fetchActorPage(data.slug, data.page);
  });

export const getTagPage = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        slug: z.string().min(1).max(120),
        page: z.number().int().min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { fetchTagPage } = await import("./crawl.server.ts");
    return fetchTagPage(data.slug, data.page);
  });

export const searchVideos = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        query: z.string().trim().min(1).max(120),
        limit: z.number().int().min(1).max(100).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { searchSiteVideos } = await import("./search.server.ts");
    return searchSiteVideos(data.query, data.limit);
  });

export const getVideoDetail = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ id: z.string().regex(/^\d+$/) }).parse(input))
  .handler(async ({ data }) => {
    const { fetchVideoDetail } = await import("./crawl.server");
    return fetchVideoDetail(data.id);
  });

export const getPlaylist = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ id: z.string().regex(/^\d+$/) }).parse(input))
  .handler(async ({ data }) => {
    const { fetchPlaylist } = await import("./crawl.server");
    const { rewritePlaylist } = await import("./parse");
    const raw = await fetchPlaylist(data.id);
    return { id: data.id, playlist: rewritePlaylist(data.id, raw) };
  });
