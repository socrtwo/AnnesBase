# Quick Access Bar plan

> **Plan.** Anne's Base has an early native editor and SQLite viewer; advanced database features remain planned. This document fixes what the Quick Access Bar (QAT) will offer. It follows the implementation already shipped in the sister apps (`QAT_STANDARD`, `QAT_EXTRAS`, `addAllQatChoices` in the shared shell).

## Principles

- Every command is eligible. The QAT stores command ids; any of the commands in [COMMANDS-PLAN.md](COMMANDS-PLAN.md), plus macros and separators, can be placed on it.
- Access has its own Quick Access Toolbar drop-down, and the older database programs had toolbars or function-key bars; Anne's Base's drop-down checklist is the **suite's standard choices** (so that QAT layouts exported from the sister apps carry over) plus **Access's drop-down choices** and the **default toolbar buttons of the classic programs**. Nothing on those lists is left out.
- The bar can sit at the top, below the ribbon, or **at the bottom near the on-screen keyboard or thumb**, and can show or hide labels. In classic menu mode, the bar is the toolbar under the menu bar, as in Access 2003.

## Choices gathered from the surveyed programs

| Source | Default choices or buttons |
|---|---|
| Access 2007–current QAT drop-down | Save, Email, Quick Print, Print Preview, Spelling, Undo, Redo, Mode (touch/mouse), Refresh All, Sync All |
| Access 2003 Database and Table Datasheet toolbars | New, Open, Save, Print, Print Preview, Spelling, Cut, Copy, Paste, Format Painter, Undo, Office Links, Analyze, Code, Properties, Relationships, New Object, View, Sort Ascending, Sort Descending, Filter by Selection, Filter by Form, Apply Filter, Find, New Record, Delete Record, Database Window |
| dBASE IV and FoxPro function-key bars | Help (F1), Assist/Control Center, List, Directory, Structure, Status, Display, Edit, Append, Browse |
| FileMaker Pro status toolbar | New Record, Delete Record, Find, Sort, Show All, Share, Browse/Find/Layout/Preview modes |
| SSMS and DBeaver toolbars | New Query, Execute, Cancel, Explain Plan, Results to Grid/Text, Comment, Commit, Rollback |

## Anne's Base's drop-down

1. **Suite standard choices,** with their shared ids: New, Open, Save, Email, Quick Print, Print Preview and Print, Undo, Redo, Touch/Mouse Mode, Open Recent File. AutoSave is not applicable (records save as they are entered) and is left out.
2. **Database extras** (the union above): Refresh All, Spelling, Cut, Copy, Paste, Format Painter, Sort Ascending, Sort Descending, Filter by Selection, Filter by Form, Toggle Filter, Find, New Record, Delete Record, Undo Delete, Datasheet View, Design View, Property Sheet, Relationships, Code Editor, Run (query), Explain Plan, Commit, Roll Back, Compact and Repair, Back Up, Navigation Pane, Dot Prompt, Browse/Find/Layout/Preview Mode, Ask Your Data, Search Commands.
3. **Add All Choices (Save, Print first, then A–Z)** (`view.qatAddAll`): puts every choice from lists 1 and 2 on the bar, **Save** and **Print** first, then the rest sorted alphabetically by label (case-insensitive), then anything else already on the bar in its existing order. Separators are kept.
4. **More Commands…** (opens the Customize Quick Access Bar dialog).
5. **Position** (`view.qatPosition`): above the ribbon, below the ribbon, at the bottom.
6. **Show / Hide Labels** (`view.qatLabels`).
7. **Hide Quick Access Bar** (`view.qatHide`; restore with `view.qatShow` or by long-pressing any command).

**Default bar** (new installs): Save, Undo, Redo, Refresh All, Search Commands — Access's default plus command search.

## Customize Quick Access Bar dialog

As in the sister apps: a *Choose commands from* list with **Popular Commands**, **Commands Not in the Tabs**, **All Commands**, each built-in and custom tab (including the contextual Table, Query, Form and Macro tabs), and **Macros**; buttons Add, Remove, Add Separator, Move Up, Move Down, Add All A–Z, Reset, Import/Export (JSON, shared format with the suite). As in Access, a QAT can be kept **for all databases** or **for this database only** (stored in the file).
