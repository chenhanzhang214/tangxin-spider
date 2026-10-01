import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeArchiveItemsIntoBundles, planArchiveItems } from "./archive-utils.ts";
import type { ActorBundle, VideoCard } from "./types.ts";

function video(id: string, actor: string): VideoCard {
  return {
    id,
    title: `作品 ${id}`,
    duration: "01:00",
    cover: `https://t.5gcdn.xyz/videos/${id}/cover.jpg`,
    actor,
    actorSlug: actor,
    pageUrl: `https://tangxinvlog.app/v/${id}/`,
    hls: `https://t.5gcdn.xyz/videos/${id}/index.m3u8`,
  };
}

describe("archive planning", () => {
  it("keeps actor folders and continues numbering after existing bundles", () => {
    const existing: ActorBundle[] = [
      {
        name: "演员甲",
        slug: "演员甲",
        listed: 1,
        videos: [video("100", "演员甲")],
      },
    ];

    const planned = planArchiveItems(
      [video("101", "演员甲"), video("102", "演员乙"), video("103", "演员甲")],
      existing,
    );

    assert.deepEqual(
      planned.map((item) => ({ id: item.video.id, actor: item.actor, index: item.index })),
      [
        { id: "101", actor: "演员甲", index: 2 },
        { id: "102", actor: "演员乙", index: 1 },
        { id: "103", actor: "演员甲", index: 3 },
      ],
    );
  });

  it("deduplicates repeated search results by video id and actor", () => {
    const planned = planArchiveItems(
      [video("101", "演员甲"), video("101", "演员甲"), video("102", "演员甲")],
      [],
    );

    assert.deepEqual(
      planned.map((item) => ({ id: item.video.id, index: item.index })),
      [
        { id: "101", index: 1 },
        { id: "102", index: 2 },
      ],
    );
  });

  it("merges homepage recommendations into actor bundles without duplicates", () => {
    const existing: ActorBundle[] = [
      {
        name: "演员甲",
        slug: "actor-a",
        listed: 3,
        videos: [video("100", "演员甲")],
      },
    ];
    const planned = planArchiveItems(
      [video("100", "演员甲"), video("101", "演员甲"), video("200", "演员乙")],
      existing,
    );

    const merged = mergeArchiveItemsIntoBundles(planned, existing);

    assert.deepEqual(
      merged.map((bundle) => ({
        name: bundle.name,
        slug: bundle.slug,
        ids: bundle.videos.map((item) => item.id),
      })),
      [
        { name: "演员甲", slug: "actor-a", ids: ["100", "101"] },
        { name: "演员乙", slug: "演员乙", ids: ["200"] },
      ],
    );
  });
});
