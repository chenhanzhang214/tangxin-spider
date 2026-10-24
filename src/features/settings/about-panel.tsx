import {
  Clapperboard,
  CircleUserRound,
  Cpu,
  Hash,
  Monitor,
  Play,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import { SectionTitle } from "@/features/workspace/presentation";

export function AboutPanel() {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <SectionTitle kicker="关于" title="糖心图谱" />
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            为作品发现、预览与本地收藏而设计。作者：chenhz。
          </p>
        </div>
        <div className="font-mono text-xs text-muted">
          <span className="text-faint">VERSION </span>
          {APP_VERSION}
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
            React 负责界面，Electron 提供独立窗口；桌面版使用 Python 解析目录和规划归档，C++
            流式合并本地分片。 Node 保留网络传输、Pagefind 搜索与 HLS
            解密，FFmpeg（C）负责无损转封装。 关闭外部 Chrome 不影响本机任务；退出本应用会停止任务。
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

export function ImplementationStep({
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
