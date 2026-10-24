"""Offline contracts for the desktop worker; no source-site traffic."""
import json
from pathlib import Path
import subprocess
import sys
import unittest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from tangxin.catalog import parse_home, parse_page, parse_cloud
from tangxin.archive import plan_archive

CARD = '''<article class="card"><a href="/v/9001/"></a>
<h3 class="title"><a href="/v/9001/">测试作品 🌷</a></h3>
<span class="duration">12:30</span><a class="nickname" href="/a/%E7%94%B2/">@甲</a></article>'''


class CatalogTests(unittest.TestCase):
    def test_home_keeps_order_and_deduplicates(self):
        result = parse_home('<title>首页</title><section class="section"><h2>推荐</h2>' + CARD * 2 + '</section>')
        self.assertEqual(result['title'], '首页')
        videos = result['sections'][0]['videos']
        self.assertEqual(len(videos), 1)
        self.assertEqual(videos[0]['title'], '测试作品 🌷')
        self.assertEqual(videos[0]['actorSlug'], '甲')
        self.assertEqual(videos[0]['hls'], 'https://t.5gcdn.xyz/videos/9001/index.m3u8')

    def test_page_and_empty_next(self):
        html = '<h1>#旅行</h1><p>共 48 部视频</p>' + CARD + '<a rel="next">下一页</a>'
        result = parse_page(html, '旅行', 1, 'tag')
        self.assertEqual((result['name'], result['total'], result['hasNext']), ('旅行', 48, True))
        self.assertFalse(parse_page('<a rel="next">下一页</a>', '旅行', 2, 'tag')['hasNext'])

    def test_cloud_excludes_page_numbers(self):
        html = '<a href="/a/2/">2</a><a href="/a/%E7%94%B2/"><span class="name">甲</span><span class="num">42</span></a>'
        self.assertEqual(parse_cloud(html * 2, 'a'), [{'slug': '甲', 'name': '甲', 'count': 42, 'href': '/a/%E7%94%B2/'}])

    def test_archive_preserves_existing_indexes_and_input(self):
        videos = [{'id': '1', 'actor': '甲'}, {'id': '2', 'actor': '甲'}, {'id': '2', 'actor': '甲'}, {'id': '3', 'actor': ' '}]
        existing = [{'name': '甲', 'videos': [{'id': '0'}, {'id': '1'}]}]
        result = plan_archive(videos, existing)
        self.assertEqual([(x['actor'], x['index']) for x in result], [('甲', 2), ('甲', 3), ('未分类演员', 1)])
        self.assertEqual(len(existing[0]['videos']), 2)

    def test_worker_protocol(self):
        for request, ok in [({'version': 1, 'op': 'health', 'payload': {}}, True), ({'version': 1, 'op': '__import__', 'payload': {}}, False), ({'version': 99, 'op': 'health', 'payload': {}}, False)]:
            with self.subTest(request=request):
                result = subprocess.run([sys.executable, '-I', str(BACKEND / 'worker.py')], input=json.dumps(request), capture_output=True, text=True, encoding='utf-8', timeout=5)
                reply = json.loads(result.stdout)
                self.assertEqual(reply['ok'], ok)
                self.assertEqual(result.returncode, 0 if ok else 1)


if __name__ == '__main__':
    unittest.main()
