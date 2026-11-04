# Database test corpus

Generate the first synthetic SQLite fixtures from the repository root:

```bash
# Termux: pkg install python
python3 scripts/gen-corpus.py
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

The generator uses Python's standard-library SQLite module and writes to
`tests/corpus/generated/`. Use `--output PATH` for another **new** directory.
Existing paths are refused to protect fixtures and local databases. Tests use
temporary directories and do not require generated files to be present.

The generated data is original, fictional, and covered by the project's MIT
license. It includes related customers and orders, foreign keys, a unique
constraint, an index, null values, Unicode text, long overflow-page text and
binary values. It is ordinary SQLite, not an implementation of the planned
`.qbase` catalog.

| Fixture | Purpose | Recovery expectation |
|---|---|---|
| `intact.sqlite` | Baseline; integrity and foreign-key checks pass | All 3 customers and 64 orders |
| `bad-header.sqlite` | SQLite signature replaced with zero bytes | All data after signature restoration |
| `bad-index.sqlite` | Secondary index root page zeroed | All data through table scans; rebuild the index |
| `truncated.sqlite` | Second half of the file removed | Diagnose damage; recovery extent is not yet specified |

`manifest.json` records provenance, SQLite version, mutations, file sizes and
SHA-256 checksums. The baseline queries, counts and logical-result hashes provide
ground truth for future recovery tests. Binary fields are represented with
SQLite `hex()`; logical hashes use UTF-8 JSON with compact separators and rows
ordered by primary key. The corrupt variants all derive from the same closed,
intact database. Tests open fixtures read-only and check that diagnosis leaves
their bytes unchanged.

Generation is repeatable on the same Python/SQLite toolchain. SQLite versions may
produce different physical layouts and binary checksums; the manifest records
the version and the generator discovers the index page rather than assuming its
position. Future readers should compare recovered logical data against the
manifest, not depend on fixed page numbers or binary hashes from another version.

This completes only the SQLite seed portion of the roadmap's corpus task. Access,
xBase, Paradox, other legacy formats, WAL/journal cases and recovery-score tests
remain outstanding. No database recovery engine is implemented yet.
