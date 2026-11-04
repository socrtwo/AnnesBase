#!/usr/bin/env python3
"""Generate the Anne's Base planning documents from their source files.

Reads  docs/commands-plan.src.txt  and  docs/menus-plan.src.txt
Writes docs/COMMANDS-PLAN.md, docs/MENUS-PLAN.md and docs/commands-plan.json

Checks (exit status 1 on failure):
  * every command id is unique and follows area.name;
  * every id named in a menu layout exists;
  * no two commands share a default shortcut, except listed context-dependent pairs;
  * every origin code is in the legend.

Usage:  python3 scripts/gen-plan.py [--check]     (--check validates without writing)
Standard library only, so it runs in Termux with `pkg install python`.
"""
import json
import re
import sys
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
CHECK_ONLY = "--check" in sys.argv

# Shortcuts that are deliberately shared because the commands work in different contexts.
CONTEXT_SHARED = {
    "Esc": {"record.undoField", "ai.stop"},
}
ID_RE = re.compile(r"^[a-z][a-z0-9]*(\.[a-z][A-Za-z0-9]*)+$")

errors = []


def parse_commands(path):
    tabs = []          # [{prefix, name, desc, groups: [{name, commands: [...]}]}]
    origins = OrderedDict()
    in_origins = False
    for n, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if line == "# ORIGINS":
            in_origins = True
            continue
        if not line or (line.startswith("#") and not line.startswith("##")):
            continue
        if in_origins:
            code, name, kind = [p.strip() for p in line.split("|")]
            origins[code] = {"name": name, "kind": kind}
            continue
        if line.startswith("@tab "):
            prefix, name, desc = [p.strip() for p in line[5:].split("|")]
            tabs.append({"prefix": prefix, "name": name, "desc": desc, "groups": []})
            continue
        if line.startswith("## "):
            tabs[-1]["groups"].append({"name": line[3:].strip(), "commands": []})
            continue
        parts = [p.strip() for p in line.split("|")]
        if len(parts) != 5:
            errors.append(f"commands line {n}: expected 5 fields, got {len(parts)}: {raw}")
            continue
        label, cid, keys, orig, notes = parts
        if not tabs[-1]["groups"]:
            errors.append(f"commands line {n}: command before any group")
            continue
        tabs[-1]["groups"][-1]["commands"].append({
            "label": label,
            "id": cid,
            "shortcuts": [k.strip() for k in keys.split(",") if k.strip()] if keys else [],
            "origins": [o.strip() for o in orig.split(",") if o.strip()],
            "notes": notes,
            "notInTabs": "not in tabs" in notes,
            "tab": tabs[-1]["name"],
            "group": tabs[-1]["groups"][-1]["name"],
            "line": n,
        })
    return tabs, origins


def parse_menus(path):
    layouts = []
    for n, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("@layout "):
            key, name, model = [p.strip() for p in line[8:].split("|")]
            layouts.append({"key": key, "name": name, "model": model, "menus": []})
        elif line.startswith("= "):
            layouts[-1]["menus"].append({"name": line[2:].strip(), "items": []})
        elif line.startswith("> "):
            sub = {"submenu": line[2:].strip(), "items": []}
            layouts[-1]["menus"][-1]["items"].append(sub)
        elif line == "<":
            pass
        elif line == "---":
            target = layouts[-1]["menus"][-1]["items"]
            if target and isinstance(target[-1], dict) and "submenu" in target[-1] and not target[-1].get("closed"):
                target[-1]["items"].append("---")
            else:
                target.append("---")
        else:
            target = layouts[-1]["menus"][-1]["items"]
            if target and isinstance(target[-1], dict) and "submenu" in target[-1] and not target[-1].get("closed"):
                target[-1]["items"].append((line, n))
            else:
                target.append((line, n))
        if line == "<":
            layouts[-1]["menus"][-1]["items"][-1]["closed"] = True
    return layouts


tabs, ORIGINS = parse_commands(DOCS / "commands-plan.src.txt")
layouts = parse_menus(DOCS / "menus-plan.src.txt")

