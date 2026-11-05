# Roadmap

> **In progress: early M1 native editor.** The browser shell supports native table creation, record editing, transactional history, sequential undo and browser autosave/restore, plus read-only SQLite browsing. Worker/OPFS storage, versioned snapshots, full field design and platform packaging remain unfinished. Milestones are ordered by dependency, not by date. The release goal for each milestone from M1 on is a tagged prerelease built for every platform; that workflow is not implemented yet. Command ids refer to [COMMANDS-PLAN.md](COMMANDS-PLAN.md).

## M0 — Planning (this repository)

- [x] README, feature survey ([INNOVATIONS.md](INNOVATIONS.md)), command inventory ([COMMANDS-PLAN.md](COMMANDS-PLAN.md), generated from [commands-plan.src.txt](commands-plan.src.txt)), classic menu layouts ([MENUS-PLAN.md](MENUS-PLAN.md)), Quick Access Bar plan ([QAT.md](QAT.md)), AI plan ([AI-PLAN.md](AI-PLAN.md)), formats ([FORMATS-PLAN.md](FORMATS-PLAN.md)), recovery ([RECOVERY-PLAN.md](RECOVERY-PLAN.md)), code ([CODE-PLAN.md](CODE-PLAN.md)), architecture ([ARCHITECTURE-PLAN.md](ARCHITECTURE-PLAN.md)), legal notes, license, contributing guide and issue templates.
- [x] `scripts/gen-plan.py` validates ids, menu references, origins and shortcut conflicts.
- [x] Planning-stage CI validates plans, metadata and the synthetic corpus on Linux and Windows with Python 3.10 and 3.13; checks Termux setup script syntax on Linux. Application builds and release workflows remain in M1.
- [ ] Verify the classic menu arrangements and default keys against installed copies or published manuals of Access 2003 and current Access, dBASE III Plus and IV, FoxPro 2.6 for DOS, Visual FoxPro 9, Paradox 4.5 for DOS and Paradox for Windows, FileMaker Pro, Lotus Approach 97, Works, LibreOffice Base, SSMS and DBeaver, and correct [menus-plan.src.txt](menus-plan.src.txt).
- [ ] Collect an openly licensed test corpus: databases from each program in FORMATS-PLAN.md (made for the project or redistributable), and generated damaged files.
  - [x] Synthetic SQLite seed corpus: intact relational data, damaged header, damaged secondary index and truncation; provenance, logical ground truth and read-only validation tests. See [tests/corpus/README.md](../tests/corpus/README.md).
  - [ ] Add Access, xBase, Paradox and other format samples, WAL/journal damage and recovery-score assertions as their readers arrive.
- [ ] Confirm the license of every on-device model candidate in AI-PLAN.md and of the optional DuckDB module.

## M1 — Shell, engine and tables

- Project scaffold: TypeScript, Vite, vitest, Capacitor 8 (Android, iOS), Electron, PWA manifest and service worker; CI and release workflows from the sister apps.
  - [x] TypeScript/Vite browser entry, vitest, lockfile and web validation CI (`npm ci`, tests, type check and production build).
  - [ ] Capacitor, Electron, PWA/offline support and multiplatform release workflows.
- Suite shell: command registry, ribbon, Quick Access Bar with **Add All Choices** (`view.qatAddAll`), Customize Ribbon and Keyboard, command search, Backstage, preferences, settings import/export, portable mode.
  - [x] Registry for every planned command, search, ribbon groups, Quick Access pin/unpin/clear, standard and extra choices with Save/Print first, and browser-persisted pins/menu selection. Execution requires a real handler; unimplemented commands stay unavailable.
  - [x] Modern Office-style ribbon tabs with keyboard navigation and Word-style File/Backstage navigation; database actions stay unavailable until implemented.
  - [ ] Custom ribbon/key bindings, working database actions in Backstage, broader preferences, import/export and portable mode; integrate suite shell conventions as features arrive.
- **Classic menu bar** with the Access 2003 layout (default) and View ▸ Menus.
  - [x] Render all 15 planned layouts and nested menus with a layout selector; default to Access 2003 style.
  - [ ] Verify historical arrangements (M0), implement the View ▸ Menus command and complete menu keyboard navigation.
- Storage engine: SQLite WASM, `.qbase` catalog, **journal**, snapshots, encryption.
  - [x] Locally bundled SQLite WASM, experimental `0-preview` native metadata, blank/sample creation, checked read-only file opening and copy download; 32 MiB in-memory input limit.
  - [x] Experimental `1-preview` managed-table catalog and transactional before/after journal; sequential undo survives download/reopen. Ordinary/old/unsupported database schemas remain read-only.
  - [x] IndexedDB recovery copies for each editable native database, atomic metadata/byte writes, reload restoration with undo history, serialized/coalesced autosaves, stale-tab revision checks and visible storage-error retry.
  - [ ] Worker/OPFS and platform storage, finalized object catalog, transaction grouping across multiple operations, versioned snapshots and encryption.
