import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  BookOpen,
  ChevronRight,
  Clapperboard,
  CheckCircle2,
  CircleUserRound,
  Cpu,
  Download,
  ExternalLink,
  FolderOpen,
  FolderTree,
  Hash,
  HardDrive,
  Info,
  LayoutDashboard,
  ListPlus,
  Loader2,
  Monitor,
  Moon,
  PackageOpen,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Tag,
  Terminal,
  UserRound,
  Workflow,
  XCircle,
  Sun,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Button } from "@/components/ui/button";
import { VideoPreviewDialog } from "@/components/video-preview-dialog";
import { cn } from "@/lib/utils";
import {
  getActorPage,
  getActors,
  getHome,
  getPlaylist,
  getTagPage,
  getTags,
  searchVideos,
} from "@/lib/tx/fns";
import { planArchiveItems, type ArchiveItem } from "@/lib/tx/archive-utils";
import {
  downloadTaskProgress,
  downloadTaskKey,
  summarizeDownloadTasks,
  type DownloadProgressUpdate,
  type DownloadTask,
  type DownloadTaskUpdate,
  type DownloadQueueSummary,
} from "@/lib/tx/download-progress";
import { mergeVideos, useCatalog, type TabId } from "@/lib/tx/store";
import { formatActorTree } from "@/lib/tx/parse";
import {
  DEFAULT_DOWNLOAD_DIRECTORY,
  isValidDownloadDirectory,
  loadDownloadDirectory,
  normalizeDownloadDirectory,
  persistDownloadDirectory,
} from "@/lib/tx/download-settings";
import { sanitizeFilename, sanitizeVideoTitle, videoMp4Url } from "@/lib/tx/mp4-utils";
import { readMp4Response, type Mp4SaveResult } from "@/lib/tx/mp4-progress";
import { PAGE_SIZE, type HomeData, type NamedCount, type VideoCard } from "@/lib/tx/types";
import { useTheme } from "@/lib/theme-context";

export const Route = createFileRoute("/")({
  loader: async () => {
    try {
      const [home, actors, tags] = await Promise.all([getHome(), getActors(), getTags()]);
      return { home, actors, tags, error: null as string | null };
    } catch (err) {
      return {
        home: null,
        actors: [] as NamedCount[],
        tags: [] as NamedCount[],
        error: friendlyLoadError(err),
      };
    }
  },
  component: Home,
});

const TABS: { id: TabId; label: string; description: string; icon: LucideIcon }[] = [
  { id: "map", label: "概览", description: "数据与栏目", icon: LayoutDashboard },
  { id: "crawl", label: "爬取", description: "演员与页数", icon: Clapperboard },
  { id: "discover", label: "发现", description: "标签与搜索", icon: Search },
  { id: "result", label: "归档", description: "作品与 MP4", icon: FolderTree },
  { id: "script", label: "工具", description: "脚本与命令", icon: Terminal },
  { id: "settings", label: "设置", description: "下载与本机", icon: Settings },
  { id: "about", label: "关于", description: "实现说明", icon: Info },
];

const ROUTES = [
  { path: "/", note: "首页栏目网格，Astro 静态 HTML" },
  { path: "/a/", note: "演员云 780+，按作品数排序" },
  { path: "/a/{slug}/[n]/", note: "演员作品页，每页 24，rel=next 翻页" },
  { path: "/v/{id}/", note: "播放页，内联 HLS.js + index.m3u8" },
  { path: "/tag/", note: "标签云 200+" },
  { path: "/tag/{slug}/[n]/", note: "标签作品列表" },
  { path: "/featured/[n]/", note: "精选合集" },
  { path: "/search/", note: "Pagefind 索引，由本机服务代理搜索结果" },
  { path: "/rss.xml", note: "最新更新" },
  { path: "/zh-tw/…", note: "繁中镜像路由" },
];

const MEDIA = [
  { k: "封面", v: "https://t.5gcdn.xyz/videos/{id}/cover.jpg" },
  { k: "播放列表", v: "https://t.5gcdn.xyz/videos/{id}/index.m3u8" },
  { k: "AES 密钥", v: "https://t.5gcdn.xyz/videos/{id}/enc.key" },
  { k: "分片", v: "https://t.5gcdn.xyz/videos/{id}/segN.ts" },
];

