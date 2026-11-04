# Recovery plan: damaged databases

> **Plan.** Anne's Base has an early native editor and SQLite viewer; advanced database features remain planned. This is the design of its repair and recovery pipeline, the database counterpart of the recovery engines in the sister apps, descended from the author's [Immortal Unzipper / Immortal Zip](https://socrtwo.github.io/Immortal-Zip/), [Word Recovery](https://github.com/socrtwo/wordrecovery-SF) and [Universal File Repair Tool](https://github.com/socrtwo/Universal-File-Repair-Tool) projects. Commands are on the **Repair & Recovery** tab ([COMMANDS-PLAN.md](COMMANDS-PLAN.md#repair--recovery)).

## Principles

- **Never write over the damaged file.** Every repair, including *Compact and Repair*, works on a copy and writes a new file; the original is kept beside it with `(before repair)` in its name until the user deletes it. *Undo Last Repair* (`recover.undoRepair`) switches back.
- **Never refuse what can be read.** A database with damage opens with every readable table and object, read-only, under a banner: *"This database is damaged. 14 of 16 tables and 97% of rows could be read. Recovery Report…"*.
- **Explain.** *Recovery Report* (`recover.report`) lists, per object, what was wrong, which method fixed it, and what is missing, in plain language with a technical section below. *Diagnose with AI* (`ai.diagnose`) can explain it further; it receives the report's structure, not the data.
- **Prevent first.** The native format's journal and snapshots (below) mean most "recovery" in a `.qbase` is an ordinary undo or restore.

## Pipeline

1. **Identify** the format from its bytes (header signatures, page sizes, version fields); mismatched extensions are reported. Encrypted files ask for the password before anything else; a wrong password is never mistaken for damage.
2. **Diagnose** (`recover.diagnose`, read-only): walk the page structure, catalog, indexes and object storage; score each table and object as *intact*, *damaged*, *orphaned* (data present, catalog entry missing) or *lost*.
3. **Cheap repairs** in memory (headers, counts, free-space maps, indexes), then reopen.
4. **Deep Repair** (`recover.deepRepair`): read every page that passes checks, reassemble tables from their data pages (using the catalog where it is readable and page-type heuristics where it is not), and write a new database. Indexes and relationships are rebuilt from the definitions; rows that violate them are kept in a `_violations` table, not discarded.
5. **Object recovery** (`recover.objects`): forms, reports, macros and modules from damaged storage; failing that, from the latest snapshot, object history or text export.
6. **Carving** (`recover.carve`): for files that are not databases at all any more — disk images, backups, zip and other archives, e-mail attachments, temporary files — scan for database page and header signatures and reassemble candidates.
7. **Salvage** (`recover.salvage`): everything readable into a new `.qbase`; or, as a last resort, every readable table to CSV (`recover.exportCsv`).
8. **Report** and open the best result.

## Format-specific methods

### Microsoft Access (Jet 3/4 `.mdb`, ACE `.accdb`)

- **Header and database definition page**: version, page size, code page, encryption key and flags checked and rebuilt from defaults where damaged.
- **System tables** (`recover.repairSystem`): `MSysObjects` and the catalog rebuilt from the table-definition pages found by scanning, so tables that "disappeared" from the navigation pane come back.
- **Table definitions and usage maps**: damaged usage maps (the page lists of each table) rebuilt by scanning data pages for their owning table definition.
- **Data pages**: row offsets validated; overlapping or out-of-page rows recovered field by field; long-value (memo/OLE/attachment) chains followed with loop detection.
- **Indexes** rebuilt from data rather than repaired.
- **Deleted records** (`recover.deletedRecords`): rows marked deleted but still present on data pages, and rows on pages returned to the free list, listed for review with their probable table.
- **Code project** (`recover.repairCode`): the VBA project storage's module source streams recovered from a damaged project; compiled p-code discarded (`recover.decompile`); missing references listed (`recover.brokenReferences`).
- **Forms and reports**: from their storage where readable; otherwise from SaveAsText exports or a text-folder export.
- **Lock files**: stale `.ldb`/`.laccdb` removed only after confirming that no process holds the database (`recover.fixLock`).
- **The 2 GB limit**: files at or past the limit are read regardless, and *Database Health* warns well before it is reached.

### xBase (`.dbf`, `.dbt`, `.fpt`, indexes)

- **Header** (`recover.repairHeader`): record count, header length and record length recomputed from the file size and field descriptors; field descriptors reconstructed from the data when the header is overwritten (column boundaries found statistically).
- **Records**: misaligned records realigned on the delete-flag byte; end-of-file markers in the wrong place corrected.
- **Memo files** (`recover.repairMemo`): block chains followed and orphan blocks matched back to their records by block number.
- **Deleted records**: rows with the `*` flag shown for review; `RECALL` restores them.
- **Indexes** (`.ndx`, `.mdx`, `.cdx`, `.idx`, `.ntx`): always rebuilt from the data, never trusted.

### Paradox (`.db`, `.px`, `.mb`)

- Block chains (`recover.repairParadox`) rebuilt by scanning blocks; the primary index rebuilt from data; `.mb` blob references validated; deleted records recovered from free blocks where present.

### SQLite (including `.qbase`)

- `PRAGMA integrity_check` and `quick_check` first (`recover.check`).
- **WAL and rollback journal** (`recover.fromJournal`): committed frames in a `-wal` file not yet checkpointed are recovered; a hot journal is replayed or set aside according to what the diagnosis finds.
- **Page-level recovery**: the SQLite recovery extension's approach (reading every b-tree page and reassembling rows by root page and schema) as the Deep Repair method.
- **Deleted records**: rows in freelist pages and free blocks within pages, listed for review.

### LibreOffice Base, FileMaker exports and other containers

- `.odb` is a zip: the suite's zip recovery (Immortal Zip) runs first, then the embedded HSQLDB script or Firebird database is recovered by its own method.
- Exports (CSV, XML, JSON) that are truncated or malformed are read as far as they parse, with the break point reported.

## Protection in the native format

| Feature | Command | What it does |
|---|---|---|
| Write-ahead journal | `recover.journal` | Every insert, update and delete is recorded with before and after values; on by default. Powers Undo Delete, Record History, Show Table as of and Restore Rows. |
| Automatic snapshots | `recover.autoSnapshots`, `file.snapshots` | Point-in-time copies (hourly while editing, on close, before every action query and every repair, by default), pruned by age. |
| Verify on open | `recover.verifyOnOpen` | A quick integrity check on open; a full check weekly. |
| Repair before it breaks | `recover.monitor` | Warns about fragmentation, size limits, index damage and failing storage (repeated read errors). |
| Scheduled verified backups | `file.backupSchedule`, `file.verifyBackup` | Backups are opened and checked after writing, with checksums. |

## Tests

Each method arrives with damaged-file tests: a corpus of intact files from each program, and generated damage (truncation, zeroed and random pages, flipped bits in headers, shuffled pages, deleted catalog entries, broken memo chains, orphaned WAL frames). Each test records the share of rows and objects recovered, so a change that recovers less fails.
