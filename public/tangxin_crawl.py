#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""糖心Vlog (tangxinvlog.app) 按演员归档的视频爬虫。

站点是 Astro 6 静态站，没有 JSON API。目录来自 HTML：

  GET /a/                 演员云  <ul class="artist-cloud">
  GET /a/{slug}/          演员作品第 1 页，每页 24 条 <article class="card">
  GET /a/{slug}/{n}/      第 n 页；<link rel="next"> 判断是否还有下一页
  GET /v/{id}/            详情。播放器读取：
                          const m3u8 = "https://t.5gcdn.xyz/videos/{id}/index.m3u8"
  GET /tag/               标签云
  GET /featured/{n}/      精选合集
  GET /rss.xml            最新更新
  搜索                    前端 Pagefind（/pagefind/），无服务端搜索接口

媒体约定（可由 id 直接拼出，不必先打开详情）：
  封面   https://t.5gcdn.xyz/videos/{id}/cover.jpg
  播放   https://t.5gcdn.xyz/videos/{id}/index.m3u8     AES-128 HLS
  密钥   https://t.5gcdn.xyz/videos/{id}/enc.key
  分片   https://t.5gcdn.xyz/videos/{id}/segN.ts

默认只落盘「改写过绝对地址的 m3u8 播放列表」，按演员编号：

  C:\Users\Public\Videos\Tangxin/
    桥本香菜/
      1.m3u8
      2.m3u8
      manifest.json
    catalog.txt

若本机有 ffmpeg，加 --mp4 会把 HLS 转封装为可播放的标题.mp4（不重编码），
先写入临时文件，转换成功后再替换最终文件。
后缀想跟「1.mpt」命名的话，传 --ext mpt。
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

ORIGIN = "https://tangxinvlog.app"
CDN = "https://t.5gcdn.xyz"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
DEFAULT_OUTPUT_DIR = Path(r"C:\Users\Public\Videos\Tangxin")
WINDOWS_RESERVED_BASENAME = re.compile(
    r"^(?:CON|PRN|AUX|NUL|CLOCK\$|COM[1-9]|LPT[1-9])(?:\..*)?$",
    re.IGNORECASE,
)


def safe_filename(value: str, fallback: str) -> str:
    normalized = unicodedata.normalize("NFKC", value or "")
    normalized = re.sub(r'[\x00-\x1f<>:"/\\|?*]', "_", normalized)
    normalized = normalized.rstrip(". ").strip()[:100].rstrip(". ")
    if not normalized:
        normalized = fallback
    if WINDOWS_RESERVED_BASENAME.fullmatch(normalized):
        normalized = f"_{normalized}"
    return normalized


def fetch(url: str, accept: str = "text/html") -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": accept,
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Referer": ORIGIN + "/",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as res:
        return res.read().decode("utf-8", "replace")


def strip_tags(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html)).strip()


def parse_cards(html: str) -> list[dict]:
    cards: list[dict] = []
    seen: set[str] = set()
    for block in re.findall(r'<article class="card"[\s\S]*?</article>', html):
        mid = re.search(r'href="/v/(\d+)/"', block)
        if not mid or mid.group(1) in seen:
            continue
        vid = mid.group(1)
        seen.add(vid)
        title_m = re.search(
            r'<h3 class="title"[\s\S]*?<a[^>]*>([\s\S]*?)</a>', block
        )
        dur_m = re.search(r'class="duration"[^>]*>([^<]+)', block)
        nick_m = re.search(r'class="nickname"[^>]*>([\s\S]*?)</a>', block)
        href = re.search(r'href="(/a/[^"]+/)"', block)
        slug = urllib.parse.unquote(
            (href.group(1) if href else "").replace("/a/", "").strip("/")
        )
        cards.append(
            {
                "id": vid,
                "title": strip_tags(title_m.group(1) if title_m else ""),
                "duration": (dur_m.group(1) if dur_m else "").strip(),
                "actor": strip_tags(nick_m.group(1) if nick_m else "").lstrip("@"),
                "actor_slug": slug,
                "page": f"{ORIGIN}/v/{vid}/",
                "cover": f"{CDN}/videos/{vid}/cover.jpg",
                "hls": f"{CDN}/videos/{vid}/index.m3u8",
            }
        )
    return cards


