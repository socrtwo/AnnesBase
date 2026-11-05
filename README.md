# Anne's Base

*Part of the Anne's Office suite: [Anne's Pen](https://github.com/socrtwo/QuillPen) (documents), [Anne's Grid](https://github.com/socrtwo/QuillGrid) (spreadsheets), [Anne's Post](https://github.com/socrtwo/QuillPost) (email), [Anne's Stage](https://github.com/socrtwo/QuillStage) (presentations), [Anne's Loom](https://github.com/socrtwo/QuillLoom) (web sites), [Anne's Press](https://github.com/socrtwo/QuillPress) (desktop publishing), [Anne's Folio](https://github.com/socrtwo/QuillFolio) (PDF), [Anne's Lens](https://github.com/socrtwo/QuillLens) (pictures) and **Anne's Base** (databases).*

An original, open-source desktop database for Android, iOS, Windows, macOS, Linux, ChromeOS and the web, in the tradition of Microsoft Access: tables, queries, forms, reports, macros and code in one file, for people who are not database administrators. Its goal is the same as the rest of the Anne's Office suite: **no missing commands**. Anne's Base gathers the commands of Access (including features Access has retired), of the classic database programs (dBASE, FoxPro and Visual FoxPro, Clipper, Paradox, FileMaker, Lotus Approach, Works, Q&A, R:BASE, DataEase, Alpha Four, HyperCard), of the open-source and server tools (LibreOffice Base, Kexi, SQLite, PostgreSQL, MySQL, SQL Server Management Studio, DBeaver, DuckDB) and of the web databases (Airtable, Notion, Quickbase, Power Apps), adds ideas of its own, and has an **AI** tab and menu for asking questions of your data, designing databases, writing queries and code, cleaning data and diagnosing damage. Every feature is a command, and every command can be put on the Quick Access Bar, on your own tab, in any classic menu layout, on a keyboard shortcut, in a macro, and found with command search. When a database is damaged, Anne's Base shows what it can recover instead of refusing to open it.

> **Status: early M1 database editor.** Native `.qbase` files support table creation, adding/editing/deleting records, journaled history, selective record restore, sequential undo, browser autosave/restore and versioned snapshots. Other SQLite files open read-only. The browser app includes a sample database, command search, Word-style File menus, ribbon groups, classic menus and Quick Access pinning. Queries, damaged-file recovery and AI are not implemented. No platform releases have been published. The documents below describe the intended application; see [CONTRIBUTING.md](CONTRIBUTING.md).

## Run the preview

Install Node.js 24 LTS, then run from this repository:

```bash
# Termux: pkg install nodejs-lts python
npm ci
npm run dev
```

Open `http://localhost:5173` in your browser. Select **Try sample database**, then choose Customers or Orders in the navigation pane. Or choose **New blank database** and **Create table**: every table gets an automatic integer id, plus up to 32 Text, Whole number or Decimal number fields. Required means non-null; empty text is a separate value. Use **Add record**, or select a row for **Edit selected** / **Delete selected**. **Undo last change** reverses the latest active change, including a deletion. **Change history** shows the latest 100 journal entries.

**Open SQLite file** reads a `.sqlite`, `.db` or `.qbase` from your device. **Download a copy** downloads a new file including the journal, never overwriting your source. Undo remains available after reopening the downloaded native file. File ▸ New/Open/Save/Close uses the same engine. Datasheet pages show up to 100 rows; use Previous/Next for more.

Select a row and choose **Record history**, or enter an id to inspect a deleted record. Choose a change to compare its **Before** and **After** values; **Load older changes** pages through histories longer than the global 100-entry overview. **Restore before values** / **Restore after values** writes a new journal entry without undoing unrelated records, and the restore can itself be undone. Empty text, NULL and an absent record are shown separately. Versions marked Undone can still be inspected and explicitly restored. History includes only changes actually recorded in the journal.

Automatic ids are not reused after deletion or undo within a table's lifetime. Selective restore is disabled if an older file reused an id or if the current row no longer matches its journal. It also rejects a stale history preview and cannot restore an old dropped table's rows into a new table of the same name. Related-record restoration, actor attribution, bulk restoration and as-of table views remain planned.

Use **Sort column** / **Sort direction**, **Filter column** / **Filter condition** / **Filter value**, or **Find in table**, then select **Apply view**. Find narrows the table to rows containing the literal term across text and number columns. A single column filter can be combined with Find; **Apply column filter** temporarily enables/disables that condition. The ribbon/menu commands Sort Ascending/Descending, Remove Sort, Filter, Apply/Toggle Filter, Clear All Filters and Find use the same controls. Clearing filters also clears Find but preserves sorting.

Numeric comparisons preserve signed 64-bit integer inputs. Text Contains/Find fold ASCII case and treat `%` and `_` literally, without wildcard syntax; full Unicode case folding is not provided. NULL is distinct from empty text and has its own filter conditions. Blob contents are not searched and support only NULL/not-NULL filtering. Sorting and comparisons follow SQLite's types/collations, with primary-key or full-row tie ordering for stable pages. Views are temporary: switching tables or reopening a database resets them. Viewing never writes records or adds journal entries; saved queries, multi-condition filters and advanced sort remain planned.

Editable native databases autosave committed changes and their journal as **Browser recovery copies** using IndexedDB. Wait for **Saved in this browser** before leaving, then restore a copy after reopening the app. Each database has its own copy; closing or creating another database does not delete it. **Recent Databases** in File opens this recovery list. You can remove inactive copies explicitly. Revision checks prevent a stale tab from overwriting or deleting a newer copy; a conflict leaves the local edits available to download or discard before restoring the latest copy.

Browser copies belong to this browser profile and site address (including the port). They do not update original files or sync between devices. They contain the latest committed database state, not unfinished form drafts or a versioned backup history. Browser storage can be unavailable, full, cleared or evicted, so keep downloaded backups. Failed autosaves remain visibly failed with a retry button, and pending changes/drafts retain their leave-page warning. A started download is not confirmation that the file was saved.

Use **Snapshots** in the workspace or File ▸ Info to keep several versions. **Create snapshot** saves the committed native database and journal under a label; manual versions stay pinned until removed. **Automatic snapshots before changes** is off by default. Enable it to capture the state before successful edits, undo and record restoration. Choose 1–20 automatic versions per database (default 5); older automatic versions are pruned atomically on the next automatic save. Rapid pending captures may be combined, so this is not a snapshot of every edit. The journal still records each change. Snapshot settings persist when browser preferences are available.

**Restore as new copy** verifies a SHA-256 checksum and SQLite integrity, then opens a separate database with a new recovery-copy id. Original snapshots and recovery copies are preserved, and the restored journal remains undoable. Clear **Current database only** to see versions of other databases, including after closing a file. **Download snapshot** verifies and downloads that version; **Remove snapshot** affects only the selected snapshot. Snapshot creation excludes unfinished drafts, and restoring respects pending-edit guards. Wait for the snapshot save message before leaving. Storage/checksum errors are visible and do not discard the open database. Snapshots need HTTPS or localhost for checksum support and share the browser-profile/site storage limits above; they are not embedded in downloaded databases or synced between devices.

This preview loads files into memory, with a **32 MiB input/recovery-copy limit**. Ordinary SQLite, old `0-preview` files, explicit read-only opens and unsupported native schemas remain read-only and are not automatically copied to browser storage. New native files use experimental catalog version `2-preview`, which includes selective-restore journal entries. Supported `1-preview` files remain editable and are marked `2-preview` atomically on their first selective restore; original source files are never overwritten. Older application builds do not support this new history operation. Compatibility with future versions is not promised. Access files, encrypted databases, damaged-file recovery, redo and changes to an existing table's schema are not supported.

The dev server listens on all interfaces for device testing. The modern ribbon opens a Word-style **File** screen with Home, New, Open, Info, Save, Print, Share, Export, Close and Options pages. Use **Back** or Escape to return to the workspace. Unimplemented actions remain disabled.

Command search covers all 693 planned commands; it searches labels, ids, groups and notes. Pin or unpin commands from search results, or use **Add All Choices** for the standard Quick Access set. Expand **Classic menus** below the ribbon to choose a historic layout; the default is Access 2003 style and its historical fidelity still needs verification. Pinning and menu layout are saved in browser storage when available.

```bash
npm test             # registry, catalog, preferences and shell interactions
npm run build        # type check and production web build in dist/
python3 scripts/gen-plan.py --check
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the code that exists today. Capacitor, Electron, PWA/offline support, worker/OPFS storage and broader journal features remain upcoming M1 work.

## The plan in brief

- **693 planned commands** in File, Home, Create, External Data, Database Tools, Data, Repair & Recovery, xBase, View, AI, Developer and Help, plus the contextual Table, Query, Form and Macro tabs. Each command records where the idea comes from; 129 are new ideas. See [docs/COMMANDS-PLAN.md](docs/COMMANDS-PLAN.md).
- **Classic menus as well as the ribbon.** The ribbon follows Access 2007 and later. View ▸ Menus adds a classic menu bar that defaults to **Access 2003** and can follow **dBASE III Plus ASSIST, the dBASE IV Control Center, FoxPro for DOS, Visual FoxPro, Paradox for DOS and for Windows, FileMaker Pro, Lotus Approach, Works, LibreOffice Base, SQL Server Management Studio or DBeaver**, all programs combined, or a **complete** layout with every command. See [docs/MENUS-PLAN.md](docs/MENUS-PLAN.md).
- **Access's keys and habits:** F11 navigation pane, F5 go to record, F9 and Shift+F9 refresh and requery, Ctrl+; date, Ctrl+' value from the previous record, Shift+Enter save record, F4 property sheet, F8 field list, Alt+F11 code editor, Ctrl+G Immediate window. FileMaker, FoxPro and SSMS key sets can be loaded instead.
- **One file, safe by default.** The native `.qbase` file is SQLite inside, with a write-ahead journal: every record change can be undone, deleted records can be brought back, any table can be viewed *as of* an earlier time, and automatic snapshots are kept. No 2 GB limit.
- **Opens what you already have:** Access `.accdb`, `.mdb` (Jet 3 and 4), `.accde`/`.mde` data, `.adp` forms and reports; dBASE, FoxPro and Clipper `.dbf` with memo and index files; Paradox; FileMaker exports; Approach, Works, Q&A and other historic formats; SQLite, DuckDB, LibreOffice Base `.odb`, SQL dumps, CSV, JSON, XML, spreadsheets, Parquet and GEDCOM; and live connections to PostgreSQL, MySQL/MariaDB, SQL Server, Oracle and Firebird. See [docs/FORMATS-PLAN.md](docs/FORMATS-PLAN.md).
- **Everything Access does, plus what it dropped:** table design with validation, lookups, calculated fields and data macros; the query grid and every query type, with SQL view; forms and reports with layout and design views, subforms, conditional formatting and grouping; labels and form letters through Anne's Pen; macros and a VBA-compatible Basic. Restored: the Database window, switchboards, PivotTable and PivotChart views, replication (as two-way sync), user-level security (as roles), and a successor to data access pages and web apps that publishes a database as a phone and browser app.
- **From the other programs:** the xBase **dot prompt**, work areas, `.prg` programs and PACK/ZAP/RECALL; Paradox **query by example** with example elements and ANSWER tables; FileMaker **Browse/Find/Layout/Preview modes**, portals, omit and constrain/extend found sets; Q&A's natural-language **Intelligent Assistant** with its taught vocabulary; Airtable and Notion **card, gallery, kanban, calendar, timeline and map views**, saved views and record comments; an SQL editor with plans, transactions, dialect translation and history from SSMS and DBeaver; Power Query-style **transform steps**.
- **Data quality and records work:** exact and near-duplicate finding with merge, address and free-text date standardization ("abt 1850"), outlier and type-mismatch reports, validation of existing data, a data profiler, test data, and GEDCOM import and export for family history.
- **AI tab and menu (optional):** Ask Your Data in plain English (always showing the SQL it ran and the rows, never an invented number), question to query, explain and improve SQL, design a database or a form from a description, suggest indexes and normalization, write and explain code, classify and extract fields from notes, match records across tables, turn scanned forms into rows, and **Diagnose with AI** for damaged files. By default only the schema is sent, never your data. See [docs/AI-PLAN.md](docs/AI-PLAN.md).
- **Database repair and recovery:** Compact and Repair as you know it, plus Diagnose File for files that will not open, Deep Repair that rebuilds into a new file from the readable pages, system-table and code-project repair, dBASE header and memo repair, Paradox block repair, recovery of deleted records from free pages, SQLite WAL and journal recovery, object recovery from text exports, and carving of tables out of disk images and backups. The original is never written. See [docs/RECOVERY-PLAN.md](docs/RECOVERY-PLAN.md).
- **Ideas new to desktop databases** are listed in [docs/INNOVATIONS.md](docs/INNOVATIONS.md#9-new-in-annes-base): record history and restore, undo delete with related records, find across the whole database, object version history, one migration wizard in and out of every program, phone preview of forms, and more.

## Platforms (planned)

Each release will have builds for **Android** (APK and AAB), **iOS/iPadOS** (an unsigned .ipa you sign with your Apple ID), **Windows** (installer for x64 or ARM, or portable), **macOS** (universal), **Linux** (AppImage or .deb for x64, arm64 and armv7l, which covers **Raspberry Pi OS**), **ChromeOS** (Android app, Linux app or web app) and the **web** (static files; offline-capable and installable). Server connections and ODBC need the desktop builds or the suite relay; everything else works everywhere. See [docs/ARCHITECTURE-PLAN.md](docs/ARCHITECTURE-PLAN.md) and [docs/ROADMAP.md](docs/ROADMAP.md).

## The Anne's Office suite

| App | What it is | Repository |
|---|---|---|
| **Anne's Pen** | Word processor | https://github.com/socrtwo/QuillPen |
| **Anne's Grid** | Spreadsheet | https://github.com/socrtwo/QuillGrid |
| **Anne's Post** | Email | https://github.com/socrtwo/QuillPost |
| **Anne's Stage** | Presentations | https://github.com/socrtwo/QuillStage |
| **Anne's Loom** | Web sites | https://github.com/socrtwo/QuillLoom |
| **Anne's Press** | Desktop publishing | https://github.com/socrtwo/QuillPress |
| **Anne's Folio** | PDF | https://github.com/socrtwo/QuillFolio |
| **Anne's Lens** | Pictures | https://github.com/socrtwo/QuillLens |
| **Anne's Base** | Databases (this project) | https://github.com/socrtwo/annes-base |

The apps share one application shell: command registry, Quick Access Bar, customizable tabs and keyboard, command search, macro recorder, AI setup wizard and providers, recovery engine and platform layer. Anne's Base sends mail merges, labels and form letters to Anne's Pen, live tables to Anne's Grid, catalogs and directories to Anne's Press, searchable web directories and published apps to Anne's Loom, reports to Anne's Folio, and e-mail through Anne's Post; it takes OCR text from Anne's Folio and Anne's Lens for Records from Documents.

## Documentation

| File | Contents |
|---|---|
| [docs/INNOVATIONS.md](docs/INNOVATIONS.md) | Survey of database programs, past and present, and what Anne's Base adopts from each |
| [docs/COMMANDS-PLAN.md](docs/COMMANDS-PLAN.md) | The planned command inventory, tab by tab, with ids, shortcuts and origins (generated) |
| [docs/MENUS-PLAN.md](docs/MENUS-PLAN.md) | The classic menu layouts and the ribbon's Home tab (generated) |
| [docs/commands-plan.json](docs/commands-plan.json) | The same data as JSON, for the future catalog test (generated) |
| [docs/QAT.md](docs/QAT.md) | The Quick Access Bar plan |
| [docs/AI-PLAN.md](docs/AI-PLAN.md) | The AI tab: questions, design, code, data, repair; services, privacy and limits |
| [docs/FORMATS-PLAN.md](docs/FORMATS-PLAN.md) | Every database and data format to open, link and save, current and historical |
| [docs/RECOVERY-PLAN.md](docs/RECOVERY-PLAN.md) | Database repair, deleted-record recovery and carving |
| [docs/CODE-PLAN.md](docs/CODE-PLAN.md) | Macros, the VBA-compatible Basic, the xBase interpreter, JavaScript and the object model |
| [docs/ARCHITECTURE-PLAN.md](docs/ARCHITECTURE-PLAN.md) | Intended architecture: shell, storage engine, journal, query engine, designers, connectors, builds |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Milestones |
| [docs/ENSEMBLE.md](docs/ENSEMBLE.md) | Several AIs on one request: master synthesis or Quaker consensus |
| [docs/LEGAL.md](docs/LEGAL.md) | Clean-room, trademark and licensing notes |

The command and menu plans are generated: edit [docs/commands-plan.src.txt](docs/commands-plan.src.txt) or [docs/menus-plan.src.txt](docs/menus-plan.src.txt) and run `python3 scripts/gen-plan.py` (it also checks ids, menu references and shortcut conflicts).

The [synthetic test corpus](tests/corpus/README.md) supplies intact and damaged SQLite fixtures for future storage and recovery work. Generate it with `python3 scripts/gen-corpus.py`; run its checks with `python3 -m unittest discover -s tests -p 'test_*.py' -v`. Both use only Python's standard library and work in Termux.

## Project language

The interface, code comments and documentation use American English.

## License

[MIT](LICENSE). Copyright (c) 2026 Paul D Pruitt.

## Legal

Anne's Base is an independent, clean-room project released under the MIT License. It is not affiliated with, endorsed by, or sponsored by Microsoft, Claris, Corel, Lotus or IBM, Oracle, dBase LLC, the makers of any other database program named here, or any AI provider. Product names appear only to describe file-format compatibility, the arrangement a classic menu layout follows, or the origin of an idea (nominative use). Microsoft Access is a trademark of Microsoft Corporation; other names belong to their owners. The interface, icons, templates, sample data and text will be original or openly licensed. See [docs/LEGAL.md](docs/LEGAL.md).
