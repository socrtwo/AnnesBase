# Current architecture

Anne's Base currently contains a browser shell, an in-memory native table editor
with a transaction journal and undo, a read-only SQLite viewer and synthetic fixtures.
[ARCHITECTURE-PLAN.md](ARCHITECTURE-PLAN.md) describes the intended full product.

## Web scaffold

Vite bundles the TypeScript entry in `src/main.ts` and styles in `src/style.css`.
The application uses browser DOM APIs with no UI framework. `npm run dev` serves
the preview; `npm run build` type-checks and produces `dist/`. Node.js 24 LTS is
the recommended development version. The web build is not yet an offline PWA.

## Commands and views

`src/commands/registry.ts` loads metadata from `docs/commands-plan.json`. Each
planned command is registered once; a separate handler map controls whether it
can execute. Metadata alone never enables a command. Duplicate ids, unknown
handlers and duplicate handlers are rejected. Execution distinguishes unknown,
unavailable and executed commands; handler failures propagate to the caller.

`src/ui/shell.ts` renders a modern Office-style ribbon, search and the Quick
Access Bar from this catalog. Historic menus and their layout selector are
available in the collapsed Classic menus section. The Home ribbon uses the catalog's
special `homeTab` arrangement. Contextual tabs can be inspected in this preview;
they are not yet tied to an open object. Search matches all words against labels,
ids, tabs, groups and notes, and displays the first 60 matches. Text is inserted
through DOM text properties rather than HTML interpolation.

Search Commands, Add All Choices, New, Open/Open Read-Only, Save/Save As (download
a copy), Close Database, Create Table, New Record, Delete Record and Undo have handlers. Availability predicates disable
Save and Close without an open database and prevent overlapping file operations.
Pin, unpin, clear-pins, tab selection and menu selection are local shell controls.
Unimplemented commands are disabled. The classic menus use
native disclosure elements; full desktop-style arrow-key navigation and automatic
classic-menu dismissal are still future work. Modern ribbon tabs support Left,
Right, Home and End keys with selected-tab state and associated panel labels.

`src/ui/backstage.ts` renders the Word-style File screen with a left navigation
rail and Home, New, Open, Info, Save, Print, Share, Export, Close and Options
pages. Its database actions use the same availability checks as the rest of the
shell. The workspace is hidden while File is open; Back or Escape restores it
and returns focus to File. Options can return to Command search to customize
Quick Access. The Home page shows an honest empty recent list, and Print shows
a placeholder rather than a fabricated preview.

## Preferences

`src/prefs.ts` stores versioned browser preferences under
`annesbase.preferences.v1`. Loading filters unknown command ids, removes duplicate
pins and validates menu layouts. Malformed JSON and unsupported versions fall
back to defaults. If browser storage cannot be read or written, controls continue
working for the session and saving failures are reported.

`QAT_STANDARD` and `QAT_EXTRAS` implement the choices in [QAT.md](QAT.md).
Add All Choices puts Save and Print first, sorts the remaining choices by label,
and appends other existing pins in their prior order. Any catalog command may be
pinned from search, including planned commands; pinning does not enable execution.
Separators, rearranging pins, settings import/export, per-database settings and
cross-app preference-format compatibility are not implemented yet.

## SQLite and files

`src/engine/database.ts` wraps sql.js (MIT; SQLite is public domain). The WASM is
loaded lazily by `src/engine/browser.ts` from Vite's emitted assets, without a
runtime CDN. The sql.js license is bundled in `public/licenses/sql.js.txt`.

New files contain `qb_meta` with application `annes-base` and schema version
`1-preview`; this is an experimental catalog, not the final native format. The
sample adds Customers and Orders with fictional data (relationships are not enforced).
The old `0-preview` catalog remains readable without a silent migration. Native metadata is hidden
from table navigation only when the application and version markers match.

Opening validates the SQLite signature and `PRAGMA quick_check(1)` before
replacing the current session. Failed opens leave the previous database intact.
All sessions idle with `PRAGMA query_only = ON`; native mutations temporarily
enable writes only inside the journal's transaction layer. The wrapper exposes no
arbitrary SQL interface. Existing file bytes are never written. Export restores
the query-only pragma because sql.js resets connection settings on export.

`src/ui/databasePane.ts` owns the session and displays table names, columns and
pages of 100 rows with one lookahead row. Names are quoted, values use
DOM text nodes, integers are read as BigInt, nulls are marked and blobs show their
byte count. Text displays are shortened after 2,000 characters without modifying
stored data. Pages use SQLite's scan order; sorting and filtering are not provided.

Files are loaded into memory with a 32 MiB input limit. This is not a worker/OPFS
engine, large-file implementation, snapshot system or encryption layer.
The browser file picker reads a copy; Save/Save As triggers a separate download
and does not imply the download completed or replace an existing file. Reloading
loses the active session. There is no database autosave or saved-recent-file list.
Closing/replacing a database and beforeunload guard pending mutations and form
drafts. A successfully requested download clears the pending-mutation guard, but
the UI explicitly says a started download is not a confirmed save.

## Native editing and journal

`src/engine/journal.ts` accepts only managed native tables: an automatic integer
id and 1–32 Text/Integer/Real fields. Metadata (`qb_objects.fields_json`) must
reconstruct the exact table SQL before writes are allowed. Internal schemas are
checked on open; any trigger disables all native editing. Ordinary SQLite and
unsupported native schemas stay read-only. Required means SQL NOT NULL; empty
strings remain distinct from null. Whole numbers are validated against the signed
64-bit range and bound as decimal strings to avoid JavaScript number rounding.

Each create/insert/update/delete runs in an IMMEDIATE transaction, including its
`qb_journal` entry. Row images encode integer values as tagged decimal strings.
If the data write or journal write fails, both roll back. The sample is baseline
data, not user history. Undo processes the newest active entry, restores before
values or a deleted row (or drops an empty newly created table), and marks the
entry undone in the same transaction. Before reversing insert/update, the current
row must still match the after image. Malformed history and conflicting restores
stop without partial changes. A new change after undo starts a new history branch;
redo is not offered. The journal is part of the downloaded database.

`src/ui/editors.ts` provides a field-list form and record forms with explicit null
controls. Edits are committed on Save record, not per keystroke. Selection enables
Edit/Delete; change history shows the latest 100 entries. Existing-table schema
changes, foreign-key design, arbitrary SQLite writes, per-record restore and
as-of views remain planned. No database autosave exists yet.

## Validation

- vitest checks registry behavior, catalog coverage, all menu/ribbon references,
  preference validation, choice ordering and DOM interactions using jsdom.
- Python standard-library tests verify generated SQLite fixtures and damage
  detection; see [../tests/corpus/README.md](../tests/corpus/README.md).
- `scripts/gen-plan.py --check` validates the planning sources.
- GitHub Actions runs Python checks on Linux/Windows and the web tests/build on
  Linux. Platform installers and release artifacts are not configured.
