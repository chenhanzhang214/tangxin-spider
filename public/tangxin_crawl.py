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

  C:\\Users\\Public\\Videos\\Tangxin/
    桥本香菜/
      1.m3u8
      2.m3u8
      manifest.json
    catalog.txt

若本机有 ffmpeg，加 --mp4 会把 HLS 转封装为可播放的标题.mp4（不重编码），
先写入临时文件，转换成功后再替换最终文件。
后缀想跟「1.mpt」命名的话，传 --ext mpt。

另支持公开目录站 https://1792682274428z1281480769st1.3drxrina.com。
用 --origin 或环境变量 TX_SITE_ORIGIN 选择它时，只导出栏目目录，
不请求 videoAuth，也不生成 m3u8 / mp4。需要已安装 cryptography。
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import urllib.error
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
RXRINA_ORIGIN = "https://1792682274428z1281480769st1.3drxrina.com"
CDN = "https://t.5gcdn.xyz"
RXRINA_PAGE_SIZE = 24
# Public catalog responses use the same wrapper as the anonymous web page.
RXRINA_RESPONSE_KEY = b"C6DvClCIsrp6t5cMQRlLAxJItxt5H7WT"
RXRINA_RESPONSE_IV = b"VLMQmNqzTnq18DjXwap3HSFrW76uIHoU"
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


def canonical_origin(value: str) -> str | None:
    raw = (value or "").strip()
    if not raw:
        return ORIGIN
    parsed = urllib.parse.urlparse(raw)
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.query or parsed.fragment:
        return None
    if parsed.path not in ("", "/"):
        return None
    origin = f"https://{parsed.hostname}" if parsed.hostname else ""
    if origin in (ORIGIN, RXRINA_ORIGIN):
        return origin
    return None


def decrypt_rxrina_payload(encoded: str) -> dict:
    try:
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    except ImportError as exc:
        raise RuntimeError(
            "该内容源的目录响应使用站点公开页面的 AES 封装。请先执行 pip install cryptography，或改用程序设置中的内容源。"
        ) from exc
    cipher = Cipher(algorithms.AES(RXRINA_RESPONSE_KEY), modes.CBC(RXRINA_RESPONSE_IV[:16]))
    decryptor = cipher.decryptor()
    raw = base64.b64decode(encoded)
    padded = decryptor.update(raw) + decryptor.finalize()
    pad = padded[-1]
    if pad < 1 or pad > 16 or padded[-pad:] != bytes([pad]) * pad:
        raise RuntimeError("内容源目录无法解析")
    payload = json.loads(padded[:-pad].decode("utf-8"))
    if not isinstance(payload, dict):
        raise RuntimeError("内容源目录无法解析")
    return payload


def format_rxrina_duration(value: object) -> str:
    if isinstance(value, str) and ":" in value:
        return value.strip()
    if isinstance(value, str) and value.isdigit():
        raw = int(value)
    elif isinstance(value, int):
        raw = value
    else:
        return ""
    seconds = round(raw / 1000) if raw >= 1000 else raw
    hours, remainder = divmod(max(0, seconds), 3600)
    minutes, secs = divmod(remainder, 60)
    clock = f"{minutes:02d}:{secs:02d}"
    return f"{hours}:{clock}" if hours else f"{minutes}:{secs:02d}"


def rxrina_cover(poster: str, config: dict) -> str:
    value = poster or ""
    name_cdn = str(config.get("bufnamecdn") or "")
    image_cdn = str(config.get("resimgcdn") or "")
    domain_cdn = str(config.get("bufdomaincdn") or "")
    image_domain = str(config.get("resimgdomaincdn") or "")
    if name_cdn and image_cdn:
        value = value.replace(name_cdn, image_cdn)
    if domain_cdn and image_domain:
        value = value.replace(domain_cdn, image_domain)
    if value.startswith("//"):
        return "https:" + value
    return value


def map_rxrina_row(row: dict, origin: str, column_name: str, config: dict) -> dict | None:
    videos = row.get("movieVideos") if isinstance(row.get("movieVideos"), list) else []
    first = videos[0] if videos and isinstance(videos[0], dict) else {}
    identifier = first.get("id", row.get("id"))
    if not isinstance(identifier, int) or identifier < 0:
        if not (isinstance(identifier, str) and identifier.isdigit()):
            return None
    video_id = str(identifier)
    column = str(row.get("columnValue") or "").strip()
    if not column:
        return None
    page = urllib.parse.urljoin(
        origin + "/",
        f"column/{urllib.parse.quote(column)}/video/{urllib.parse.quote(video_id)}",
    )
    return {
        "id": video_id,
        "title": str(row.get("title") or f"视频 {video_id}"),
        "duration": format_rxrina_duration(row.get("duration")),
        "cover": rxrina_cover(str(row.get("poster") or ""), config),
        "actor": column_name or column,
        "actorSlug": column,
        "pageUrl": page,
        "hls": "",
    }


class _RejectRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        raise RuntimeError("内容源拒绝跳转到其他地址")


