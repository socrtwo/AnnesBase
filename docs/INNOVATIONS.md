# Innovations survey

> **Plan.** Anne's Base has an early native editor and SQLite viewer; advanced database features remain planned. This survey records the database programs, past and present, whose commands and ideas Anne's Base adopts, and what it takes from each. Command ids are in [COMMANDS-PLAN.md](COMMANDS-PLAN.md); the origin codes there (ACC, DB, PDX…) refer to the programs below.

## How to read this

- Each entry names the program, its period, what it was known for, and the commands Anne's Base adopts. Descriptions are written from product knowledge and public documentation; dates and details will be checked before implementation (see [ROADMAP.md](ROADMAP.md), M0).
- Adopting an idea means reimplementing the behavior under Anne's Base's own interface and generic names (see [LEGAL.md](LEGAL.md)); no text, icons or code are copied.
- The guiding rule is **no missing commands**: if someone learned a command in one of these programs, Anne's Base has it, findable by its old name in command search and in *Help ▸ Coming from Another Program*.

## 1. The model: Microsoft Access

### Microsoft Access (1992–)

The desktop database most people mean by "a database": tables, queries, forms, reports, macros and VBA modules in one file, on the Jet engine (`.mdb`, Jet 1.x–4.0) and later ACE (`.accdb`, from Access 2007). Known for the query design grid, form and report wizards, the Relationships window, Compact and Repair, linked tables and the split front-end/back-end pattern, and VBA with DAO/ADO.

**Adopted:** essentially every command of the 2007-and-later ribbon (File/Backstage, Home, Create, External Data, Database Tools, and the contextual Table, Query, Form/Report Design, Arrange, Format and Macro tabs), the Access 2003 menu bar as the default classic layout, Access's keyboard conventions, the query types (select, make-table, append, update, crosstab, delete, union, pass-through, data definition), data macros, the expression builder, name AutoCorrect, the documenter, the performance and table analyzers, the Linked Table Manager, Split Database, locked (`.accde`-style) and runtime (`.accdr`-style) applications, the Trust Center, and command-line switches such as `/compact`, `/repair`, `/x`, `/cmd`, `/runtime`, `/excl` and `/ro`.

### Access's retired features (ACCX)

Features Access removed over the years but that people still have in old databases or miss: the **Database window** (replaced by the navigation pane in 2007), **switchboards** and the Switchboard Manager, **data access pages** (2000–2003; removed in 2007), **Access Data Projects** (`.adp`, SQL Server front ends; removed in 2013), **Jet replication** and the Briefcase, **user-level security** and `.mdw` workgroup files (not supported in `.accdb`), **PivotTable and PivotChart views** (removed in 2013), **Collect Data through e-mail** (removed in 2013), **Access web apps** on SharePoint (retired 2017–2018), the classic **AutoFormat** styles, and the macro grid with **Macro Names** and **Conditions** columns.

**Adopted:** each restored in a modern form: the Database window as an optional navigation view (`view.databaseWindow`), switchboards (`create.switchboard`), PivotTable/PivotChart (`create.pivot`, `create.pivotChart`), two-way sync of offline copies (`file.sync`), roles imported from `.mdw` files (`file.importWorkgroup`, `file.permissions`), Collect Data by Email through Anne's Post, AutoFormat styles as themes, and app pages (`create.appPage`, `file.newWebApp`) that take over from data access pages and web apps, with an importer for old data access pages.

## 2. The xBase family

### dBASE (Ashton-Tate 1980–1991, Borland 1991–1999, then dBASE Inc. and dBase LLC)

dBASE II, III, III Plus and IV defined desktop databases on CP/M and DOS: the `.dbf` table with `.dbt` memo and `.ndx`/`.mdx` index files, the **dot prompt** (`USE`, `LIST`, `DISPLAY`, `BROWSE`, `APPEND`, `REPLACE … FOR`, `LOCATE`, `SEEK`, `INDEX ON`, `SET FILTER`, `PACK`, `ZAP`), the menu-driven **ASSIST** of dBASE III Plus, and the **Control Center** of dBASE IV with panels for Data, Queries, Forms, Reports, Labels and Applications. Records were deleted in two steps: marked, then removed with `PACK` (and unmarked with `RECALL`).

**Adopted:** the xBase tab (`xbase.*`): a dot prompt that works on any table in the database, work areas, `USE`, `SET RELATION`, `SET ORDER`, `BROWSE`, `REPLACE`, `LOCATE/CONTINUE`, `SEEK`, `COUNT/SUM/AVERAGE`, `COPY TO … SDF/DELIMITED`, the `SET` commands as a dialog, the ASSIST and Control Center layouts as classic menus, `.prg` programs (`create.prg`, `xbase.runProgram`), and `PACK`, `RECALL` and `ZAP` (`table.pack`, `table.recall`, `table.zap`) on `.dbf` files — with a snapshot taken before anything destructive. Full `.dbf` reading and writing with memo files and indexes, and `.dbf` header and memo repair.

