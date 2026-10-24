"""One bounded UTF-8 JSON request per process. Protocol version 1.

Isolated Python (-I) ignores user site-packages and PYTHONPATH.
Only this packaged code is imported. The bridge owns lifetime and timeout.
"""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tangxin.archive import plan_archive
from tangxin.catalog import parse_cloud, parse_detail, parse_home, parse_page

MAX_REQUEST_BYTES = 16 * 1024 * 1024


def dispatch(request: dict) -> object:
    if request.get('version') != 1 or not isinstance(request.get('payload'), dict):
        raise ValueError('invalid protocol')
    operation, data = request.get('op'), request['payload']
    if operation == 'health':
        return {'protocol': 1, 'python': sys.version.split()[0], 'engine': 'python'}
    if operation == 'archive':
        if not isinstance(data.get('videos'), list) or not isinstance(data.get('bundles'), list):
            raise ValueError('invalid archive')
        return plan_archive(data['videos'], data['bundles'])
    html = data.get('html')
    if not isinstance(html, str):
        raise ValueError('HTML must be text')
    if operation == 'home':
        return parse_home(html)
    if operation == 'cloud':
        return parse_cloud(html, data['kind'])
    if operation == 'page':
        return parse_page(html, data['slug'], data['page'], data['kind'])
    if operation == 'detail':
        return parse_detail(html, data['id'])
    raise ValueError('unknown operation')


def main() -> int:
    try:
        raw = sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1)
        if len(raw) > MAX_REQUEST_BYTES:
            raise ValueError('request too large')
        request = json.loads(raw.decode('utf-8'))
        if not isinstance(request, dict):
            raise ValueError('request must be an object')
        reply = {'version': 1, 'ok': True, 'result': dispatch(request)}
        code = 0
    except (ValueError, TypeError, KeyError, AttributeError, RecursionError):
        reply = {'version': 1, 'ok': False, 'error': '目录服务无法处理此请求，请重试或检查版本。'}
        code = 1
    sys.stdout.buffer.write((json.dumps(reply, ensure_ascii=False) + '\n').encode('utf-8'))
    return code


if __name__ == '__main__':
    raise SystemExit(main())