function Home() {
  const data = Route.useLoaderData();
  const tab = useCatalog((s) => s.tab);
  const setTab = useCatalog((s) => s.setTab);
  const hydrateMeta = useCatalog((s) => s.hydrateMeta);
  const setDownloadDirectory = useCatalog((s) => s.setDownloadDirectory);
  const home = useCatalog((s) => s.home);
  const actors = useCatalog((s) => s.actors);
  const tags = useCatalog((s) => s.tags);

  useEffect(() => {
    if (data.home) hydrateMeta(data.home, data.actors, data.tags);
  }, [data, hydrateMeta]);

  useEffect(() => {
    setDownloadDirectory(loadDownloadDirectory());
  }, [setDownloadDirectory]);

  const homeView = home ?? data.home;
  const actorsView = actors.length ? actors : data.actors;
  const tagsView = tags.length ? tags : data.tags;
  const currentTab = TABS.find((item) => item.id === tab) ?? TABS[0];
  const { theme, toggleTheme } = useTheme();
  const contentRef = useRef<HTMLElement>(null);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, left: 0 });
  }, [tab]);

  return (
    <div className="h-dvh overflow-hidden bg-bg">
      <div className="mx-auto flex h-full min-h-0 max-w-[1680px] overflow-hidden animate-page-in">
        <aside aria-label="侧边栏" className="hidden h-full min-h-0 w-64 shrink-0 flex-col overflow-hidden border-r border-line bg-surface/30 px-4 py-5 md:flex">
          <div className="shrink-0">
            <BrandLockup />
          </div>
          <div className="mt-8 flex shrink-0 items-center justify-between px-3">
            <p className="font-mono text-[10px] tracking-[0.18em] text-faint uppercase">工作区</p>
            <span className="rounded-full border border-line px-2 py-0.5 font-mono text-[10px] text-accent">
              本机
            </span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-scroll-region="sidebar">
            <AppNav tab={tab} setTab={setTab} />
          </div>
          <div className="mt-4 shrink-0 rounded-lg border border-line bg-bg/40 p-3">
            <div className="flex items-center gap-2 text-xs text-muted">
              <CircleUserRound className="size-4 text-accent" />
              <span>运行模式</span>
              <span className="ml-auto font-mono text-fg">本机</span>
            </div>
            <div className="mt-3 flex items-center justify-between font-mono text-[10px] text-faint">
              <span>糖心图谱</span>
              <span>v0.4.2</span>
            </div>
          </div>
        </aside>

        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="shrink-0 border-b border-line bg-bg/80">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 md:py-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="md:hidden">
                  <BrandLockup compact />
                </div>
                <div className="hidden min-w-0 md:block">
                  <p className="font-mono text-[10px] tracking-[0.18em] text-faint uppercase">
                    tangxinvlog.app / workspace
                  </p>
                  <h1 className="mt-1 truncate font-display text-2xl font-medium tracking-tight text-fg">
                    {currentTab.label}
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-5">
                <div className="hidden gap-5 font-mono text-xs text-muted sm:flex">
                  <Stat label="演员" value={actorsView.length || "—"} />
                  <Stat label="标签" value={tagsView.length || "—"} />
                  <Stat label="栏目" value={homeView?.sections.length ?? "—"} />
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted">
                  <span className="size-1.5 rounded-full bg-accent" />
                  本机模式
                </span>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="inline-flex size-9 items-center justify-center rounded-md border border-line bg-surface text-muted transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:bg-elevated hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                  aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
                  title={theme === "dark" ? "浅色模式" : "深色模式"}
                >
                  {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                </button>
              </div>
            </div>
            <div className="mx-auto max-w-6xl overflow-x-auto px-4 pb-3 sm:px-6 md:hidden">
              <AppNav tab={tab} setTab={setTab} compact />
            </div>
          </header>

          <main ref={contentRef} tabIndex={0} aria-label={`${currentTab.label}内容`} data-scroll-region="content" className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
            <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 sm:py-9">
              {data.error && (
                <p className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-clay">
                  {data.error}
                </p>
              )}
              {tab === "map" && (
                <StructurePanel home={homeView} actors={actorsView} tags={tagsView} />
              )}
              {tab === "crawl" && <CrawlPanel />}
              {tab === "discover" && <DiscoveryPanel />}
              {tab === "result" && <ResultPanel />}
              {tab === "script" && <ScriptPanel />}
              {tab === "settings" && <SettingsPanel />}
              {tab === "about" && <AboutPanel />}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function BrandLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", compact && "min-w-0")}>
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-accent text-accent-fg">
        <Workflow className="size-5" strokeWidth={2} />
      </div>
      <div className={cn("min-w-0", compact && "max-w-[150px]")}>
        <p className="truncate font-display text-lg leading-none text-fg">糖心图谱</p>
        <p className="mt-1 truncate font-mono text-[9px] tracking-[0.16em] text-faint uppercase">
          local media workspace
        </p>
      </div>
    </div>
  );
}

function AppNav({
  tab,
  setTab,
  compact = false,
}: {
  tab: TabId;
  setTab: (tab: TabId) => void;
  compact?: boolean;
}) {
  return (
    <nav
      className={cn(
        compact ? "flex min-w-max gap-1" : "mt-3 flex flex-col gap-1",
        compact && "overflow-x-auto pb-1",
      )}
      aria-label="工作区导航"
    >
      {TABS.map((item) => {
        const Icon = item.icon;
        const active = tab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            aria-current={active ? "page" : undefined}
            title={item.description}
            className={cn(
              "group flex items-center gap-3 rounded-md text-left text-sm transition-colors duration-150",
              compact ? "h-10 min-w-24 justify-center px-3" : "w-full px-3 py-2.5",
              active
                ? "bg-elevated text-fg shadow-[inset_2px_0_0_var(--color-accent)]"
                : "text-muted hover:bg-surface hover:text-fg",
            )}
          >
            <Icon
              className={cn("size-4 shrink-0", active ? "text-accent" : "text-faint")}
              strokeWidth={1.8}
            />
            <span className="truncate">{item.label}</span>
            {!compact && <span className="ml-auto text-[10px] text-faint">{item.description}</span>}
          </button>
        );
      })}
    </nav>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-faint">{label}</div>
      <div className="mt-1 font-display text-2xl text-fg tabular-nums">{value}</div>
    </div>
  );
}

