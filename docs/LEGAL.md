# Clean-room, trademark and licensing notes

This file records how Anne's Base will provide the complete command set of Microsoft Access and the other database programs while avoiding other vendors' trademarks and copyrights. It summarizes the practice the other Anne's Office apps follow; it is not legal advice. Anne's Base has an early command shell; this file states the rules for existing and future code.

## What is reproduced, and why it is safe

- **Functionality and command names.** Database operations (New Record, Filter by Selection, Make-Table Query, Compact and Repair, Linked Table Manager, Report Wizard, Mailing Labels) are functional ideas, and their names are ordinary descriptive words used across the industry. Functionality is not protected by copyright, and descriptive terms are not trademarks for those functions.
- **Menu arrangements.** The classic menu layouts ([MENUS-PLAN.md](MENUS-PLAN.md)) reproduce how commands are *grouped* in familiar programs, so people can find them, under Anne's Base's own labels, ordering details, tooltips and help text. No menu text, dialog layout, help file or tooltip is copied.
- **Keyboard shortcuts.** Long-standing conventions (F11 for the navigation pane, Ctrl+; for today's date, Shift+F9 to requery) are functional conventions users rely on; all can be rebound.
- **Languages.** SQL is a standard; VBA-compatible Basic and the xBase language are implemented from public language references and observed behavior so that existing code runs. Language syntax and the names of functions and objects (`DLookup`, `DoCmd`, `CurrentDb`, `REPLACE … FOR`) are functional interfaces needed for compatibility. No Microsoft or other vendor code, type libraries or documentation text is included.
- **File formats.** Formats are implemented from public specifications and documentation (SQLite file format, Microsoft's published open specifications where they apply, xBase and Paradox format descriptions published over decades, GEDCOM, Parquet, ODF) and from open-source references with permissive licenses (Jackcess, Apache 2.0). Undocumented formats are read only as far as public, clean-room information allows.

## What is deliberately not reproduced

- No vendor logos, icons, splash screens, color schemes or trade dress (Access's maroon key icon and its color are not used; Anne's Base's icon is original and part of the suite family). Command icons will be Google's Material Symbols (Apache 2.0).
- No vendor names in the app's own name or interface, except as the *names of menu layouts* in View ▸ Classic Menu Layout ("Access 2003 style", "dBASE IV Control Center style"), which identify an arrangement (nominative use), in *Help ▸ Coming from Another Program*, and in file-type lists to identify formats. Brand-specific feature names are replaced with generic terms:

| Vendor term | Anne's Base term |
|---|---|
| Intelligent Assistant (Q&A) | Ask Your Data (the classic box is labeled "Intelligent Assistant (classic)" only as a description of the style) |
| Copilot and other assistant brand names | AI tab |
| ACCDE / MDE (as product file types) | Locked Application (`.qbasel`) |
| Access Runtime | Runtime mode |
| Application Parts | Table from Template |
| Rushmore (FoxPro) | (not named; the optimizer is just the query engine) |
| ScriptMaker (FileMaker) | Script (step list) |
| Portal (FileMaker) | Portal (generic description of a related-records panel) |
| QBE as a Paradox feature | Query by example (generic) |
| Interfaces (Airtable) | App Page |
| Power Query | Transform Steps |
| Northwind (Microsoft sample) | an original sample database |

- No copied help text, templates, sample databases, wizards' text, themes or icons. Templates and samples are original.
- No reverse engineering of license checks or DRM; no decoding of formats whose only documentation is leaked or decompiled code; no recovery of passwords for protected files (password-protected files open only with the password).

## Nominative use

Anne's Base's documentation names other products (Microsoft Access, Jet and ACE, Visual Basic for Applications, Excel, Works, SQL Server, Power Apps, Dataverse, dBASE, FoxBASE, FoxPro, Visual FoxPro, Clipper, Harbour, Paradox, FileMaker Pro, Lotus Approach, Q&A, R:BASE, DataEase, Alpha Four, Alpha Five, Alpha Anywhere, PC-File, Reflex, Btrieve, DataFlex, Superbase, HyperCard, LibreOffice Base, OpenOffice Base, Kexi, SQLite, SQLCipher, PostgreSQL, pgAdmin, MySQL, MariaDB, Oracle, Firebird, DuckDB, DBeaver, Toad, MongoDB, Airtable, Notion, Quickbase, Zoho Creator, Knack, PAF, Legacy Family Tree, RootsMagic, Gramps and others) only to identify file formats and languages, interoperability targets and menu arrangements, or to credit where an idea came from ("Find requests with omit, inspired by FileMaker"). This is nominative use; it does not imply affiliation, sponsorship or endorsement. The names are trademarks of their respective owners, including:

- Microsoft, Access, Excel, Visual FoxPro, Visual Basic, SQL Server, Power Apps and Works are trademarks of Microsoft Corporation.
- dBASE is a trademark of dBase LLC.
- Paradox is a trademark of Corel Corporation.
- FileMaker and Claris are trademarks of Claris International Inc.
- Lotus and Approach are trademarks of HCL Technologies or IBM.
- HyperCard is a trademark of Apple Inc.
- Oracle and MySQL are trademarks of Oracle Corporation.
- Airtable, Notion, Quickbase, MongoDB and DBeaver are trademarks of their respective companies.
- Other names belong to their respective owners.

## Third-party components (planned)

The final list will be generated from `package.json` and the WASM build manifests into a third-party notices file at build time, as in the sister apps. Only permissive licenses are accepted in the base app:

| Component | License |
|---|---|
| SQLite (WASM build, with FTS5, JSON1, R*Tree) | public domain |
| SQLCipher-compatible codec (clean-room or the community edition's BSD-style license) | BSD-style |
| CodeMirror 6 | MIT |
| pdf-lib or the suite's PDF writer | MIT |
| ONNX Runtime Web, Transformers.js | MIT, Apache 2.0 |
| DuckDB-WASM (optional module) | MIT |
| Apache Arrow / Parquet readers | Apache 2.0 |
| node-postgres, mysql2, tedious (SQL Server) — desktop only | MIT |
| Material Symbols | Apache 2.0 |
| Capacitor, Electron, electron-builder | MIT |
| On-device models | each model's own license, shown before download; permissive only (see AI-PLAN.md) |

Jackcess (Apache 2.0, Java) is a reference for the Jet/ACE formats; if code is ported from it, its license and NOTICE are kept, as Apache 2.0 requires.

**Not used:** mdbtools code (GPL/LGPL; its published format notes are a reference only), Oracle Instant Client in the base app (its license does not allow redistribution in all the ways the suite ships; Oracle connections use a pure-JavaScript protocol client or ODBC), any GPL or AGPL code, non-commercial-only model weights.

## Online services

Anne's Base works offline. Online services are called only when the user invokes the matching command: the chosen AI services (AI tab), server connections the user configures, the suite relay for app pages, shared forms and synchronization, model and module downloads, Open URL and web imports, address standardization services (optional), map tiles (map views; OpenStreetMap tile usage policy respected, offline basemap optional), and update checks (desktop and APK builds, opt-in). By default AI services receive only the schema, never data (see [AI-PLAN.md](AI-PLAN.md)).
