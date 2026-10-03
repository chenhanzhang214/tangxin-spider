import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, RefreshCw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type Hls from "hls.js";
import { Button } from "@/components/ui/button";
import { videoPreviewUrl } from "@/lib/tx/preview";
import type { VideoCard } from "@/lib/tx/types";

export function VideoPreviewDialog({
  video,
  onClose,
}: {
  video: VideoCard | null;
  onClose: () => void;
}) {
  const triggerRef = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root
      open={Boolean(video)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-player/80" />
        <Dialog.Content
          className="video-preview-dialog fixed top-1/2 left-1/2 z-50 flex w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-y-auto rounded-lg border border-line bg-surface text-fg shadow-xl focus:outline-none"
          onOpenAutoFocus={() => {
            triggerRef.current = document.activeElement as HTMLElement | null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus({ preventScroll: true });
          }}
        >
          {video && (
            <>
              <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line p-4">
                <div className="min-w-0">
                  <p className="text-xs text-accent">视频预览</p>
                  <Dialog.Title className="mt-1 line-clamp-2 break-words font-display text-lg text-fg">
                    {video.title}
                  </Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm text-muted">
                    @{video.actor || "未分类演员"} · {video.duration || "时长未知"}
                  </Dialog.Description>
                </div>
                <Dialog.Close asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label="关闭视频预览"
                    className="size-11 shrink-0 p-0"
                  >
                    <X className="size-5" />
                  </Button>
                </Dialog.Close>
              </header>
              <PreviewPlayer key={video.id} video={video} />
              <p className="shrink-0 border-t border-line px-4 py-3 text-xs leading-relaxed text-muted">
                预览不会保存 MP4。确认内容后，关闭预览并勾选作品归档下载。
              </p>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function PreviewPlayer({ video }: { video: VideoCard }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const media = videoRef.current;
    if (!media) return;
    let hls: Hls | undefined;
    let disposed = false;
    setStatus("loading");
    setError("");

    const markError = (message: string) => {
      if (disposed) return;
      clearTimeout(timeout);
      hls?.stopLoad();
      media.pause();
      setStatus("error");
      setError(message);
    };
    const ready = () => {
      if (disposed) return;
      clearTimeout(timeout);
      setStatus("ready");
    };
    const mediaError = () => markError("当前视频无法播放，请重试或选择其他作品。");
    const buffering = () => {
      if (!disposed) setStatus((current) => (current === "error" ? current : "loading"));
    };
    media.addEventListener("canplay", ready);
    media.addEventListener("playing", ready);
    media.addEventListener("waiting", buffering);
    media.addEventListener("error", mediaError);
    const timeout = setTimeout(() => markError("视频加载超时，请检查网络后重试。"), 30_000);

    void (async () => {
      const { default: HlsModule } = await import("hls.js");
      if (disposed) return;
      if (HlsModule.isSupported()) {
        hls = new HlsModule({
          enableWorker: true,
          maxBufferLength: 20,
          maxMaxBufferLength: 30,
          backBufferLength: 10,
        });
        hls.on(HlsModule.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          markError(
            data.type === HlsModule.ErrorTypes.NETWORK_ERROR
              ? "视频源暂时不可用，请检查网络后重试。"
              : "当前视频无法解码，请重试或选择其他作品。",
          );
        });
        hls.loadSource(videoPreviewUrl(video.id));
        hls.attachMedia(media);
      } else if (media.canPlayType("application/vnd.apple.mpegurl")) {
        media.src = videoPreviewUrl(video.id);
      } else {
        markError("当前环境不支持视频预览。");
      }
    })().catch(() => markError("预览播放器加载失败，请重试。"));

    return () => {
      disposed = true;
      clearTimeout(timeout);
      media.removeEventListener("canplay", ready);
      media.removeEventListener("playing", ready);
      media.removeEventListener("waiting", buffering);
      media.removeEventListener("error", mediaError);
      hls?.destroy();
      media.pause();
      media.removeAttribute("src");
      media.load();
    };
  }, [video.id, attempt]);

  return (
    <div className="relative bg-player text-player-fg" aria-busy={status === "loading"}>
      <video
        ref={videoRef}
        className="video-preview-media aspect-video w-full object-contain"
        controls
        autoPlay
        muted
        playsInline
        preload="metadata"
        poster={videoPreviewUrl(video.id, "cover.jpg")}
        aria-label={`预览：${video.title}`}
      />
      {status === "loading" && (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <span className="inline-flex items-center gap-2 rounded-md bg-player/80 px-3 py-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            正在缓冲…
          </span>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-player/90 p-4 text-center">
          <p role="alert" className="text-sm">
            {error}
          </p>
          <Button type="button" onClick={() => setAttempt((value) => value + 1)}>
            <RefreshCw className="size-4" />
            重试预览
          </Button>
        </div>
      )}
    </div>
  );
}