def rxrina_fetch(origin: str, path: str) -> dict | str:
    url = urllib.parse.urljoin(origin + "/", path.lstrip("/"))
    parsed = urllib.parse.urlparse(url)
    if f"{parsed.scheme}://{parsed.hostname}" != origin:
        raise RuntimeError("内容源地址无效")
    token = os.urandom(32).hex()
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "*/*" if path.endswith(".js") else "application/json",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.6",
            "Referer": origin + "/",
            "authwebtoken": token,
            "X-Site-Id": parsed.hostname or "",
            "version": "1",
        },
    )
    opener = urllib.request.build_opener(_RejectRedirect)
    try:
        with opener.open(request, timeout=18) as response:
            body = response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"请求失败 {exc.code} {parsed.path}") from exc
    if path.endswith(".js"):
        return body
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as exc:
        raise RuntimeError("内容源返回了无法识别的目录") from exc
    if isinstance(payload, dict) and isinstance(payload.get("x-data"), str):
        payload = decrypt_rxrina_payload(payload["x-data"])
    if not isinstance(payload, dict):
        raise RuntimeError("内容源返回了无法识别的目录")
    code = payload.get("code")
    if code == 401:
        raise RuntimeError("内容源要求登录，已停止，不会尝试绕过访问控制。")
    if isinstance(code, int) and code != 200:
        message = payload.get("msg")
        raise RuntimeError(message if isinstance(message, str) and message else f"内容源返回错误 {code}")
    return payload


def parse_rxrina_config(source: str) -> dict:
    marker = source.find("window.__SITE_CONFIG__")
    start = source.find("{", marker if marker >= 0 else 0)
    if marker < 0 or start < 0:
        raise RuntimeError("内容源配置缺少站点参数")
    depth = 0
    in_string = False
    escaped = False
    end = None
    for index, char in enumerate(source[start:], start):
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                end = index + 1
                break
    if end is None:
        raise RuntimeError("内容源配置缺少站点参数")
    payload = json.loads(source[start:end])
    if not isinstance(payload, dict):
        raise RuntimeError("内容源配置无法识别")
    return payload


def crawl_rxrina(args: argparse.Namespace, origin: str) -> int:
    if args.mp4:
        print(
            "该内容源不支持 --mp4：播放地址受 videoAuth 控制，脚本不会请求媒体。",
            file=sys.stderr,
        )
        return 2
    try:
        config_source = rxrina_fetch(origin, "/server/web/site/config.js")
        if not isinstance(config_source, str):
            raise RuntimeError("内容源配置缺少站点参数")
        config = parse_rxrina_config(config_source)
        home = rxrina_fetch(origin, "/server/web/index")
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    if not isinstance(home, dict):
        print("内容源返回了无法识别的目录", file=sys.stderr)
        return 2
    query_data = ((home.get("data") or {}) if isinstance(home.get("data"), dict) else {}).get("queryData")
    roster: list[dict[str, str]] = []
    if isinstance(query_data, list):
        for entry in query_data:
            if not isinstance(entry, dict):
                continue
            slug = str(entry.get("value") or "").strip()
            name = str(entry.get("name") or "").strip()
            if slug and name:
                roster.append({"slug": slug, "name": name})
    wanted = args.actors if args.actors else [item["slug"] for item in roster[: max(1, args.top)]]
    names = {item["slug"]: item["name"] for item in roster}
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    bundles: list[tuple[str, list[dict]]] = []
    catalog: dict[str, list[dict]] = {}
    try:
        for slug in wanted:
            name = names.get(slug, slug)
            print(f"爬取栏目 {name}", flush=True)
            videos: list[dict] = []
            seen: set[str] = set()
            page = 1
            while page <= args.max_pages:
                query = urllib.parse.urlencode(
                    {
                        "columnValue": slug,
                        "pageNum": page,
                        "pageSize": RXRINA_PAGE_SIZE,
                    }
                )
                payload = rxrina_fetch(origin, f"/server/movie/list?{query}")
                if not isinstance(payload, dict):
                    break
                rows = payload.get("rows") if isinstance(payload.get("rows"), list) else []
                added = 0
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    video = map_rxrina_row(row, origin, name, config)
                    if not video or video["id"] in seen:
                        continue
                    seen.add(video["id"])
                    videos.append(video)
                    added += 1
                total = payload.get("total") if isinstance(payload.get("total"), int) else 0
                print(f"  [{name}] p{page} +{added}  累计 {len(videos)}/{total or '?'}", flush=True)
                if added == 0 or page * RXRINA_PAGE_SIZE >= total:
                    break
                page += 1
                time.sleep(args.delay)
            folder = out / safe_filename(name, "未分类栏目")
            folder.mkdir(parents=True, exist_ok=True)
            (folder / "manifest.json").write_text(
                json.dumps(
                    {"column": name, "slug": slug, "media": "unsupported", "videos": videos},
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
            bundles.append((name, videos))
            catalog[name] = videos
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    lines: list[str] = []
    for name, videos in bundles:
        lines.append(f"栏目: {name}")
        for video in videos:
            lines.append(f"      {video['duration']:<8} {video['title']}")
        if not videos:
            lines.append("      (空)")
        lines.append("")
    tree = "\n".join(lines)
    (out / "catalog.txt").write_text(tree, encoding="utf-8")
    (out / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\n===== 目录结果（未下载媒体） =====\n")
    print(tree)
    print(f"已写入 {out.resolve()}", flush=True)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="按演员爬取 tangxinvlog.app 视频目录，或导出 3drxrina 公开目录")
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
    parser.add_argument(
        "--origin",
        default=os.environ.get("TX_SITE_ORIGIN", ORIGIN),
        help="内容源。默认 tangxinvlog.app；3drxrina 目录站只导出目录",
    )
    args = parser.parse_args()
    origin = canonical_origin(args.origin)
    if origin is None:
        print("不支持的内容源。只接受糖心 Vlog 或已配置的 3drxrina 目录站。", file=sys.stderr)
        return 2
    if origin == RXRINA_ORIGIN:
        return crawl_rxrina(args, origin)

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
