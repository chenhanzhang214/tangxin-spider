import { ChevronRight, Loader2, Play, Search } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getActorPage } from "@/lib/tx/fns";
import { mergeVideos, useCatalog } from "@/lib/tx/store";
import { PAGE_SIZE, type VideoCard } from "@/lib/tx/types";
import { SectionTitle } from "@/features/workspace/presentation";
import { wait } from "@/features/workspace/helpers";

export function CrawlPanel() {
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
          选择演员与读取页数，整理他们的作品；完成后可前往归档预览或下载。
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
                  aria-pressed={on}
                  className={cn(
                    "flex h-12 w-full items-center justify-between px-4 text-left text-sm",
                    on ? "bg-elevated text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-sm border text-xs",
                        on ? "border-accent bg-accent text-accent-fg" : "border-line-strong",
                      )}
                    >
                      {on ? "✓" : ""}
                    </span>
                    <span className="truncate">{actor.name}</span>
                  </span>
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
        <p className="text-sm font-medium text-fg">任务动态</p>
        <div
          aria-live="polite"
          className="mt-4 flex max-h-96 flex-col gap-3 overflow-auto text-xs leading-relaxed text-muted"
        >
          {logs.length === 0 && <p className="py-8 text-center">选择演员后，开始整理作品。</p>}
          {logs.map((line) => (
            <p key={line.t + line.msg}>{line.msg}</p>
          ))}
        </div>
      </aside>
    </div>
  );
}