- Navigation pane and Database window; Table Datasheet and Design views with every field type, properties, validation, indexes, lookups; record commands, sort and filter (selection, form, advanced), find and replace, totals row.
  - [x] Table navigation and read-only datasheet pages, preserving integer precision and displaying nulls/blobs safely.
  - [x] Basic table creation (Text, Whole number, Decimal number, non-null fields, automatic integer primary key), record insert/update/delete, null controls and sequential undo; pending-edit and draft guards.
  - [x] Single-column sort, typed column filters, NULL conditions, literal find across text/numbers, filter toggle/clear, stable paged ordering and shared command bindings; works on read-only SQLite too.
  - [ ] Existing-table schema design, remaining field types, validation/index/lookup designers, virtualized large-data grids, multi-column/advanced sort, multi-condition/saved filters and the remaining record commands.
- Undo Delete, Record History, Show Table as of (the journal's first uses).
  - [x] Global Undo restores deletions and previous row values; the latest 100 journal entries are visible in Change history.
  - [ ] Dedicated per-record history/restore, as-of table views and the full Undo Delete workflow.
- [x] A catalog test comparing the registry with `docs/commands-plan.json`, including every menu, ribbon and Home-tab reference. This checks registration coverage, not implementation of every planned command.

## M2 — Queries and relationships

- Relationships window, referential integrity, ER diagram.
- Query Design grid and SQL view round-trip; every query type; parameters, totals, crosstab; Jet SQL on SQLite.
- SQL editor with dialects, explain plan, transactions, history; Translate SQL.
- Import and export: CSV/text with specs, spreadsheets, JSON, XML, HTML, SQLite, SQL scripts; Open in Anne's Grid.

## M3 — Forms, reports and Access files

- Form and report designers (layout and design views), controls, subforms, conditional formatting, grouping and totals, labels, print and print preview, PDF export.
- Wizards: table, query, form, report, label; templates.
- `.accdb`/`.mdb` reading (tables, queries, relationships, then forms, reports and macros); writing behind the verified flag; Split Database, Linked Table Manager, Compact and Repair (Access and `.qbase`).
- Access 2003, FileMaker, Base and Works menu layouts; Customize Menus.

## M4 — Macros and code

- Structured macros and data macros; AutoExec; Trust Center.
- VBA-compatible Basic with DAO and DoCmd, code editor, Immediate window, debugger; import of modules from Access files.
- JavaScript macros and the recorder; command-line switches.

## M5 — Recovery

- Diagnose File, Recovery Report, Deep Repair for SQLite and Jet/ACE, system-table and code-project repair, deleted-record recovery, WAL and journal recovery, object recovery, Salvage, Undo Last Repair, Database Health.
- Damaged-file corpus tests with recovery scores.

## M6 — xBase, Paradox and the historic programs

- `.dbf` family with memo and index files, PACK/RECALL/ZAP, header and memo repair; xBase tab, dot prompt, Command window, xBase interpreter, ASSIST and Control Center; dBASE, FoxPro, Visual FoxPro layouts.
- Paradox reading and writing, QBE example elements and ANSWER tables, Paradox repair; Paradox layouts.
- FileMaker export import, Approach, Works, Q&A, `.odb` and the other historic importers; the migration wizard in both directions.

## M7 — Data tools, views and sharing

- Data tab: near duplicates and merge, cleanup, standardization, validation reports, transform steps, test data, profiler, lineage; GEDCOM.
- Card, gallery, kanban, calendar, timeline and map views; saved views; record comments; pivot table and chart; dashboards.
- Hand-offs to Anne's Pen (merge, labels, form letters), Press, Loom, Folio and Post; app pages and shared forms through the relay; Synchronize Copies.

## M8 — AI

- AI tab and AI menu: setup wizard, adapters, Ask Your Data with the vocabulary and rule-based parser, design, code, data and repair commands, Several AIs, AI History, privacy settings per database and per field.
- On-device embeddings and matching.

## M9 — Servers and stretch goals

- Server connections (desktop): PostgreSQL, MySQL/MariaDB, SQL Server, Oracle, Firebird, ODBC; Move to Server; schema and data compare; jobs; users logged in.
- Relay connections for mobile and web; local REST API.
- Carving (`recover.carve`) refinements; DuckDB analytical module; HyperCard stacks.

## Recovery (throughout)

Tolerant reading arrives with each format reader, and each reader's repair methods arrive with it, each with damaged-file tests.
