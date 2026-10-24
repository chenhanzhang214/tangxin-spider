import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";
import { runWorkerProcess, runPython } from "./worker.server.ts";
import {
  parseHome,
  parseActorPage,
  parseTagPage,
  parseNamedCloud,
  parseVideoDetail,
} from "./parse.ts";
import { planArchiveItems } from "./archive-utils.ts";

const options = { root: resolve(".output/worker") };
const card =
  '<article class="card"><a href="/v/9001/" aria-label="标题 🌷"></a><h3 class="title"><a href="/v/9001/">作品 🌷</a></h3><a class="nickname" href="/a/%E7%94%B2/">@甲</a><span class="duration">01:30</span></article>';

test("Python and web catalog implementations return the same contracts", async () => {
  const html = `<title>测试</title><h1>#标签</h1><p>共 48 部</p><section class="section"><h2>推荐</h2>${card}${card}</section><a rel="next">下一页</a><a href="/tag/%E6%A0%87%E7%AD%BE/"><span class="name">标签</span><span class="num">42</span></a>`;
  assert.deepEqual(await runPython("home", { html }, options), parseHome(html));
  for (const kind of ["a", "tag"] as const) {
    assert.deepEqual(
      await runPython("cloud", { html, kind }, options),
      parseNamedCloud(html, kind),
    );
    assert.deepEqual(
      await runPython("page", { html, kind, slug: "甲", page: 1 }, options),
      (kind === "a" ? parseActorPage : parseTagPage)(html, "甲", 1),
    );
  }
  assert.deepEqual(
    await runPython("detail", { html, id: "9001" }, options),
    parseVideoDetail(html, "9001"),
  );
  const videos = parseHome(html).sections[0]!.videos;
  assert.deepEqual(
    await runPython("archive", { videos: [...videos, ...videos], bundles: [] }, options),
    planArchiveItems(videos),
  );
});

test("worker timeout, missing executable and oversized input fail explicitly", async () => {
  await assert.rejects(
    runWorkerProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], "", 50),
    /超时/,
  );
  await assert.rejects(runWorkerProcess(resolve("missing-worker.exe"), [], "", 1000), /启动/);
  await assert.rejects(
    runWorkerProcess(process.execPath, [], "x".repeat(17 * 1024 * 1024), 100),
    /过大/,
  );
});

test("nonzero exit and excessive output cannot succeed", async () => {
  await assert.rejects(
    runWorkerProcess(process.execPath, ["-e", "process.exit(2)"], "", 2000),
    /失败/,
  );
  await assert.rejects(
    runWorkerProcess(
      process.execPath,
      ["-e", "process.stdout.write('x'.repeat(17*1024*1024))"],
      "",
      2000,
    ),
    /过大/,
  );
});