commands = OrderedDict()
for t in tabs:
    for g in t["groups"]:
        for c in g["commands"]:
            if not ID_RE.match(c["id"]):
                errors.append(f"bad id {c['id']} (line {c['line']})")
            if c["id"] in commands:
                errors.append(f"duplicate id {c['id']} (lines {commands[c['id']]['line']} and {c['line']})")
            commands[c["id"]] = c
            for o in c["origins"]:
                if o not in ORIGINS:
                    errors.append(f"unknown origin {o} for {c['id']}")

# Shortcut conflicts
by_key = {}
for c in commands.values():
    for k in c["shortcuts"]:
        if "…" in k or "wheel" in k:
            continue
        by_key.setdefault(k.lower(), []).append(c["id"])
for k, ids in by_key.items():
    if len(ids) > 1:
        allowed = next((v for kk, v in CONTEXT_SHARED.items() if kk.lower() == k), None)
        if not (allowed and set(ids) <= allowed):
            errors.append(f"shortcut {k} used by {', '.join(ids)}")

# AI menu, shared by every layout
ai_tab = next(t for t in tabs if t["prefix"] == "ai")
AI_MENU = {"name": "AI", "items": []}
for gi, g in enumerate(ai_tab["groups"]):
    if g["name"] == "Providers":
        continue
    if gi:
        AI_MENU["items"].append("---")
    AI_MENU["items"].append({"submenu": g["name"], "items": [(c["id"], 0) for c in g["commands"]], "closed": True})
AI_MENU["items"] += ["---"] + [(c["id"], 0) for c in next(g for g in ai_tab["groups"] if g["name"] == "Providers")["commands"]]

for L in layouts:
    help_i = next((i for i, m in enumerate(L["menus"]) if m["name"] == "Help"), len(L["menus"]))
    L["menus"].insert(help_i, AI_MENU)


def walk_ids(items):
    for it in items:
        if it == "---":
            continue
        if isinstance(it, dict):
            yield from walk_ids(it["items"])
        else:
            yield it


for L in layouts:
    for m in L["menus"]:
        for cid, n in walk_ids(m["items"]):
            if cid not in commands:
                errors.append(f"menu layout {L['key']} ({m['name']}, line {n}): unknown command {cid}")

SYNONYMS = {"Record": "Records", "Browse": "Records", "Update": "Records", "Position": "Records",
            "Ask": "Query", "Retrieve": "Query", "SQL Editor": "Query",
            "Create": "Insert", "Forms": "Insert", "Report": "Insert",
            "Image": "Format", "Navigate": "View", "Search": "Edit",
            "Set Up": "File", "Catalog": "File", "Exit": "File",
            "Organize": "Tools", "Modify": "Tools", "System": "Tools", "Scripts": "Tools", "Program": "Tools",
            "Project": "Database"}
COMBINED_ORDER = ["File", "Edit", "View", "Insert", "Format", "Records", "Query", "Database", "Tools", "Window"]

# Combined layout: union menu by menu, in first-seen order; Help last, AI just before it.
combined = OrderedDict()
for L in layouts:
    for m in L["menus"]:
        if m["name"] == "AI":
            continue
        dest = combined.setdefault(SYNONYMS.get(m["name"], m["name"]), [])
        seen = set(walk_ids_ids for walk_ids_ids, _ in walk_ids(dest))
        added = False
        block = []
        for cid, n in walk_ids(m["items"]):
            if cid not in seen and cid in commands:
                block.append((cid, n))
                seen.add(cid)
        if block:
            if dest:
                dest.append("---")
            dest.extend(block)
order = [k for k in COMBINED_ORDER if k in combined] + [k for k in combined if k not in COMBINED_ORDER and k != "Help"]
COMBINED = {"key": "all", "name": "All programs combined",
            "model": "the union of every layout above, merged menu by menu without duplicates (Record, Browse, Update and Position merge into Records; Ask, Retrieve and SQL Editor into Query; Create, Forms and Report into Insert; Image into Format; Navigate into View; Search into Edit; Set Up, Catalog and Exit into File; Organize, Modify, System, Scripts and Program into Tools; Project into Database)",
            "menus": [{"name": k, "items": combined[k]} for k in order] + [AI_MENU] +
                     ([{"name": "Help", "items": combined["Help"]}] if "Help" in combined else [])}

