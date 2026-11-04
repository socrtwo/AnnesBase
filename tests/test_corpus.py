"""Check fixture integrity and recovery ground truth without modifying inputs."""
import hashlib
import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts' / 'gen-corpus.py'
SPEC = importlib.util.spec_from_file_location('gen_corpus', SCRIPT)
CORPUS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CORPUS)


class CorpusTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'fixtures'
        self.manifest = CORPUS.generate(self.root)

    def open_readonly(self, name):
        db = sqlite3.connect((self.root / name).as_uri() + '?mode=ro&immutable=1', uri=True)
        self.addCleanup(db.close)
        return db

    def test_hashes_and_damage_detection(self):
        for fixture in self.manifest['fixtures']:
            with self.subTest(file=fixture['file']):
                path = self.root / fixture['file']
                original = path.read_bytes()
                self.assertEqual(len(original), fixture['bytes'])
                self.assertEqual(hashlib.sha256(original).hexdigest(), fixture['sha256'])
                try:
                    results = self.open_readonly(fixture['file']).execute('PRAGMA integrity_check').fetchall()
                    healthy = results == [('ok',)]
                except sqlite3.DatabaseError:
                    healthy = False
                self.assertEqual(healthy, fixture['integrity_ok'])
                self.assertEqual(path.read_bytes(), original)

    def test_intact_and_index_damaged_tables_match_ground_truth(self):
        for name in ('intact.sqlite', 'bad-index.sqlite'):
            db = self.open_readonly(name)
            for table, expected in self.manifest['expected_tables'].items():
                with self.subTest(file=name, table=table):
                    rows = db.execute(expected['query']).fetchall()
                    self.assertEqual(len(rows), expected['rows'])
                    encoded = json.dumps(rows, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
                    self.assertEqual(hashlib.sha256(encoded).hexdigest(), expected['sha256'])
        self.assertEqual(self.open_readonly('intact.sqlite').execute('PRAGMA foreign_key_check').fetchall(), [])

    def test_header_repair_recovers_all_original_bytes(self):
        damaged = (self.root / 'bad-header.sqlite').read_bytes()
        self.assertEqual(b'SQLite format 3\0' + damaged[16:], (self.root / 'intact.sqlite').read_bytes())

    def test_repeat_generation_and_overwrite_protection(self):
        other = Path(self.temp.name) / 'second'
        self.assertEqual(CORPUS.generate(other), self.manifest)
        for path in self.root.iterdir():
            self.assertEqual(path.read_bytes(), (other / path.name).read_bytes())
        before = (self.root / 'intact.sqlite').read_bytes()
        with self.assertRaises(FileExistsError):
            CORPUS.generate(self.root)
        self.assertEqual((self.root / 'intact.sqlite').read_bytes(), before)


if __name__ == '__main__':
    unittest.main()