### FoxBASE, FoxPro and Visual FoxPro (Fox Software 1984–1992, Microsoft 1992–2007)

The fast xBase: Rushmore query optimization, compound `.cdx` indexes, `.fpt` memo files, the **Command window**, the FoxPro 2.x DOS menu bar (System, File, Edit, Database, Record, Program, Window), and Visual FoxPro's database containers (`.dbc`), forms (`.scx`), class libraries and SQL `SELECT` inside the language. Microsoft ended Visual FoxPro with version 9.0 (extended support ended in 2015).

**Adopted:** the Command window, the FoxPro for DOS and Visual FoxPro layouts, `.cdx`/`.idx`/`.fpt` support, reading `.dbc` containers (tables, long field names, relations), and `.scx` forms imported as far as their (documented) table structure allows. Compile and run for `.prg` code through the xBase interpreter ([CODE-PLAN.md](CODE-PLAN.md)).

### Clipper and Harbour (Nantucket 1985, Computer Associates; Harbour open source 1999–)

The xBase compiler for stand-alone DOS applications: `@ … SAY … GET` data-entry screens, `.ntx` indexes, code blocks. Harbour and xHarbour continue it as open source.

**Adopted:** `.ntx` indexes, the character-grid data entry screen designer (`create.screen`) that saves an ordinary form, and Clipper-compatible syntax in the xBase interpreter where it does not conflict with dBASE.

## 3. The other desktop databases of the DOS and early Windows era

### Paradox (Ansa 1985, Borland 1987–1996, Corel 1996–)

Known for **query by example** (QBE): check marks in a table image to choose fields, *example elements* to link tables, and results in a temporary **ANSWER** table; the Paradox Application Language (PAL); and a main menu bar of View, Ask, Report, Create, Modify, Image, Forms, Tools, Scripts, Help, Exit. Tables are `.db` with `.px` primary indexes, `.mb` memo blobs, `.Xnn`/`.Ynn` secondary indexes and `.val` validity checks.

**Adopted:** the Paradox for DOS and Windows layouts; QBE example elements, check-mark variants and ANSWER tables in the Query tab (`query.qbeExample`, `query.qbeCheck`, `query.answerTable`); Filter by Form, which descends from QBE; Paradox import and export including validity checks; Paradox table repair.

### FileMaker Pro (Nashoba Systems and Forethought 1985, Apple's Claris 1988–1998, FileMaker Inc. 1998–2019, Claris again 2019–)

The database for people who do not want to think about tables: **Browse, Find, Layout and Preview modes**; **find requests** with omit, **constrain** and **extend found set**; **portals** of related records inside a layout; auto-enter options; calculation fields; ScriptMaker step lists; sub-summary parts in layouts; value lists; container fields. The file format (`.fp3`, `.fp5`, `.fp7`, `.fmp12`) is not publicly documented.

**Adopted:** the four modes as views (`view.browseMode`…`view.previewMode`) with an optional FileMaker key set, omit/show omitted/constrain/extend (`filter.*`), portals (`form.portal`), auto-enter options (`table.autoEnter`), value lists, sub-summary parts, ScriptMaker-style step macros (`create.fmScript`), signature fields, and the FileMaker layout. Import is from FileMaker's own exports (XML, Merge, tab, `.xlsx`) — see [FORMATS-PLAN.md](FORMATS-PLAN.md).

### Lotus Approach (Approach Software 1991, Lotus 1994, IBM until 2014)

A friendly front end over `.dbf` files with views (forms, reports, worksheets, crosstabs, form letters, mailing labels, charts) stored in an `.apr` file; menus File, Edit, View, Create, Browse, Window, Help.

**Adopted:** the Approach layout, form letters and labels as first-class Create commands, crosstab as Pivot Table, and import of the `.dbf` tables behind an `.apr` view file.

### Microsoft Works database (1987–2009)

A simple flat-file database with List, Form and Report views, `.wdb` files, and form letters merged with the Works word processor.

**Adopted:** the Works layout, the Database Wizard idea for first-time users (`file.dbWizard`), and `.wdb` import.

### Symantec Q&A (1985–1998)

A DOS database with a word processor and the **Intelligent Assistant**: a natural-language query box that answered questions such as "show the names of customers in Ohio" after you *taught* it synonyms for your fields and values — an ancestor of today's text-to-SQL.

