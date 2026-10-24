import {
  CheckCircle2,
  Download,
  ExternalLink,
  HardDrive,
  Loader2,
  PackageOpen,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { VideoPreviewDialog } from "@/components/video-preview-dialog";
import { VideoArtwork } from "./video-item";
import { getPlaylist } from "@/lib/tx/fns";
import { downloadTaskKey, summarizeDownloadTasks } from "@/lib/tx/download-progress";
import { useCatalog } from "@/lib/tx/store";
import { formatActorTree } from "@/lib/tx/parse";
import { sanitizeFilename } from "@/lib/tx/mp4-utils";
import { type VideoCard } from "@/lib/tx/types";
import { SectionTitle } from "@/features/workspace/presentation";
import { saveBlob } from "@/features/workspace/helpers";
import { runMp4Batch } from "@/features/downloads/batch";
import {
  type FfmpegUiState,
  requestMp4File,
  downloadProgressPatch,
  makeMp4DownloadTask,
  isDownloadTaskActive,
} from "@/features/downloads/batch";
import { DownloadQueuePanel } from "@/features/downloads/download-queue";

export function ResultPanel() {
  const [previewVideo, setPreviewVideo] = useState<VideoCard | null>(null);
  const bundles = useCatalog((s) => s.bundles);
  const setTab = useCatalog((s) => s.setTab);
  const downloadDirectory = useCatalog((s) => s.downloadDirectory);
  const tree = useMemo(() => formatActorTree(bundles, "m3u8"), [bundles]);
  const mp4Tasks = useMemo(
    () =>
      bundles.flatMap((bundle) =>
        bundle.videos.map((video, index) => ({
          actor: bundle.name,
          index: index + 1,
          video,
        })),
      ),
    [bundles],
  );
  const [ffmpeg, setFfmpeg] = useState<FfmpegUiState>({ status: "checking" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const downloadTasks = useCatalog((s) => s.downloadTasks);
  const upsertDownloadTask = useCatalog((s) => s.upsertDownloadTask);
  const upsertDownloadTasks = useCatalog((s) => s.upsertDownloadTasks);
  const updateDownloadTask = useCatalog((s) => s.updateDownloadTask);
  const clearFinishedDownloads = useCatalog((s) => s.clearFinishedDownloads);
  const downloadSummary = useMemo(() => summarizeDownloadTasks(downloadTasks), [downloadTasks]);
  const hasActiveDownloads = downloadSummary.queued > 0 || downloadSummary.downloading > 0;
  const batchActive = downloadTasks.some(
    (task) => task.groupId && (task.status === "queued" || task.status === "downloading"),
  );

  const checkFfmpeg = useCallback(async () => {
    setFfmpeg({ status: "checking" });
    try {
      const response = await fetch("/api/mp4?status=1", { cache: "no-store" });
      const payload = (await response.json()) as {
        available?: boolean;
        version?: string;
        hlsConcurrency?: number;
        error?: string;
      };
      setFfmpeg({
        status: payload.available ? "available" : "missing",
        version: payload.version,
        hlsConcurrency: payload.hlsConcurrency,
        error: payload.error,
      });
    } catch (err) {
      setFfmpeg({
        status: "error",
        error: err instanceof Error ? err.message : "无法检测 ffmpeg",
      });
    }
  }, []);

  useEffect(() => {
    void checkFfmpeg();
  }, [checkFfmpeg]);

  function downloadTree() {
    saveBlob(tree, "catalog.txt", "text/plain;charset=utf-8");
  }

  function downloadJson() {
    const payload: Record<string, VideoCard[]> = {};
    for (const b of bundles) payload[b.name] = b.videos;
    saveBlob(JSON.stringify(payload, null, 2), "catalog.json", "application/json");
  }

  async function downloadPlaylist(video: VideoCard, index: number, actor: string) {
    setBusyId(`playlist:${video.id}`);
    setMessage(null);
    try {
      const { playlist } = await getPlaylist({ data: { id: video.id } });
      saveBlob(
        playlist,
        `${sanitizeFilename(actor)}-${index}.m3u8`,
        "application/vnd.apple.mpegurl",
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "播放列表下载失败");
    } finally {
      setBusyId(null);
    }
  }

  async function downloadMp4(video: VideoCard, index: number, actor: string) {
    if (ffmpeg.status !== "available") {
      setMessage("当前电脑还没有可用的 ffmpeg，请先安装后点击刷新检测。 ");
      return;
    }
    const key = downloadTaskKey(video.id, actor, index);
    const targetDirectory = downloadDirectory;
    const current = downloadTasks.find((task) => task.key === key);
    if (isDownloadTaskActive(current)) return;
    clearFinishedDownloads();
    upsertDownloadTask(makeMp4DownloadTask(video, index, actor, "downloading"));
    setMessage(
      `正在使用 ${ffmpeg.hlsConcurrency ?? 8} 路并发下载 HLS 分片，随后自动无损转封装并检查 MP4…`,
    );
    try {
      const saved = await requestMp4File(video, index, actor, targetDirectory, (progress) =>
        updateDownloadTask(key, downloadProgressPatch(progress)),
      );
      updateDownloadTask(key, {
        status: "completed",
        progress: 100,
        phase: "completed",
        message: saved.message,
        path: saved.path,
      });
      setMessage(saved.message);
    } catch (err) {
      const error = err instanceof Error ? err.message : "MP4 下载失败";
      updateDownloadTask(key, { status: "failed", phase: "failed", message: error });
      setMessage(error);
    }
  }

  async function openCatCatch(video: VideoCard, index: number, actor: string) {
    const actionId = `catcatch:${video.id}`;
    setBusyId(actionId);
    setMessage(null);
    try {
      const response = await fetch("/api/cat-catch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: video.id, actor, index, title: video.title }),
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        CatCatchOpenResult | { error?: string } | null;
      if (!response.ok) {
        const error = payload && "error" in payload ? payload.error : undefined;
        throw new Error(error || `猫抓解析器打开失败（${response.status}）`);
      }
      if (!payload || !("ok" in payload) || !payload.ok) {
        throw new Error("Chrome 已启动，但没有确认猫抓解析器");
      }
      setMessage(`${payload.message}${payload.version ? ` · 猫抓 ${payload.version}` : ""}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "猫抓解析器打开失败");
    } finally {
      setBusyId(null);
    }
  }

  async function downloadAllMp4(tasks: typeof mp4Tasks) {
    if (ffmpeg.status !== "available" || tasks.length === 0 || hasActiveDownloads) return;
    await runMp4Batch({
      items: tasks,
      targetDirectory: downloadDirectory,
      concurrency: ffmpeg.hlsConcurrency ?? 8,
      groupId: `batch-${Date.now()}`,
      clearFinishedDownloads,
      upsertDownloadTasks,
      updateDownloadTask,
      setMessage,
    });
  }

  if (bundles.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-surface px-5 py-10 text-center">
        <p className="text-sm text-muted">还没有归档。先到「爬取」选演员再跑一遍。</p>
        <Button type="button" className="mt-5" variant="subtle" onClick={() => setTab("crawl")}>
          去爬取
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionTitle kicker="归档" title="按演员归档" />
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="subtle" onClick={downloadTree}>
            <Download className="size-4" />
            catalog.txt
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={downloadJson}>
            catalog.json
          </Button>
        </div>
      </div>
      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-xs tracking-widest text-faint uppercase">mp4</p>
              {ffmpeg.status === "available" && (
                <span className="inline-flex items-center gap-1 text-xs text-accent">
                  <CheckCircle2 className="size-3.5" />
                  ffmpeg 可用{ffmpeg.version ? ` · ${ffmpeg.version}` : ""}
                  {ffmpeg.hlsConcurrency ? ` · ${ffmpeg.hlsConcurrency} 路分片` : ""}
                </span>
              )}
              {ffmpeg.status === "checking" && (
                <span className="inline-flex items-center gap-1 text-xs text-muted">
                  <Loader2 className="size-3.5 animate-spin" />
                  检测中
                </span>
              )}
              {(ffmpeg.status === "missing" || ffmpeg.status === "error") && (
                <span className="inline-flex items-center gap-1 text-xs text-clay">
                  <XCircle className="size-3.5" />
                  未就绪
                </span>
              )}
            </div>
            <h3 className="mt-1 text-xl font-semibold text-fg">保存到你的作品库</h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              先预览，再保存为 MP4。作品按演员归类，文件名保留视频标题；也可使用猫抓打开外部解析器。
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-line bg-bg/40 px-3 py-2 text-xs text-muted">
              <HardDrive className="size-3.5 shrink-0 text-accent" />
              <span className="shrink-0">当前目录</span>
              <code className="min-w-0 break-all text-fg">{downloadDirectory}</code>
              <Button type="button" size="sm" variant="ghost" onClick={() => setTab("settings")}>
                修改
              </Button>
            </div>
            {(ffmpeg.status === "missing" || ffmpeg.status === "error") && (
              <p className="mt-2 text-sm leading-relaxed text-clay">
                {ffmpeg.error || "请安装 ffmpeg 并加入 PATH，或设置 FFMPEG_PATH 后重启启动器。"}
              </p>
            )}
            {message && (
              <p className="mt-2 text-sm leading-relaxed text-muted" aria-live="polite">
                {message}
              </p>
            )}
            {hasActiveDownloads && (
              <p className="mt-2 font-mono text-xs text-accent" aria-live="polite">
                综合进度 {downloadSummary.percent}% · {downloadSummary.finished}/
                {downloadSummary.total} 个作品已结束
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={ffmpeg.status !== "available" || hasActiveDownloads}
              onClick={() => void downloadAllMp4(mp4Tasks)}
            >
              {hasActiveDownloads ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <PackageOpen className="size-4" />
              )}
              全部本机 MP4
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={ffmpeg.status === "checking" || batchActive}
              onClick={() => void checkFfmpeg()}
              title="重新检测本机 ffmpeg"
            >
              <RefreshCw className="size-4" />
              刷新
            </Button>
          </div>
        </div>
      </section>
      {downloadTasks.length > 0 && (
        <DownloadQueuePanel
          tasks={downloadTasks}
          summary={downloadSummary}
          onClear={clearFinishedDownloads}
        />
      )}
      <details className="rounded-lg border border-line bg-surface px-4 py-3">
        <summary className="min-h-6 text-sm text-muted">查看归档清单</summary>
        <pre className="mt-3 overflow-auto font-mono text-xs leading-6 whitespace-pre-wrap text-muted">
          {tree}
        </pre>
      </details>
      <VideoPreviewDialog video={previewVideo} onClose={() => setPreviewVideo(null)} />
      {bundles.map((bundle) => (
        <section key={bundle.slug} className="rounded-xl border border-line bg-surface p-4">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-xl text-fg">演员: {bundle.name}</h3>
              <p className="mt-1 font-mono text-xs text-faint">
                {bundle.videos.length} 条{bundle.listed ? ` / 源站 ${bundle.listed}` : ""}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="subtle"
              disabled={ffmpeg.status !== "available" || hasActiveDownloads}
              onClick={() =>
                void downloadAllMp4(
                  bundle.videos.map((video, index) => ({
                    actor: bundle.name,
                    index: index + 1,
                    video,
                  })),
                )
              }
            >
              <PackageOpen className="size-4" />
              此演员 MP4
            </Button>
          </header>
          <ol className="mt-4 flex flex-col">
            {bundle.videos.map((video, i) => {
              const downloadTask = downloadTasks.find(
                (task) => task.key === downloadTaskKey(video.id, bundle.name, i + 1),
              );
              const downloadBusy = isDownloadTaskActive(downloadTask);
              return (
                <li
                  key={video.id}
                  className="flex flex-col gap-2 border-t border-line py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-4">
                    <VideoArtwork compact video={video} onPreview={setPreviewVideo} />
                    <div className="min-w-0">
                      <p
                        title={video.title}
                        className="line-clamp-2 break-words text-sm font-medium text-fg"
                      >
                        {video.title}
                      </p>
                      <p className="mt-2 text-xs text-muted">
                        {video.duration || "时长未知"} · MP4
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={busyId === `catcatch:${video.id}` || batchActive}
                      onClick={() => void openCatCatch(video, i + 1, bundle.name)}
                      title="调用本机 Chrome 打开猫抓 M3U8 解析器"
                    >
                      {busyId === `catcatch:${video.id}` ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <ExternalLink className="size-4" />
                      )}
                      猫抓解析
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="subtle"
                      disabled={ffmpeg.status !== "available" || downloadBusy || batchActive}
                      onClick={() => void downloadMp4(video, i + 1, bundle.name)}
                      title="使用本机 ffmpeg 转封装为 MP4"
                    >
                      {downloadBusy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : downloadTask?.status === "completed" ? (
                        <CheckCircle2 className="size-4" />
                      ) : downloadTask?.status === "failed" ? (
                        <XCircle className="size-4" />
                      ) : (
                        <Download className="size-4" />
                      )}
                      MP4
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busyId === `playlist:${video.id}` || batchActive}
                      onClick={() => void downloadPlaylist(video, i + 1, bundle.name)}
                    >
                      {busyId === `playlist:${video.id}` ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Download className="size-4" />
                      )}
                      播放列表
                    </Button>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

export type CatCatchOpenResult = {
  ok: true;
  version?: string;
  message: string;
};