# Complete layout: every tab as a menu and every group as a submenu, so menu-bar users miss nothing.
COMPLETE = {"key": "complete", "name": "Anne's Base complete",
            "model": "the ribbon itself: one menu per tab, one submenu per group, every command",
            "menus": []}
for t in tabs:
    if t["prefix"] == "help":
        continue
    items = []
    for g in t["groups"]:
        items.append({"submenu": g["name"], "items": [(c["id"], 0) for c in g["commands"]], "closed": True})
    COMPLETE["menus"].append({"name": t["name"], "items": items if len(items) > 1 else items[0]["items"]})
COMPLETE["menus"].append({"name": "Help", "items": [(c["id"], 0) for g in tabs[-1]["groups"] for c in g["commands"]]})

if errors:
    print("\n".join("ERROR: " + e for e in errors), file=sys.stderr)
    sys.exit(1)

total = len(commands)
by_tab = {t["name"]: sum(len(g["commands"]) for g in t["groups"]) for t in tabs}
new_count = sum(1 for c in commands.values() if "NEW" in c["origins"])
in_menus = {cid for L in layouts for m in L["menus"] for cid, _ in walk_ids(m["items"])}
print(f"{total} commands, {len(layouts) + 2} menu layouts, {new_count} original (NEW) commands; "
      f"{len(in_menus)} commands appear in at least one classic layout")
if CHECK_ONLY:
    sys.exit(0)


def md_escape(s):
    return s.replace("|", "\\|")


def origin_names(codes):
    return ", ".join(ORIGINS[c]["name"] if c not in ("NEW", "SUITE", "ALL") else
                     {"NEW": "**new**", "SUITE": "suite", "ALL": "most database programs"}[c] for c in codes)


def keys(c):
    return ", ".join(c["shortcuts"])


# ---------- COMMANDS-PLAN.md ----------
out = []
w = out.append
w("# Command inventory plan\n")
w("> **Plan.** Anne's Base has an early native editor and SQLite viewer; advanced database features remain planned. This is the planned command inventory: every command of Microsoft "
  "Access and of the major database programs past and present, tab by tab, with the command id Anne's Base will use "
  "and where the idea comes from, plus commands that are new in Anne's Base. It is generated by `scripts/gen-plan.py` "
  "from [commands-plan.src.txt](commands-plan.src.txt); edit that file, not this one. When the app exists, "
  "`npm run catalog` will generate `docs/COMMANDS.md` from the command registry, and this plan will be retired.\n")
w(f"**{total} commands** in {len(tabs)} tabs ({new_count} of them new ideas). Every command will be usable on the "
  "Quick Access Bar, on custom tabs, in every classic menu layout ([MENUS-PLAN.md](MENUS-PLAN.md)), on a keyboard "
  "shortcut, in a macro and in command search (Alt+Q). Commands marked *not in tabs* have no default place on a tab "
  "but are reachable everywhere else, so nothing is hidden.\n")
w("## Conventions\n")
w("- **ids** are `area.name` in camelCase, as in the other Anne's Office apps. Where a sister app already defines a "
  "command (`file.save`, `edit.undo`, `view.cmdSearch`, `view.qatAddAll`, `ai.setup`…), Anne's Base reuses the id so "
  "shared settings, macros and Quick Access Bar layouts carry over.")
w("- **Arguments.** Some commands take an argument, written `id(arg)` in macros and layouts "
  "(`view.menuLayout(dbase4)`, `query.dialect(postgresql)`); the notes list the arguments.")
w("- **Shortcuts** are planned defaults and follow Microsoft Access where its keys are well known (F11 navigation pane, "
  "F5 go to record, F9 refresh, Shift+F9 requery, Ctrl+; date, Ctrl+' value from previous record, Shift+Enter save record, "
  "F4 property sheet, F8 field list, Alt+F11 code editor, Ctrl+G Immediate window). All can be rebound; Customize "
  "Keyboard also loads FileMaker, FoxPro and SQL Server Management Studio key sets. The generator rejects duplicate defaults.")
w("- **Origin** says where the command or idea comes from (nominative use; see [LEGAL.md](LEGAL.md)). "
  "**new** marks ideas not found in the programs surveyed (they may exist in other software); *suite* marks commands "
  "shared with the sister apps.")
