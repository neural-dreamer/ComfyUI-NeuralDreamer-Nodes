"""Puts the English hints of tools/hints/hints_*.py into the data of a builder.

A hints module has:
  ZONES    {zone id: hint}
  PARAMS   {"part.param": hint}
  OPTIONS  {"part.param": {option id: hint}}
  SETS     {option set name: {option id: hint}}
  LEVELS   {"part.param": {option id: {level id: hint}}}
Hints that are already in the data are kept; only the missing ones are added (a hint listed here wins when FORCE is True in the module).
"""
import json
import re


def apply_dict(raw, mod):
    """For the generated files (outfit, pose): call it on the data before it is written."""
    force = getattr(mod, "FORCE", False)

    def put(obj, text):
        if text and (force or not obj.get("hint")):
            obj["hint"] = text

    zones = getattr(mod, "ZONES", {})
    for z in raw.get("zones", []):
        put(z, zones.get(z["id"]))
    sets = getattr(mod, "SETS", {})
    for name, opts in raw.get("option_sets", {}).items():
        for o in opts:
            put(o, sets.get(name, {}).get(o["id"]))
            for lv in o.get("levels", []):
                put(lv, getattr(mod, "SET_LEVELS", {}).get(name, {}).get(o["id"], {}).get(lv["id"]))
    for part in raw["parts"]:
        for p in part["params"]:
            pid = f'{part["id"]}.{p["id"]}'
            put(p, getattr(mod, "PARAMS", {}).get(pid))
            opts = getattr(mod, "OPTIONS", {}).get(pid, {})
            lvls = getattr(mod, "LEVELS", {}).get(pid, {})
            for o in p.get("options", []):
                put(o, opts.get(o["id"]))
                for lv in o.get("levels", []):
                    put(lv, lvls.get(o["id"], {}).get(lv["id"]))
    return raw


def _q(text):
    return json.dumps(text, ensure_ascii=False)


def patch_text(text, mod):
    """For the hand-edited Character Builder file: add the missing hints line by line, so nothing else in the file changes."""
    force = getattr(mod, "FORCE", False)
    out, section, set_name, part, param = [], None, None, None, None
    done = {"zones": 0, "params": 0, "options": 0, "sets": 0}
    for line in text.split("\n"):
        new = line
        if re.match(r'^  "option_sets": \{', line):
            section = "sets"
        elif re.match(r'^  "parts": \[', line):
            section = "parts"
        elif re.match(r'^  "zones": \[', line):
            section = "zones"
        elif section == "sets" and (m := re.match(r'^    "([^"]+)": \[', line)):
            set_name = m.group(1)
        elif section == "sets" and (m := re.match(r'^      \{ "id": "([^"]+)"', line)):
            h = getattr(mod, "SETS", {}).get(set_name, {}).get(m.group(1))
            new = _add_option_hint(line, h, force)
            done["sets"] += new != line
        elif section == "parts":
            if (m := re.match(r'^      "id": "([^"]+)",', line)):
                part = m.group(1)
            elif (m := re.match(r'^        \{ "id": "([^"]+)", "label": "((?:[^"\\]|\\.)*)"', line)):
                param = f"{part}.{m.group(1)}"
                h = getattr(mod, "PARAMS", {}).get(param)
                if h and (force or '"hint"' not in line):
                    new = line[: m.end()] + f', "hint": {_q(h)}' + line[m.end():] if '"hint"' not in line else re.sub(r'"hint": "(?:[^"\\]|\\.)*"', f'"hint": {_q(h)}', line, count=1)
                    done["params"] += 1
            elif (m := re.match(r'^          \{ "id": "([^"]+)"', line)):
                h = getattr(mod, "OPTIONS", {}).get(param, {}).get(m.group(1))
                new = _add_option_hint(line, h, force)
                done["options"] += new != line
        elif section == "zones" and (m := re.match(r'^    \{ "id": "([^"]+)", "label": "((?:[^"\\]|\\.)*)"', line)):
            h = getattr(mod, "ZONES", {}).get(m.group(1))
            if h and not line[m.end():].startswith(', "hint"'):
                new = line[: m.end()] + f', "hint": {_q(h)}' + line[m.end():]
                done["zones"] += 1
        out.append(new)
    return "\n".join(out), done


def _add_option_hint(line, hint, force):
    if not hint:
        return line
    if '"hint"' in line:
        return re.sub(r'"hint": "(?:[^"\\]|\\.)*"', lambda _: f'"hint": {_q(hint)}', line, count=1) if force else line
    m = re.search(r"\s*\}(,?)\s*$", line)
    if not m:
        return line
    return line[: m.start()] + f', "hint": {_q(hint)} }}' + m.group(1)
