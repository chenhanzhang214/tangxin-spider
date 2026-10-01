import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getFfmpegStatus,
  getHlsConcurrency,
  handleMp4Request,
  resolveMp4Download,
} from "./mp4.server.ts";

describe("mp4 server route", () => {
  it("returns a clear local-only status in deployed environments", async () => {
    const previous = process.env.VERCEL;
    process.env.VERCEL = "1";
    try {
      const response = await getFfmpegStatus();
      assert.equal(response.available, false);
      assert.match(response.error ?? "", /仅支持 Windows 本机启动模式/);
    } finally {
      if (previous === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = previous;
    }
  });

  it("rejects non-numeric ids before spawning ffmpeg", async () => {
    const response = await handleMp4Request(new Request("http://localhost/api/mp4?id=abc"));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "视频 ID 无效，只允许数字 ID" });
  });

  it("resolves the configured actor folder and numbered filename", () => {
    const previous = process.env.TX_DOWNLOAD_DIR;
    process.env.TX_DOWNLOAD_DIR = "E:\\TangxinData";
    try {
      assert.deepEqual(resolveMp4Download("演员甲", 2, undefined, "视频二"), {
        directory: "E:\\TangxinData\\演员甲",
        filename: "视频二.mp4",
        path: "E:\\TangxinData\\演员甲\\视频二.mp4",
      });
    } finally {
      if (previous === undefined) delete process.env.TX_DOWNLOAD_DIR;
      else process.env.TX_DOWNLOAD_DIR = previous;
    }
  });

  it("keeps actor names inside the download root", () => {
    const previous = process.env.TX_DOWNLOAD_DIR;
    process.env.TX_DOWNLOAD_DIR = "E:\\TangxinData";
    try {
      const location = resolveMp4Download("演员/../../outside", 1);
      assert.equal(location.directory, "E:\\TangxinData\\演员_.._.._outside");
    } finally {
      if (previous === undefined) delete process.env.TX_DOWNLOAD_DIR;
      else process.env.TX_DOWNLOAD_DIR = previous;
    }
  });

  it("resolves a custom absolute directory while retaining actor subfolders", () => {
    assert.deepEqual(resolveMp4Download("演员甲", 3, "D:\\archive\\spider", "视频三"), {
      directory: "D:\\archive\\spider\\演员甲",
      filename: "视频三.mp4",
      path: "D:\\archive\\spider\\演员甲\\视频三.mp4",
    });
  });

  it("rejects a relative custom directory before conversion", async () => {
    const response = await handleMp4Request(
      new Request(
        "http://localhost/api/mp4?id=12345&actor=%E6%BC%94%E5%91%98%E7%94%B2&index=1&downloadDir=relative%2Fpath",
      ),
    );
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "下载目录必须是绝对路径，且长度不能超过 512 个字符。",
    });
  });

  it("requires an actor and positive number before starting a conversion", async () => {
    const previous = process.env.VERCEL;
    process.env.VERCEL = "1";
    try {
      const response = await handleMp4Request(
        new Request("http://localhost/api/mp4?id=12345&actor=%E6%BC%94%E5%91%98%E7%94%B2&index=0"),
      );
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "演员和正整数编号是必需的" });
    } finally {
      if (previous === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = previous;
    }
  });

  it("clamps the local HLS prefetch concurrency to a safe range", () => {
    const previous = process.env.TX_HLS_CONCURRENCY;
    try {
      process.env.TX_HLS_CONCURRENCY = "99";
      assert.equal(getHlsConcurrency(), 16);
      process.env.TX_HLS_CONCURRENCY = "0";
      assert.equal(getHlsConcurrency(), 1);
      process.env.TX_HLS_CONCURRENCY = "not-a-number";
      assert.equal(getHlsConcurrency(), 8);
    } finally {
      if (previous === undefined) delete process.env.TX_HLS_CONCURRENCY;
      else process.env.TX_HLS_CONCURRENCY = previous;
    }
  });
});
