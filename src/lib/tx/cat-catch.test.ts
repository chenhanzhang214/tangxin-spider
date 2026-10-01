import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CAT_CATCH_EXTENSION_ID, catCatchM3u8Url } from "./cat-catch.ts";

describe("Cat Catch integration", () => {
  it("builds the installed Cat Catch parser URL with source metadata", () => {
    const url = catCatchM3u8Url("36355", "演员/甲", 2, "测试视频");
    const parsed = new URL(url);

    assert.equal(parsed.protocol, "chrome-extension:");
    assert.equal(parsed.hostname, CAT_CATCH_EXTENSION_ID);
    assert.equal(parsed.pathname, "/m3u8.html");
    assert.equal(parsed.searchParams.get("url"), "https://t.5gcdn.xyz/videos/36355/index.m3u8");
    assert.deepEqual(JSON.parse(parsed.searchParams.get("requestHeaders") ?? "{}"), {
      referer: "https://tangxinvlog.app/",
    });
    assert.equal(parsed.searchParams.get("title"), "测试视频");
    assert.equal(parsed.searchParams.get("filename"), "演员_甲/2");
    assert.equal(parsed.searchParams.has("autoDown"), false);
  });
});
