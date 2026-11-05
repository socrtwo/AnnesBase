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
a copy), Close Database, Create Table, New Record, Delete Record, Record History, Snapshots, Automatic Snapshots and Undo have handlers. Availability predicates disable
Save and Close without an open database and prevent overlapping file operations.
Sort Ascending/Descending/Clear, Filter, Apply/Toggle Filter, Clear All Filters and
Find delegate to the current table's view controls. Availability predicates disable
view commands without a selected table or while a file operation is in progress.
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
`2-preview`; this is an experimental catalog, not the final native format. The
sample adds Customers and Orders with fictional data (relationships are not enforced).
The old `0-preview` catalog remains readable without a silent migration. Native metadata is hidden
from table navigation only when the application and version markers match.
Supported `1-preview` files remain editable. Their metadata moves to `2-preview`
in the same transaction as the first selective restore. Failed restores roll
back this marker too; schema structure is unchanged. Older app builds cannot
edit the new format or interpret its restore journal operation.

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
stored data. Table-view sorting and filtering run in SQLite before paging.

Files are loaded into memory with a 32 MiB input limit. This is not a worker/OPFS
engine, large-file implementation or encryption layer.
The browser file picker reads a copy; Save/Save As triggers a separate download
and does not imply the download completed or replace an existing file. Browser
autosave preserves committed native state for explicit restoration after reload.
Closing/replacing a database and beforeunload guard mutations not yet autosaved
or requested for download, and unfinished form drafts. A started download is
explicitly described as a request, not a confirmed save.

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
changes, foreign-key design, arbitrary SQLite writes and as-of views remain planned.

## Record history and selective restoration

`recordHistory()` validates and decodes per-record before/after images in pages
of 50 entries, with a lookahead. It includes undone entries for inspection and
returns an optimistic token representing the current complete row (or absence).
The UI compares field values and permits restoration only of a non-absent image.
Long display values are shortened without changing the restored data.

`restoreVersion()` validates table/record/event ownership, checks the preview
token and the current row's consistency with active history, then inserts or
updates the chosen image and appends a `restore` event in one transaction. It
never reactivates older events. Global Undo reverses this event using its own
before image, including returning a recovered record to an absent state.
Unrelated rows and their history are preserved. Malformed images, stale previews,
external row changes and journal-write failures stop without partial writes.

Automatic inserts choose one more than the largest current or historic record
id in the current table lifetime, including undone history, and fail on 64-bit
exhaustion. Restoring the original id is allowed because it restores that same
record rather than allocating a new identity. Legacy files with multiple insert
events for one id are ambiguous and cannot selectively restore that id. The
latest active create-table event bounds each table lifetime, so drop/recreate
cannot expose earlier incarnations for restoration. Baseline versions that were
never journaled are not synthesized.

`src/ui/recordHistory.ts` offers an id picker, before/after review, older-page
loading and restore actions. The pane closes on successful mutations, database
changes and table/view changes. Restore refreshes the data view and participates
in browser autosave. Per-record history is limited to supported editable native
schemas; related-record restoration, actor metadata and bulk/as-of workflows
are not provided yet.

## Table views

`src/engine/tableView.ts` compiles a single column condition, optional literal
find term and one sort choice into a read-only SELECT. Columns come from
`PRAGMA table_xinfo` (including visible generated columns). Identifiers are
catalog-validated and quoted; operators/directions use fixed allowlists and
all search/filter values are bound parameters. Integer comparisons validate
the signed 64-bit range and bind decimal strings, avoiding JavaScript rounding.

Text contains/find uses SQLite `instr(lower(CAST(... AS TEXT)), lower(?))`;
case folding is ASCII-only and wildcard characters are literal. Numeric
conditions use declared SQLite affinity; untyped columns use text comparisons.
Blob fields permit null checks and are excluded from Find. General sorting
retains SQLite's storage-type, collation and null-ordering behavior.

Paging fetches 100 rows plus one lookahead. Default/tie order is the declared
primary key, including composite keys; tables without one use visible columns.
This provides repeatable page boundaries without exposing arbitrary SQL. It is
not a query designer, arbitrary SQL editor or large-data virtual grid.

`src/ui/tableControls.ts` renders the selectors, literal Find input and explicit
Apply view action. Invalid filters leave the current view intact. Applied view
changes reset pagination and record selection and respect unfinished editor
drafts. Editing uses the selected primary-key id, so sorting or a filter that
hides an edited row cannot redirect the write. View state is not journaled,
autosaved or written into the database; table changes and restore reset it.

