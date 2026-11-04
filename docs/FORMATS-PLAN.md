# File formats and connections (plan)

> **Plan.** Anne's Base has an early SQLite viewer; editing and most database features remain planned. This lists every database and data format Anne's Base intends to open, link, import or save, current and historical, with the planned fidelity and the public sources the work will be based on. Recognition is by content, not extension: *File ▸ Open* reads the first bytes and picks the reader. Commands are in [COMMANDS-PLAN.md](COMMANDS-PLAN.md#external-data).

Legend — **Open**: works as a live database (read and write). **Import**: data (and objects where noted) copied into a `.qbase`. **Link**: tables used in place. **Export**: written out. *R* read, *W* write.

## Native format

| Format | Ext. | Support | Notes |
|---|---|---|---|
| Anne's Base database | `.qbase` | Open R/W | An SQLite 3 database. Your tables are ordinary SQLite tables any SQLite tool can read; forms, reports, queries, macros, modules, settings and the journal live in tables prefixed `qb_`. Optional SQLCipher-compatible AES-256 encryption. No size limit short of SQLite's (terabytes). |
| Anne's Base template | `.qbaset` | Open R/W | A `.qbase` with a template manifest. |
| Locked application | `.qbasel` | Open R | Designs hidden, code compiled, data editable (the `.accde` idea). |
| Text folder | folder | Import/Export | Every object as a text file (JSON for designs, `.bas`/`.js` for code, CSV or SQL for data): for version control and recovery. |

## Microsoft Access and Jet

| Format | Ext. | Support | Notes |
|---|---|---|---|
| Access 2007–current (ACE) | `.accdb` | Open R/W, Link | Tables, indexes, relationships, queries (SQL), data macros, attachment, multivalued and calculated fields; forms, reports, macros and modules imported and converted. Password encryption (ACE AES/RC4) read and written. |
| Access 2000–2003 (Jet 4) | `.mdb` | Open R/W, Link | As above; Jet 4 encoding and Unicode compression. |
| Access 97 (Jet 3), Access 2/95 | `.mdb` | Open R, Import | Including "encoded" (`dbtools.encodeJet`) files. Jet 1.x–2.x where samples allow. |
| Locked and runtime files | `.accde`, `.mde`, `.accdr` | Import (data, queries, and forms and reports where not compiled away) | Compiled code cannot be recovered by design; reported as such. |
| Access Data Project | `.adp` | Import (forms, reports, macros, modules); link the SQL Server tables | |
| Workgroup information file | `.mdw` | Import (users, groups → roles) | Passwords are not imported; users set new ones. |
| Lock files | `.ldb`, `.laccdb` | Read | Who has the file open; stale lock cleanup. |
| Template, add-in | `.accdt`, `.accda`, `.mda` | Import | |
| SaveAsText exports | `.txt` per object | Import | Access's undocumented-but-stable SaveAsText format, as produced by common version-control add-ins. |

**Sources:** the public Jet/ACE format descriptions from the mdbtools project and Jackcess (Apache 2.0) as clean-room references, Microsoft's [MS-*] open specifications where they apply, and the corpus of test files in [ROADMAP.md](ROADMAP.md) M0. Writing `.accdb`/`.mdb` will be held behind a "verified" flag per feature until round-trip tests with Access itself pass.

## The xBase family

| Format | Ext. | Support | Notes |
|---|---|---|---|
| dBASE II | `.dbf` | Open R, Import | |
| dBASE III / III Plus | `.dbf`, `.dbt`, `.ndx` | Open R/W, Link, Export | |
| dBASE IV, 5, Visual dBASE, dBASE 7 | `.dbf`, `.dbt`, `.mdx` | Open R/W, Link, Export | Level 7 long field names and new types. |
| FoxBASE, FoxPro 2.x | `.dbf`, `.fpt`, `.idx`, `.cdx` | Open R/W, Link, Export | |
| Visual FoxPro | `.dbf`, `.fpt`, `.cdx`, `.dbc`/`.dct`/`.dcx` | Open R/W, Link; database container read | Null flags, varchar/varbinary, autoinc. Forms `.scx`/`.sct` and reports `.frx`/`.frt` import as far as their table structure is documented. |
| Clipper, Harbour | `.dbf`, `.dbt`, `.ntx` | Open R/W | |
| Shapefile attribute tables | `.dbf` | Open R/W | With the code page from `.cpg`. |
| xBase programs | `.prg` | Open, run in the xBase interpreter | See [CODE-PLAN.md](CODE-PLAN.md). |

Code pages from the `.dbf` language driver byte (437, 850, 1252, 866, 1251 and the rest), overridable.

## Other desktop databases

| Program | Files | Support |
|---|---|---|
| Paradox (DOS and Windows, levels 3–7) | `.db`, `.px`, `.mb`, `.Xnn`/`.Ynn`, `.val`, `.fam` | Open R/W, Link, Export; validity checks and referential integrity read |
| FileMaker Pro | `.fp3`, `.fp5` | Import where public information allows; otherwise from exports |
| FileMaker Pro 7 and later | `.fp7`, `.fmp12` | Import from FileMaker's exports: FMPXMLRESULT/FMPDSORESULT XML, Merge (`.mer`), tab, CSV, `.xlsx`; Database Design Report XML for structure |
| Lotus Approach | `.apr` (+ `.dbf`) | Import the `.dbf` tables; view definitions as far as known |
| Microsoft Works | `.wdb` | Import (Works 2–9) |
| Symantec Q&A | `.dtf`, `.idx` | Import where the format is known; otherwise Q&A ASCII export |
| R:BASE, DataEase, Alpha Four/Five, PC-File, Reflex, Btrieve, DataFlex, Superbase, Approach | various | Import, direct where documented; otherwise their text exports with saved specs |
| LibreOffice/OpenOffice Base | `.odb` | Import: embedded HSQLDB 1.8 or Firebird data, queries, forms, reports |
| Kexi | `.kexi` | Open R/W (SQLite) |
| HyperCard | stacks | Import where public documentation allows (fields and cards; scripts as text) |

## Embedded and analytical databases

| Format | Support |
|---|---|
| SQLite 2 and 3 (`.sqlite`, `.db`, `.sqlite3`, with `-wal` and `-journal`) | Open R/W, Link |
| SQLCipher | Open R/W with key |
| DuckDB (`.duckdb`) | Open R, Import; write where the engine allows (desktop) |
| H2, HSQLDB, Derby | Import from their script exports |
| Firebird/InterBase (`.fdb`, `.gdb`) | Connect (desktop); embedded files through the engine where available |

## Server databases (connections)

PostgreSQL, MySQL and MariaDB, SQL Server and Azure SQL, Oracle, Firebird, CockroachDB and other PostgreSQL-wire servers, and **ODBC** (desktop) for anything else. Desktop builds connect directly; Android, iOS and the web connect through the suite relay or a REST gateway the user configures. Tables can be linked or imported; queries can be pass-through. Dumps (`pg_dump` plain and custom formats, `mysqldump`, SQL Server scripts) import without a server: they are run in a sandbox and the resulting tables kept.

## Data files

| Format | Support |
|---|---|
| CSV, TSV, fixed width, any delimiter | Import, Link, Export (saved specifications; encoding and date-order detection) |
| Excel `.xlsx`, `.xlsm`, `.xls`; OpenDocument `.ods`; Lotus `.wk1`/`.wks`/`.123`; Quattro `.wb1` | Import, Link (`.xlsx`, `.ods`), Export |
| JSON, NDJSON | Import (flatten into related tables or keep as JSON fields), Export |
| XML with or without XSD; Access XML export | Import, Export |
| HTML tables, web pages | Import |
| Parquet, Arrow IPC/Feather, Avro, ORC | Import; Parquet Export |
| MongoDB `mongoexport` JSON, `mongodump` BSON | Import |
| SQL scripts in any dialect | Import, Export |
| vCard, mail-program CSV, Anne's Post address book | Import |
| iCalendar `.ics` | Import |
| GEDCOM 5.5, 5.5.1, 7.0 (and GEDZIP) | Import, Export |
| PDF, XPS | Export (reports, forms, datasheets) |
| RTF | Export (reports) |

## Saving and converting

*File ▸ Convert Database* and *Save Database As* write `.qbase`, `.accdb`, `.mdb` (Jet 4), SQLite, a `.dbf` set, `.odb`, or an SQL script. Every conversion writes a **conversion report**: objects and properties that the target cannot hold (for example, data macros in `.mdb`, attachment fields in `.dbf`, VBA in SQLite) and what was done with them. Nothing is dropped silently.

## Licensing notes

The base app uses permissively licensed code only (see [LEGAL.md](LEGAL.md)): SQLite (public domain) compiled to WASM, a clean-room Jet/ACE reader and writer informed by Jackcess (Apache 2.0) and the published format notes, clean-room xBase and Paradox readers from public format descriptions. mdbtools' published format notes are used as a reference; its code, and the code of other GPL/LGPL implementations, is neither copied nor linked. Formats whose only documentation is leaked or decompiled code are not implemented.
