import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleCatCatchRequest } from "./cat-catch.server.ts";

describe("Cat Catch launcher route", () => {
  it("rejects invalid input before trying to start Chrome", async () => {
    const response = await handleCatCatchRequest(
      new Request("http://localhost/api/cat-catch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "abc", actor: "演员", index: 1 }),
      }),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "视频 ID 无效，只允许数字 ID" });
  });

  it("requires an actor and positive number", async () => {
    const response = await handleCatCatchRequest(
      new Request("http://localhost/api/cat-catch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "36355", index: 0 }),
      }),
    );

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "演员和正整数编号是必需的" });
  });

  it("reports whether the local Chrome launcher is available", async () => {
    const previous = process.env.VERCEL;
    process.env.VERCEL = "1";
    try {
      const response = await handleCatCatchRequest(
        new Request("http://localhost/api/cat-catch?status=1"),
      );
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        available: false,
        error: "猫抓联动仅支持本机启动模式。",
      });
    } finally {
      if (previous === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = previous;
    }
  });

  it("rejects cross-origin requests before launching Chrome", async () => {
    let launched = false;
    const response = await handleCatCatchRequest(
      new Request("http://localhost/api/cat-catch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://example.com",
        },
        body: JSON.stringify({ id: "36355", actor: "演员", index: 1 }),
      }),
      {
        getStatus: () => ({
          available: true,
          chromePath: "C:\\Chrome\\chrome.exe",
          profileName: "Default",
          version: "2.7.2_0",
        }),
        launch: async () => {
          launched = true;
        },
      },
    );

    assert.equal(response.status, 403);
    assert.equal(launched, false);
    assert.deepEqual(await response.json(), { error: "猫抓联动只接受当前应用的请求" });
  });

  it("starts the installed Chrome profile with the Cat Catch parser URL", async () => {
    let command = "";
    let args: string[] = [];
    const response = await handleCatCatchRequest(
      new Request("http://localhost/api/cat-catch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "36355", actor: "演员/甲", index: 2, title: "测试视频" }),
      }),
      {
        getStatus: () => ({
          available: true,
          chromePath: "C:\\Chrome\\chrome.exe",
          profileName: "Default",
          version: "2.7.2_0",
        }),
        launch: async (nextCommand, nextArgs) => {
          command = nextCommand;
          args = nextArgs;
        },
      },
    );

    assert.equal(response.status, 200);
    assert.equal(command, "C:\\Chrome\\chrome.exe");
    assert.equal(args[0], "--profile-directory=Default");
    assert.equal(args[1], "--new-tab");
    const target = new URL(args[2] ?? "");
    assert.equal(target.protocol, "chrome-extension:");
    assert.equal(target.searchParams.get("filename"), "演员_甲/2");
    assert.equal(target.searchParams.get("url"), "https://t.5gcdn.xyz/videos/36355/index.m3u8");
    assert.deepEqual(await response.json(), {
      ok: true,
      version: "2.7.2_0",
      message: "已在 Chrome 中打开猫抓 M3U8 解析器",
    });
  });
});
