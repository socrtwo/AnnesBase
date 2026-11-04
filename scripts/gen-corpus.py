#!/usr/bin/env python3
"""Generate synthetic SQLite recovery fixtures using only the standard library."""
import argparse
import hashlib
import json
import sqlite3
from pathlib import Path


def generate(output):
    """Create a new corpus directory; never overwrite an existing directory."""
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    source = output / 'intact.sqlite'
    with sqlite3.connect(source) as db:
        db.executescript('''
            PRAGMA page_size = 4096;
            PRAGMA foreign_keys = ON;
            CREATE TABLE customers (
                id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE
            );
            CREATE TABLE orders (
                id INTEGER PRIMARY KEY,
                customer_id INTEGER NOT NULL REFERENCES customers(id),
                amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0),
                note TEXT, payload BLOB
            );
            CREATE INDEX orders_customer ON orders(customer_id);
        ''')
        db.executemany('INSERT INTO customers VALUES (?, ?, ?)', [
            (1, 'Example Customer', 'customer@example.invalid'),
            (2, 'Renée Example', None),
            (3, '架空 Example', 'fictional@example.invalid'),
        ])
        db.executemany('INSERT INTO orders VALUES (?, ?, ?, ?, ?)', [
            (i, (i % 3) + 1, i * 125,
             None if i % 5 == 0 else f'Order {i}: synthetic café note. ' * 200,
             bytes([0, i, 255]))
            for i in range(1, 65)
        ])
        db.commit()
        assert db.execute('PRAGMA integrity_check').fetchall() == [('ok',)]
        assert db.execute('PRAGMA foreign_key_check').fetchall() == []
        index_page = db.execute(
            "SELECT rootpage FROM sqlite_schema WHERE name = 'orders_customer'"
        ).fetchone()[0]
        expected = {}
        for table in ('customers', 'orders'):
            columns = '*' if table == 'customers' else 'id, customer_id, amount_cents, note, hex(payload)'
            rows = db.execute(f'SELECT {columns} FROM {table} NOT INDEXED ORDER BY id').fetchall()
            encoded = json.dumps(rows, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
            expected[table] = {
                'rows': len(rows),
                'query': f'SELECT {columns} FROM {table} NOT INDEXED ORDER BY id',
                'sha256': hashlib.sha256(encoded).hexdigest(),
            }
    # Close the connection before reading or copying the file, including on Windows.
    db.close()
    original = source.read_bytes()
    bad_header = bytearray(original)
    bad_header[:16] = bytes(16)
    bad_index = bytearray(original)
    index_offset = (index_page - 1) * 4096
    bad_index[index_offset:index_offset + 4096] = bytes(4096)
    variants = [
        ('intact.sqlite', original, 'none', True, True),
        ('bad-header.sqlite', bytes(bad_header), 'Zero the 16-byte SQLite signature.', False, True),
        ('truncated.sqlite', original[:len(original) // 2], 'Remove the second half of the file.', False, False),
        ('bad-index.sqlite', bytes(bad_index), f'Zero index root page {index_page} (orders_customer).', False, True),
    ]
    fixtures = []
    for name, data, damage, healthy, full_recovery in variants:
        if name != source.name:
            (output / name).write_bytes(data)
        fixtures.append({
            'file': name, 'bytes': len(data),
            'sha256': hashlib.sha256(data).hexdigest(),
            'source': None if healthy else source.name,
            'damage': damage, 'integrity_ok': healthy,
            'full_logical_recovery_expected': full_recovery,
        })
    manifest = {
        'version': 1,
        'license': 'MIT',
        'provenance': 'Synthetic data generated for Anne\'s Base; no third-party databases or personal data.',
        'sqlite_version': sqlite3.sqlite_version,
        'page_size': 4096,
        'expected_tables': expected,
        'fixtures': fixtures,
    }
    (output / 'manifest.json').write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8'
    )
    return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=Path('tests/corpus/generated'),
                        help='New output directory (must not already exist).')
    args = parser.parse_args()
    try:
        manifest = generate(args.output)
    except FileExistsError:
        parser.exit(1, f'Refusing to overwrite existing path: {args.output}\n')
    print(f'Generated {len(manifest["fixtures"])} fixtures in {args.output}')
