# Architecture plan

> **This is a plan, not a description of existing code.** Anne's Base has an early native editor and SQLite viewer; advanced database features remain planned. The design mirrors what the sister apps already ship (Anne's Pen, Anne's Grid, Anne's Stage, Anne's Folio), so that the suite shares one shell and one set of conventions. See [ARCHITECTURE.md](ARCHITECTURE.md) for what exists today; this plan records the remaining intended architecture.

## Summary

Anne's Base will be a TypeScript web application built with **Vite** and tested with **vitest**. The Android and iOS releases will package it with **Capacitor 8**, the Windows, macOS and Linux releases with **Electron**, and the same build will run in a browser as an installable, offline-capable **PWA**. It shares the suite shell: command registry, ribbon, Quick Access Bar, customizable tabs and keyboard, command search, macro recorder, AI setup and providers, the recovery engine's generic parts, and the platform layer. It also shares the **classic menu bar** with Anne's Loom and Anne's Lens.

New to the suite are a **storage engine** (SQLite compiled to WebAssembly, with a journal), a **query engine** layer (dialects, the query grid, plans), **designers** for tables, queries, forms, reports and macros, **format readers** for Access, xBase, Paradox and the rest, and **connectors** to servers.

## Intended source layout

```
src/
  main.ts                 entry: command registry, App + Shell, launch-file handling, back button, CLI switches (desktop)
  app.ts                  App (windows, open databases, exec(), recording) and DatabaseTab (database, open objects, history)
  prefs.ts                per-device preferences: QAT (QAT_STANDARD, QAT_EXTRAS, addAllQatChoices), custom tabs, menus,
                          keymap, macros, trusted locations, connections (credentials in the keychain), AI settings
  commands/
    registry.ts           Command interface and registry: the single source for ribbon, menus, QAT, keys, macros, search
    *.ts                  command modules by area (file, home/edit/record/sort/filter/sheet/format, create, ext, dbtools,
                          table, query, form, macro, data, recover, xbase, view, ai, dev, help)
  ui/
    shell.ts, ribbon.ts   shared with the suite
    classicMenus.ts       menu layouts generated from docs/commands-plan.json at build time; Customize Menus
    navPane.ts            navigation pane and the classic Database window
    datasheet.ts          virtualized grid: millions of rows, frozen columns, subdatasheets, totals row, inline editing
    designers/
      tableDesigner.ts    fields, types, properties, indexes, validation, lookups
      queryDesigner.ts    the QBE grid, join lines, totals, parameters; round-trips with SQL view
      sqlEditor.ts        CodeMirror 6: dialect-aware highlighting and completion, plans, results
      formDesigner.ts     layout and design views, control layouts (stacked/tabular), anchoring, phone preview
      reportDesigner.ts   bands, grouping and sorting, totals, page setup; shares the layout engine with forms
      macroDesigner.ts    structured macro editor and action catalog
      relationships.ts    relationship and ER diagrams
    views/                card, gallery, kanban, calendar, timeline, map, pivot, dashboard
    dialogs/              import/export specs, linked table manager, documenter, migration wizard, recovery report…
  engine/
    sqlite/               SQLite (WASM build, with FTS5, JSON1, R*Tree, math; SQLCipher-compatible codec) on OPFS in
                          browsers, the file system on desktop and mobile
    journal.ts            change journal: before/after images per row, transaction ids, user, time; snapshots
    catalog.ts            qb_ tables: object definitions, properties, version history
    sql/
      parser.ts           one SQL parser with dialect modules (Access/Jet SQL, ANSI, SQLite, PostgreSQL, MySQL,
                          SQL Server, Oracle) producing a common AST; printer per dialect (translation, formatting)
      jet.ts              Jet SQL semantics on SQLite: IIf, Nz, DLookup, wildcard *, #dates#, TRANSFORM…PIVOT,
                          parameters, domain aggregates
      planner.ts          explain plans, Index Advisor, query statistics
    expr/                 expression service for validation rules, calculated fields, control sources, conditions
    types.ts              field types and conversions (Access types, xBase types, server types → storage classes)
  formats/
    registry.ts           content sniffing and reader/writer selection
    jet/                  .mdb/.accdb reader and writer (pages, usage maps, LVAL chains, indexes, encryption, MSys*)
    accessObjects/        forms, reports, macros, modules out of Jet/ACE storage and SaveAsText; VBA project storage
    xbase/                .dbf/.dbt/.fpt/.ndx/.mdx/.cdx/.idx/.ntx, .dbc containers
    paradox/              .db/.px/.mb/.Xnn/.val
    odb/, wdb/, filemaker/, approach/, qa/, historic/
    text/, json/, xml/, sheet/, columnar/, gedcom/, sqlscript/
  connectors/
    postgres.ts, mysql.ts, mssql.ts, oracle.ts, firebird.ts, odbc.ts (desktop, native modules in Electron)
    relay.ts              the suite relay for mobile and web
    rest.ts               REST sources; local REST API server (desktop)
  code/
    basic/                VBA-compatible Basic: lexer, parser, interpreter, debugger protocol
    xbase/                xBase interpreter and dot prompt
    js/                   JavaScript macro host (sandboxed realm) and the recorder
    om/                   the object model shared by all three (Application, CurrentDb, DoCmd, Forms, Recordset…)
  recovery/               see RECOVERY-PLAN.md: diagnose, repair, deep repair, carving, salvage, report
  ai/                     shared providers + Ask Your Data, vocabulary, schema embedding, plan review UI
  platform/               file access, keychain, printing, share, intents (shared with the suite)
tests/
  unit/                   engine, journal, SQL dialects, expression service, every format reader/writer, interpreters
  catalog.test.ts         registry vs docs/commands-plan.json
  corpus/                 real files from each program (openly licensed) and generated damaged files
```

