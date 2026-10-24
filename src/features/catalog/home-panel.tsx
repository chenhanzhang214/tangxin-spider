import { ArrowUpRight, ChevronRight, ListPlus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { VideoPreviewDialog } from "@/components/video-preview-dialog";
import { getArchivePlan } from "@/lib/tx/fns";
import { useCatalog } from "@/lib/tx/store";
import type { HomeData, NamedCount, VideoCard } from "@/lib/tx/types";
import { EmptyState } from "@/features/workspace/presentation";
import { VideoTile } from "./video-item";

export function StructurePanel({
  home,
  actors,
  tags,
}: {
  home: HomeData | null;
  actors: NamedCount[];
  tags: NamedCount[];
}) {
  const bundles = useCatalog((s) => s.bundles);
  const addArchiveItems = useCatalog((s) => s.addArchiveItems);
  const setTab = useCatalog((s) => s.setTab);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewVideo, setPreviewVideo] = useState<VideoCard | null>(null);
  const videos = useMemo(
    () => [
      ...new Map(
        (home?.sections ?? [])
          .flatMap((section) => section.videos)
          .map((video) => [video.id, video]),
      ).values(),
    ],
    [home],
  );

  useEffect(() => {
    const available = new Set(videos.map((video) => video.id));
    setSelectedIds((current) => current.filter((id) => available.has(id)));
  }, [videos]);

  function toggleVideo(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
    setMessage(null);
  }

  function toggleSection(sectionVideos: VideoCard[]) {
    const ids = new Set(sectionVideos.map((video) => video.id));
    setSelectedIds((current) =>
      sectionVideos.every((video) => current.includes(video.id))
        ? current.filter((id) => !ids.has(id))
        : [...new Set([...current, ...ids])],
    );
  }

  async function addRecommendations() {
    if (busy || selectedIds.length === 0) return;
    setBusy(true);
    try {
      const items = await getArchivePlan({
        data: { videos: videos.filter((video) => selectedIds.includes(video.id)), bundles },
      });
      const existing = new Set(
        bundles.flatMap((bundle) => bundle.videos.map((video) => `${bundle.name}\0${video.id}`)),
      );
      const added = items.filter((item) => !existing.has(`${item.actor}\0${item.video.id}`)).length;
      addArchiveItems(items);
      setSelectedIds([]);
      setMessage(
        added
          ? `已加入 ${added} 部作品，并按演员整理到归档。`
          : "所选作品已在归档中，无需重复添加。",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加入归档失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mb-2 text-xs font-medium tracking-widest text-accent">你的本地作品库</p>
          <h2 className="text-3xl leading-tight font-semibold tracking-tight text-fg">
            发现，预览，再收藏。
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            从首页推荐开始，把喜欢的作品整理到自己的目录。
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
            <span>
              <strong className="mr-1.5 font-mono font-medium text-fg">{videos.length}</strong>
              部推荐
            </span>
            <span>
              <strong className="mr-1.5 font-mono font-medium text-fg">{actors.length}</strong>
              位演员
            </span>
            <span>
              <strong className="mr-1.5 font-mono font-medium text-fg">{tags.length}</strong>个标签
            </span>
          </div>
        </div>
        <Button variant="ghost" onClick={() => setTab("discover")}>
          <Search className="size-4" />
          探索更多
          <ArrowUpRight className="size-4" />
        </Button>
      </section>
      <div className="selection-toolbar sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface px-4 py-2 shadow-sm">
        <p className="text-sm text-muted">
          首页推荐 <span className="mx-2 text-faint">/</span>
          <span className="font-medium text-fg">已选 {selectedIds.length}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedIds(videos.map((video) => video.id))}
            disabled={!videos.length || busy}
          >
            全选首页
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedIds([])}
            disabled={!selectedIds.length || busy}
          >
            清空
          </Button>
          <Button
            size="sm"
            onClick={() => void addRecommendations()}
            disabled={!selectedIds.length || busy}
          >
            <ListPlus className="size-4" />
            {busy ? "整理中…" : "加入爬取"}
          </Button>
        </div>
      </div>
      {message && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-elevated px-4 py-3 text-sm text-fg"
        >
          <span>{message}</span>
          {bundles.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setTab("result")}>
              查看归档
              <ChevronRight className="size-4" />
            </Button>
          )}
        </div>
      )}
      {home?.sections.map((section) => (
        <section key={section.title}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-fg">
              {section.title}
              <span className="ml-3 font-mono text-xs font-normal text-muted">
                {section.videos.length} 部
              </span>
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleSection(section.videos)}
              disabled={!section.videos.length || busy}
            >
              {section.videos.length > 0 &&
              section.videos.every((video) => selectedIds.includes(video.id))
                ? "取消本栏"
                : "全选本栏"}
            </Button>
          </div>
          <div className="video-grid grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {section.videos.map((video) => (
              <VideoTile
                key={video.id}
                video={video}
                selected={selectedIds.includes(video.id)}
                onToggle={toggleVideo}
                onPreview={setPreviewVideo}
              />
            ))}
          </div>
          {!section.videos.length && <EmptyState message="本栏暂时没有推荐作品。" />}
        </section>
      ))}
      {!videos.length && (
        <EmptyState message="暂时没有推荐内容。可前往“发现”搜索作品，或刷新后重试。" />
      )}
      <VideoPreviewDialog video={previewVideo} onClose={() => setPreviewVideo(null)} />
    </div>
  );
}
