import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  downloadTaskProgress,
  mapHlsProgressToDownloadProgress,
  removeFinishedDownloadTasks,
  summarizeDownloadTasks,
  upsertDownloadTask,
  type DownloadTask,
} from "./download-progress.ts";

function task(key: string, status: DownloadTask["status"]): DownloadTask {
  return {
    key,
    videoId: key,
    actor: "演员甲",
    index: 1,
    title: `视频 ${key}`,
    status,
  };
}

describe("download progress", () => {
  it("counts queued, active, and terminal tasks into a stable percentage", () => {
    const summary = summarizeDownloadTasks([
      task("queued", "queued"),
      task("active", "downloading"),
      task("done", "completed"),
      task("failed", "failed"),
    ]);

    assert.deepEqual(summary, {
      total: 4,
      queued: 1,
      downloading: 1,
      completed: 1,
      failed: 1,
      finished: 2,
      percent: 50,
    });
  });

  it("weights the queue percentage by each work item's individual progress", () => {
    const summary = summarizeDownloadTasks([
      { ...task("queued", "queued"), progress: 0 },
      { ...task("active", "downloading"), progress: 42 },
      { ...task("done", "completed"), progress: 100 },
    ]);

    assert.equal(summary.percent, 47);
    assert.equal(downloadTaskProgress({ ...task("active", "downloading"), progress: 42 }), 42);
    assert.equal(downloadTaskProgress({ ...task("done", "completed"), progress: 42 }), 100);
  });

  it("maps HLS phases into monotonic per-video percentages", () => {
    assert.deepEqual(
      mapHlsProgressToDownloadProgress({
        phase: "playlist",
        completedSegments: 0,
        totalSegments: 10,
      }),
      {
        phase: "preparing",
        percent: 4,
        message: "已读取 HLS 播放列表，准备下载分片…",
        completedSegments: 0,
        totalSegments: 10,
      },
    );
    assert.equal(
      mapHlsProgressToDownloadProgress({
        phase: "segments",
        completedSegments: 5,
        totalSegments: 10,
      }).percent,
      45,
    );
    assert.equal(
      mapHlsProgressToDownloadProgress({
        phase: "merging",
        completedSegments: 10,
        totalSegments: 10,
      }).percent,
      88,
    );
  });

  it("updates an existing task in place and keeps queue order", () => {
    const updated = upsertDownloadTask([task("first", "queued"), task("second", "downloading")], {
      ...task("first", "completed"),
      message: "已保存",
    });

    assert.deepEqual(
      updated.map((item) => [item.key, item.status, item.message]),
      [
        ["first", "completed", "已保存"],
        ["second", "downloading", undefined],
      ],
    );
  });

  it("removes only completed and failed tasks when history is cleared", () => {
    const remaining = removeFinishedDownloadTasks([
      task("queued", "queued"),
      task("active", "downloading"),
      task("done", "completed"),
      task("failed", "failed"),
    ]);

    assert.deepEqual(
      remaining.map((item) => item.key),
      ["queued", "active"],
    );
  });
});
