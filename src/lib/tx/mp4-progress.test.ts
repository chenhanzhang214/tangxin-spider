import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readMp4Response, type Mp4SaveResult } from "./mp4-progress.ts";

function ndjsonResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
    },
  );
}

describe("MP4 progress response", () => {
  it("reads progress split across network chunks and returns the final save result", async () => {
    const progress: number[] = [];
    const response = ndjsonResponse([
      '{"type":"progress","phase":"segments","percent":45,"message":"正在下载","completedSegments":5,',
      '"totalSegments":10}\n{"type":"progress","phase":"remuxing","percent":91,"message":"转封装中"}\n',
      '{"type":"result","data":{"ok":true,"path":"E:\\\\spider\\\\演员甲\\\\1.mp4","bytes":1234,"message":"已保存"}}\n',
    ]);

    const result = await readMp4Response(response, (update) => progress.push(update.percent));

    assert.deepEqual(progress, [45, 91]);
    assert.deepEqual(result, {
      ok: true,
      path: "E:\\spider\\演员甲\\1.mp4",
      bytes: 1234,
      message: "已保存",
    } satisfies Mp4SaveResult);
  });

  it("keeps compatibility with the existing JSON response", async () => {
    const response = Response.json({
      ok: true,
      path: "E:\\spider\\演员乙\\2.mp4",
      bytes: 5678,
      message: "已保存",
    });

    assert.equal((await readMp4Response(response)).bytes, 5678);
  });

  it("surfaces a streamed conversion error", async () => {
    const response = ndjsonResponse([
      '{"type":"progress","phase":"checking","percent":97,"message":"检查中"}\n',
      '{"type":"error","error":"MP4 完整性检查失败"}\n',
    ]);

    await assert.rejects(() => readMp4Response(response), /MP4 完整性检查失败/);
  });
});