function StructurePanel({
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
  const [selectedHomeIds, setSelectedHomeIds] = useState<string[]>([]);
  const [homeMessage, setHomeMessage] = useState<string | null>(null);
  const [previewVideo, setPreviewVideo] = useState<VideoCard | null>(null);
  const homeVideos = useMemo(() => {
    const unique = new Map<string, VideoCard>();
    for (const section of home?.sections ?? []) {
      for (const video of section.videos) unique.set(video.id, video);
    }
    return [...unique.values()];
  }, [home]);
  const featuredVideos =
    home?.sections.reduce((total, section) => total + section.videos.length, 0) ?? 0;
  const actorWorks = actors.reduce((total, actor) => total + actor.count, 0);

  useEffect(() => {
    const available = new Set(homeVideos.map((video) => video.id));
    setSelectedHomeIds((current) => current.filter((id) => available.has(id)));
  }, [homeVideos]);

  function toggleHomeVideo(id: string) {
    setSelectedHomeIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
    setHomeMessage(null);
  }

  function toggleHomeSection(videos: VideoCard[]) {
    const sectionIds = new Set(videos.map((video) => video.id));
    setSelectedHomeIds((current) => {
      const allSelected = videos.length > 0 && videos.every((video) => current.includes(video.id));
      if (allSelected) return current.filter((id) => !sectionIds.has(id));
      return [...new Set([...current, ...sectionIds])];
    });
    setHomeMessage(null);
  }

  function addHomeRecommendations() {
    const selected = homeVideos.filter((video) => selectedHomeIds.includes(video.id));
    if (selected.length === 0) {
      setHomeMessage("请先勾选至少一条首页推荐内容。");
      return;
    }

    const items = planArchiveItems(selected, bundles);
    const existing = new Set(
      bundles.flatMap((bundle) => bundle.videos.map((video) => `${bundle.name}\u0000${video.id}`)),
    );
    const added = items.filter(
      (item) => !existing.has(`${item.actor}\u0000${item.video.id}`),
    ).length;
    addArchiveItems(items);
    setSelectedHomeIds([]);
    setHomeMessage(
      added > 0
        ? `已把 ${added} 条首页推荐加入爬取归档，并按演员合并。`
        : "所选首页推荐已经在爬取归档中。",
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionTitle kicker="工作区概览" title="今天要处理什么？" />
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            先从演员目录选任务，再把作品归档到本机。这里展示的是当前源站数据快照和工作区状态。
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 font-mono text-xs text-muted">
          <span className="size-1.5 rounded-full bg-accent" />
          数据已接入
        </span>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={UserRound} label="演员" value={actors.length || "—"} note="可选择抓取" />
        <MetricCard icon={Tag} label="标签" value={tags.length || "—"} note="源站分类" />
        <MetricCard
          icon={BookOpen}
          label="作品线索"
          value={actorWorks || "—"}
          note="演员作品总数"
        />
        <MetricCard
          icon={Clapperboard}
          label="实时栏目"
          value={home?.sections.length ?? "—"}
          note={`${featuredVideos || "—"} 条首屏样本`}
        />
      </section>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <SectionTitle kicker="源站快照" title="首页推荐" />
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              先点击预览确认内容，再勾选首页推荐加入爬取归档；内容会按演员合并，之后可在“归档”中下载 MP4。
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="mr-1 font-mono text-xs text-faint">
              已选 {selectedHomeIds.length}/{homeVideos.length}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSelectedHomeIds(homeVideos.map((video) => video.id))}
              disabled={homeVideos.length === 0}
            >
              全选首页
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setSelectedHomeIds([])}
              disabled={selectedHomeIds.length === 0}
            >
              清空
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={addHomeRecommendations}
              disabled={selectedHomeIds.length === 0}
            >
              <ListPlus className="size-4" />
              加入爬取
            </Button>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {home?.sections.map((sec) => (
            <article key={sec.title} className="rounded-lg border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg text-fg">{sec.title}</h3>
                  <span className="mt-1 block font-mono text-xs text-faint">
                    {sec.videos.length} 条推荐 · {sec.moreHref || "首页"}
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => toggleHomeSection(sec.videos)}
                  disabled={sec.videos.length === 0}
                >
                  {sec.videos.length > 0 &&
                  sec.videos.every((video) => selectedHomeIds.includes(video.id))
                    ? "取消本栏"
                    : "全选本栏"}
                </Button>
              </div>
              <ul className="mt-3 max-h-64 overflow-auto rounded-md border border-line bg-bg/30">
                {sec.videos.map((v) => {
                  const checked = selectedHomeIds.includes(v.id);
                  return (
                    <li key={v.id} className="border-b border-line last:border-0">
                      <div
                        className={cn(
                          "flex items-start gap-3 px-3 py-2.5 transition-colors",
                          checked && "bg-elevated",
                        )}
                      >
                        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleHomeVideo(v.id)}
                            className="mt-0.5 size-4 accent-[var(--color-accent)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-fg">{v.title}</span>
                            <span className="mt-1 block truncate font-mono text-xs text-faint">
                              {v.duration || "时长未知"} · @{v.actor}
                            </span>
                          </span>
                        </label>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setPreviewVideo(v)}
                          aria-label={`预览 ${v.title}`}
                          className="h-11 shrink-0"
                        >
                          <Play className="size-3.5" />
                          预览
                        </Button>
                      </div>
                    </li>
                  );
                })}
                {sec.videos.length === 0 && (
                  <li className="px-3 py-5 text-sm text-faint">本栏暂时没有可加入的推荐。</li>
                )}
              </ul>
            </article>
          ))}
          {!home && <EmptyState message="首页数据暂时不可用，稍后可刷新重试。" />}
        </div>
        {homeMessage && (
          <div
            className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface px-4 py-3"
            aria-live="polite"
          >
            <p className="text-sm text-muted">{homeMessage}</p>
            {bundles.length > 0 && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setTab("result")}>
                查看归档
                <ChevronRight className="size-4" />
              </Button>
            )}
          </div>
        )}
      </section>

      <VideoPreviewDialog video={previewVideo} onClose={() => setPreviewVideo(null)} />

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SectionTitle kicker="目录索引" title="演员与标签" />
          <span className="font-mono text-xs text-faint">按作品数量排序</span>
        </div>
        <div className="mt-5 grid gap-6 md:grid-cols-2">
          <CloudBlock icon={UserRound} title="演员" items={actors.slice(0, 18)} />
          <CloudBlock icon={Tag} title="标签" items={tags.slice(0, 18)} />
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  note: string;
}) {
  return (
    <article className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3 text-xs text-muted">
        <span>{label}</span>
        <Icon className="size-4 text-accent" strokeWidth={1.7} />
      </div>
      <p className="mt-4 font-display text-3xl text-fg tabular-nums">{value}</p>
      <p className="mt-1 font-mono text-[10px] text-faint">{note}</p>
    </article>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-dashed border-line px-4 py-8 text-sm text-muted">
      {message}
    </p>
  );
}

