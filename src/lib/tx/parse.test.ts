import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTagPage } from "./parse.ts";

describe("tag page parser", () => {
  it("parses the tag heading, total, cards, and next-page marker", () => {
    const html = `
      <h1>#标签甲</h1>
      <p>共 48 部视频 · 第 1 / 2 页</p>
      <article class="card">
        <a class="cover-link" href="/v/9001/" aria-label="测试作品一">
          <img src="https://t.5gcdn.xyz/videos/9001/cover.jpg" />
          <span class="duration">12:30</span>
        </a>
        <h3 class="title"><a href="/v/9001/">测试作品一</a></h3>
        <a class="nickname" href="/a/%E6%BC%94%E5%91%98%E7%94%B2/">@演员甲</a>
      </article>
      <a rel="next" href="/tag/%E6%A0%87%E7%AD%BE%E7%94%B2/2">下一页 →</a>
    `;

    const result = parseTagPage(html, "标签甲", 1);

    assert.equal(result.name, "标签甲");
    assert.equal(result.slug, "标签甲");
    assert.equal(result.total, 48);
    assert.equal(result.page, 1);
    assert.equal(result.hasNext, true);
    assert.deepEqual(result.videos[0], {
      id: "9001",
      title: "测试作品一",
      duration: "12:30",
      cover: "https://t.5gcdn.xyz/videos/9001/cover.jpg",
      actor: "演员甲",
      actorSlug: "演员甲",
      pageUrl: "https://tangxinvlog.app/v/9001/",
      hls: "https://t.5gcdn.xyz/videos/9001/index.m3u8",
    });
  });
});
