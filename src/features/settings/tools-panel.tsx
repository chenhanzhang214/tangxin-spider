import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useCatalog } from "@/lib/tx/store";
import { SectionTitle } from "@/features/workspace/presentation";

export function ScriptPanel() {
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
