import { create } from "zustand";
import {
  removeFinishedDownloadTasks,
  upsertDownloadTask as mergeDownloadTask,
  type DownloadTask,
  type DownloadTaskUpdate,
} from "./download-progress";
import { DEFAULT_DOWNLOAD_DIRECTORY } from "./download-settings";
import { mergeArchiveItemsIntoBundles, type ArchiveItem } from "./archive-utils";
import type { ActorBundle, HomeData, NamedCount, VideoCard } from "./types";

export type TabId = "map" | "crawl" | "discover" | "result" | "script" | "settings" | "about";

type LogLine = { t: number; msg: string };

type CatalogState = {
  tab: TabId;
  setTab: (tab: TabId) => void;
  home: HomeData | null;
  actors: NamedCount[];
  tags: NamedCount[];
  selected: string[];
  toggleActor: (slug: string) => void;
  selectTop: (n: number) => void;
  clearSelected: () => void;
  maxPages: number;
  setMaxPages: (n: number) => void;
  bundles: ActorBundle[];
  upsertBundle: (bundle: ActorBundle) => void;
  addArchiveItems: (items: ArchiveItem[]) => void;
  resetBundles: () => void;
  crawling: boolean;
  setCrawling: (v: boolean) => void;
  logs: LogLine[];
  log: (msg: string) => void;
  clearLogs: () => void;
  query: string;
  setQuery: (q: string) => void;
  hydrateMeta: (home: HomeData, actors: NamedCount[], tags: NamedCount[]) => void;
  downloadTasks: DownloadTask[];
  upsertDownloadTask: (task: DownloadTask) => void;
  upsertDownloadTasks: (tasks: DownloadTask[]) => void;
  updateDownloadTask: (key: string, patch: DownloadTaskUpdate) => void;
  clearFinishedDownloads: () => void;
  downloadDirectory: string;
  setDownloadDirectory: (directory: string) => void;
};

export const useCatalog = create<CatalogState>((set, get) => ({
  tab: "map",
  setTab: (tab) => set({ tab }),
  home: null,
  actors: [],
  tags: [],
  selected: [],
  toggleActor: (slug) => {
    const cur = get().selected;
    set({
      selected: cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug],
    });
  },
  selectTop: (n) =>
    set({
      selected: get()
        .actors.slice(0, n)
        .map((a) => a.slug),
    }),
  clearSelected: () => set({ selected: [] }),
  maxPages: 2,
  setMaxPages: (n) => set({ maxPages: Math.max(1, Math.min(20, n)) }),
  bundles: [],
  upsertBundle: (bundle) =>
    set({
      bundles: [...get().bundles.filter((b) => b.slug !== bundle.slug), bundle].sort(
        (a, b) => b.videos.length - a.videos.length,
      ),
    }),
  addArchiveItems: (items) =>
    set({ bundles: mergeArchiveItemsIntoBundles(items, get().bundles) }),
  resetBundles: () => set({ bundles: [] }),
  crawling: false,
  setCrawling: (v) => set({ crawling: v }),
  logs: [],
  log: (msg) => set({ logs: [...get().logs.slice(-200), { t: Date.now(), msg }] }),
  clearLogs: () => set({ logs: [] }),
  query: "",
  setQuery: (q) => set({ query: q }),
  hydrateMeta: (home, actors, tags) => set({ home, actors, tags }),
  downloadTasks: [],
  upsertDownloadTask: (task) =>
    set({ downloadTasks: mergeDownloadTask(get().downloadTasks, task) }),
  upsertDownloadTasks: (tasks) =>
    set({
      downloadTasks: tasks.reduce(
        (current, task) => mergeDownloadTask(current, task),
        get().downloadTasks,
      ),
    }),
  updateDownloadTask: (key, patch) => {
    const current = get().downloadTasks.find((task) => task.key === key);
    if (!current) return;
    set({
      downloadTasks: mergeDownloadTask(get().downloadTasks, {
        ...current,
        ...patch,
        key,
      }),
    });
  },
  clearFinishedDownloads: () =>
    set({ downloadTasks: removeFinishedDownloadTasks(get().downloadTasks) }),
  downloadDirectory: DEFAULT_DOWNLOAD_DIRECTORY,
  setDownloadDirectory: (directory) => set({ downloadDirectory: directory }),
}));

export function mergeVideos(existing: VideoCard[], incoming: VideoCard[]) {
  const seen = new Set(existing.map((v) => v.id));
  const next = [...existing];
  for (const v of incoming) {
    if (seen.has(v.id)) continue;
    seen.add(v.id);
    next.push(v);
  }
  return next;
}
