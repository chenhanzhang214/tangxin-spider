import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pagefindDataToVideoCard } from "./search.server.ts";

describe("Pagefind search result mapping", () => {
  it("maps a video result into the existing download contract", () => {
    const result = pagefindDataToVideoCard({
      url: "https://tangxinvlog.app/v/8123/",
      meta: {
        title: "搜索到的作品",
        duration: "08:12",
        image: "https://t.5gcdn.xyz/videos/8123/cover.jpg",
        nickname: "@演员乙",
      },
    });

    assert.deepEqual(result, {
      id: "8123",
      title: "搜索到的作品",
      duration: "08:12",
      cover: "https://t.5gcdn.xyz/videos/8123/cover.jpg",
      actor: "演员乙",
      actorSlug: "",
      pageUrl: "https://tangxinvlog.app/v/8123/",
      hls: "https://t.5gcdn.xyz/videos/8123/index.m3u8",
    });
  });

  it("accepts language-prefixed video results from the current search index", () => {
    for (const path of ["/zh-tw/v/36560/", "/zh-cn/v/36560", "/en/v/36560/"]) {
      const result = pagefindDataToVideoCard({
        url: `https://tangxinvlog.app${path}`,
        meta: { title: "预览测试作品", nickname: "@演员乙" },
      });
      assert.equal(result?.id, "36560");
      assert.equal(result?.pageUrl, "https://tangxinvlog.app/v/36560/");
      assert.equal(result?.hls, "https://t.5gcdn.xyz/videos/36560/index.m3u8");
    }
  });

  it("does not accept unrelated or external language-prefixed pages", () => {
    for (const url of [
      "https://example.com/zh-tw/v/36560/",
      "https://tangxinvlog.app/zh-tw/a/36560/",
      "https://tangxinvlog.app/arbitrary/v/36560/",
      "https://tangxinvlog.app/zh-tw/v/not-a-number/",
    ]) {
      assert.equal(pagefindDataToVideoCard({ url }), null);
    }
  });

  it("rejects results that are not source video pages", () => {
    assert.equal(
      pagefindDataToVideoCard({
        url: "https://example.com/about/",
        meta: { title: "不是视频" },
      }),
      null,
    );
  });
});
