# Contributing to Anne's Base

Thank you for your interest. Anne's Base has an **early browser shell and read-only SQLite viewer; editing and the change journal are not implemented**. Useful contributions include shell improvements, engine work, tests and:

- **Feedback on the plan:** missing commands, wrong command placement, menu arrangements that differ from the programs they model, ideas from other database programs, and corrections to [docs/INNOVATIONS.md](docs/INNOVATIONS.md), [docs/MENUS-PLAN.md](docs/MENUS-PLAN.md), [docs/FORMATS-PLAN.md](docs/FORMATS-PLAN.md) or [docs/QAT.md](docs/QAT.md). Edit [docs/commands-plan.src.txt](docs/commands-plan.src.txt) or [docs/menus-plan.src.txt](docs/menus-plan.src.txt) and run `python3 scripts/gen-plan.py`; it fails on unknown ids, duplicate ids and shortcut conflicts. Open an issue with the *Feature request* template.
- **Test files:** databases you made yourself (or that are openly licensed) from Access (any version), dBASE, FoxPro, Clipper, Paradox, FileMaker exports, Approach, Works, Q&A, R:BASE, DataEase, Alpha Four, LibreOffice Base and the rest, with made-up data; damaged files for the recovery engine. Do not attach files you do not have the right to share or that contain real people's information.
- **Old manuals:** if you own printed manuals for the historic programs, the page numbers that show their menus help verify the classic layouts. Describe them in your own words; do not upload scans.

## Ground rules

- **Clean room.** Do not contribute code, text, templates, sample databases, menu text or icons copied from proprietary software, its documentation or its help files, and do not consult leaked or decompiled source. Work from public specifications, open-source references with permissive licenses, and your own observation of behavior. GPL and LGPL implementations (for example mdbtools) may not be copied from. See [docs/LEGAL.md](docs/LEGAL.md).
- **Generic names.** Use the generic terms in docs/LEGAL.md (Ask Your Data, Locked Application, Transform Steps…) in the interface and code.
- **No missing commands.** Every new feature is a command in the registry with an id, label, icon, tab and group (or *not in tabs*), so it can be placed on the Quick Access Bar, custom tabs, classic menus, shortcuts and macros and found by command search.
- **Safety first.** Anything that changes or deletes data goes through the journal and can be undone; anything that repairs a file writes a new file.
- **American English** in the interface, code comments and documentation.
- **Licenses.** Contributions are accepted under the MIT License. New dependencies must use a permissive license (MIT, BSD, Apache 2.0, ISC, public domain, SIL OFL for fonts).

## Development checks

Use Node.js 24 LTS. The current web scaffold supports:

```bash
npm ci
npm run dev        # web app at http://localhost:5173
npm run typecheck
npm test           # unit tests (vitest)
npm run build
```

Keep pull requests focused, include tests for engine, SQL, format, interpreter and recovery changes, and run the type check and tests before submitting.
