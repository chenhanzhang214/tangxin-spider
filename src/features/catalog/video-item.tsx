import { Film, Play } from "lucide-react";
import { useState } from "react";
import type { VideoCard } from "@/lib/tx/types";
import { videoPreviewUrl } from "@/lib/tx/preview";
import { cn } from "@/lib/utils";

export function VideoArtwork({
  video,
  onPreview,
  compact = false,
}: {
  video: VideoCard;
  onPreview: (video: VideoCard) => void;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => onPreview(video)}
      aria-label={`预览 ${video.title}`}
      className={cn(
        "video-artwork group relative isolate block overflow-hidden bg-elevated",
        compact ? "aspect-video w-28 shrink-0 rounded-sm" : "aspect-[16/10] w-full rounded-t-lg",
      )}
    >
      {failed ? (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted">
          <Film className="size-6" />
          {!compact && <span className="text-xs">暂无封面 · 仍可预览</span>}
        </span>
      ) : (
        <img
          src={videoPreviewUrl(video.id, "cover.jpg")}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
        />
      )}
      <span className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-sm bg-player/80 px-2 py-1 text-xs text-player-fg">
        <Play className="size-3 fill-current" />
        预览
      </span>
      {!compact && video.duration && (
        <span className="absolute right-2 bottom-2 rounded-sm bg-player/80 px-2 py-1 font-mono text-xs tabular-nums text-player-fg">
          {video.duration}
        </span>
      )}
    </button>
  );
}

/** Preview and selection are independent targets, never nested buttons/labels. */
export function VideoTile({
  video,
  selected,
  onToggle,
  onPreview,
}: {
  video: VideoCard;
  selected: boolean;
  onToggle: (id: string) => void;
  onPreview: (video: VideoCard) => void;
}) {
  return (
    <article
      className={cn(
        "video-tile min-w-0 overflow-hidden rounded-lg border bg-surface transition-colors",
        selected ? "border-accent ring-1 ring-accent/20" : "border-line hover:border-line-strong",
      )}
    >
      <VideoArtwork key={video.id} video={video} onPreview={onPreview} />
      <div className="px-3.5 pt-3 pb-2">
        <h4
          title={video.title}
          className="line-clamp-2 min-h-11 break-words text-sm leading-[1.6] font-medium text-fg"
        >
          {video.title}
        </h4>
        <div className="mt-1 flex min-w-0 items-center justify-between gap-2">
          <span className="truncate text-xs text-muted">
            {video.actor ? `@${video.actor}` : "未分类演员"}
          </span>
          <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggle(video.id)}
              aria-label={`选择 ${video.title}`}
              className="size-4 accent-[var(--color-accent)]"
            />
            {selected ? "已选择" : "选择"}
          </label>
        </div>
      </div>
    </article>
  );
}
