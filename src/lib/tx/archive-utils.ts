import type { ActorBundle, VideoCard } from "./types.ts";

export type ArchiveItem = {
  video: VideoCard;
  actor: string;
  index: number;
};

function archiveActor(video: VideoCard) {
  return video.actor.trim() || "未分类演员";
}

export function planArchiveItems(videos: VideoCard[], existingBundles: ActorBundle[] = []) {
  const seen = new Set<string>();
  const existingIndexes = new Map<string, Map<string, number>>();
  const nextIndexes = new Map<string, number>();

  for (const bundle of existingBundles) {
    const actor = bundle.name.trim() || "未分类演员";
    const indexes = existingIndexes.get(actor) ?? new Map<string, number>();
    bundle.videos.forEach((video, index) => indexes.set(video.id, index + 1));
    existingIndexes.set(actor, indexes);
    nextIndexes.set(actor, Math.max(nextIndexes.get(actor) ?? 1, bundle.videos.length + 1));
  }

  const planned: ArchiveItem[] = [];
  for (const video of videos) {
    const actor = archiveActor(video);
    const key = `${actor}\u0000${video.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const existingIndex = existingIndexes.get(actor)?.get(video.id);
    if (existingIndex) {
      planned.push({ video, actor, index: existingIndex });
      continue;
    }

    const index = nextIndexes.get(actor) ?? 1;
    nextIndexes.set(actor, index + 1);
    planned.push({ video, actor, index });
  }

  return planned;
}

export function mergeArchiveItemsIntoBundles(
  items: ArchiveItem[],
  existingBundles: ActorBundle[] = [],
) {
  const bundles = existingBundles.map((bundle) => ({
    ...bundle,
    videos: [...bundle.videos],
  }));
  const byActor = new Map(
    bundles.map((bundle, index) => [bundle.name.trim() || "未分类演员", index]),
  );

  for (const item of items) {
    const actor = item.actor.trim() || "未分类演员";
    const bundleIndex = byActor.get(actor);
    if (bundleIndex === undefined) {
      byActor.set(actor, bundles.length);
      bundles.push({
        name: actor,
        slug: item.video.actorSlug.trim() || actor,
        listed: 1,
        videos: [item.video],
      });
      continue;
    }

    const bundle = bundles[bundleIndex];
    if (!bundle || bundle.videos.some((video) => video.id === item.video.id)) continue;
    bundle.videos.push(item.video);
    bundle.listed = Math.max(bundle.listed, bundle.videos.length);
  }

  return bundles.sort((a, b) => b.videos.length - a.videos.length);
}