def parse_actors(html: str) -> list[dict]:
    out: list[dict] = []
    for m in re.finditer(
        r'href="/a/([^"]+)/"[^>]*>[\s\S]*?class="name"[^>]*>\s*([^<]+?)\s*</span>'
        r'[\s\S]*?class="num"[^>]*>\s*(\d+)\s*</span>',
        html,
    ):
        slug = urllib.parse.unquote(m.group(1).strip("/"))
        if slug.isdigit():
            continue
        out.append({"slug": slug, "name": m.group(2).strip(), "count": int(m.group(3))})
    return out


def rewrite_playlist(vid: str, text: str) -> str:
    base = f"{CDN}/videos/{vid}/"
    lines = []
    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("#"):
            def abs_uri(m: re.Match[str]) -> str:
                uri = m.group(1)
                return f'URI="{uri if uri.startswith("http") else base + uri}"'

            s = re.sub(r'URI="([^"]+)"', abs_uri, s)
            lines.append(s)
        else:
            lines.append(s if s.startswith("http") else base + s)
    return "\n".join(lines) + "\n"


def crawl_actor(slug: str, max_pages: int, delay: float) -> tuple[str, list[dict]]:
    videos: list[dict] = []
    name = slug
    total = 0
    page = 1
    while page <= max_pages:
        quoted = urllib.parse.quote(slug)
        path = f"/a/{quoted}/" if page == 1 else f"/a/{quoted}/{page}/"
        html = fetch(ORIGIN + path)
        if page == 1:
            h1_m = re.search(r"<h1[^>]*>([\s\S]*?)</h1>", html)
            name = strip_tags(h1_m.group(1) if h1_m else slug).lstrip("@").strip() or slug
            total_m = re.search(r"共\s*(\d+)\s*部", html)
            total = int(total_m.group(1)) if total_m else 0
        batch = parse_cards(html)
        if not batch:
            break
        videos.extend(batch)
        has_next = "rel=\"next\"" in html.lower()
        print(
            f"  [{name}] p{page} +{len(batch)}  累计 {len(videos)}/{total or '?'}",
            flush=True,
        )
        if not has_next:
            break
        page += 1
        time.sleep(delay)
    uniq: list[dict] = []
    seen: set[str] = set()
    for v in videos:
        if v["id"] in seen:
            continue
        seen.add(v["id"])
        uniq.append(v)
    return name, uniq


def write_tree(
    bundles: list[tuple[str, list[dict]]],
    dest: Path,
    ext: str,
    use_title: bool = False,
) -> str:
    lines: list[str] = []
    for name, videos in bundles:
        lines.append(f"演员: {name}")
        for i, v in enumerate(videos, 1):
            filename = (
                f"{safe_filename(v['title'], '未命名视频')}.mp4"
                if use_title and ext == "mp4"
                else f"{i}.{ext}"
            )
            lines.append(f"      {filename:<10} {v['duration']:<8} {v['title']}")
        if not videos:
            lines.append("      (空)")
        lines.append("")
    text = "\n".join(lines)
    dest.write_text(text, encoding="utf-8")
    return text