function SettingsPanel() {
  const directory = useCatalog((s) => s.downloadDirectory);
  const setDownloadDirectory = useCatalog((s) => s.setDownloadDirectory);
  const downloadTasks = useCatalog((s) => s.downloadTasks);
  const activeDownloads = downloadTasks.filter(isDownloadTaskActive).length;
  const [draft, setDraft] = useState(directory);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const [canChooseDirectory, setCanChooseDirectory] = useState(false);
  const [choosingDirectory, setChoosingDirectory] = useState(false);

  useEffect(() => {
    setCanChooseDirectory(Boolean(window.tangxinDesktop?.selectDownloadDirectory));
  }, []);

  useEffect(() => {
    setDraft(directory);
  }, [directory]);

  function saveDirectory(nextValue = draft) {
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
    setFeedback({ message: "下载目录已保存，之后的新任务会写入这里。" });
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
            {choosingDirectory ? <Loader2 className="size-4 animate-spin" /> : <FolderOpen className="size-4" />}
            {choosingDirectory ? "选择中…" : "选择文件夹"}
          </Button>
          <Button type="button" onClick={() => saveDirectory()} disabled={activeDownloads > 0 || choosingDirectory}>
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

function SettingNote({
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

function AboutPanel() {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionTitle kicker="关于" title="糖心图谱是怎么工作的" />
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            这里集中放项目实现、媒体链路和本机运行说明，让“怎么实现的”不再挤在工作区操作页面里。
          </p>
        </div>
        <div className="font-mono text-xs text-muted">
          <span className="text-faint">VERSION </span>0.4.2
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.6fr)]">
        <div className="rounded-lg border border-line bg-surface p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-elevated text-accent">
              <Workflow className="size-5" />
            </div>
            <div>
              <p className="font-mono text-[10px] tracking-[0.18em] text-faint uppercase">
                implementation
              </p>
              <h3 className="mt-1 font-display text-xl text-fg">项目怎么实现的</h3>
            </div>
          </div>
          <p className="mt-5 text-sm leading-relaxed text-muted">
            图形界面使用 React、TanStack Start 和
            Vite；本地服务负责请求源站、解析演员、标签与搜索索引，并处理 MP4；Electron
            只负责提供独立桌面窗口。这样关闭网页不会中断已经交给本机服务的 MP4 任务。
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <ImplementationStep
              icon={Monitor}
              title="桌面窗口"
              detail="Electron 启动本地服务并加载应用界面，不需要手动打开浏览器。"
            />
            <ImplementationStep
              icon={Clapperboard}
              title="演员抓取"
              detail="按演员 slug 分页读取作品卡片，去重后为每条作品生成编号。"
            />
            <ImplementationStep
              icon={Hash}
              title="标签与搜索"
              detail="标签按页面读取；搜索使用源站 Pagefind 索引，结果沿用演员归档和下载队列。"
            />
            <ImplementationStep
              icon={Cpu}
              title="HLS 加速"
              detail="同时下载、解密和排序分片，默认 8 路并发；复杂列表自动回退兼容模式。"
            />
            <ImplementationStep
              icon={Play}
              title="视频预览"
              detail="HLS.js 按需加载播放分片，本地服务转发媒体解决跨域限制；关闭预览即释放播放器。"
            />
            <ImplementationStep
              icon={ShieldCheck}
              title="MP4 成品"
              detail="ffmpeg 使用无损 copy 转封装并启用 faststart，完成后检查 ftyp/moov 索引。"
            />
          </div>
        </div>
        <div className="rounded-lg border border-line bg-elevated p-5 sm:p-6">
          <p className="font-mono text-[10px] tracking-[0.18em] text-faint uppercase">workspace</p>
          <div className="mt-5 flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-full border border-line bg-surface text-accent">
              <CircleUserRound className="size-6" />
            </div>
            <div>
              <p className="text-xs text-muted">运行方式</p>
              <p className="mt-1 font-display text-2xl text-fg">本机优先</p>
            </div>
          </div>
          <div className="mt-7 border-t border-line pt-4 text-sm leading-relaxed text-muted">
            <p>本项目面向本机整理与归档，下载文件默认写入设置中的目录，并按演员自动分类。</p>
            <p className="mt-3">
              猫抓解析保留为 Chrome 扩展通道；本机 MP4 通道不依赖猫抓页面完成。
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-surface p-5 sm:p-6">
        <div className="flex items-end justify-between gap-3">
          <SectionTitle kicker="pipeline" title="一条 MP4 任务的链路" />
          <span className="hidden font-mono text-xs text-faint sm:block">
            local only / copy remux
          </span>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-5">
          {[
            ["01", "选择来源", "选择演员、标签或搜索结果"],
            ["02", "拼接 HLS", "从视频 ID 得到 index.m3u8"],
            ["03", "并发分片", "下载、解密、按顺序合并 TS"],
            ["04", "ffmpeg", "无损转封装为可播放 MP4"],
            ["05", "演员目录", "写入 演员名\\视频标题.mp4"],
          ].map(([number, title, detail]) => (
            <div key={number} className="relative rounded-md border border-line bg-bg/40 p-4">
              <p className="font-mono text-xs text-accent">{number}</p>
              <h3 className="mt-4 text-sm font-medium text-fg">{title}</h3>
              <p className="mt-2 text-xs leading-relaxed text-muted">{detail}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted">
          综合进度会结合每个作品的 HLS 分片下载、合并、ffmpeg
          转封装和完整性检查；任务列表会显示每个作品的独立百分比与分片数量。
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div>
          <SectionTitle kicker="source map" title="源站路由约定" />
          <div className="mt-5 overflow-hidden rounded-lg border border-line bg-surface">
            {ROUTES.map((row, index) => (
              <div
                key={row.path}
                className={cn(
                  "grid gap-2 px-4 py-3 sm:grid-cols-[170px_1fr]",
                  index > 0 && "border-t border-line",
                )}
              >
                <code className="break-all font-mono text-xs text-accent">{row.path}</code>
                <span className="text-sm text-muted">{row.note}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <SectionTitle kicker="media contract" title="媒体资源约定" />
          <div className="mt-5 overflow-hidden rounded-lg border border-line bg-surface">
            {MEDIA.map((row, index) => (
              <div
                key={row.k}
                className={cn(
                  "grid gap-2 px-4 py-3 sm:grid-cols-[88px_1fr]",
                  index > 0 && "border-t border-line",
                )}
              >
                <span className="text-sm text-muted">{row.k}</span>
                <code className="break-all font-mono text-xs text-fg">{row.v}</code>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function ImplementationStep({
  icon: Icon,
  title,
  detail,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border border-line bg-bg/40 p-4">
      <Icon className="size-4 text-accent" strokeWidth={1.8} />
      <h4 className="mt-3 text-sm font-medium text-fg">{title}</h4>
      <p className="mt-2 text-xs leading-relaxed text-muted">{detail}</p>
    </div>
  );
}

function CloudBlock({
  icon: Icon,
  title,
  items,
}: {
  icon: typeof UserRound;
  title: string;
  items: NamedCount[];
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center gap-2 text-sm text-muted">
        <Icon className="size-4" strokeWidth={1.75} />
        {title}
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.slug} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate text-fg">{item.name}</span>
            <span className="font-mono text-xs tabular-nums text-faint">{item.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CrawlPanel() {
  const actors = useCatalog((s) => s.actors);
  const selected = useCatalog((s) => s.selected);
  const toggleActor = useCatalog((s) => s.toggleActor);
  const selectTop = useCatalog((s) => s.selectTop);
  const clearSelected = useCatalog((s) => s.clearSelected);
  const query = useCatalog((s) => s.query);
  const setQuery = useCatalog((s) => s.setQuery);
  const maxPages = useCatalog((s) => s.maxPages);
  const setMaxPages = useCatalog((s) => s.setMaxPages);
  const crawling = useCatalog((s) => s.crawling);
  const setCrawling = useCatalog((s) => s.setCrawling);
  const log = useCatalog((s) => s.log);
  const logs = useCatalog((s) => s.logs);
  const upsertBundle = useCatalog((s) => s.upsertBundle);
  const resetBundles = useCatalog((s) => s.resetBundles);
  const setTab = useCatalog((s) => s.setTab);
  const bundles = useCatalog((s) => s.bundles);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actors;
    return actors.filter(
      (a) => a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q),
    );
  }, [actors, query]);

  async function runCrawl() {
    if (crawling || selected.length === 0) return;
    setCrawling(true);
    resetBundles();
    log(`开始爬取 ${selected.length} 位演员，每位最多 ${maxPages} 页`);
    try {
      for (const slug of selected) {
        const meta = actors.find((a) => a.slug === slug);
        let name = meta?.name ?? slug;
        let listed = meta?.count ?? 0;
        let videos: VideoCard[] = [];
        for (let page = 1; page <= maxPages; page += 1) {
          const res = await getActorPage({ data: { slug, page } });
          name = res.name || name;
          listed = res.total || listed;
          videos = mergeVideos(videos, res.videos);
          log(
            `${name} 第 ${page} 页 +${res.videos.length}，累计 ${videos.length}/${listed || "?"}`,
          );
          if (!res.hasNext) break;
          await wait(280);
        }
        upsertBundle({ name, slug, listed, videos });
      }
      log("完成。切换到「结果」查看按演员归档的作品。");
      setTab("result");
    } catch (err) {
      log(`中断：${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setCrawling(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div>
        <SectionTitle kicker="爬取" title="按演员分页抓取" />
        <p className="mt-3 text-sm leading-relaxed text-muted">
          每位演员请求 <code className="text-fg">/a/{"{slug}"}/[页]/</code>
          ，解析卡片后直接拼 HLS 地址。默认少翻页，避免压垮源站。
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="筛选演员名"
              className="h-11 w-full rounded-md border border-line bg-surface pr-3 pl-10 text-sm text-fg outline-none placeholder:text-faint focus:ring-2 focus:ring-accent/40"
            />
          </label>
          <label className="flex h-11 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm text-muted">
            页数
            <input
              type="number"
              min={1}
              max={20}
              value={maxPages}
              onChange={(e) => setMaxPages(Number(e.target.value) || 1)}
              className="h-8 w-14 rounded-sm border border-line bg-elevated px-2 font-mono text-fg outline-none"
            />
            <span className="text-faint">× {PAGE_SIZE}</span>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="subtle" onClick={() => selectTop(3)}>
            选前 3
          </Button>
          <Button type="button" size="sm" variant="subtle" onClick={() => selectTop(8)}>
            选前 8
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={clearSelected}>
            清空
          </Button>
          <span className="self-center font-mono text-xs text-faint">已选 {selected.length}</span>
        </div>
        <ul className="mt-4 max-h-96 overflow-auto rounded-xl border border-line bg-surface">
          {filtered.slice(0, 80).map((actor) => {
            const on = selected.includes(actor.slug);
            return (
              <li key={actor.slug} className="border-b border-line last:border-0">
                <button
                  type="button"
                  onClick={() => toggleActor(actor.slug)}
                  className={cn(
                    "flex h-12 w-full items-center justify-between px-4 text-left text-sm",
                    on ? "bg-elevated text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  <span className="truncate">{actor.name}</span>
                  <span className="font-mono text-xs tabular-nums text-faint">{actor.count}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-5 flex flex-wrap gap-3">
          <Button type="button" onClick={runCrawl} disabled={crawling || selected.length === 0}>
            {crawling ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                爬取中
              </>
            ) : (
              <>
                <Play className="size-4" />
                开始爬取
              </>
            )}
          </Button>
          {bundles.length > 0 && (
            <Button type="button" variant="ghost" onClick={() => setTab("result")}>
              查看结果
              <ChevronRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
      <aside className="rounded-xl border border-line bg-surface p-4">
        <p className="font-mono text-xs tracking-widest text-faint uppercase">log</p>
        <div className="mt-3 flex max-h-96 flex-col gap-2 overflow-auto font-mono text-xs leading-relaxed text-muted">
          {logs.length === 0 && <p>等待任务。</p>}
          {logs.map((line) => (
            <p key={line.t + line.msg}>{line.msg}</p>
          ))}
        </div>
      </aside>
    </div>
  );
}

function DiscoveryPanel() {
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
    const items = planArchiveItems(selectedVideos, bundles);
    if (items.length === 0) {
      setMessage("请先在结果列表中至少勾选一个作品。");
      return;
    }
    const targetDirectory = downloadDirectory;
    const label =
      source === "tag" ? `标签“${selectedTag?.name ?? ""}”` : `搜索“${searchQuery.trim()}”`;
    setArchiveBusy(source);
    setMessage(null);
    addArchiveItems(items);
    try {
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
            <p className="mt-1 text-sm text-muted">
              使用源站 Pagefind 索引，输入标题、演员或关键词。
            </p>
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

function DiscoveryResultCard({
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
}: {
  title: string;
  videos: VideoCard[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onArchive: () => void;
  onPreview: (video: VideoCard) => void;
  archiveBusy: boolean;
  disabled: boolean;
  resultNote: string;
}) {
  return (
    <section
      className="rounded-xl border border-line bg-surface p-4"
      aria-labelledby={`${title}-title`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs tracking-widest text-faint uppercase">
            archive candidates
          </p>
          <h3 id={`${title}-title`} className="mt-1 font-display text-xl text-fg">
            {title}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {resultNote} · 按演员归档，MP4 文件名使用视频标题。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onSelectAll}
            disabled={videos.length === 0}
          >
            全选
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onClear}
            disabled={selectedIds.length === 0}
          >
            清空
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onArchive}
            disabled={disabled || selectedIds.length === 0}
          >
            {archiveBusy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <PackageOpen className="size-4" />
            )}
            {archiveBusy ? "归档中" : "归档并下载 MP4"}
          </Button>
        </div>
      </div>
      <ul
        className="mt-4 max-h-[32rem] overflow-auto rounded-lg border border-line bg-bg/30"
        aria-label={`${title}列表`}
      >
        {videos.map((video) => {
          const checked = selectedIds.includes(video.id);
          return (
            <li key={video.id} className="border-b border-line last:border-0">
              <div
                className={cn(
                  "flex items-start gap-3 px-3 py-3 transition-colors",
                  checked && "bg-elevated",
                )}
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(video.id)}
                    className="mt-1 size-4 accent-[var(--color-accent)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg">{video.title}</span>
                    <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-faint">
                      <span>{video.actor}</span>
                      <span>{video.duration || "时长未知"}</span>
                      <span>ID {video.id}</span>
                    </span>
                  </span>
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onPreview(video)}
                  aria-label={`预览 ${video.title}`}
                  className="h-11 shrink-0"
                >
                  <Play className="size-3.5" />
                  预览
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type FfmpegUiState = {
  status: "checking" | "available" | "missing" | "error";
  version?: string;
  hlsConcurrency?: number;
  error?: string;
};

async function requestMp4File(
  video: VideoCard,
  index: number,
  actor: string,
  targetDirectory: string,
  onProgress?: (update: DownloadProgressUpdate) => void,
): Promise<Mp4SaveResult> {
  const response = await fetch(
    videoMp4Url(video.id, actor, index, targetDirectory, true, video.title || "未命名视频"),
    { cache: "no-store" },
  );
  return readMp4Response(response, onProgress);
}

function downloadProgressPatch(update: DownloadProgressUpdate): DownloadTaskUpdate {
  return {
    status: "downloading",
    progress: update.percent,
    phase: update.phase,
    message: update.message,
    ...(update.completedSegments !== undefined
      ? { completedSegments: update.completedSegments }
      : {}),
    ...(update.totalSegments !== undefined ? { totalSegments: update.totalSegments } : {}),
  };
}

async function runMp4Batch({
  items,
  targetDirectory,
  concurrency,
  groupId,
  clearFinishedDownloads,
  upsertDownloadTasks,
  updateDownloadTask,
  setMessage,
}: {
  items: ArchiveItem[];
  targetDirectory: string;
  concurrency: number;
  groupId: string;
  clearFinishedDownloads: () => void;
  upsertDownloadTasks: (tasks: DownloadTask[]) => void;
  updateDownloadTask: (key: string, patch: DownloadTaskUpdate) => void;
  setMessage: (message: string) => void;
}) {
  clearFinishedDownloads();
  upsertDownloadTasks(
    items.map((item) => makeMp4DownloadTask(item.video, item.index, item.actor, "queued", groupId)),
  );
  setMessage(
    `批量任务将逐个视频使用 ${concurrency} 路分片并发，完成后按演员写入“${targetDirectory}”。`,
  );

  let success = 0;
  let firstError = "";
  let firstSavedPath = "";
  for (const item of items) {
    const key = downloadTaskKey(item.video.id, item.actor, item.index);
    updateDownloadTask(key, {
      status: "downloading",
      progress: 0,
      phase: "preparing",
      message: "正在下载 HLS 分片并转封装…",
    });
    try {
      const saved = await requestMp4File(
        item.video,
        item.index,
        item.actor,
        targetDirectory,
        (progress) => updateDownloadTask(key, downloadProgressPatch(progress)),
      );
      firstSavedPath ||= saved.path;
      success += 1;
      updateDownloadTask(key, {
        status: "completed",
        progress: 100,
        phase: "completed",
        message: saved.message,
        path: saved.path,
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : "MP4 下载失败";
      firstError ||= error;
      updateDownloadTask(key, { status: "failed", phase: "failed", message: error });
    }
    await wait(250);
  }

  setMessage(
    firstError
      ? `批量下载完成：成功 ${success}/${items.length}。${firstError}`
      : `批量下载完成：${success} 个 MP4 已保存到演员子文件夹。${firstSavedPath ? ` 示例：${firstSavedPath}` : ""}`,
  );
}

type CatCatchOpenResult = {
  ok: true;
  version?: string;
  message: string;
};

function makeMp4DownloadTask(
  video: VideoCard,
  index: number,
  actor: string,
  status: DownloadTask["status"],
  groupId?: string,
): DownloadTask {
  return {
    key: downloadTaskKey(video.id, actor, index),
    videoId: video.id,
    actor,
    index,
    title: video.title,
    status,
    progress: status === "completed" ? 100 : 0,
    ...(status === "completed"
      ? { phase: "completed" as const }
      : status === "failed"
        ? { phase: "failed" as const }
        : status === "downloading"
          ? { phase: "preparing" as const }
          : {}),
    ...(groupId ? { groupId } : {}),
  };
}

function isDownloadTaskActive(task: DownloadTask | undefined) {
  return task?.status === "queued" || task?.status === "downloading";
}

function ResultPanel() {
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
    const targetDirectory = downloadDirectory;
    const groupId = `batch-${Date.now()}`;
    clearFinishedDownloads();
    const queuedTasks = tasks.map((task) =>
      makeMp4DownloadTask(task.video, task.index, task.actor, "queued", groupId),
    );
    upsertDownloadTasks(queuedTasks);
    setMessage(
      `批量任务将逐个视频使用 ${ffmpeg.hlsConcurrency ?? 8} 路分片并发，避免多个视频同时抢占带宽。`,
    );
    let success = 0;
    let firstError = "";
    let firstSavedPath = "";
    for (let i = 0; i < tasks.length; i += 1) {
      const task = tasks[i];
      if (!task) continue;
      const key = downloadTaskKey(task.video.id, task.actor, task.index);
      updateDownloadTask(key, {
        status: "downloading",
        progress: 0,
        phase: "preparing",
        message: "正在下载 HLS 分片并转封装…",
      });
      try {
        const saved = await requestMp4File(
          task.video,
          task.index,
          task.actor,
          targetDirectory,
          (progress) => updateDownloadTask(key, downloadProgressPatch(progress)),
        );
        firstSavedPath ||= saved.path;
        success += 1;
        updateDownloadTask(key, {
          status: "completed",
          progress: 100,
          phase: "completed",
          message: saved.message,
          path: saved.path,
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : "MP4 下载失败";
        firstError ||= error;
        updateDownloadTask(key, { status: "failed", phase: "failed", message: error });
      }
      await wait(250);
    }
    setMessage(
      firstError
        ? `批量下载完成：成功 ${success}/${tasks.length}。${firstError}`
        : `批量下载完成：${success} 个 MP4 已保存到演员子文件夹。${firstSavedPath ? ` 示例：${firstSavedPath}` : ""}`,
    );
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
            <h3 className="mt-1 font-display text-xl text-fg">猫抓解析 · 本机 MP4 双通道</h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              “猫抓解析”会调用本机 Chrome；本机 MP4 会先并发下载、解密并排序 HLS 分片，再由 ffmpeg
              无损转封装和检查，保存到当前目录下的演员子文件夹。复杂播放列表会自动回退到 ffmpeg
              兼容模式。
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
      <pre className="overflow-auto rounded-xl border border-line bg-surface p-4 font-mono text-xs leading-6 text-muted whitespace-pre-wrap">
        {tree}
      </pre>
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
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-accent">
                      {i + 1}.m3u8
                      <span className="ml-3 text-faint">{video.duration}</span>
                    </p>
                    <p className="truncate text-sm text-fg">{video.title}</p>
                    <p className="truncate font-mono text-xs text-faint">{video.hls}</p>
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

function DownloadQueuePanel({
  tasks,
  summary,
  onClear,
}: {
  tasks: DownloadTask[];
  summary: DownloadQueueSummary;
  onClear: () => void;
}) {
  const activity =
    summary.downloading > 0
      ? `正在处理 ${summary.downloading} 个视频`
      : summary.queued > 0
        ? `等待处理 ${summary.queued} 个视频`
        : "本轮任务已结束";

  return (
    <section
      className="rounded-xl border border-line bg-surface p-4"
      aria-labelledby="download-queue-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs tracking-widest text-faint uppercase">download queue</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <h3 id="download-queue-title" className="font-display text-xl text-fg">
              正在下载
            </h3>
            <span className="font-mono text-xs text-accent" aria-live="polite">
              {summary.finished}/{summary.total} 已完成
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            {activity} · 按每个作品的下载与转封装阶段综合计算
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={summary.finished === 0}
          onClick={onClear}
        >
          清除已完成
        </Button>
      </div>

      <div
        className="mt-4 h-2 overflow-hidden rounded-full bg-elevated"
        role="progressbar"
        aria-label="MP4 下载总进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={summary.percent}
        aria-valuetext={`${summary.percent}% 综合进度，${summary.finished} / ${summary.total} 个作品已结束`}
      >
        <div
          className={cn(
            "h-full rounded-full bg-accent transition-[width] duration-300",
            summary.downloading > 0 && "animate-pulse",
          )}
          style={{ width: `${summary.percent}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 font-mono text-xs text-faint">
        <span>{summary.percent}%</span>
        <span>
          成功 {summary.completed} · 失败 {summary.failed} · 排队 {summary.queued}
        </span>
      </div>

      <ol className="mt-4 flex max-h-96 flex-col overflow-auto" aria-label="MP4 下载列表">
        {tasks.map((task) => {
          const taskPercent = downloadTaskProgress(task);
          return (
            <li
              key={task.key}
              className="border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0"
            >
              <div className="flex min-w-0 items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-mono text-xs">
                    <span className="text-accent">
                      {task.actor} / {sanitizeVideoTitle(task.title)}.mp4
                    </span>
                    <span className={downloadTaskStatusClass(task.status)}>
                      {downloadTaskStatusLabel(task.status)}
                    </span>
                  </p>
                  <p className="mt-1 truncate text-sm text-fg">{task.title}</p>
                </div>
                <span className="shrink-0 font-mono text-sm tabular-nums text-fg">
                  {taskPercent}%
                </span>
              </div>

              <div
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-elevated"
                role="progressbar"
                aria-label={`${task.actor} ${sanitizeVideoTitle(task.title)}.mp4 下载进度`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={taskPercent}
                aria-valuetext={`${taskPercent}%`}
              >
                <div
                  className={cn(
                    "h-full rounded-full transition-[width] duration-300",
                    task.status === "failed" ? "bg-clay" : "bg-accent",
                    task.status === "downloading" && "animate-pulse",
                  )}
                  style={{ width: `${taskPercent}%` }}
                />
              </div>

              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] text-faint">
                <span>{downloadTaskPhaseLabel(task)}</span>
                {task.completedSegments !== undefined && task.totalSegments !== undefined && (
                  <span>
                    分片 {task.completedSegments}/{task.totalSegments}
                  </span>
                )}
              </div>
              {task.message && (
                <p className="mt-1 break-all text-xs leading-relaxed text-faint">{task.message}</p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function downloadTaskStatusLabel(status: DownloadTask["status"]) {
  switch (status) {
    case "queued":
      return "排队中";
    case "downloading":
      return "下载中";
    case "completed":
      return "已完成";
    case "failed":
      return "失败";
  }
}

function downloadTaskStatusClass(status: DownloadTask["status"]) {
  switch (status) {
    case "queued":
      return "text-muted";
    case "downloading":
      return "text-accent";
    case "completed":
      return "text-fg";
    case "failed":
      return "text-clay";
  }
}

function downloadTaskPhaseLabel(task: DownloadTask) {
  if (task.status === "queued") return "等待处理";
  if (task.status === "completed") return "已保存";
  if (task.status === "failed") return "处理失败";

  switch (task.phase) {
    case "preparing":
      return "准备播放列表";
    case "segments":
      return "下载 HLS 分片";
    case "merging":
      return "合并分片";
    case "remuxing":
      return "ffmpeg 转封装";
    case "checking":
      return "检查 MP4";
    default:
      return "处理中";
  }
}

function ScriptPanel() {
  const [source, setSource] = useState<string>("");
  const downloadDirectory = useCatalog((s) => s.downloadDirectory);
  useEffect(() => {
    fetch("/tangxin_crawl.py")
      .then((r) => r.text())
      .then(setSource)
      .catch(() => setSource("# 无法加载脚本"));
  }, []);
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <SectionTitle kicker="程序" title="Windows 本机" />
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            图形界面已经覆盖“抓取 → MP4 转封装 → 按演员保存”。Python
            脚本保留作批量、定时或自定义输出目录的备用方案。
          </p>
        </div>
        <Button type="button" asChild>
          <a href="/tangxin_crawl.py" download="tangxin_crawl.py">
            <Download className="size-4" />
            下载脚本
          </a>
        </Button>
      </div>

      <ol className="grid gap-3">
        {[
          {
            n: "0",
            t: "图形界面",
            d: "解压项目后双击根目录 start.bat。需已安装 Node.js LTS（勾选 Add to PATH）。程序会自动构建并打开独立的糖心图谱桌面窗口，黑窗口不要关。",
          },
          {
            n: "1",
            t: "直接在结果页下载 MP4",
            d: `完成爬取后打开“归档”，先看 ffmpeg 状态，再点单个 MP4、此演员 MP4 或全部下载 MP4。默认 8 路并发下载分片，保存到设置中的目录\\演员名\\视频标题.mp4。`,
          },
          {
            n: "2",
            t: "ffmpeg 依赖",
            d: "npm install 会安装项目自带的 Windows ffmpeg。若状态仍未就绪，可安装系统版并加入 PATH，或设置 FFMPEG_PATH 后重启启动器。",
          },
          {
            n: "3",
            t: "需要时再下载脚本",
            d: "点右上“下载脚本”获取 Python CLI，适合批量运行、定时运行或指定本地输出目录。",
          },
          {
            n: "4",
            t: "保存位置",
            d: `程序会并发下载和解密分片、按原顺序合并，再完整生成并检查 MP4，最后写入 ${downloadDirectory} 下对应的演员子文件夹；不再依赖浏览器默认下载目录。`,
          },
        ].map((step) => (
          <li key={step.n} className="rounded-lg border border-line bg-surface px-4 py-3">
            <p className="font-mono text-xs text-accent">
              {step.n} {step.t}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-muted">{step.d}</p>
          </li>
        ))}
      </ol>

      <div className="rounded-xl border border-line bg-surface p-4">
        <p className="font-mono text-xs tracking-widest text-faint uppercase">命令</p>
        <pre className="mt-3 overflow-auto font-mono text-xs leading-6 text-fg whitespace-pre-wrap">
          {`python tangxin_crawl.py --actors 饼干姐姐 --max-pages 1 --mp4
python tangxin_crawl.py --top 3 --max-pages 2 --mp4 --out D:\\tx-out`}
        </pre>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4">
        <p className="font-mono text-xs tracking-widest text-faint uppercase">mp4 在哪</p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          图形界面当前写到以下目录，并按演员创建子文件夹：
        </p>
        <pre className="mt-3 overflow-auto font-mono text-xs leading-6 text-fg whitespace-pre-wrap">
          {`${downloadDirectory}\\
  catalog.txt
  catalog.json
  饼干姐姐\\
    1.m3u8
    第一个视频标题.mp4      ← 加了 --mp4 才有
    2.m3u8
    第二个视频标题.mp4
    manifest.json`}
        </pre>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          命令结束时会打印 <code className="text-fg">已写入 …</code>，那一行就是绝对路径。 不加
          --mp4 则只有 m3u8，没有 mp4。
        </p>
      </div>

      <pre className="max-h-96 overflow-auto rounded-xl border border-line bg-surface p-4 font-mono text-xs leading-5 text-muted">
        {source || "加载中…"}
      </pre>
    </div>
  );
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div>
      <p className="font-mono text-xs tracking-[0.18em] text-faint uppercase">{kicker}</p>
      <h2 className="mt-1 font-display text-2xl font-medium tracking-tight text-fg">{title}</h2>
    </div>
  );
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function friendlyLoadError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (/fetch failed|timeout|timed out|ECONNRESET|ENETUNREACH/i.test(message)) {
    return "源站暂时不可达，请检查网络或稍后点击刷新页面重试。";
  }
  return message || "加载失败";
}

function saveBlob(content: Blob | BlobPart, filename: string, type: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
