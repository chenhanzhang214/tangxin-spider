import {
  ChevronRight,
  CheckCircle2,
  Hash,
  Loader2,
  RefreshCw,
  Search,
  Tag,
  XCircle,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Button } from "@/components/ui/button";
import { VideoPreviewDialog } from "@/components/video-preview-dialog";
import { cn } from "@/lib/utils";
import { getTagPage, searchVideos } from "@/lib/tx/fns";
import { getArchivePlan } from "@/lib/tx/fns";
import { summarizeDownloadTasks } from "@/lib/tx/download-progress";
import { mergeVideos, useCatalog } from "@/lib/tx/store";
import { PAGE_SIZE, type NamedCount, type VideoCard } from "@/lib/tx/types";
import { SectionTitle } from "@/features/workspace/presentation";
import { wait } from "@/features/workspace/helpers";
import { DiscoveryResultCard } from "@/features/catalog/discovery-results";
import { type FfmpegUiState, runMp4Batch } from "@/features/downloads/batch";
import { DownloadQueuePanel } from "@/features/downloads/download-queue";

export function DiscoveryPanel() {
  const tags = useCatalog((s) => s.tags);
  const bundles = useCatalog((s) => s.bundles);
  const addArchiveItems = useCatalog((s) => s.addArchiveItems);
  const downloadDirectory = useCatalog((s) => s.downloadDirectory);
  const downloadTasks = useCatalog((s) => s.downloadTasks);
  const upsertDownloadTasks = useCatalog((s) => s.upsertDownloadTasks);
  const updateDownloadTask = useCatalog((s) => s.updateDownloadTask);
  const clearFinishedDownloads = useCatalog((s) => s.clearFinishedDownloads);
  const setTab = useCatalog((s) => s.setTab);
  const [tagFilter, setTagFilter] = useState("");
  const [selectedTag, setSelectedTag] = useState<NamedCount | null>(null);
  const [tagPages, setTagPages] = useState(2);
  const [tagVideos, setTagVideos] = useState<VideoCard[]>([]);
  const [tagTotal, setTagTotal] = useState(0);
  const [tagLoading, setTagLoading] = useState(false);
  const [tagMessage, setTagMessage] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchLimit, setSearchLimit] = useState(40);
  const [searchItems, setSearchItems] = useState<VideoCard[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [selectedSearchIds, setSelectedSearchIds] = useState<string[]>([]);
  const [ffmpeg, setFfmpeg] = useState<FfmpegUiState>({ status: "checking" });
  const [archiveBusy, setArchiveBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [previewVideo, setPreviewVideo] = useState<VideoCard | null>(null);
  const downloadSummary = useMemo(() => summarizeDownloadTasks(downloadTasks), [downloadTasks]);
  const hasActiveDownloads = downloadSummary.queued > 0 || downloadSummary.downloading > 0;
  const filteredTags = useMemo(() => {
    const query = tagFilter.trim().toLowerCase();
    return tags
      .filter(
        (tag) =>
          !query ||
          tag.name.toLowerCase().includes(query) ||
          tag.slug.toLowerCase().includes(query),
      )
      .slice(0, 80);
  }, [tagFilter, tags]);

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

  async function loadTagVideos() {
    if (!selectedTag || tagLoading) return;
    setTagLoading(true);
    setTagMessage(null);
    setMessage(null);
    setTagVideos([]);
    setSelectedTagIds([]);
    try {
      let name = selectedTag.name;
      let total = selectedTag.count;
      let videos: VideoCard[] = [];
      const pages = Math.max(1, Math.min(20, tagPages));
      for (let page = 1; page <= pages; page += 1) {
        const result = await getTagPage({ data: { slug: selectedTag.slug, page } });
        name = result.name || name;
        total = result.total || total;
        videos = mergeVideos(videos, result.videos);
        setTagMessage(`${name}：已读取第 ${page} 页，得到 ${videos.length} 条作品。`);
        if (!result.hasNext) break;
        await wait(280);
      }
      setTagTotal(total);
      setTagVideos(videos);
      setTagMessage(`${name}：共读取 ${videos.length} 条作品，可勾选后归档下载。`);
    } catch (err) {
      setTagMessage(`标签读取失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setTagLoading(false);
    }
  }

  async function runSearch() {
    const query = searchQuery.trim();
    if (!query || searchLoading) return;
    setSearchLoading(true);
    setSearchMessage(null);
    setMessage(null);
    setSearchItems([]);
    setSelectedSearchIds([]);
    try {
      const result = await searchVideos({
        data: { query, limit: Math.max(1, Math.min(100, searchLimit)) },
      });
      setSearchTotal(result.total);
      setSearchItems(result.videos);
      setSearchMessage(
        result.videos.length > 0
          ? `找到 ${result.total} 条结果，当前载入 ${result.videos.length} 条。`
          : `没有找到“${query}”相关作品。`,
      );
    } catch (err) {
      setSearchMessage(`搜索失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setSearchLoading(false);
    }
  }

  function toggleSelection(id: string, setter: Dispatch<SetStateAction<string[]>>) {
    setter((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function archiveAndDownload(source: "tag" | "search") {
    if (ffmpeg.status !== "available") {
      setMessage("当前电脑还没有可用的 ffmpeg，请先安装后点击刷新检测。");
      return;
    }
    if (hasActiveDownloads || archiveBusy) return;
    const videos = source === "tag" ? tagVideos : searchItems;
    const selectedIds = source === "tag" ? selectedTagIds : selectedSearchIds;
    const selectedVideos = videos.filter((video) => selectedIds.includes(video.id));
    if (selectedVideos.length === 0) {
      setMessage("请先在结果列表中至少勾选一个作品。");
      return;
    }
    const targetDirectory = downloadDirectory;
    const label =
      source === "tag" ? `标签“${selectedTag?.name ?? ""}”` : `搜索“${searchQuery.trim()}”`;
    setArchiveBusy(source);
    setMessage(null);
    try {
      const items = await getArchivePlan({ data: { videos: selectedVideos, bundles } });
      addArchiveItems(items);
      await runMp4Batch({
        items,
        targetDirectory,
        concurrency: ffmpeg.hlsConcurrency ?? 8,
        groupId: `discover-${source}-${Date.now()}`,
        clearFinishedDownloads,
        upsertDownloadTasks,
        updateDownloadTask,
        setMessage,
      });
    } catch (err) {
      setMessage(`${label}归档失败：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setArchiveBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <SectionTitle kicker="发现" title="按标签或搜索归档" />
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted">
            标签适合按栏目分页读取，搜索适合快速定位作品。先预览确认，再勾选结果归档下载，程序会继续按演员创建子文件夹。
          </p>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs text-faint">
          {ffmpeg.status === "available" ? (
            <span className="inline-flex items-center gap-1 text-accent">
              <CheckCircle2 className="size-3.5" />
              ffmpeg 可用 · {ffmpeg.hlsConcurrency ?? 8} 路
            </span>
          ) : ffmpeg.status === "checking" ? (
            <span className="inline-flex items-center gap-1 text-muted">
              <Loader2 className="size-3.5 animate-spin" />
              检测中
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-clay">
              <XCircle className="size-3.5" />
              ffmpeg 未就绪
            </span>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={() => void checkFfmpeg()}>
            <RefreshCw className="size-3.5" />
            刷新
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs tracking-widest text-faint uppercase">tag archive</p>
              <h3 className="mt-1 flex items-center gap-2 font-display text-xl text-fg">
                <Hash className="size-5 text-accent" />
                按标签
              </h3>
              <p className="mt-1 text-sm text-muted">选一个标签，读取前几页后批量归档。</p>
            </div>
            {selectedTag && (
              <span className="rounded-full border border-line px-2.5 py-1 text-xs text-accent">
                {selectedTag.name}
              </span>
            )}
          </div>
          <label className="relative mt-4 block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
            <input
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
              placeholder="筛选标签名"
              aria-label="筛选标签名"
              className="h-10 w-full rounded-md border border-line bg-bg/40 pr-3 pl-10 text-sm text-fg outline-none placeholder:text-faint focus:ring-2 focus:ring-accent/40"
            />
          </label>
          <div className="mt-3 flex max-h-52 flex-wrap content-start gap-2 overflow-auto">
            {filteredTags.map((tag) => (
              <button
                key={tag.slug}
                type="button"
                onClick={() => {
                  setSelectedTag(tag);
                  setTagVideos([]);
                  setSelectedTagIds([]);
                  setTagMessage(null);
                }}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs transition-colors",
                  selectedTag?.slug === tag.slug
                    ? "border-accent bg-elevated text-fg"
                    : "border-line text-muted hover:border-line-strong hover:text-fg",
                )}
              >
                {tag.name} <span className="ml-1 font-mono text-faint">{tag.count}</span>
              </button>
            ))}
            {filteredTags.length === 0 && (
              <p className="py-4 text-sm text-faint">没有匹配的标签。</p>
            )}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex h-10 items-center gap-2 rounded-md border border-line bg-bg/40 px-3 text-sm text-muted">
              页数
              <input
                type="number"
                min={1}
                max={20}
                value={tagPages}
                onChange={(event) => setTagPages(Number(event.target.value) || 1)}
                className="h-7 w-14 rounded-sm border border-line bg-elevated px-2 font-mono text-fg outline-none"
              />
              <span className="text-faint">× {PAGE_SIZE}</span>
            </label>
            <Button
              type="button"
              disabled={!selectedTag || tagLoading}
              onClick={() => void loadTagVideos()}
            >
              {tagLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Tag className="size-4" />
              )}
              {tagLoading ? "读取中" : "读取标签作品"}
            </Button>
          </div>
          {tagMessage && (
            <p className="mt-3 text-xs leading-relaxed text-muted" aria-live="polite">
              {tagMessage}
            </p>
          )}
          {tagTotal > 0 && (
            <p className="mt-1 font-mono text-xs text-faint">源站约 {tagTotal} 条作品</p>
          )}
        </section>

        <section className="rounded-xl border border-line bg-surface p-4">
          <div>
            <p className="font-mono text-xs tracking-widest text-faint uppercase">site search</p>
            <h3 className="mt-1 flex items-center gap-2 font-display text-xl text-fg">
              <Search className="size-5 text-accent" />
              搜索作品
            </h3>
            <p className="mt-1 text-sm text-muted">输入标题、演员或关键词，找到想收藏的作品。</p>
          </div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void runSearch();
                }}
                placeholder="搜索作品标题或演员"
                aria-label="搜索作品标题或演员"
                className="h-10 w-full rounded-md border border-line bg-bg/40 pr-3 pl-10 text-sm text-fg outline-none placeholder:text-faint focus:ring-2 focus:ring-accent/40"
              />
            </label>
            <Button
              type="button"
              disabled={!searchQuery.trim() || searchLoading}
              onClick={() => void runSearch()}
            >
              {searchLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              {searchLoading ? "搜索中" : "搜索"}
            </Button>
          </div>
          <label className="mt-3 flex h-10 w-fit items-center gap-2 rounded-md border border-line bg-bg/40 px-3 text-sm text-muted">
            载入结果
            <input
              type="number"
              min={1}
              max={100}
              value={searchLimit}
              onChange={(event) => setSearchLimit(Number(event.target.value) || 1)}
              className="h-7 w-16 rounded-sm border border-line bg-elevated px-2 font-mono text-fg outline-none"
            />
            <span className="text-faint">条</span>
          </label>
          {searchMessage && (
            <p className="mt-3 text-xs leading-relaxed text-muted" aria-live="polite">
              {searchMessage}
            </p>
          )}
          {searchTotal > 0 && (
            <p className="mt-1 font-mono text-xs text-faint">源站匹配 {searchTotal} 条</p>
          )}
        </section>
      </div>

      {tagVideos.length > 0 && (
        <DiscoveryResultCard
          title={`标签结果 · ${selectedTag?.name ?? ""}`}
          videos={tagVideos}
          selectedIds={selectedTagIds}
          onToggle={(id) => toggleSelection(id, setSelectedTagIds)}
          onSelectAll={() => setSelectedTagIds(tagVideos.map((video) => video.id))}
          onClear={() => setSelectedTagIds([])}
          onArchive={() => void archiveAndDownload("tag")}
          onPreview={setPreviewVideo}
          archiveBusy={archiveBusy === "tag"}
          disabled={hasActiveDownloads || archiveBusy !== null || ffmpeg.status !== "available"}
          resultNote={`${selectedTagIds.length}/${tagVideos.length} 已选择`}
        />
      )}

      {searchItems.length > 0 && (
        <DiscoveryResultCard
          title="搜索结果"
          videos={searchItems}
          selectedIds={selectedSearchIds}
          onToggle={(id) => toggleSelection(id, setSelectedSearchIds)}
          onSelectAll={() => setSelectedSearchIds(searchItems.map((video) => video.id))}
          onClear={() => setSelectedSearchIds([])}
          onArchive={() => void archiveAndDownload("search")}
          onPreview={setPreviewVideo}
          archiveBusy={archiveBusy === "search"}
          disabled={hasActiveDownloads || archiveBusy !== null || ffmpeg.status !== "available"}
          resultNote={`${selectedSearchIds.length}/${searchItems.length} 已选择`}
        />
      )}

      {message && (
        <p
          className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-muted"
          aria-live="polite"
        >
          {message}
        </p>
      )}
      {downloadTasks.length > 0 && (
        <DownloadQueuePanel
          tasks={downloadTasks}
          summary={downloadSummary}
          onClear={clearFinishedDownloads}
        />
      )}
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
        <span>
          归档目录：<code className="break-all text-fg">{downloadDirectory}</code>
        </span>
        <Button type="button" size="sm" variant="ghost" onClick={() => setTab("result")}>
          查看归档
          <ChevronRight className="size-4" />
        </Button>
      </div>
      <VideoPreviewDialog video={previewVideo} onClose={() => setPreviewVideo(null)} />
    </div>
  );
}
