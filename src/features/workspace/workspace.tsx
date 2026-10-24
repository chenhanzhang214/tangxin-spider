import {
  Clapperboard,
  FolderTree,
  Info,
  LayoutDashboard,
  Moon,
  Search,
  Settings,
  Terminal,
  Sun,
  Download,
  ChevronRight,
  Film,
  RefreshCw,
  FolderCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useCatalog, type TabId } from "@/lib/tx/store";
import { loadDownloadDirectory } from "@/lib/tx/download-settings";
import { useTheme } from "@/lib/theme-context";
import { StructurePanel } from "@/features/catalog/home-panel";
import { CrawlPanel } from "@/features/catalog/crawl-panel";
import { DiscoveryPanel } from "@/features/catalog/discovery-panel";
import { ResultPanel } from "@/features/catalog/archive-panel";
import { MediaPanel } from "@/features/catalog/media-panel";
import { SettingsPanel } from "@/features/settings/settings-panel";
import { AboutPanel } from "@/features/settings/about-panel";
import { ScriptPanel } from "@/features/settings/tools-panel";
import type { HomeData, NamedCount } from "@/lib/tx/types";
import { APP_VERSION } from "@/lib/version";

export type WorkspaceData = {
  home: HomeData | null;
  actors: NamedCount[];
  tags: NamedCount[];
  error: string | null;
};
const TABS: { id: TabId; label: string; description: string; icon: LucideIcon }[] = [
  { id: "map", label: "概览", description: "首页推荐", icon: LayoutDashboard },
  { id: "discover", label: "发现", description: "标签与搜索", icon: Search },
  { id: "crawl", label: "爬取", description: "演员作品", icon: Clapperboard },
  { id: "result", label: "归档", description: "作品与下载", icon: FolderTree },
  { id: "media", label: "媒体库", description: "已下载作品", icon: FolderCheck },
  { id: "script", label: "工具", description: "导出与脚本", icon: Terminal },
  { id: "settings", label: "设置", description: "本机偏好", icon: Settings },
  { id: "about", label: "关于", description: "版本与作者", icon: Info },
];