**Adopted:** Ask Your Data (`ai.ask`) is its modern successor, and Anne's Base keeps Q&A's best idea: a user-taught **vocabulary** (`ai.teach`) of synonyms for tables, fields and values, which makes plain-English questions dependable and also works without a hosted AI for simple questions. The classic box is kept as `ai.qaAssistant`. Q&A `.dtf` import where the format is known, otherwise from its ASCII export.

### R:BASE, DataEase, Alpha Four, PC-File, Reflex, Btrieve and DataFlex (1980s–)

R:BASE (relational, SQL-based, still sold), DataEase (menu-driven forms and the DQL query language), Alpha Four (later Alpha Five and Alpha Anywhere), PC-File (shareware flat-file manager), Borland Reflex (an early analytical database with crosstab views), Btrieve (a record manager under many DOS applications) and DataFlex.

**Adopted:** an importer for each (`ext.importHistoric`) — direct where the format is publicly documented, otherwise through the program's own text export with saved import specifications — and their ideas where they are not already covered: Reflex's crosstab report as Pivot Table, DataEase's menu-built forms as the Database Wizard.

### HyperCard (Apple, 1987–2004)

Stacks of cards with fields, buttons and HyperTalk scripts; for many people their first database.

**Adopted:** the Card Stack form (`create.cardStack`): one card per record, buttons with scripts, navigation by arrows, saved as an ordinary form so it works everywhere.

## 4. Open-source desktop databases

### LibreOffice Base and OpenOffice Base (from StarOffice/StarBase, 2003–)

An Access-like front end in the office suite, storing forms, reports and queries in an `.odb` file with an embedded HSQLDB or Firebird engine, or connecting to external databases; menus File, Edit, View, Insert, Tools, Window, Help; SQL view everywhere.

**Adopted:** the Base layout, `.odb` import (embedded data, queries, forms, reports), and the principle that every query can be opened in SQL.

### Kexi (KDE / Calligra, 2003–)

An open-source Access-like program on SQLite, with tables, queries, forms, reports and scripts.

**Adopted:** confirmation that a full desktop database on SQLite is practical; `.kexi` files open directly (they are SQLite).

## 5. Server databases and their tools

### SQL Server and SQL Server Management Studio; Oracle and SQL Developer; PostgreSQL and pgAdmin; MySQL, MariaDB and MySQL Workbench; Firebird

The server world: query windows with batches and transactions, execution plans, schema and data compare, jobs, backups and restores, logins and roles, procedures, triggers, temporal tables (SQL Server system-versioned tables; Oracle flashback query).

**Adopted:** the SSMS layout; the SQL editor (`query.sqlEditor`) with statement-under-cursor, scripts, begin/commit/rollback and auto-commit, results to grid, text or file, explain plan, query history and statistics; schema and data compare; Index Advisor; jobs and schedules; backups with verification; and **Show Table as of** (`data.asOf`), built on the journal rather than on a server feature. Live connections to these servers from the desktop builds.

### DBeaver, DB Browser for SQLite, Toad, DuckDB

Universal database tools and an analytical engine: ER diagrams, data profiling, snippets, pinned result tabs, result charts, test-data generators; DuckDB reads Parquet, CSV and JSON directly at speed.

**Adopted:** the DBeaver layout, ER diagrams, the data profiler, snippets, pinned results, result charts, test data; Parquet/Arrow/Avro import and Parquet export; DuckDB files open directly, and the analytical engine is available for large imports (see [ARCHITECTURE-PLAN.md](ARCHITECTURE-PLAN.md)).

### MongoDB and Compass

Document databases with nested JSON records.

**Adopted:** JSON and BSON import that either flattens nested objects into related tables or keeps them in JSON fields, and a JSON field type with path queries.

## 6. Spreadsheets as databases

### Excel and LibreOffice Calc with Power Query and PivotTables

Where most small databases actually live. Power Query's recorded transformation steps (unpivot, split column, merge, group), PivotTables and import from web pages.

**Adopted:** the Data tab's Transform group (`data.unpivot`, `data.steps`…), web-page table import, Pivot Table, and two-way hand-off with Anne's Grid (`ext.toGrid`, `file.newFromSheet`).

## 7. Web and low-code databases (2010s–)

### Airtable, Notion databases, Quickbase, Zoho Creator, Knack, Power Apps and Dataverse

Spreadsheet-like tables with rich field types (attachments, ratings, choices, links), many **views of the same table** (grid, card, gallery, kanban, calendar, timeline, map, form), saved views per person, record comments and history, shareable forms, automations, dashboards, and apps for phones.

