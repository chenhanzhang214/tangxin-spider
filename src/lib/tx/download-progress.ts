export type DownloadTaskStatus = "queued" | "downloading" | "completed" | "failed";

export type DownloadTaskPhase =
  "preparing" | "segments" | "merging" | "remuxing" | "checking" | "completed" | "failed";

export type DownloadProgressUpdate = {
  phase: Exclude<DownloadTaskPhase, "completed" | "failed">;
  percent: number;
  message: string;
  completedSegments?: number;
  totalSegments?: number;
};

export type HlsPrefetchProgressSnapshot = {
  phase: "playlist" | "segments" | "merging";
  completedSegments: number;
  totalSegments: number;
};

export type DownloadTask = {
  key: string;
  videoId: string;
  actor: string;
  index: number;
  title: string;
  status: DownloadTaskStatus;
  progress?: number;
  phase?: DownloadTaskPhase;
  completedSegments?: number;
  totalSegments?: number;
  groupId?: string;
  message?: string;
  path?: string;
};

export type DownloadTaskUpdate = Partial<Omit<DownloadTask, "key">>;

export type DownloadQueueSummary = {
  total: number;
  queued: number;
  downloading: number;
  completed: number;
  failed: number;
  finished: number;
  percent: number;
};

function clampProgress(value: number | undefined) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value as number))) : 0;
}

export function downloadTaskProgress(task: Pick<DownloadTask, "status" | "progress">) {
  return task.status === "completed" ? 100 : clampProgress(task.progress);
}

export function mapHlsProgressToDownloadProgress(
  progress: HlsPrefetchProgressSnapshot,
): DownloadProgressUpdate {
  const completedSegments = Math.max(0, Math.floor(progress.completedSegments));
  const totalSegments = Math.max(0, Math.floor(progress.totalSegments));
  if (progress.phase === "playlist") {
    return {
      phase: "preparing",
      percent: 4,
      message: "已读取 HLS 播放列表，准备下载分片…",
      completedSegments,
      totalSegments,
    };
  }
  if (progress.phase === "merging") {
    return {
      phase: "merging",
      percent: 88,
      message: `分片已下载 ${completedSegments}/${totalSegments}，正在合并…`,
      completedSegments,
      totalSegments,
    };
  }
  const ratio = totalSegments === 0 ? 0 : Math.min(1, completedSegments / totalSegments);
  return {
    phase: "segments",
    percent: 5 + Math.round(ratio * 80),
    message: `正在下载 HLS 分片 ${Math.min(completedSegments, totalSegments)}/${totalSegments}…`,
    completedSegments: Math.min(completedSegments, totalSegments),
    totalSegments,
  };
}

export function summarizeDownloadTasks(tasks: readonly DownloadTask[]): DownloadQueueSummary {
  const summary = tasks.reduce(
    (result, task) => {
      result[task.status] += 1;
      return result;
    },
    {
      queued: 0,
      downloading: 0,
      completed: 0,
      failed: 0,
    } as Pick<DownloadQueueSummary, "queued" | "downloading" | "completed" | "failed">,
  );
  const total = tasks.length;
  const finished = summary.completed + summary.failed;
  const progressTotal = tasks.reduce(
    (totalProgress, task) =>
      totalProgress + (task.status === "failed" ? 100 : downloadTaskProgress(task)),
    0,
  );

  return {
    total,
    ...summary,
    finished,
    percent: total === 0 ? 0 : Math.round(progressTotal / total),
  };
}

export function upsertDownloadTask(
  tasks: readonly DownloadTask[],
  next: DownloadTask,
): DownloadTask[] {
  const index = tasks.findIndex((task) => task.key === next.key);
  if (index < 0) return [...tasks, next];

  const updated = [...tasks];
  updated[index] = next;
  return updated;
}

export function removeFinishedDownloadTasks(tasks: readonly DownloadTask[]): DownloadTask[] {
  return tasks.filter((task) => task.status !== "completed" && task.status !== "failed");
}

export function downloadTaskKey(videoId: string, actor: string, index: number) {
  return `${videoId}::${actor}::${index}`;
}