export function Home({ data }: { data: WorkspaceData }) {
  const tab = useCatalog((s) => s.tab);
  const setTab = useCatalog((s) => s.setTab);
  const hydrateMeta = useCatalog((s) => s.hydrateMeta);
  const setDownloadDirectory = useCatalog((s) => s.setDownloadDirectory);
  const home = useCatalog((s) => s.home);
  const actors = useCatalog((s) => s.actors);
  const tags = useCatalog((s) => s.tags);
  const activeDownloads = useCatalog(
    (s) =>
      s.downloadTasks.filter((task) => task.status === "queued" || task.status === "downloading")
        .length,
  );
  const { theme, toggleTheme } = useTheme();
  const contentRef = useRef<HTMLElement>(null);
  const currentTab = TABS.find((item) => item.id === tab) ?? TABS[0];
  useEffect(() => {
    if (data.home) hydrateMeta(data.home, data.actors, data.tags);
  }, [data, hydrateMeta]);
  useEffect(() => {
    setDownloadDirectory(loadDownloadDirectory());
    fetch("/api/files?dir=1")
      .then((r) => r.json())
      .then((res: { root?: string }) => {
        if (res?.root) setDownloadDirectory(res.root);
      })
      .catch(() => {});
  }, [setDownloadDirectory]);
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, left: 0 });
  }, [tab]);

  return (
    <div className="app-shell h-dvh overflow-hidden bg-bg">
      <div className="mx-auto flex h-full min-h-0 max-w-[1920px] overflow-hidden">
        <aside
          aria-label="侧边栏"
          className="hidden h-full min-h-0 w-56 shrink-0 flex-col overflow-hidden border-r border-line bg-surface px-4 py-6 md:flex"
        >
          <div className="shrink-0 px-2">
            <BrandLockup />
          </div>
          <div
            data-scroll-region="sidebar"
            className="mt-9 min-h-0 flex-1 overflow-y-auto overscroll-contain"
          >
            <p className="mb-3 px-3 text-[11px] font-medium tracking-widest text-muted">
              媒体工作区
            </p>
            <AppNav tab={tab} setTab={setTab} />
          </div>
          <div className="mt-5 shrink-0 border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setTab("result")}
              className="flex min-h-12 w-full items-center gap-3 rounded-md px-3 text-left hover:bg-elevated"
            >
              <Download className="size-4 text-accent" />
              <div className="flex-1">
                <p className="text-xs font-medium text-fg">
                  {activeDownloads ? `${activeDownloads} 项任务进行中` : "下载队列"}
                </p>
                <p className="mt-1 text-[11px] text-muted">
                  {activeDownloads ? "查看作品进度" : "准备好收藏下一部作品"}
                </p>
              </div>
              <ChevronRight className="size-3.5 text-muted" />
            </button>
            <div className="mt-4 flex items-center justify-between px-3 text-[11px] text-muted">
              <span>chenhz</span>
              <span className="font-mono">v{APP_VERSION}</span>
            </div>
          </div>
        </aside>
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="shrink-0 border-b border-line bg-surface">
            <div className="flex min-h-20 items-center justify-between gap-3 px-4 sm:px-8">
              <div className="md:hidden">
                <BrandLockup compact />
              </div>
              <div className="hidden items-center gap-3 text-sm md:flex">
                <span className="text-muted">工作区</span>
                <ChevronRight className="size-3.5 text-faint" />
                <h1 className="font-medium text-fg">{currentTab.label}</h1>
              </div>
              <div className="flex items-center gap-2">
                <span className="mr-3 hidden items-center gap-2 text-xs text-muted sm:inline-flex">
                  <span className="size-1.5 rounded-full bg-accent" />
                  本地工作区
                </span>
                <button
                  type="button"
                  onClick={() => setTab("discover")}
                  className="toolbar-icon"
                  aria-label="搜索作品"
                >
                  <Search className="size-[18px]" />
                </button>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="toolbar-icon"
                  aria-label={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
                >
                  {theme === "dark" ? (
                    <Sun className="size-[18px]" />
                  ) : (
                    <Moon className="size-[18px]" />
                  )}
                </button>
              </div>
            </div>
            <div className="overflow-x-auto px-4 pb-3 md:hidden">
              <AppNav tab={tab} setTab={setTab} compact />
            </div>
          </header>
          <main
            ref={contentRef}
            tabIndex={0}
            aria-label={`${currentTab.label}内容`}
            data-scroll-region="content"
            className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
          >
            <div className="workspace-content mx-auto w-full max-w-[1440px] px-4 py-7 sm:px-8 sm:py-8">
              {data.error && (
                <div
                  role="status"
                  className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-clay/30 bg-surface p-4 text-sm text-clay"
                >
                  <span>{data.error}</span>
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center gap-2 text-fg"
                    onClick={() => window.location.reload()}
                  >
                    <RefreshCw className="size-4" />
                    重新加载
                  </button>
                </div>
              )}
              {tab === "map" && (
                <StructurePanel
                  home={home ?? data.home}
                  actors={actors.length ? actors : data.actors}
                  tags={tags.length ? tags : data.tags}
                />
              )}
              {tab === "crawl" && <CrawlPanel />}
              {tab === "discover" && <DiscoveryPanel />}
              {tab === "result" && <ResultPanel />}
              {tab === "media" && <MediaPanel />}
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
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-accent text-accent-fg">
        <Film className="size-5" strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-base font-semibold tracking-wide text-fg">糖心图谱</p>
        {!compact && (
          <p className="mt-1 text-[10px] tracking-[0.13em] text-muted">TANGXIN LIBRARY</p>
        )}
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
      className={cn(compact ? "flex min-w-max gap-1" : "flex flex-col gap-1")}
      aria-label="工作区导航"
    >
      {TABS.map((item, index) => {
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
              "flex min-h-11 items-center gap-3 rounded-md px-3 text-left text-sm transition-colors",
              compact ? "min-w-20 justify-center" : "w-full",
              !compact && index === 6 && "mt-6",
              active
                ? "bg-accent/12 font-medium text-accent"
                : "text-muted hover:bg-elevated hover:text-fg",
            )}
          >
            <Icon className="size-[18px] shrink-0" strokeWidth={1.8} />
            <span>{item.label}</span>
            {active && !compact && <span className="ml-auto size-1.5 rounded-full bg-accent" />}
          </button>
        );
      })}
    </nav>
  );
}