**Adopted:** the view types in the Create tab (`create.cardView`, `create.galleryView`, `create.kanban`, `create.calendar`, `create.timeline`, `create.mapView`), saved views (`filter.savedViews`), record comments and history (`record.comments`, `record.history`), shared form links (`file.shareForm`), automations (`create.automation`), dashboards (`create.dashboard`), REST sources and a local REST API, and app pages published through Anne's Loom.

## 8. AI and records tools (2022–)

### AI database assistants and text-to-SQL

Assistants that turn questions into SQL, explain and optimize queries, design schemas and generate code. Their weakness is confident wrong answers.

**Adopted:** the AI tab ([AI-PLAN.md](AI-PLAN.md)), under one firm rule: **answers come from the database, not from the model.** Ask Your Data always runs a query and shows it; numbers in an answer are the query's results. Design and code suggestions arrive as reviewable plans, never applied silently.

### Genealogy databases (PAF, Legacy Family Tree, RootsMagic, Gramps)

Purpose-built databases for people, families, events and sources, exchanging data as GEDCOM; strong on duplicate merging and on recording the source of every fact.

**Adopted:** GEDCOM 5.5.1 and 7 import and export (`ext.importGedcom`, `ext.exportGedcom`), near-duplicate matching and merge with a record of what was merged (`data.fuzzyDuplicates`, `data.mergeRecords`), free-text date standardization with a precision flag ("abt 1850", "bef 1902"), recursive queries for trees, and a *family history* template.

## 9. New in Anne's Base

Ideas not found in the programs surveyed (they may exist elsewhere):

| Idea | Commands | Why |
|---|---|---|
| **Journal-backed safety** | `record.undoDelete`, `record.history`, `data.journal`, `data.asOf`, `data.restoreRows`, `edit.undoHistory` | Every insert, update and delete is journaled, so a mistaken update query or delete can be undone, with related records, long after the fact. |
| **Automatic snapshots** | `file.snapshots`, `recover.autoSnapshots` | Point-in-time copies without remembering to back up. |
| **Object version history** | `file.objectHistory` | Every saved design of a form, report, query or module, with compare and restore. |
| **Find across the database** | `edit.findEverywhere` | One search over data, object names, properties, macros and code. |
| **Database Health** | `file.health`, `recover.monitor`, `recover.verifyOnOpen` | Warns before trouble: fragmentation, the 2 GB limit of `.mdb`/`.accdb`, broken links, missing references. |
| **Diagnose any file** | `recover.diagnose`, `ai.diagnose` | A plain-language account of what is wrong with a database that will not open, and the safest order of repairs. |
| **Repair never writes the original** | `recover.deepRepair`, `recover.undoRepair` | Every repair produces a new file; switching back is one command. |
| **Recover from anything** | `recover.carve` | Tables carved out of disk images, backups, attachments and archives. |
| **One migration wizard, both directions** | `dbtools.migrate`, `dbtools.migrateOut` | In from Access, dBASE, FoxPro, Paradox, FileMaker, Approach, Works, Q&A and the rest; out again, so nobody is locked in. |
| **Lookup and multivalued fields to real tables** | `table.lookupToTable`, `table.multivaluedToTable` | Fixes the two most common Access design traps with one command each. |
| **Suggest Relationships** | `dbtools.suggestRelationships` | Finds the joins a database was always meant to have. |
| **Validate existing data** | `data.validateAll`, `data.typeMismatch`, `data.outliers` | Access checks rules only when data is entered; this checks what is already there. |
| **Natural-language filter** | `filter.natural` | Filters from a sentence, showing the filter it built. |
| **Phone preview of forms** | `form.phonePreview` | One form design that works on a phone. |
| **SQL dialect translation** | `query.dialect`, `query.translate` | Move queries between Access SQL, SQLite, PostgreSQL, MySQL, SQL Server and Oracle. |
| **Records from Documents** | `ai.fromDocuments` | Registration forms, invoices and census pages into rows, through the suite's OCR. |
| **Data lineage** | `data.lineage` | Which import, query or automation produced a row. |
| **Text-folder round trip** | `file.exportTextFolder`, `file.importTextFolder` | The whole database as text for version control, and a way back from a good export when the file is damaged. |

## Considered and skipped

- **A proprietary file format of our own.** The native format is SQLite, documented and readable by other tools.
- **Full ActiveX hosting.** Old ActiveX controls are recognized on import and replaced by native controls with a report; hosting them would tie the app to Windows and is a security risk.
- **Reading the FileMaker `.fmp12` format directly.** It is undocumented; import is from FileMaker's own exports.
- **Running unsigned VBA from downloaded files automatically.** Code runs only in trusted databases, as in Access.