def maybe_ffmpeg(m3u8: Path, mp4: Path) -> None:
    temporary = mp4.with_name(f".{mp4.name}.{uuid.uuid4().hex}.part")
    cmd = [
        "ffmpeg",
        "-y",
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-protocol_whitelist",
        "file,http,https,tcp,tls,crypto",
        "-headers",
        f"Referer: {ORIGIN}/\r\nUser-Agent: {UA}\r\n",
        "-i",
        str(m3u8),
        "-map",
        "0:v:0?",
        "-map",
        "0:a:0?",
        "-c",
        "copy",
        "-bsf:a",
        "aac_adtstoasc",
        "-movflags",
        "+faststart",
        "-f",
        "mp4",
        str(temporary),
    ]
    try:
        subprocess.run(cmd, check=True)
        if not temporary.exists() or temporary.stat().st_size < 16:
            raise RuntimeError("ffmpeg 输出了空的 MP4 文件")
        temporary.replace(mp4)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser(description="按演员爬取 tangxinvlog.app 视频目录")
    parser.add_argument(
        "--out",
        default=str(DEFAULT_OUTPUT_DIR),
        help="输出目录，默认 C:\\Users\\Public\\Videos\\Tangxin",
    )
    parser.add_argument("--actors", nargs="*", help="演员 slug，缺省则取作品数最多的若干位")
    parser.add_argument("--top", type=int, default=3, help="未指定 --actors 时取前 N 位")
    parser.add_argument("--max-pages", type=int, default=2, help="每位演员最多翻页")
    parser.add_argument("--delay", type=float, default=0.4, help="请求间隔秒")
    parser.add_argument("--mp4", action="store_true", help="调用 ffmpeg 转封装为 mp4")
    parser.add_argument("--ext", default="m3u8", help="编号文件后缀，默认 m3u8；可改成 mpt/mp4")
    args = parser.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    print("拉取演员列表 /a/ …", flush=True)
    roster = parse_actors(fetch(ORIGIN + "/a/"))
    print(f"共 {len(roster)} 位", flush=True)

    wanted = args.actors if args.actors else [a["slug"] for a in roster[: max(1, args.top)]]

    bundles: list[tuple[str, list[dict]]] = []
    catalog: dict[str, list[dict]] = {}

    for slug in wanted:
        print(f"爬取演员 {slug}", flush=True)
        name, videos = crawl_actor(slug, args.max_pages, args.delay)
        folder = out / safe_filename(name, "未分类演员")
        folder.mkdir(parents=True, exist_ok=True)
        saved: list[dict] = []
        ext = "mp4" if args.mp4 else args.ext
        for i, v in enumerate(videos, 1):
            try:
                raw = fetch(v["hls"], accept="application/vnd.apple.mpegurl,*/*")
                playlist = rewrite_playlist(v["id"], raw)
            except Exception as exc:  # noqa: BLE001 — keep going on a single miss
                print(f"    ! 播放列表 {v['id']} 失败: {exc}", file=sys.stderr)
                playlist = f"#EXTM3U\n{v['hls']}\n"
            playlist_path = folder / f"{i}.m3u8"
            playlist_path.write_text(playlist, encoding="utf-8")
            mp4_filename = f"{safe_filename(v['title'], '未命名视频')}.mp4"
            output_filename = mp4_filename if args.mp4 else f"{i}.{ext}"
            item = {**v, "file": output_filename, "playlist": str(playlist_path)}
            if args.mp4:
                mp4_path = folder / mp4_filename
                print(f"    ffmpeg {mp4_path.name}", flush=True)
                try:
                    maybe_ffmpeg(playlist_path, mp4_path)
                except (OSError, RuntimeError, subprocess.CalledProcessError) as exc:
                    print(f"    ! MP4 {v['id']} 失败: {exc}", file=sys.stderr)
                    continue
                item["mp4"] = str(mp4_path)
            elif args.ext != "m3u8":
                numbered = folder / f"{i}.{args.ext}"
                numbered.write_text(playlist, encoding="utf-8")
            saved.append(item)
            time.sleep(args.delay)
        (folder / "manifest.json").write_text(
            json.dumps({"actor": name, "slug": slug, "videos": saved}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        bundles.append((name, saved))
        catalog[name] = saved

    tree = write_tree(
        bundles,
        out / "catalog.txt",
        "mp4" if args.mp4 else args.ext,
        use_title=args.mp4,
    )
    (out / "catalog.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print("\n===== 爬取结果 =====\n")
    print(tree)
    print(f"已写入 {out.resolve()}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
