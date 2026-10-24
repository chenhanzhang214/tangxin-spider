"""CTest contract: fixed names, bounded streaming, no overwrite on failure."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

EXECUTABLE = str(Path(sys.argv.pop(1)).resolve())


class MergeTests(unittest.TestCase):
    def invoke(self, directory, count):
        return subprocess.run([EXECUTABLE], input=f'{directory}\n{count}\n', text=True, encoding='utf-8', capture_output=True, timeout=10)

    def test_order_unicode_and_progress(self):
        with tempfile.TemporaryDirectory(prefix='糖心-🌷-') as tmp:
            root = Path(tmp)
            (root / 'segment-000001.ts').write_bytes(b'B' * 1700000)
            (root / 'segment-000000.ts').write_bytes(b'A' * 1100000)
            result = self.invoke(root, 2)
            self.assertEqual(result.returncode, 0, result.stderr)
            events = [json.loads(line) for line in result.stdout.splitlines()]
            self.assertEqual(events[-1]['bytes'], 2800000)
            self.assertEqual((root / 'input.ts').read_bytes(), b'A' * 1100000 + b'B' * 1700000)
            self.assertTrue((root / 'segment-000000.ts').exists())

    def test_missing_input_leaves_no_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'segment-000000.ts').write_bytes(b'A')
            self.assertNotEqual(self.invoke(root, 2).returncode, 0)
            self.assertFalse((root / 'input.ts').exists())

    def test_existing_output_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'input.ts').write_bytes(b'KEEP')
            (root / 'segment-000000.ts').write_bytes(b'A')
            self.assertNotEqual(self.invoke(root, 1).returncode, 0)
            self.assertEqual((root / 'input.ts').read_bytes(), b'KEEP')

    def test_invalid_count(self):
        for count in [0, -1, 100001, '2garbage']:
            with tempfile.TemporaryDirectory() as tmp:
                self.assertNotEqual(self.invoke(tmp, count).returncode, 0)


if __name__ == '__main__':
    unittest.main()
