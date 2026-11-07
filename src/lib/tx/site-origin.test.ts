import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CDN_ORIGIN, SITE_ORIGIN } from "./types.ts";
import {
  RXRINA_SITE_ORIGIN,
  resolveRequestedSiteOrigin,
  siteAllowsLocalMedia,
  siteProfileForOrigin,
  videoSupportsLocalMedia,
} from "./site-origin.ts";

describe("site origin allowlist", () => {
  it("keeps tangxinvlog.app as the default", () => {
    assert.equal(resolveRequestedSiteOrigin(), SITE_ORIGIN);
    assert.equal(resolveRequestedSiteOrigin("  ", "  "), SITE_ORIGIN);
    assert.equal(siteProfileForOrigin(SITE_ORIGIN)?.kind, "tangxin");
    assert.equal(siteAllowsLocalMedia(SITE_ORIGIN), true);
  });

  it("accepts the 3drxrina catalog host and trailing slash", () => {
    assert.equal(resolveRequestedSiteOrigin(`${RXRINA_SITE_ORIGIN}/`), RXRINA_SITE_ORIGIN);
    assert.equal(siteProfileForOrigin(RXRINA_SITE_ORIGIN)?.media, "catalog-only");
    assert.equal(siteAllowsLocalMedia(RXRINA_SITE_ORIGIN), false);
  });

  it("rejects unknown hosts, paths, and credentials", () => {
    for (const value of [
      "https://evil.example",
      "http://tangxinvlog.app",
      "https://user:pass@tangxinvlog.app",
      "https://tangxinvlog.app/a/",
      "https://tangxinvlog.app/?q=1",
    ]) {
      assert.throws(() => resolveRequestedSiteOrigin(value), /内容源不在支持列表中/);
    }
    assert.throws(() => resolveRequestedSiteOrigin(undefined, "https://evil.example"), /TX_SITE_ORIGIN/);
  });

  it("only treats the tangxin media CDN as locally playable", () => {
    assert.equal(videoSupportsLocalMedia({ hls: `${CDN_ORIGIN}/videos/12/index.m3u8` }), true);
    assert.equal(videoSupportsLocalMedia({ hls: "" }), false);
    assert.equal(
      videoSupportsLocalMedia({
        hls: `${RXRINA_SITE_ORIGIN}/videoAuth/openApi/video.m3u8?resId=1`,
      }),
      false,
    );
  });
});