w("- **Vendor feature names** are replaced with generic terms (Ask Your Data, Locked Application, Card Stack…).\n")
w("| Namespace | Area |\n|---|---|")
for t in tabs:
    prefixes = sorted({c["id"].split(".")[0] for g in t["groups"] for c in g["commands"]})
    w(f"| {', '.join('`' + p + '.`' for p in prefixes)} | {t['name']}: {t['desc']} |")
w("\n| Tab | Commands |\n|---|---|")
for t in tabs:
    w(f"| [{t['name']}](#{re.sub(r'[^a-z0-9 -]', '', t['name'].lower()).replace(' ', '-')}) | {by_tab[t['name']]} |")
w(f"| **Total** | **{total}** |\n")
w("---\n")
for t in tabs:
    w(f"## {t['name']}\n")
    w(f"{t['desc']}.\n")
    for g in t["groups"]:
        w(f"### {t['name']} ▸ {g['name']}\n")
        w("| Command | id | Shortcut | Origin | Notes |\n|---|---|---|---|---|")
        for c in g["commands"]:
            w(f"| {md_escape(c['label'])} | `{c['id']}` | {md_escape(keys(c))} | {origin_names(c['origins'])} | {md_escape(c['notes'])} |")
        w("")
w("## Origins legend\n")
w("| Code in the source file | Program | Kind |\n|---|---|---|")
for code, o in ORIGINS.items():
    w(f"| {code} | {o['name']} | {o['kind']} |")
w("")
w("## Shortcuts shared on purpose\n")
for k, ids in CONTEXT_SHARED.items():
    w(f"- **{k}**: " + ", ".join(f"`{i}`" for i in sorted(ids)) + " (different contexts)")
w("")
(DOCS / "COMMANDS-PLAN.md").write_text("\n".join(out) + "\n", encoding="utf-8")


# ---------- MENUS-PLAN.md ----------
def render_items(items, depth=0):
    lines = []
    pad = "  " * depth
    for it in items:
        if it == "---":
            lines.append(f"{pad}- ───")
        elif isinstance(it, dict):
            lines.append(f"{pad}- **{it['submenu']} ▸**")
            lines.extend(render_items(it["items"], depth + 1))
        else:
            cid = it[0]
            lines.append(f"{pad}- {commands[cid]['label']} — `{cid}`")
    return lines


out = []
w = out.append
w("# Classic menu layouts (plan)\n")
w("> **Plan.** Generated by `scripts/gen-plan.py` from [menus-plan.src.txt](menus-plan.src.txt). Every entry is a "
  "command id from [COMMANDS-PLAN.md](COMMANDS-PLAN.md); the generator fails if a layout names a command that does "
  "not exist, the same check `tests/unit/catalog.test.ts` will make once there is code.\n")
w("Anne's Base has two menu systems over one command library, as Anne's Loom and Anne's Lens do:\n")
w("- **The suite ribbon** (File, Home, Create, External Data, Database Tools, Data, Repair & Recovery, xBase, View, "
  "AI, Developer, Help, plus the contextual Table, Query, Form and Macro tabs), with the Quick Access Bar, command "
  "search (Alt+Q), Customize Ribbon and Customize Keyboard. The ribbon is the default, as in Access 2007 and later.")
w("- **A classic menu bar** laid out like the database programs people learned. *View ▸ Menus* switches between "
  "ribbon, menu bar or both; *View ▸ Classic Menu Layout* (`view.menuLayout`) picks the program whose layout the bar "
  "follows. **Access 2003 style is the default** for the menu bar. *View ▸ Customize Menus* edits any layout or "
  "builds a new one.\n")
w("A command found in the dBASE-style *Organize* menu is the same command as on the ribbon: it can go on the Quick "
  "Access Bar, gets a shortcut and records in macros. *Help ▸ Menu Map* (`help.menuMap`) shows where a command lives "
  "in every layout. Each layout reproduces the *arrangement* of commands people know, under Anne's Base's own "
  "labels; it is not a copy of any program's menu text (see [LEGAL.md](LEGAL.md)). The arrangements were compiled "
  "from product knowledge and documentation and will be checked against installed copies or published manuals before "
  "implementation (tracked in [ROADMAP.md](ROADMAP.md), M0). Programs whose menus change with the object or mode "
  "(Access 2003's Format, Records and Query menus, FileMaker's Records menu) are listed with every contextual menu; "
  "the app shows each in its context.\n")
