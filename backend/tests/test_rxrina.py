"""Offline checks for the 3drxrina catalog adapter. No source-site traffic."""
import argparse
import base64
import importlib.util
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("tangxin_crawl", ROOT / "public" / "tangxin_crawl.py")
CRAWL = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(CRAWL)


class RxrinaOriginTests(unittest.TestCase):
    def test_allowlist(self):
        self.assertEqual(CRAWL.canonical_origin(""), CRAWL.ORIGIN)
        self.assertEqual(CRAWL.canonical_origin(CRAWL.RXRINA_ORIGIN + "/"), CRAWL.RXRINA_ORIGIN)
        self.assertIsNone(CRAWL.canonical_origin("https://evil.example"))
        self.assertIsNone(CRAWL.canonical_origin("http://" + CRAWL.RXRINA_ORIGIN.removeprefix("https://")))
        self.assertIsNone(CRAWL.canonical_origin(CRAWL.RXRINA_ORIGIN + "/watch"))

    def test_catalog_row_has_no_media_url(self):
        video = CRAWL.map_rxrina_row(
            {
                "id": 10,
                "title": "测试作品",
                "duration": "65000",
                "poster": "COVER_RES/a",
                "columnValue": "push_1",
                "movieVideos": [{"id": 99, "videoId": 100}],
                "videoInfo": {"url": "res-id"},
            },
            CRAWL.RXRINA_ORIGIN,
            "测试栏目",
            {"bufnamecdn": "COVER_RES", "resimgcdn": "https://img.example", "bufdomaincdn": "", "resimgdomaincdn": ""},
        )
        self.assertEqual(video["id"], "99")
        self.assertEqual(video["duration"], "1:05")
        self.assertEqual(video["cover"], "https://img.example/a")
        self.assertEqual(video["hls"], "")
        self.assertNotIn("videoAuth", json.dumps(video, ensure_ascii=False))
        self.assertNotIn("res-id", json.dumps(video, ensure_ascii=False))

    def test_config_ignores_braces_inside_strings(self):
        source = 'window.__SITE_CONFIG__ = {"title":"说明}尾注","version":"1"}; trailing }'
        self.assertEqual(CRAWL.parse_rxrina_config(source)["title"], "说明}尾注")

    def test_mp4_flag_stops_before_any_request(self):
        args = argparse.Namespace(mp4=True, actors=None, top=1, max_pages=1, delay=0, out="unused")
        self.assertEqual(CRAWL.crawl_rxrina(args, CRAWL.RXRINA_ORIGIN), 2)

    def test_decrypt_roundtrip(self):
        try:
            from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        except ImportError:
            self.skipTest("cryptography is optional for the standalone script")
        cipher = Cipher(algorithms.AES(CRAWL.RXRINA_RESPONSE_KEY), modes.CBC(CRAWL.RXRINA_RESPONSE_IV[:16]))
        encryptor = cipher.encryptor()
        raw = json.dumps({"code": 200, "rows": []}).encode()
        pad = 16 - (len(raw) % 16)
        payload = base64.b64encode(encryptor.update(raw + bytes([pad]) * pad) + encryptor.finalize()).decode()
        self.assertEqual(CRAWL.decrypt_rxrina_payload(payload)["code"], 200)


if __name__ == "__main__":
    unittest.main()
