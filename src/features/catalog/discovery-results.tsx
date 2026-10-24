import { Loader2, PackageOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VideoCard } from "@/lib/tx/types";
import { VideoTile } from "./video-item";

type Props = {
  title: string;
  videos: VideoCard[];
  selectedIds: string[];
  resultNote: string;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onArchive: () => void;
  onPreview: (video: VideoCard) => void;
  archiveBusy: boolean;
  disabled: boolean;
};

export function DiscoveryResultCard({
  title,
  videos,
  selectedIds,
  onToggle,
  onSelectAll,
  onClear,
  onArchive,
  onPreview,
  archiveBusy,
  disabled,
  resultNote,
}: Props) {
  return (
    <section aria-label={title}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-fg">{title}</h3>
          <p className="mt-2 text-sm text-muted">
            {resultNote} · 已选 {selectedIds.length} 部
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" size="sm" onClick={onSelectAll} disabled={!videos.length}>
            全选
          </Button>
          <Button variant="ghost" size="sm" onClick={onClear} disabled={!selectedIds.length}>
            清空
          </Button>
          <Button size="sm" onClick={onArchive} disabled={disabled || !selectedIds.length}>
            {archiveBusy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PackageOpen className="size-4" />
            )}
            {archiveBusy ? "归档中" : "归档并下载 MP4"}
          </Button>
        </div>
      </div>
      <div
        className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
        aria-label={`${title}列表`}
      >
        {videos.map((video) => (
          <VideoTile
            key={video.id}
            video={video}
            selected={selectedIds.includes(video.id)}
            onToggle={onToggle}
            onPreview={onPreview}
          />
        ))}
      </div>
    </section>
  );
}
