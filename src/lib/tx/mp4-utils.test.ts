import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFfmpegArgs,
  buildLocalFfmpegArgs,
  sanitizeFilename,
  videoMp4Url,
} from "./mp4-utils.ts";

describe("mp4 utilities", () => {
  it("builds a copy/remux command from a video id without accepting a URL", () => {
    const args = buildFfmpegArgs("12345");

    assert.deepEqual(args.slice(0, 10), [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-protocol_whitelist",
      "file,http,https,tcp,tls,crypto",
      "-headers",
      "Referer: https://tangxinvlog.app/\r\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\n",
      "-i",
      "https://t.5gcdn.xyz/videos/12345/index.m3u8",
    ]);
    assert.deepEqual(args.slice(-7), [
      "-bsf:a",
      "aac_adtstoasc",
      "-movflags",
      "frag_keyframe+empty_moov",
      "-f",
      "mp4",
      "pipe:1",
    ]);
    assert.equal(args.includes("https://example.com/custom.m3u8"), false);
  });

  it("uses a seekable faststart MP4 when the output is a file", () => {
    const args = buildFfmpegArgs("12345", "E:\\TangxinData\\演员\\1.mp4");
    const movflagsIndex = args.indexOf("-movflags");

    assert.deepEqual(args.slice(movflagsIndex, movflagsIndex + 2), ["-movflags", "+faststart"]);
    assert.equal(args.includes("frag_keyframe+empty_moov"), false);
  });

  it("builds a local transport-stream remux without remote HTTP headers", () => {
    const args = buildLocalFfmpegArgs(
      "E:\\TangxinData\\演员\\.work\\input.ts",
      "E:\\TangxinData\\演员\\1.mp4.part",
    );

    assert.equal(args.includes("-headers"), false);
    assert.equal(args.includes("-protocol_whitelist"), false);
    assert.equal(
      args[args.indexOf("-i") + 1],
      "E:\\TangxinData\\演员\\.work\\input.ts",
    );
    assert.deepEqual(args.slice(-7), [
      "-bsf:a",
      "aac_adtstoasc",
      "-movflags",
      "+faststart",
      "-f",
      "mp4",
      "E:\\TangxinData\\演员\\1.mp4.part",
    ]);
  });

  it("sanitizes Windows filename characters and keeps a fallback", () => {
    assert.equal(sanitizeFilename('A/B:C*D?E"'), "A_B_C_D_E_");
    assert.equal(sanitizeFilename("...   "), "video");
    assert.equal(sanitizeFilename("x".repeat(150)).length, 100);
  });

  it("builds the same-origin download endpoint", () => {
    assert.equal(videoMp4Url("12345"), "/api/mp4?id=12345");
  });

  it("includes the actor folder and number in the local save request", () => {
    const url = videoMp4Url("12345", "演员/甲", 2);
    assert.match(url, /^\/api\/mp4\?/);
    assert.match(url, /[?&]id=12345(?:&|$)/);
    assert.match(url, /[?&]actor=%E6%BC%94%E5%91%98%2F%E7%94%B2(?:&|$)/);
    assert.match(url, /[?&]index=2(?:&|$)/);
  });

  it("includes a custom absolute download directory when provided", () => {
    const url = videoMp4Url("12345", "演员甲", 3, "D:\\archive\\spider");
    assert.match(url, /[?&]downloadDir=D%3A%5Carchive%5Cspider(?:&|$)/);
  });

  it("requests a streaming response when per-video progress is needed", () => {
    const url = videoMp4Url("12345", "演员甲", 3, "D:\\archive\\spider", true);
    assert.match(url, /[?&]progress=1(?:&|$)/);
  });
});