## Browser autosave and recovery

`src/storage/recovery.ts` uses IndexedDB database `annesbase.recovery.v1` with
separate metadata and byte stores. Metadata and SQLite bytes commit in the same
transaction. Every document gets a UUID; starting/opening another native file
creates a separate recovery copy instead of replacing the previous one. Listing
copies reads metadata without loading all database bytes. There is no automatic
pruning; inactive copies can be explicitly removed.

Each update and removal compares the expected revision inside its read/write
transaction. Stale tabs fail without overwriting/deleting a newer version. The
local session is retained on failure, and the current newer copy can be restored
after resolving pending edits. This is conflict detection, not live multi-tab
synchronization or merging. The list refreshes on launch and local storage actions.

`src/storage/autosave.ts` serializes writes for a document and coalesces pending
snapshots to the newest one while a write is in flight. It exports a consistent
SQLite image after each committed mutation, on editable-native creation/open,
and when download acknowledgement changes. An older completion cannot report a
newer edit as saved. Quota/availability/conflict errors keep an error state until
a successful retry or restoration. Recovery bytes are limited to 32 MiB.

`databasePane.ts` restores saved files only when requested, validates them with
the existing SQLite open path, and reconnects autosave to their id/revision. The
recorded pending-download flag is restored separately from SQLite history, so
undo remains available and download status is not silently lost. Ordinary,
legacy and explicitly read-only opens do not autosave. Unfinished form drafts
are never serialized; they retain their unload guard even if committed rows
have been saved. A confirmed browser save makes leaving committed rows safe
without a download prompt, but is not a portable backup.

IndexedDB is scoped to browser profile/origin and can be cleared or evicted.
This is a latest-state recovery copy, not versioned snapshots, cross-device sync,
an offline PWA, direct original-file saving or a worker/OPFS SQLite engine.

## Versioned browser snapshots

`src/storage/snapshots.ts` uses a separate IndexedDB database,
`annesbase.snapshots.v1`, leaving latest-state recovery storage unchanged. Metadata
and complete SQLite bytes commit atomically. Snapshot ids use add-only inserts;
concurrent tabs cannot overwrite an existing version. Listing reads metadata only.
SHA-256 checksums (Web Crypto, HTTPS/localhost) and byte sizes are checked on read;
restoration also uses the normal SQLite signature, integrity and catalog checks.
Checksums detect corruption, not malicious alteration of browser storage.

Manual versions are pinned until explicitly removed. Optional automatic captures
export before a mutation and enqueue only after it succeeds. A serialized queue
coalesces pending automatic captures per document while retaining every manual
request. Each automatic transaction prunes older automatic versions for that
document to the configured count (1–20), preserving manual versions and other
documents. A failed byte write rolls back both metadata and pruning. Retention
changes take effect on the next automatic save, not immediately.

`src/ui/snapshots.ts` provides labels, metadata browsing, current/all-document
scope, download, removal and restore as a separate copy. The copy gets a new
recovery UUID; the original snapshot and recovery copy remain unchanged. Its
journal and undo remain available. Captures do not include unfinished drafts;
restore uses pending-edit protection and validates a candidate before replacing
the workspace. Snapshot failures do not block edits or claim autosave success.
Pending snapshot writes retain the leave-page warning. Errors are visible even
if the panel was closed. UI callbacks stop updating after disposal, while queued
writes of already captured bytes can finish independently.

Opt-in settings use `annesbase.snapshots.settings.v1`, separate from shell
preferences; unavailable localStorage falls back to session-only settings with a
warning. Each SQLite image is limited to 32 MiB. Snapshots remain browser/origin
storage and are not embedded in the native file. No timed/on-close snapshots,
age retention, sync, encryption or worker/OPFS snapshots are implemented yet.

## Validation

- vitest checks registry behavior, catalog coverage, all menu/ribbon references,
  preference validation, choice ordering, SQLite views, journals, recovery storage
  and DOM interactions using jsdom. Tests use at most two workers to avoid
  WebAssembly/jsdom resource contention on smaller runners.
- Python standard-library tests verify generated SQLite fixtures and damage
  detection; see [../tests/corpus/README.md](../tests/corpus/README.md).
- `scripts/gen-plan.py --check` validates the planning sources.
- GitHub Actions runs Python checks on Linux/Windows and the web tests/build on
  Linux. Platform installers and release artifacts are not configured.
