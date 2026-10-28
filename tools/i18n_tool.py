#!/usr/bin/env python3
"""Checks and helpers for the translations of the builders (js/i18n/<lang>.json).

  python3 tools/i18n_tool.py keys                 how many words the interface has
  python3 tools/i18n_tool.py check [--hints]      every word translated, same {placeholders}, nothing stale
  python3 tools/i18n_tool.py todo <lang> [file]   write what is missing as JSON ({"ui": {en: ""}, "character": {key: {"l": en...}}}) to translate
  python3 tools/i18n_tool.py merge <lang> <file>  put the translations of such a file into js/i18n/<lang>.json
  python3 tools/i18n_tool.py hints                which parameters, options and zones have no English hint yet

The English words are the ones in the code and in js/*_builder.json; the keys are made by js/nd_i18n_walk.js.
A language file looks like {"_about": "...", "ui": {"English text": "translation"}, "character": {"o:hair.style:bob": {"l": "label", "h": "hint"}}, "outfit": {...}, "pose": {...}}.
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
I18N = os.path.join(ROOT, "js", "i18n")
LANGS = ("ru", "zh")
SECTIONS = ("character", "outfit", "pose", "composition")
LETTERS = re.compile(r"[^\W\d_]", re.U)
PLACEHOLDER = re.compile(r"\{(\w+)\}")
NAMES = {"Character Builder", "Outfit Builder", "Pose Builder", "Composition Settings"}  # product names stay as they are
SWATCH = set()  # (section, key) of the colours: named by their label, no hint needed


def english():
    """(ui strings, {section: {key: {short: english}}}) as the code and the data have them."""
    out = subprocess.run(["node", os.path.join(ROOT, "tools", "i18n_keys.cjs")], capture_output=True, text=True)
    if out.returncode:
        sys.exit(out.stderr)
    d = json.loads(out.stdout)
    data = {s: {} for s in SECTIONS}
    for e in d["data"]:
        cur = data[e["section"]].setdefault(e["key"], {})
        cur.update(e["fields"])
        if e.get("swatch"):
            SWATCH.add((e["section"], e["key"]))
    return d["ui"], data


def load(lang):
    path = os.path.join(I18N, f"{lang}.json")
    if not os.path.exists(path):
        return {"_about": "", "ui": {}, **{s: {} for s in SECTIONS}}
    with open(path, encoding="utf8") as f:
        d = json.load(f)
    d.setdefault("ui", {})
    for s in SECTIONS:
        d.setdefault(s, {})
    return d


def save(lang, d):
    os.makedirs(I18N, exist_ok=True)
    out = {"_about": d.get("_about", ""), "ui": dict(sorted(d["ui"].items()))}
    for s in SECTIONS:
        out[s] = dict(sorted(d[s].items()))
    with open(os.path.join(I18N, f"{lang}.json"), "w", encoding="utf8") as f:
        json.dump(out, f, ensure_ascii=False, indent=0, separators=(",", ": "))
        f.write("\n")


def missing(lang, ui, data):
    d = load(lang)
    todo = {"ui": {}, **{s: {} for s in SECTIONS}}
    for k in ui:
        if not (isinstance(d["ui"].get(k), str) and d["ui"][k].strip()):
            todo["ui"][k] = ""
    for s in SECTIONS:
        for key, fields in data[s].items():
            have = d[s].get(key, {})
            miss = {sh: en for sh, en in fields.items() if not (isinstance(have.get(sh), str) and have[sh].strip())}
            if miss:
                todo[s][key] = miss
    return todo


def cmd_keys():
    ui, data = english()
    print(f"interface strings: {len(ui)}")
    for s in SECTIONS:
        fields = sum(len(v) for v in data[s].values())
        print(f"{s}: {len(data[s])} keys, {fields} fields (labels {sum('l' in v for v in data[s].values())}, hints {sum('h' in v for v in data[s].values())})")


def cmd_todo(lang, path=None):
    ui, data = english()
    todo = missing(lang, ui, data)
    n = len(todo["ui"]) + sum(len(todo[s]) for s in SECTIONS)
    text = json.dumps(todo, ensure_ascii=False, indent=1)
    if path:
        with open(path, "w", encoding="utf8") as f:
            f.write(text)
        print(f"{n} to translate -> {path}")
    else:
        print(text)


def cmd_merge(lang, path):
    with open(path, encoding="utf8") as f:
        add = json.load(f)
    d = load(lang)
    n = 0
    for k, v in add.get("ui", {}).items():
        if isinstance(v, str) and v.strip():
            d["ui"][k] = v
            n += 1
    for s in SECTIONS:
        for key, fields in add.get(s, {}).items():
            cur = d[s].setdefault(key, {})
            for sh, v in fields.items():
                if isinstance(v, str) and v.strip():
                    cur[sh] = v
                    n += 1
    save(lang, d)
    print(f"merged {n} words into js/i18n/{lang}.json")


def holes(ui, data, hints):
    """Parameters, options, levels and zones without an English hint (colours are named by their label)."""
    out = []
    for s in SECTIONS:
        for key, fields in data[s].items():
            kind = key.split(":")[0]
            if kind in ("g", "sg", "at", "lp", "zq", "t") or "h" in fields or "l" not in fields or (s, key) in SWATCH:
                continue
            out.append((s, key))
    return out


def cmd_hints():
    ui, data = english()
    miss = holes(ui, data, True)
    print(f"without a hint: {len(miss)}")
    for s, k in miss[:400]:
        print(f"  {s} {k}  [{data[s][k].get('l')}]")



def cmd_check(need_hints=False):
    ui, data = english()
    bad = warn = 0
    for lang in LANGS:
        d = load(lang)
        todo = missing(lang, ui, data)
        for k in todo["ui"]:
            print(f"[{lang}] missing ui: {k!r}")
            bad += 1
        for s in SECTIONS:
            for key, miss in todo[s].items():
                print(f"[{lang}] missing {s} {key}: {sorted(miss)}")
                bad += 1
        # stale and wrong placeholders
        for k, v in d["ui"].items():
            if k not in ui:
                print(f"[{lang}] stale ui: {k!r}")
                bad += 1
            elif isinstance(v, str) and set(PLACEHOLDER.findall(k)) != set(PLACEHOLDER.findall(v)):
                print(f"[{lang}] placeholders differ: {k!r} -> {v!r}")
                bad += 1
            elif isinstance(v, str) and v == k and LETTERS.search(k) and len(k) > 3 and k not in NAMES:
                print(f"[{lang}] not translated: {k!r}")
                warn += 1
        for s in SECTIONS:
            for key, fields in d[s].items():
                if key not in data[s]:
                    print(f"[{lang}] stale {s}: {key}")
                    bad += 1
                    continue
                for sh, v in fields.items():
                    en = data[s][key].get(sh)
                    if en is None:
                        print(f"[{lang}] stale field {s} {key}.{sh}")
                        bad += 1
                    elif isinstance(v, str) and set(PLACEHOLDER.findall(en)) != set(PLACEHOLDER.findall(v)):
                        print(f"[{lang}] placeholders differ {s} {key}.{sh}: {en!r} -> {v!r}")
                        bad += 1
                    elif sh == "l" and isinstance(v, str) and len(v) > 28 and key.startswith(("o:", "s:")):
                        print(f"[{lang}] long label ({len(v)}) {s} {key}: {v!r}")
                        warn += 1
    miss = holes(ui, data, True)
    if miss:
        print(f"{len(miss)} items have no English hint yet")
        if need_hints:
            for s, k in miss[:60]:
                print(f"  {s} {k}")
            bad += len(miss)
    print(f"{'FAIL' if bad else 'OK'}: {bad} errors, {warn} warnings")
    return 1 if bad else 0


def main(argv):
    if not argv:
        print(__doc__)
        return 0
    cmd, rest = argv[0], argv[1:]
    if cmd == "keys":
        cmd_keys()
    elif cmd == "check":
        return cmd_check("--hints" in rest)
    elif cmd == "todo":
        cmd_todo(rest[0], rest[1] if len(rest) > 1 else None)
    elif cmd == "merge":
        cmd_merge(rest[0], rest[1])
    elif cmd == "hints":
        cmd_hints()
    else:
        print(__doc__)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
