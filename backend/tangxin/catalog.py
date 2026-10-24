"""Static source-site HTML contracts, isolated from transport and UI.

Patterns mirror the web adapter; cross-language tests guard the migration.
"""
import json
import re
from typing import Any, TypedDict
from urllib.parse import quote, unquote

SITE = 'https://tangxinvlog.app'
CDN = 'https://t.5gcdn.xyz/videos'


class Video(TypedDict):
    id: str
    title: str
    duration: str
    cover: str
    actor: str
    actorSlug: str
    pageUrl: str
    hls: str


def match_text(pattern: str, text: str, default: str = '') -> str:
    match = re.search(pattern, text, re.S)
    return match.group(1) if match else default


def strip_tags(text: str) -> str:
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', text)).strip()


def encode_slug(slug: str) -> str:
    return quote(slug, safe="~!*'()")


def parse_cloud(html: str, kind: str) -> list[dict[str, Any]]:
    if kind not in ('a', 'tag'):
        raise ValueError('invalid cloud kind')
    result, seen = [], set()
    for raw, inner in re.findall(r'href="/' + kind + r'/([^"]+)/"[^>]*>(.*?)</a>', html, re.S):
        if not raw or raw.isdigit():
            continue
        slug = unquote(raw.rstrip('/'))
        fallback = strip_tags(inner)
        name = match_text(r'class="name"[^>]*>\s*([^<]+?)\s*<', inner,
                          re.sub(r'\d+\s*$', '', fallback)).strip()
        count = match_text(r'class="num"[^>]*>\s*(\d+)\s*<', inner,
                           match_text(r'(\d+)\s*$', fallback, '0'))
        if not name or slug in seen:
            continue
        seen.add(slug)
        result.append({'slug': slug, 'name': name, 'count': int(count),
                       'href': f'/{kind}/{encode_slug(slug)}/'})
    return result


def parse_cards(html: str) -> list[Video]:
    result, seen = [], set()
    for article in re.findall(r'<article class="card".*?</article>', html, re.S):
        identifier = match_text(r'href="/v/(\d+)/', article)
        if not identifier or identifier in seen:
            continue
        seen.add(identifier)
        title = strip_tags(match_text(r'<h3 class="title".*?<a[^>]*>(.*?)</a>', article,
                                      match_text(r'aria-label="([^"]+)"', article)))
        actor_href = match_text(r'href="(/a/[^"]+/)"', article)
        result.append({
            'id': identifier, 'title': title or f'视频 {identifier}',
            'duration': match_text(r'class="duration"[^>]*>([^<]+)', article).strip(),
            'cover': match_text(r'src="(https?://[^"]+cover\.jpg)"', article, f'{CDN}/{identifier}/cover.jpg'),
            'actor': strip_tags(match_text(r'class="nickname"[^>]*>(.*?)</a>', article)).removeprefix('@').strip(),
            'actorSlug': unquote(actor_href.removeprefix('/a/').rstrip('/')),
            'pageUrl': f'{SITE}/v/{identifier}/', 'hls': f'{CDN}/{identifier}/index.m3u8',
        })
    return result


def parse_home(html: str) -> dict[str, Any]:
    sections = []
    for chunk in re.findall(r'<section class="section".*?</section>', html, re.S):
        heading = strip_tags(match_text(r'<h2[^>]*>(.*?)</h2>', chunk))
        if heading:
            sections.append({'title': heading, 'moreHref': match_text(r'<a class="more"[^>]+href="([^"]+)"', chunk),
                             'videos': parse_cards(chunk)})
    return {'title': match_text(r'<title>([^<]+)</title>', html, '糖心Vlog').strip(), 'sections': sections}


def parse_page(html: str, slug: str, page: int, kind: str) -> dict[str, Any]:
    if kind not in ('a', 'tag') or not 1 <= page <= 200:
        raise ValueError('invalid page')
    heading = strip_tags(match_text(r'<h1[^>]*>(.*?)</h1>', html)).removeprefix('@' if kind == 'a' else '#').strip()
    videos = parse_cards(html)
    if kind == 'a':
        next_page = bool(re.search(r'rel="next"', html, re.I) or re.search(fr'/{page + 1}(?:/|" )', html))
    else:
        next_page = bool(re.search(r'rel=[\"\x27]next[\"\x27]', html, re.I) or '下一页' in html)
    return {'name': heading or (videos[0]['actor'] if videos else '') or slug, 'slug': slug,
            'total': int(match_text(r'共\s*(\d+)\s*部', html, '0')), 'page': page,
            'hasNext': next_page and bool(videos), 'videos': videos}


def parse_detail(html: str, identifier: str) -> dict[str, Any]:
    metadata = {}
    for raw in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S):
        try:
            candidate = json.loads(raw)
            if isinstance(candidate, dict) and candidate.get('@type') == 'VideoObject':
                metadata = candidate
                break
        except (ValueError, TypeError):
            continue

    def field(name: str, default: str = '') -> str:
        value = metadata.get(name)
        return value if isinstance(value, str) else default

    actor_link = re.search(r'href="(/a/[^"]+/)"[^>]*>.*?@?\s*([^<]+)', html, re.S)
    return {
        'id': identifier,
        'title': field('name', re.sub(r'\s*-.*$', '', match_text(r'<title>([^<]+)</title>', html, f'视频 {identifier}')).strip()),
        'duration': match_text(r'class="duration"[^>]*>([^<]+)', html, field('duration')).strip(),
        'cover': field('thumbnailUrl', f'{CDN}/{identifier}/cover.jpg'),
        'actor': strip_tags(actor_link.group(2)).removeprefix('@') if actor_link else '',
        'actorSlug': unquote(actor_link.group(1).removeprefix('/a/').rstrip('/')) if actor_link else '',
        'pageUrl': f'{SITE}/v/{identifier}/',
        'hls': match_text(r'const m3u8 = "([^"]+)"', html, field('contentUrl', f'{CDN}/{identifier}/index.m3u8')),
        'tags': parse_cloud(html, 'tag'), 'description': field('description'), 'uploadDate': field('uploadDate'),
    }