w("The **AI** menu is the same in every layout and sits just before Help.\n")
w("| Layout (`view.menuLayout` argument) | Modeled on | Menus |\n|---|---|---|")
for L in layouts + [COMBINED, COMPLETE]:
    w(f"| {L['name']} (`{L['key']}`) | {L['model']} | {', '.join(m['name'] for m in L['menus'])} |")
w("")
for L in layouts + [COMBINED, COMPLETE]:
    n_ids = len({cid for m in L["menus"] for cid, _ in walk_ids(m["items"])})
    w(f"## {L['name']}\n")
    w(f"*Modeled on {L['model']}. {n_ids} commands.*\n")
    for m in L["menus"]:
        if (m is AI_MENU and L is not layouts[0]) or (L is COMPLETE):
            w(f"<details><summary><b>{m['name']}</b>{' (same in every layout)' if m is AI_MENU else ''}</summary>\n")
            w("\n".join(render_items(m["items"])))
            w("\n</details>\n")
            continue
        w(f"### {m['name']}\n")
        w("\n".join(render_items(m["items"])))
        w("")

w("## Ribbon\n")
w("The default ribbon shows each tab's groups in the order of COMMANDS-PLAN.md. Two tabs gather commands from "
  "other tabs:\n")
HOME = [
    ("Views", ["view.objectView", "view.datasheet", "view.form", "view.design"]),
    ("Clipboard", ["edit.paste", "edit.cut", "edit.copy", "edit.formatPainter"]),
    ("Sort & Filter", ["sort.ascending", "sort.descending", "filter.menu", "filter.bySelection", "filter.byForm", "filter.toggle", "filter.natural"]),
    ("Records", ["record.new", "record.save", "record.delete", "record.refreshAll", "record.totals", "record.spelling", "record.more"]),
    ("Find", ["edit.find", "edit.replace", "edit.goTo", "edit.select"]),
    ("Ask", ["ai.ask"]),
]
w("**Home** (the default tab):\n")
w("| Group | Commands |\n|---|---|")
for g, ids in HOME:
    for i in ids:
        if i not in commands:
            print(f"ERROR: Home tab names unknown {i}", file=sys.stderr)
            sys.exit(1)
    w(f"| {g} | " + ", ".join(f"{commands[i]['label']} (`{i}`)" for i in ids) + " |")
w("\nThe **Home** tab gathers the everyday commands from other tabs, as in Access. The contextual **Table**, "
  "**Query**, **Form** and **Macro** tabs appear with their designers, as Access's Table Tools, Query Tools, Form "
  "Design Tools and Macro Tools do.\n")
(DOCS / "MENUS-PLAN.md").write_text("\n".join(out) + "\n", encoding="utf-8")

# ---------- commands-plan.json ----------
data = {
    "generatedFrom": ["docs/commands-plan.src.txt", "docs/menus-plan.src.txt"],
    "origins": ORIGINS,
    "tabs": [{"prefix": t["prefix"], "name": t["name"], "description": t["desc"],
              "groups": [{"name": g["name"], "commands": [c["id"] for c in g["commands"]]} for g in t["groups"]]}
             for t in tabs],
    "commands": {cid: {k: v for k, v in c.items() if k != "line"} for cid, c in commands.items()},
    "menuLayouts": {L["key"]: {"name": L["name"], "modeledOn": L["model"], "menus": [
        {"name": m["name"], "items": [
            "---" if it == "---" else
            {"submenu": it["submenu"], "items": ["---" if x == "---" else x[0] for x in it["items"]]} if isinstance(it, dict)
            else it[0] for it in m["items"]]} for m in L["menus"]]} for L in layouts + [COMBINED, COMPLETE]},
    "homeTab": [{"group": g, "commands": ids} for g, ids in HOME],
}
(DOCS / "commands-plan.json").write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
print("wrote docs/COMMANDS-PLAN.md, docs/MENUS-PLAN.md, docs/commands-plan.json")
