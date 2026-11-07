import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RXRINA_SITE_ORIGIN } from "./site-origin.ts";
import {
  formatRxrinaDuration,
  mapRxrinaDetail,
  mapRxrinaHome,
  mapRxrinaList,
  parseSiteConfigScript,
  type RxrinaPublicConfig,
} from "./rxrina-catalog.ts";

const config: RxrinaPublicConfig = {
  title: "测试目录",
  version: "1",
  resimgcdn: "https://img.example",
  bufnamecdn: "COVER_RES",
  bufdomaincdn: "$domain",
  resimgdomaincdn: "https://img.example",
};

const row = {
  id: 10,
  title: "测试作品",
  duration: "65000",
  poster: "COVER_RES/aes/image/a",
  columnValue: "push_1",
  tags: "测试标签",
  movieVideos: [{ id: 99, videoId: 100 }],
};

describe("3drxrina catalog mapping", () => {
  it("formats millisecond durations", () => {
    assert.equal(formatRxrinaDuration("65000"), "1:05");
    assert.equal(formatRxrinaDuration(2_304_000), "38:24");
    assert.equal(formatRxrinaDuration("12:30"), "12:30");
  });

  it("maps the homepage into columns and tags without media urls", () => {
    const parsed = parseSiteConfigScript(
      `window.__SITE_CONFIG__ = ${JSON.stringify({ ...config, summary: "<div>说明}尾注</div>" })}; trailing }`,
    );
    assert.equal(parsed.title, "测试目录");
    const result = mapRxrinaHome(
      {
        code: 200,
        data: {
          queryData: [
            {
              name: "测试栏目",
              value: "push_1",
              genres: [{ id: 1, name: "测试标签" }, { id: 2, name: "" }],
              rows: [row, row],
            },
          ],
        },
      },
      RXRINA_SITE_ORIGIN,
      config,
    );
    assert.equal(result.home.title, "测试目录");
    assert.deepEqual(result.actors, [
      { slug: "push_1", name: "测试栏目", count: 0, href: "/column/push_1" },
    ]);
    assert.equal(result.tags[0]?.name, "测试标签");
    assert.equal(result.home.sections[0]?.videos.length, 2);
    const video = result.home.sections[0]?.videos[0];
    assert.ok(video);
    assert.equal(video.hls, "");
    assert.equal(video.cover, "https://img.example/aes/image/a");
    assert.equal(video.actor, "测试栏目");
    assert.equal(video.pageUrl, `${RXRINA_SITE_ORIGIN}/column/push_1/video/99`);
    assert.equal(JSON.stringify(result).includes("videoAuth"), false);
  });

  it("paginates list totals and drops playback fields from details", () => {
    const first = mapRxrinaList({ code: 200, total: 30, rows: [row] }, RXRINA_SITE_ORIGIN, "push_1", 1, config);
    const second = mapRxrinaList({ code: 200, total: 30, rows: [row] }, RXRINA_SITE_ORIGIN, "push_1", 2, config);
    assert.equal(first.hasNext, true);
    assert.equal(second.hasNext, false);
    assert.equal(first.name, "");
    const detail = mapRxrinaDetail(
      {
        code: 200,
        data: {
          playStatus: 2,
          playErrMsg: "当前播放次数已达上限",
          urlAlter: "ignored",
          videoInfo: { url: "res-id" },
          movie: { ...row, summary: "简介", createTime: "2026-01-02" },
        },
      },
      RXRINA_SITE_ORIGIN,
      "99",
      config,
    );
    assert.equal(detail.hls, "");
    assert.equal(detail.description, "简介");
    assert.equal(detail.uploadDate, "2026-01-02");
    assert.equal(detail.tags[0]?.name, "测试标签");
    const serialized = JSON.stringify(detail);
    assert.equal(serialized.includes("res-id"), false);
    assert.equal(serialized.includes("videoAuth"), false);
    assert.equal(serialized.includes("urlAlter"), false);
  });
});
