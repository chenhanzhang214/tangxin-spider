import {
  Download,
  Film,
  FolderOpen,
  HardDrive,
  Loader2,
  Play,
  RefreshCw,
  User,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SectionTitle } from "@/features/workspace/presentation";
import type { ActorFolder, FileEntry } from "@/lib/tx/types";

type ViewState =
  | { kind: "list" }
  | { kind: "actor"; actor: string; files: FileEntry[] }
  | { kind: "play"; actor: string; file: FileEntry };

export function MediaPanel() {
  const [actors, setActors] = useState<ActorFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewState>({ kind: "list" });
  const [downloadRoot, setDownloadRoot] = useState("");

  const loadActors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, dirRes] = await Promise.all([
        fetch("/api/files?list=1", { cache: "no-store" }),
        fetch("/api/files?dir=1", { cache: "no-store" }),
      ]);
      if (!listRes.ok) throw new Error("加载失败");
      const data: ActorFolder[] = await listRes.json();
      setActors(data);
      if (dirRes.ok) {
        const dir = await dirRes.json();
        setDownloadRoot(dir.root ?? "");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadActors();
  }, [loadActors]);

  const totalFiles = actors.reduce((sum, a) => sum + a.count, 0);
  const totalSizeMB = Math.round(actors.reduce((sum, a) => sum + a.totalSizeMB, 0) * 10) / 10;
  const totalSizeGB = totalSizeMB >= 1024 ? Math.round((totalSizeMB / 1024) * 100) / 100 : null;

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionTitle kicker="媒体库" title="已下载视频" />
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            浏览电脑上已保存的 MP4 文件。局域网内的其他设备（如 iPad）也可以在线播放或保存到本地。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted">
            <HardDrive className="size-3.5 text-accent" />
            {totalFiles} 个视频 · {totalSizeGB ? `${totalSizeGB} GB` : `${totalSizeMB} MB`}
          </span>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setView({ kind: "list" }); void loadActors(); }}>
            <RefreshCw className="size-4" />
            刷新
          </Button>
        </div>
      </section>

      {downloadRoot && (
        <div className="flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-2.5 text-xs text-muted">
          <FolderOpen className="size-3.5 shrink-0 text-faint" />
          <span className="break-all font-mono">{downloadRoot}</span>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20 text-muted">
          <Loader2 className="size-5 animate-spin" />
          <span className="ml-3 text-sm">正在扫描文件…</span>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-clay/30 bg-surface p-4 text-sm text-clay">
          {error}
        </div>
      )}

      {!loading && !error && view.kind === "list" && (
        <ActorGrid actors={actors} onSelect={(actor) => setView({ kind: "actor", actor: actor.actor, files: actor.files })} />
      )}

      {view.kind === "actor" && (
        <ActorFileList
          actor={view.actor}
          files={view.files}
          onBack={() => setView({ kind: "list" })}
          onPlay={(file) => setView({ kind: "play", actor: view.actor, file })}
        />
      )}

      {view.kind === "play" && (
        <VideoPlayer
          actor={view.actor}
          file={view.file}
          onBack={() => setView({ kind: "actor", actor: view.actor, files: actors.find((a) => a.actor === view.actor)?.files ?? [] })}
        />
      )}
    </div>
  );
}

function ActorGrid({ actors, onSelect }: { actors: ActorFolder[]; onSelect: (actor: ActorFolder) => void }) {
  if (actors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center text-muted">
        <Film className="size-10 text-faint" />
        <p className="mt-4 text-sm">还没有已下载的视频</p>
        <p className="mt-1 text-xs text-faint">在"归档"标签中选择作品开始下载</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {actors.map((actor) => (
        <button
          key={actor.actor}
          type="button"
          onClick={() => onSelect(actor)}
          className="group flex items-center gap-4 rounded-lg border border-line bg-surface p-4 text-left transition-colors hover:border-accent/40 hover:bg-elevated"
        >
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-elevated text-accent group-hover:bg-accent/12">
            <User className="size-5" strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-fg">{actor.actor}</p>
            <p className="mt-1 text-xs text-muted">
              {actor.count} 个视频 · {actor.totalSizeMB >= 1024 ? `${(actor.totalSizeMB / 1024).toFixed(1)} GB` : `${actor.totalSizeMB} MB`}
            </p>
          </div>
          <span className="font-mono text-2xl tabular-nums text-faint group-hover:text-accent">
            {actor.count}
          </span>
        </button>
      ))}
    </div>
  );
}

function ActorFileList({
  actor,
  files,
  onBack,
  onPlay,
}: {
  actor: string;
  files: FileEntry[];
  onBack: () => void;
  onPlay: (file: FileEntry) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button type="button" size="sm" variant="ghost" onClick={onBack}>
          ← 返回
        </Button>
        <h3 className="font-display text-xl text-fg">{actor}</h3>
        <span className="text-xs text-muted">{files.length} 个视频</span>
      </div>

      <div className="flex flex-col gap-2">
        {files.map((file) => {
          const title = file.name.replace(/\.mp4$/i, "");
          const downloadUrl = `/api/files?actor=${encodeURIComponent(actor)}&file=${encodeURIComponent(file.name)}`;

          return (
            <div
              key={file.name}
              className="group flex items-center gap-3 rounded-lg border border-line bg-surface p-3 transition-colors hover:border-accent/30"
            >
              <button
                type="button"
                onClick={() => onPlay(file)}
                className="flex size-10 shrink-0 items-center justify-center rounded-md bg-elevated text-accent transition-colors hover:bg-accent hover:text-accent-fg"
                title="播放"
              >
                <Play className="size-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg" title={title}>
                  {title}
                </p>
                <p className="mt-0.5 text-xs text-faint">
                  {file.sizeMB >= 1024 ? `${(file.sizeMB / 1024).toFixed(1)} GB` : `${file.sizeMB} MB`}
                  {" · "}
                  {new Date(file.mtime).toLocaleDateString("zh-CN")}
                </p>
              </div>
              <a
                href={downloadUrl}
                download={file.name}
                className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-fg"
                title="下载到本设备"
              >
                <Download className="size-4" />
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function VideoPlayer({
  actor,
  file,
  onBack,
}: {
  actor: string;
  file: FileEntry;
  onBack: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoUrl = `/api/files?actor=${encodeURIComponent(actor)}&file=${encodeURIComponent(file.name)}`;
  const title = file.name.replace(/\.mp4$/i, "");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button type="button" size="sm" variant="ghost" onClick={onBack}>
            ← 返回
          </Button>
          <h3 className="truncate font-display text-lg text-fg" title={title}>
            {title}
          </h3>
        </div>
        <a
          href={videoUrl}
          download={file.name}
          className="inline-flex items-center gap-2 text-xs text-accent hover:underline"
        >
          <Download className="size-3.5" />
          保存到本设备
        </a>
      </div>

      <div className="overflow-hidden rounded-lg border border-line bg-black">
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          autoPlay
          playsInline
          className="aspect-video w-full"
          preload="metadata"
        >
          您的浏览器不支持视频播放。
        </video>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted">
        <span>{actor}</span>
        <span>{file.sizeMB >= 1024 ? `${(file.sizeMB / 1024).toFixed(1)} GB` : `${file.sizeMB} MB`}</span>
        <span>{new Date(file.mtime).toLocaleString("zh-CN")}</span>
      </div>
    </div>
  );
}