## Key design decisions

- **SQLite as the native engine.** It is public domain, extremely well tested, runs everywhere including the browser (WASM on OPFS), and its file format is documented and stable — so a `.qbase` file is never a hostage to this app. Access/Jet semantics (Jet SQL, domain functions, crosstabs, wildcards, date literals) are provided by a translation layer, not by emulating Jet.
- **Live Access files, carefully.** `.accdb`/`.mdb` files open in place through the `formats/jet` reader-writer; until a feature's round-trip tests against Access pass, writes go through *Convert* to `.qbase` with a link back, and the user is told.
- **The journal is part of the engine.** Every write path (datasheet, forms, action queries, code, imports) goes through one transaction layer that records before and after images, so undo, history, as-of views, restore and lineage are reliable rather than per-feature.
- **One layout engine for forms and reports,** with layout groups (stacked, tabular) as in Access, absolute positioning for imported legacy designs, and reflow for phone widths.
- **Designs as data.** Objects are stored as versioned JSON in `qb_` tables, which gives object history, text export, diff and recovery for free.
- **Large data.** The datasheet virtualizes rows and columns; imports stream; analytical work on large Parquet/CSV files can use DuckDB-WASM (MIT) as an optional module.
- **Multi-user.** On desktop, `.qbase` files on a shared folder use SQLite's locking with WAL, which suits a handful of simultaneous users on a reliable network share, as Access does; for more, *Move to Server* (`dbtools.moveToServer`) upsizes to PostgreSQL or MySQL or the suite relay. The app says so rather than letting a share corrupt a file.

## Classic menus

As in Anne's Loom and Anne's Lens: menu layouts are generated at build time from `docs/commands-plan.json` (the data behind [MENUS-PLAN.md](MENUS-PLAN.md)); every entry is a command id, so the catalog test guarantees that no layout names a missing command.

## Platform specifics

- **Android:** *Open with* and *Share to* for `.qbase`, `.accdb`, `.mdb`, `.dbf`, `.sqlite`, `.db`, `.csv`; Storage Access Framework for files; barcode scanning with the camera (`form.scanner`).
- **iOS/iPadOS:** document-based app with Files integration.
- **Windows/macOS/Linux (Electron):** native ODBC and server drivers, the local REST API, command-line switches, file association, printing through the system dialogs.
- **Web (PWA):** OPFS storage, File System Access API where available (download/upload otherwise), server connections through the relay.

## Builds and CI

The sister apps' workflows: type check, unit tests, catalog test, corpus tests (recovery and format round trips), then builds for every platform on tags.

## Performance and correctness tests

Datasheet scrolling at 1 million rows; import of a 1 GB CSV; Jet SQL compatibility suite (the queries of the classic Access sample databases); round trips `.accdb → .qbase → .accdb`; recovery scores on the damaged corpus; interpreter conformance suites.
