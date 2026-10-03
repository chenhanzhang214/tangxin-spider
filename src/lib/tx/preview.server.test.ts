import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handlePreviewRequest, rewritePreviewPlaylist } from "./preview.server.ts";
import { videoPreviewUrl } from "./preview.ts";

const localOrigin = "http://localhost:8080";
const cdnBase = "https://t.5gcdn.xyz/videos/123/";
const request = (path = "index.m3u8", init?: RequestInit) =>
  new Request(localOrigin + videoPreviewUrl("123", path), init);

describe("video preview streaming", () => {
  it("rewrites encrypted playlists, nested variants and init fragments without changing media tags", () => {
    const playlist = [
      "#EXTM3U",
      '#EXT-X-KEY:METHOD=AES-128,URI="../enc.key?token=example",IV=0x01',
      '#EXT-X-MAP:URI="init.mp4"',
      '#EXT-X-MEDIA:TYPE=AUDIO,URI="audio.m3u8"',
      "#EXTINF:5.0,",
      "seg0.ts",
      `${cdnBase}video/seg1.ts`,
      "#EXT-X-ENDLIST",
    ].join("\n");
    const result = rewritePreviewPlaylist("123", playlist, `${cdnBase}video/index.m3u8`);
    assert.ok(result.includes(`URI="${videoPreviewUrl("123", "enc.key?token=example")}",IV=0x01`));
    assert.ok(result.includes(`URI="${videoPreviewUrl("123", "video/init.mp4")}"`));
    assert.ok(result.includes(`URI="${videoPreviewUrl("123", "video/audio.m3u8")}"`));
    assert.ok(result.includes(`\n${videoPreviewUrl("123", "video/seg0.ts")}\n`));
    assert.ok(result.includes("#EXTINF:5.0,"));
    assert.ok(result.endsWith("#EXT-X-ENDLIST"));
    assert.ok(!result.includes("https://"));
  });

  it("rejects bad IDs, arbitrary hosts, path traversal and non-media files before fetching", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("must not fetch");
    };
    for (const path of [
      "https://127.0.0.1/seg.ts",
      "//evil.test/seg.ts",
      "../456/seg.ts",
      "%2e%2e/456/seg.ts",
      "seg%2fts",
      "index.html",
      "file:///index.m3u8",
      `${cdnBase}seg.ts#fragment`,
    ]) {
      assert.equal((await handlePreviewRequest(request(path), fetchImpl)).status, 400, path);
    }
    assert.equal(
      (await handlePreviewRequest(new Request(`${localOrigin}/api/preview?id=abc`), fetchImpl))
        .status,
      400,
    );
  });

  it("rejects untrusted resource URLs in playlist lines and key attributes", () => {
    for (const value of [
      "https://evil.test/seg.ts",
      `${cdnBase}../../other.ts`,
      "data:text/plain,abc",
    ]) {
      assert.throws(() => rewritePreviewPlaylist("123", `#EXTM3U\n${value}`));
      assert.throws(() =>
        rewritePreviewPlaylist("123", `#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="${value}"`),
      );
    }
    assert.throws(() => rewritePreviewPlaylist("123", "<html>upstream error</html>"));
  });

  it("fetches only the manifest initially, using the source Referer and no-store responses", async () => {
    const urls: string[] = [];
    const response = await handlePreviewRequest(request(), async (url, init) => {
      urls.push(String(url));
      assert.equal(new Headers(init?.headers).get("referer"), "https://tangxinvlog.app/");
      assert.equal(init?.redirect, "manual");
      return new Response("#EXTM3U\n#EXTINF:5,\nseg0.ts\n#EXT-X-ENDLIST");
    });
    assert.equal(response.status, 200);
    assert.deepEqual(urls, [`${cdnBase}index.m3u8`]);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("content-type"), "application/vnd.apple.mpegurl");
    assert.ok((await response.text()).includes(videoPreviewUrl("123", "seg0.ts")));
  });

  it("preserves byte ranges and streams binary resources without rewriting bytes", async () => {
    const bytes = Uint8Array.from([0, 128, 255, 71]);
    const response = await handlePreviewRequest(
      request("seg0.ts", { headers: { Range: "bytes=4-7" } }),
      async (_url, init) => {
        assert.equal(new Headers(init?.headers).get("range"), "bytes=4-7");
        return new Response(bytes, {
          status: 206,
          headers: { "Content-Range": "bytes 4-7/100", "Accept-Ranges": "bytes" },
        });
      },
    );
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), "bytes 4-7/100");
    assert.equal(response.headers.get("accept-ranges"), "bytes");
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), bytes);
  });

  it("cancels the upstream body when the player abandons a segment", async () => {
    let cancelled = false;
    const response = await handlePreviewRequest(
      request("seg0.ts"),
      async () =>
        new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
        ),
    );
    await response.body?.cancel();
    assert.equal(cancelled, true);
  });

  it("propagates a disconnected player signal to the upstream fetch", async () => {
    const controller = new AbortController();
    const result = await handlePreviewRequest(
      request("seg0.ts", { signal: controller.signal }),
      async (_url, init) => {
        controller.abort();
        assert.equal(init?.signal?.aborted, true);
        throw new Error("aborted");
      },
    );
    assert.equal(result.status, 504);
  });

  it("never follows a redirect outside the configured video's CDN path", async () => {
    let calls = 0;
    const response = await handlePreviewRequest(request(), async () => {
      calls += 1;
      return new Response(null, {
        status: 302,
        headers: { Location: "http://127.0.0.1/private.m3u8" },
      });
    });
    assert.equal(response.status, 502);
    assert.equal(calls, 1);
  });

  it("resolves relative segment paths against a trusted redirected playlist", async () => {
    const response = await handlePreviewRequest(request(), async (url) =>
      String(url).endsWith("/index.m3u8")
        ? new Response(null, { status: 302, headers: { Location: "nested/media.m3u8" } })
        : new Response("#EXTM3U\n#EXTINF:5,\nseg0.ts\n#EXT-X-ENDLIST"),
    );
    assert.equal(response.status, 200);
    assert.ok((await response.text()).includes(videoPreviewUrl("123", "nested/seg0.ts")));
  });

  it("rejects oversized manifests, cross-site calls, and malformed ranges", async () => {
    assert.equal(
      (
        await handlePreviewRequest(
          request(),
          async () => new Response("#EXTM3U\n" + " ".repeat(2 * 1024 * 1024)),
        )
      ).status,
      502,
    );
    const neverFetch: typeof fetch = async () => {
      throw new Error("must not fetch");
    };
    assert.equal(
      (
        await handlePreviewRequest(
          request("index.m3u8", { headers: { Origin: "https://evil.test" } }),
          neverFetch,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await handlePreviewRequest(
          request("seg0.ts", { headers: { Range: "garbage" } }),
          neverFetch,
        )
      ).status,
      416,
    );
    assert.equal(
      (await handlePreviewRequest(request(), async () => new Response(null, { status: 404 })))
        .status,
      404,
    );
  });
});
