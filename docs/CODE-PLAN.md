# Code plan: macros, Basic, xBase, JavaScript and the object model

> **Plan.** Anne's Base has an early native editor and SQLite viewer; advanced database features remain planned. This document fixes how databases are automated: Access-style macros and data macros, a VBA-compatible Basic, an xBase interpreter for dBASE/FoxPro/Clipper programs, the suite's JavaScript macros, and the object model they share. Commands are on the Create, Macro, xBase and Developer tabs ([COMMANDS-PLAN.md](COMMANDS-PLAN.md)).

## Principles

- **One object model, several languages.** Basic, xBase, JavaScript and macros all call the same API, so a command recorded as a macro can be converted to any of them.
- **Code runs only in trusted databases.** As in Access: a database opened from an untrusted location shows a bar, *"Macros and code in this database are disabled."* (`file.trust`, `file.trustCenter`). Data macros that only validate and set fields run regardless, since they cannot reach outside the database.
- **Sandboxed.** Code reaches files, the network and other programs only through API calls that the Trust Center allows per database (none by default except the database's own folder).
- **Honest compatibility.** Imported code that uses something not implemented is reported line by line, never silently skipped.

## Macros

Access 2010-style structured macros: actions (OpenForm, OpenReport, OpenQuery, ApplyFilter, GoToRecord, SetProperty, SetTempVar, RunCode, MessageBox, ImportExportSpreadsheet, EMailDatabaseObject and the rest), `If/Else If/Else`, `Group`, `Submacro`, `OnError`, `TempVars`, embedded macros on events, and the AutoExec macro. The pre-2007 grid with Macro Names and Conditions columns is offered as a view (`macro.names`, `macro.conditions`) and old macro groups import into submacros.

**Data macros** (`table.beforeChange` … `table.namedMacro`): Before Change, Before Delete, After Insert, After Update, After Delete, and named data macros, with the same actions as Access (SetField, RaiseError, CreateRecord, EditRecord, DeleteRecord, LookupRecord, ForEachRecord, SendEmail through Anne's Post). In `.qbase` they compile to SQLite triggers plus app-side steps for actions triggers cannot do; the designer shows which is which.

**FileMaker-style scripts** (`create.fmScript`): a step list (Go to Layout, Enter Find Mode, Perform Find, Omit Record, Sort Records, Set Field, Loop/Exit Loop If) saved as an ordinary macro, so FileMaker users can think in steps.

## Basic (VBA-compatible)

A Basic interpreter that runs the VBA most Access databases contain:

- **Language:** modules and class modules; `Sub`, `Function`, `Property Get/Let/Set`; `Dim`, `Static`, `Const`, `Enum`, `Type`; `Option Explicit`, `Option Compare Database`; `If`, `Select Case`, `For`, `For Each`, `Do/Loop`, `While/Wend`, `With`; `On Error GoTo/Resume`; `Err`; `Variant`, `Null`, `Nothing`, `Empty`; optional and `ParamArray` arguments; `Declare` statements are recognized and refused with a message (no native calls).
- **Functions:** the VBA string, date, math, conversion and financial functions, and the Access domain functions (`DLookup`, `DCount`, `DSum`, `DAvg`, `DMin`, `DMax`, `DFirst`, `DLast`), `Nz`, `IIf`, `Format`, `Eval`.
- **Objects:** `Application`, `CurrentDb`/`CurrentProject`, `DoCmd` (the actions above), `Forms`, `Reports`, `Screen`, `TempVars`, `DAO.Database`, `DAO.Recordset` (`OpenRecordset`, `MoveNext`, `EOF`, `Edit`, `AddNew`, `Update`, `FindFirst`, `Seek`, `Bookmark`), `QueryDef`, `TableDef`, `Field`, `Index`, `Relation`; ADO `Connection`/`Recordset` mapped to the same engine; form and report events (`Form_Load`, `BeforeUpdate`, `AfterUpdate`, `Current`, `Click`, `NoData`, `Format`, `Print` …).
- **Not provided:** COM automation of other programs (`CreateObject("Excel.Application")` and similar) is mapped where a suite app can stand in (Anne's Grid for Excel, Anne's Pen for Word, Anne's Post for Outlook) and otherwise reported; Windows API `Declare`s; ActiveX controls.
- **Editor and debugger** (`dev.codeEditor` and the Developer tab): syntax highlighting, completion from the object model, Immediate window (`view.immediate`, Ctrl+G), breakpoints, step into/over, watches, locals, call stack, compile.

## xBase

An interpreter for dBASE III Plus/IV, FoxPro 2.x and Clipper 5 programs and for the **dot prompt** (`xbase.dotPrompt`):

- **Commands:** `USE`, `SELECT`, `SET RELATION`, `SET ORDER`, `SET FILTER`, `SET INDEX`, `GO/GOTO`, `SKIP`, `LOCATE/CONTINUE`, `SEEK`/`FIND`, `APPEND [BLANK|FROM]`, `REPLACE … WITH … FOR/WHILE`, `DELETE`, `RECALL`, `PACK`, `ZAP`, `INDEX ON`, `REINDEX`, `SORT TO`, `COPY TO [SDF|DELIMITED]`, `COUNT`, `SUM`, `AVERAGE`, `TOTAL`, `LIST`, `DISPLAY`, `BROWSE`, `EDIT`, `REPORT FORM`, `LABEL FORM`, `?`/`??`, `STORE`, `PUBLIC`/`PRIVATE`/`LOCAL`, `PROCEDURE`/`FUNCTION`, `DO … WITH`, `DO WHILE`, `DO CASE`, `IF/ELSE/ENDIF`, `FOR/NEXT`, `SCAN/ENDSCAN`, `@ … SAY … GET`, `READ`, `ACCEPT`, `INPUT`, `WAIT`, the `SET` commands, and FoxPro's `SELECT – SQL`.
- **Functions:** the dBASE/FoxPro/Clipper function library (`RECNO()`, `EOF()`, `FOUND()`, `DELETED()`, `CTOD()`, `DTOC()`, `DTOS()`, `STR()`, `VAL()`, `SUBSTR()`, `TRIM()`, `IIF()`, `UPPER()` … ), with Clipper code blocks.
- **Tables:** any table in the database, not only `.dbf` files: `USE Residents` works on a `.qbase` table, an Access table or a linked server table.
- **Screens:** `@ … SAY … GET` screens run in a character-grid form; they can be converted to ordinary forms (`create.screen`).
- **Translation** (`dbtools.convertPrg`): best-effort conversion of `.prg` code to Basic or JavaScript, with a list of lines to check.

## JavaScript

The suite's macro language (`create.script`, `dev.macroEditor`, `dev.console`): modern JavaScript with the same object model in idiomatic form (`db.table('Residents').where({Building: 'C'}).rows()`), async/await for queries, and the recorder (`dev.recordMacro`) that writes JavaScript from what you do.

## Command line and API (desktop)

- **Switches** (`dev.cliHelp`), in the spirit of Access: `/ro`, `/excl`, `/runtime`, `/compact [target]`, `/repair`, `/x macro`, `/cmd value` (read by `Command()` in Basic), plus Anne's Base additions: `/export table file`, `/import file`, `/check`, `/backup`.
- **Local REST API** (`dev.restApi`): serves the open database to other programs on the same computer, read-only by default, with a token, for scripts and other suite apps.

## Tests

The interpreter test suites are corpora of real-world programs and modules (openly licensed, or written for the project) with expected results; the Access sample databases' VBA patterns (domain functions, recordset loops, form events) are covered first.
