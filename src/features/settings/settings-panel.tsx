import {
  AlertTriangle,
  Check,
  Copy,
  FolderOpen,
  FolderTree,
  HardDrive,
  Loader2,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  Tablet,
  Wifi,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCatalog } from "@/lib/tx/store";
import {
  DEFAULT_DOWNLOAD_DIRECTORY,
  isValidDownloadDirectory,
  normalizeDownloadDirectory,
  persistDownloadDirectory,
} from "@/lib/tx/download-settings";
import { SectionTitle } from "@/features/workspace/presentation";
import { isDownloadTaskActive } from "@/features/downloads/batch";

export function SettingsPanel() {
  const directory = useCatalog((s) => s.downloadDirectory);
  const setDownloadDirectory = useCatalog((s) => s.setDownloadDirectory);
  const downloadTasks = useCatalog((s) => s.downloadTasks);
  const activeDownloads = downloadTasks.filter(isDownloadTaskActive).length;
  const [draft, setDraft] = useState(directory);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const [canChooseDirectory, setCanChooseDirectory] = useState(false);
  const [choosingDirectory, setChoosingDirectory] = useState(false);
  const [lanIps, setLanIps] = useState<string[]>([]);
  const [lanPort, setLanPort] = useState(8080);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  useEffect(() => {
    setCanChooseDirectory(Boolean(window.tangxinDesktop?.selectDownloadDirectory));
    fetch("/api/files?dir=1")
      .then((r) => r.json())
      .then((data: { root?: string; localIps?: string[]; port?: number }) => {
        if (data?.localIps) setLanIps(data.localIps);
        if (data?.port) setLanPort(data.port);
        if (data?.root && !directory) {
          setDownloadDirectory(data.root);
          setDraft(data.root);
        }
      })
      .catch(() => {});
  }, [directory, setDownloadDirectory]);

  useEffect(() => {
    setDraft(directory);
  }, [directory]);

  async function saveDirectory(nextValue = draft) {
    const normalized = normalizeDownloadDirectory(nextValue);
    if (!isValidDownloadDirectory(normalized)) {
      setFeedback({ message: "请输入绝对路径，例如 E:\\Videos\\spider。", error: true });
      return;
    }
    if (useCatalog.getState().downloadTasks.some(isDownloadTaskActive)) {
      setFeedback({ message: "下载任务进行中，请完成后再修改目录。", error: true });
      return;
    }
    if (!persistDownloadDirectory(normalized)) {
      setFeedback({ message: "设置保存失败，请检查本机存储权限。", error: true });
      return;
    }
    setDownloadDirectory(normalized);
    setDraft(normalized);
    try {
      await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ downloadDir: normalized }),
      });
    } catch {
      // offline fallback
    }
    setFeedback({ message: "下载目录已保存，之后的新任务会写入这里。" });
  }

  function copyLanUrl(url: string) {
    void navigator.clipboard?.writeText(url).then(() => {
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    });
  }

  function restoreDefault() {
    setDraft(DEFAULT_DOWNLOAD_DIRECTORY);
    setFeedback({ message: "默认目录已填入，点击“保存设置”后生效。" });
  }

  async function chooseDirectory() {
    const desktop = window.tangxinDesktop;
    if (!desktop || choosingDirectory || activeDownloads > 0) return;
    setChoosingDirectory(true);
    setFeedback(null);
    try {
      const selected = await desktop.selectDownloadDirectory(draft);
      if (selected !== null) saveDirectory(selected);
    } catch {
      setFeedback({ message: "无法打开文件夹选择窗口，请重试。", error: true });
    } finally {
      setChoosingDirectory(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionTitle kicker="设置" title="本机偏好" />
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            这些设置只影响当前电脑上的下载行为。目录会保存在本机，下次打开程序仍会保留。
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted">
          <Settings className="size-3.5 text-accent" />
          本机设置
        </span>
      </section>

      <section className="rounded-lg border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-elevated text-accent">
              <HardDrive className="size-5" />
            </div>
            <div>
              <h3 className="font-display text-xl text-fg">MP4 下载目录</h3>
              <p className="mt-1 text-sm text-muted">
                完成转封装后，文件会自动按演员创建子文件夹。
              </p>
            </div>
          </div>
          {activeDownloads > 0 && (
            <span className="inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs text-accent">
              <Loader2 className="size-3.5 animate-spin" />
              {activeDownloads} 个任务进行中
            </span>
          )}
        </div>

        <label className="mt-7 block" htmlFor="download-directory">
          <span className="text-sm text-fg">保存位置</span>
          <span className="mt-1 block text-xs leading-relaxed text-muted">
            点击“选择文件夹”即可设置保存位置，也可以填写绝对路径或网络共享路径。
          </span>
        </label>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <FolderOpen className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
            <input
              id="download-directory"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setFeedback(null);
              }}
              spellCheck={false}
              autoComplete="off"
              disabled={activeDownloads > 0 || choosingDirectory}
              className="h-11 w-full rounded-md border border-line bg-bg pr-3 pl-10 font-mono text-sm text-fg outline-none placeholder:text-faint focus:border-line-strong focus:ring-2 focus:ring-accent/30"
              placeholder={DEFAULT_DOWNLOAD_DIRECTORY}
              aria-describedby="download-directory-help"
            />
          </div>
          <Button
            type="button"
            onClick={() => void chooseDirectory()}
            disabled={!canChooseDirectory || activeDownloads > 0 || choosingDirectory}
            title={canChooseDirectory ? "选择 MP4 保存文件夹" : "文件夹选择窗口在桌面版中可用"}
          >
            {choosingDirectory ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FolderOpen className="size-4" />
            )}
            {choosingDirectory ? "选择中…" : "选择文件夹"}
          </Button>
          <Button
            type="button"
            onClick={() => saveDirectory()}
            disabled={activeDownloads > 0 || choosingDirectory}
          >
            <Save className="size-4" />
            保存设置
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={restoreDefault}
            disabled={activeDownloads > 0 || choosingDirectory}
          >
            <RotateCcw className="size-4" />
            恢复默认
          </Button>
        </div>
        <p id="download-directory-help" className="mt-3 break-all font-mono text-xs text-faint">
          当前生效：{directory}
        </p>
        {feedback && (
          <p
            className={cn("mt-3 text-sm", feedback.error ? "text-clay" : "text-accent")}
            role="status"
          >
            {feedback.message}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-elevated text-accent">
              <Wifi className="size-5" />
            </div>
            <div>
              <h3 className="font-display text-xl text-fg">局域网开放与共享</h3>
              <p className="mt-1 text-sm text-muted">
                服务已对局域网开放。同一 Wi-Fi 下的 iPad、手机或电脑可直接通过浏览器访问全部功能。
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs text-accent">
            <span className="size-2 rounded-full bg-accent animate-pulse" />
            局域网端口已监听
          </span>
        </div>

        <div className="mt-6 flex flex-col gap-3">
          <p className="text-xs text-muted">局域网访问地址（在 iPad Safari 中输入）：</p>
          {lanIps.length > 0 ? (
            <div className="flex flex-col gap-2">
              {lanIps.map((ip) => {
                const url = `http://${ip}:${lanPort}`;
                const isCopied = copiedUrl === url;
                return (
                  <div
                    key={ip}
                    className="flex items-center justify-between gap-3 rounded-md border border-line bg-bg px-4 py-3 font-mono text-sm text-fg"
                  >
                    <div className="flex items-center gap-2">
                      <Tablet className="size-4 text-accent" />
                      <span>{url}</span>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => copyLanUrl(url)}
                      title="复制访问地址"
                    >
                      {isCopied ? <Check className="size-3.5 text-accent" /> : <Copy className="size-3.5" />}
                      {isCopied ? "已复制" : "复制"}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-md border border-line bg-bg px-4 py-3 font-mono text-sm text-muted">
              http://[电脑局域网IP]:{lanPort}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-md border border-line/60 bg-bg/50 p-3 text-xs leading-relaxed text-muted">
          💡 <strong className="text-fg">iPad 协同模式：</strong>
          iPad 访问后可进行选片、爬取和点击下载。视频将调用电脑上的 ffmpeg 无损转封装并自动保存到电脑的下载文件夹中。
          下载完成后，在 iPad 上的「媒体库」标签页中可直接在线流畅播放，或点击下载按钮保存到 iPad 的“文件”App 中。
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <SettingNote
          icon={FolderTree}
          title="按演员归档"
          detail="目录\演员名\视频标题.mp4，标题和演员名会自动处理为安全文件名。"
        />
        <SettingNote
          icon={ShieldCheck}
          title="完整性检查"
          detail="ffmpeg 完成后会检查 MP4 索引，未完成的临时文件不会覆盖成品。"
        />
        <SettingNote
          icon={AlertTriangle}
          title="只影响新任务"
          detail="修改目录不会移动旧文件；正在下载时会暂时锁定设置。"
        />
      </section>
    </div>
  );
}

export function SettingNote({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <article className="rounded-lg border border-line bg-surface p-4">
      <Icon className="size-4 text-accent" strokeWidth={1.8} />
      <h3 className="mt-4 text-sm font-medium text-fg">{title}</h3>
      <p className="mt-2 text-xs leading-relaxed text-muted">{detail}</p>
    </article>
  );
}
