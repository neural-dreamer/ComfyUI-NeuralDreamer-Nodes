"""
Neural Dreamer Nodes — Character Builder

A character description builder. The browser (js/character_builder.js) shows
section buttons with icons; a section opens its parameters. Everything the
user sets lives in one JSON string, the hidden `state` widget:

    {"formats": {"natural": true, "tags": false},
     "avoid_conflicts": true,
     "all_random": false,
     "genitals": false,
     "values": {"face.eye_size": "large", "hair.hair_color": "*", "general.age": 27},
     "pools":  {"hair.hair_color": ["black", "red"], "general.age": [20, 35]}}

A value of "*" means random ("all_random" makes every parameter random): it is picked from the pool (or from every option)
with the seed, one draw per parameter, so changing one parameter does not
reshuffle the others. Parameters that are not set are left out of the text.
"genitals" switches the Genitals section on; while it is off, none of its values are used.
"extra" is free text added after the description (a new paragraph).
"attrs_off" lists the race attributes the user switched off ("tiefling.horns").

Parts, options and the words they turn into are data, in js/character_builder.json
(the same file the browser reads). It is reloaded when it changes on disk, so the
wording can be tuned without restarting ComfyUI.

The node has one input and one output, both ND_PARAMS. Everything else travels inside them.
Output fields: the full description plus one text per part, and "appearance": the resolved
character for nodes that build on it (description, sex, values, covers).

The "outfit" field of the input bundle (Pack Parameters: "outfit") comes from an outfit node. It is read as
    {"outfit": {"text": "...", "covers": ["nipples", "genitals", ...]}}
(or the same two fields at the top of the bundle). The text is added to the description;
every cover name (see "covers" in the data file) leaves out the parameters it hides.
"""

import hashlib
import json
import logging
import os
import random
import re

from .params import PARAMS, NDParams

log = logging.getLogger("NeuralDreamer")

DATA_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "js", "character_builder.json")
RANDOM = "*"
SEX_TAG = re.compile(r"\{female:([^|}]*)\|male:([^}]*)\}")
SEX = "general.sex"
AGE = "general.age"
RACE = "general.race"
MAX_SEED = 0xFFFFFFFFFFFFFFFF
DEFAULT_STATE = {"formats": {"natural": True, "tags": False}, "avoid_conflicts": True, "genitals": False, "extra": "", "attrs_off": [], "custom": {}, "mode": "create", "ops": {}, "edit_keep": True, "edit_subject": "", "values": {}, "pools": {}}
MAX_EXTRA = 8000
EDIT_OPS = ("add", "replace", "remove")
# Edit mode: which kind of change a part makes, for the "keep the rest" sentence
EDIT_CATS = {"face": "face", "facial_hair": "face", "hair": "hair", "tattoos": "skin"}
GENITALS = "genitals"


# ---------------------------------------------------------------------- data


class Schema:
    """Parts, parameters and options from character_builder.json, indexed by full id ("face.eye_size")."""

    def __init__(self, data):
        sets = data.get("option_sets") or {}
        self.outputs = list(data.get("outputs") or [])
        self.conflicts = list(data.get("conflicts") or [])
        self.covers = dict(data.get("covers") or {})
        # the parameter whose value picks she / he (Sex in the Character Builder, Wearer in the Outfit Builder)
        self.sex_param = data.get("sex_param") or SEX
        self.parts = []
        self.params = {}
        for part in data.get("parts") or []:
            pids = []
            for p in part.get("params") or []:
                pid = f"{part['id']}.{p['id']}"
                q = dict(p, pid=pid, part=part["id"])
                if q.get("type") == "list":
                    # tattoos: entries picked from places, designs, styles, sizes and colors
                    for key in ("places", "designs", "styles", "sizes", "colors"):
                        q[key + "_by"] = {o["id"]: o for o in q.get(key, [])}
                elif q.get("type") != "number":
                    opts = q.get("options")
                    if opts is None:
                        opts = sets.get(q.get("set"), [])
                    q["options"] = list(opts)
                    q["opt"] = {o["id"]: o for o in q["options"]}
                    if q.get("type") == "color" or q.get("custom"):
                        # "Custom": a value typed by the user; random never picks it (it is not in options)
                        q["opt"]["custom"] = {"id": "custom", "label": "Custom", "custom": True}
                self.params[pid] = q
                pids.append(pid)
            # the noun each parameter is described with in sentences (for plain tags)
            groups = part.get("natural") if isinstance(part.get("natural"), list) else []
            for g in groups:
                for x in g.get("pre", []):
                    q = self.params.get(f"{part['id']}.{x}")
                    if q is not None:
                        q.setdefault("_noun", g.get("noun") or q.get("n") or "")
            self.parts.append(dict(part, pids=pids))
        self.part_by_id = {p["id"]: p for p in self.parts}
        # a "macro" parameter (Pose Builder presets): choosing an option sets other parameters ("sets")
        self.macro = next((pid for pid, q in self.params.items() if q.get("macro")), None)


_cache = {}  # path -> {"mtime", "schema"}: the Outfit Builder reads its own data file through the same loader


def load_schema(path=DATA_PATH):
    """The parsed data file; reloaded when the file changes. A broken edit keeps the last good version."""
    entry = _cache.setdefault(path, {"mtime": None, "schema": None})
    try:
        mtime = os.path.getmtime(path)
    except OSError as e:
        if entry["schema"]:
            return entry["schema"]
        raise RuntimeError(f"Neural Dreamer: data file not found: {path}") from e
    if entry["schema"] is None or mtime != entry["mtime"]:
        try:
            with open(path, "r", encoding="utf-8") as f:
                entry["schema"] = Schema(json.load(f))
            entry["mtime"] = mtime
        except (OSError, ValueError, KeyError, TypeError) as e:
            if entry["schema"] is None:
                raise RuntimeError(f"Neural Dreamer: cannot read {path}: {e}") from e
            log.warning("[Neural Dreamer] %s is broken (%s), using the previous version", path, e)
            entry["mtime"] = mtime
    return entry["schema"]


# --------------------------------------------------------------------- state


# Penis shape was one parameter; now curve, girth and veins are set apart.
SPLIT_PARAMS = {
    "genitals.penis_shape": {
        "straight": "genitals.penis_curve", "curved_up": "genitals.penis_curve", "curved_down": "genitals.penis_curve",
        "tapered": "genitals.penis_girth", "thick": "genitals.penis_girth", "veiny": "genitals.penis_veins",
    },
}


# dark versions of the colored skin tones are now the plain color with the Darker shade
DARK_SKIN = {"dark_green": "green", "dark_grey": "grey", "dark_blue": "blue", "dark_red": "red", "dark_purple": "purple"}


def migrate_values(values, pools):
    """Values saved under parameters that were split later go to the new parameters."""
    tone = "general.skin_tone"
    if values.get(tone) in DARK_SKIN:
        values[tone] = DARK_SKIN[values[tone]]
        values.setdefault("general.skin_shade", "dark")
    if isinstance(pools.get(tone), list):
        pools[tone] = list(dict.fromkeys(DARK_SKIN.get(x, x) for x in pools[tone]))
    for old, where in SPLIT_PARAMS.items():
        v = values.pop(old, None)
        pools.pop(old, None)
        if v in where:
            values.setdefault(where[v], v)
        elif v == RANDOM:
            for new in set(where.values()):
                values.setdefault(new, RANDOM)


def blank_state(st, default_state, parse=None):
    """The state of a node that is switched off: nothing is set, so it adds nothing to the prompt (what the other nodes
    put in is still passed on). The mode and the formats stay, so the texts it passes on keep their kind."""
    base = (parse or parse_state)(json.dumps(default_state))
    for k in ("mode", "natural", "tags", "edit_style", "edit_keep"):
        base[k] = st[k]
    base["enabled"] = False
    return base


def parse_state(text):
    try:
        data = json.loads(text or "")
    except (TypeError, ValueError):
        data = {}
    if not isinstance(data, dict):
        data = {}
    formats = data.get("formats") if isinstance(data.get("formats"), dict) else {}
    natural = bool(formats.get("natural", True))
    tags = bool(formats.get("tags", False))
    if not natural and not tags:
        natural = True  # both unticked: natural language is the default
    values = dict(data.get("values")) if isinstance(data.get("values"), dict) else {}
    pools = dict(data.get("pools")) if isinstance(data.get("pools"), dict) else {}
    migrate_values(values, pools)
    # The Genitals section is off by default. A workflow or preset saved before the switch
    # existed keeps the section on when it already has values there.
    if "genitals" in data:
        genitals = bool(data.get("genitals"))
    else:
        genitals = any(str(pid).startswith(GENITALS + ".") for pid in values)
    mode = "edit" if data.get("mode") == "edit" else "create"
    all_random = bool(data.get("all_random", False))
    if mode == "edit":
        # edit models take instructions in plain sentences; All random would rewrite the whole character
        natural, tags, all_random = True, False, False
    ops = {k: v for k, v in (data.get("ops") or {}).items() if isinstance(k, str) and v in EDIT_OPS} if isinstance(data.get("ops"), dict) else {}
    return {
        "enabled": data.get("enabled") is not False,
        "mode": mode,
        "ops": ops,
        "explicit": bool(data.get("explicit", False)),
        "edit_style": "simple" if data.get("edit_style") == "simple" else "full",
        "edit_keep": bool(data.get("edit_keep", True)),
        "edit_subject": re.sub(r"\s+", " ", str(data.get("edit_subject") or "")).strip()[:80],
        "natural": natural,
        "tags": tags,
        "avoid_conflicts": bool(data.get("avoid_conflicts", True)),
        "all_random": all_random,
        "genitals": genitals,
        "extra": str(data.get("extra") or "")[:MAX_EXTRA].strip(),
        "attrs_off": [x for x in as_list(data.get("attrs_off")) if isinstance(x, str)][:200],
        "levels": {pid: {k: (v if isinstance(v, str) else [x for x in v if isinstance(x, str)])
                         for k, v in lv.items() if isinstance(k, str) and (isinstance(v, str) or (isinstance(v, list) and any(isinstance(x, str) for x in v)))}
                   for pid, lv in (data.get("levels") or {}).items() if isinstance(pid, str) and isinstance(lv, dict)} if isinstance(data.get("levels"), dict) else {},
        "custom": {k: re.sub(r"\s+", " ", v).strip()[:60] for k, v in (data.get("custom") or {}).items()
                   if isinstance(k, str) and isinstance(v, str) and v.strip()} if isinstance(data.get("custom"), dict) else {},
        "values": values,
        "pools": pools,
    }


def clamp_number(p, v):
    try:
        v = int(round(float(v)))
    except (TypeError, ValueError, OverflowError):
        return None
    return max(int(p["min"]), min(int(p["max"]), v))


def as_list(v):
    """A value as a list: several options of a "multi" parameter (e.g. mixed races), or one."""
    if v is None:
        return []
    return list(v) if isinstance(v, (list, tuple)) else [v]


ENTRY_FIELDS = ("place", "side", "design", "style", "size", "color")
SIDES = ("left", "right", "both")


def clean_entry(p, e):
    """One tattoo from saved data: only known fields, ids from the lists (or "*" for random, "custom" for typed text)."""
    if not isinstance(e, dict):
        return None
    out = {}
    for key in ("place", "design", "style", "size", "color"):
        v = e.get(key)
        table = p.get({"place": "places", "design": "designs", "style": "styles", "size": "sizes", "color": "colors"}[key] + "_by", {})
        if isinstance(v, str) and (v == RANDOM or v in table or (key in ("place", "design", "color") and v == "custom")):
            out[key] = v
    v = e.get("side")
    if v == RANDOM or v in SIDES:
        out["side"] = v
    for key in ("place_text", "design_text", "color_text"):
        if isinstance(e.get(key), str) and e[key].strip():
            out[key] = re.sub(r"\s+", " ", e[key]).strip()[:120]
    if not any(k in out for k in ("place", "design", "place_text", "design_text")):
        return None
    return out


def valid_list(p, v):
    items = v if isinstance(v, list) else []
    out = [x for x in (clean_entry(p, e) for e in items) if x]
    return out[: int(p.get("max", 8))] or None


def valid_value(p, v):
    if p.get("type") == "list":
        return valid_list(p, v)
    if p.get("type") == "number":
        return clamp_number(p, v)
    if p.get("multi"):
        # up to `multi` options at once; one option is kept as a one-item list
        out = []
        for x in as_list(v):
            if isinstance(x, str) and x in p["opt"] and x not in out:
                out.append(x)
        # an "exclusive" option (e.g. Smooth) stands alone
        excl = [x for x in out if p["opt"][x].get("exclusive")]
        if excl:
            out = excl[:1]
        return out[: int(p["multi"])] or None
    return v if isinstance(v, str) and v in p["opt"] else None


def candidates(p, pool):
    """What a random parameter may pick: the pool, or every option (the whole range for numbers)."""
    if p.get("type") == "number":
        lo, hi = int(p["min"]), int(p["max"])
        if isinstance(pool, list) and len(pool) == 2:
            a, b = clamp_number(p, pool[0]), clamp_number(p, pool[1])
            if a is not None and b is not None:
                lo, hi = min(a, b), max(a, b)
        return list(range(lo, hi + 1))
    every = [o["id"] for o in p["options"]]
    if isinstance(pool, list):
        chosen = set(x for x in pool if isinstance(x, str))
        picked = [x for x in every if x in chosen]
        if picked:
            return picked
    return every


def _matches(cond, value):
    if value is None:
        return False
    if "in" in cond:
        # a mix (several races) clashes only when every one of them does
        vals = as_list(value)
        return bool(vals) and all(x in cond["in"] for x in vals)
    try:
        v = float(value)
    except (TypeError, ValueError):
        return False
    if "min" in cond and v < float(cond["min"]):
        return False
    if "max" in cond and v > float(cond["max"]):
        return False
    return "min" in cond or "max" in cond


def allowed(schema, pid, value, resolved):
    """False if `value` for `pid` clashes with a value already chosen (rules work both ways)."""
    for rule in schema.conflicts:
        a, b = rule.get("a") or {}, rule.get("b") or {}
        for x, y in ((a, b), (b, a)):
            if x.get("p") == pid and y.get("p") in resolved and _matches(x, value) and _matches(y, resolved[y["p"]]):
                return False
    return True


def seed_for(seed, pid):
    digest = hashlib.sha256(f"{int(seed)}:{pid}".encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big")


def suits(p, sex):
    """A parameter marked `only` (e.g. breast size: female) is used only for those sexes."""
    only = p.get("only")
    return not only or sex is None or sex in only


def _pick_set(schema, p, state, seed, pid, resolved):
    """Random for a multi parameter with random_sets: one whole combination (e.g. vulva + anus)."""
    pool = state["pools"].get(pid)
    allowed_ids = set(candidates(p, pool))
    sex = resolved.get(schema.sex_param)
    sets = [r for r in p["random_sets"] if all(x in allowed_ids for x in r.get("v", []))]
    fit = [r for r in sets if not sex or not r.get("only") or sex in r["only"]]
    sets = fit or sets
    if not sets:
        return None
    rng = random.Random(seed_for(seed, pid))
    r = rng.choices(sets, weights=[max(0.0, float(x.get("weight", 1))) for x in sets])[0]
    return list(r["v"])


def anatomy_fits(opt, have):
    need = opt.get("anatomy") or []
    any_of = opt.get("anatomy_any") or []
    return all(x in have for x in need) and (not any_of or any(x in have for x in any_of))


def _pick(schema, state, seed, pid, resolved):
    p = schema.params[pid]
    if p.get("multi") and p.get("random_sets"):
        return _pick_set(schema, p, state, seed, pid, resolved)
    if p.get("skip") and random.Random(seed_for(seed, pid + "~skip")).random() < float(p["skip"]):
        return None  # an optional parameter (e.g. glowing eyes): random often leaves it out
    cands = candidates(p, state["pools"].get(pid))
    sex = resolved.get(schema.sex_param)
    if p.get("type") != "number" and not state.get("explicit"):
        # explicit options (e.g. see-through clothes) are picked only when the Explicit switch is on
        keep = [c for c in cands if not p["opt"][c].get("explicit")]
        cands = keep if (keep or p.get("macro")) else cands  # a pose preset has no explicit fallback
        if not cands:
            return None
    if p.get("type") != "number" and p.get("filter_by"):
        # styles: random picks the items of the chosen styles (and the ones every style can wear);
        # {"p": ..., "field": ...}: the same for any other parameter (e.g. the postures a leg pose suits)
        fb = p["filter_by"] if isinstance(p["filter_by"], dict) else {"p": p["filter_by"], "field": "styles"}
        chosen = set(as_list(resolved.get(fb["p"])))
        if chosen:
            fit = [c for c in cands if not p["opt"][c].get(fb["field"]) or chosen & set(p["opt"][c][fb["field"]])]
            cands = fit or cands
    if p.get("type") != "number" and state.get("anatomy") is not None:
        # "anatomy" (all of) / "anatomy_any" (one of): options for a body the character has; no fallback
        have = set(state["anatomy"])
        cands = [c for c in cands if anatomy_fits(p["opt"][c], have)]
        if not cands:
            return None
    if sex and p.get("type") != "number":
        fit = [c for c in cands if sex in (p["opt"][c].get("only") or [sex])]
        cands = fit or cands
    if p.get("type") != "number":
        # "needs": e.g. green skin is picked only for orcs and goblins
        def fits(c):
            need = p["opt"][c].get("needs")
            return not need or any(x in (need.get("in") or []) for x in as_list(resolved.get(need.get("p"))))
        fit = [c for c in cands if fits(c)]
        cands = fit or cands
    if state["avoid_conflicts"]:
        cands = [c for c in cands if allowed(schema, pid, c, resolved)]
        if not cands:
            return None  # every value clashes with what is already chosen: leave it out
    rng = random.Random(seed_for(seed, pid))
    if p.get("type") != "number" and any("weight" in p["opt"][c] for c in cands):
        # "weight": how often random picks an option (1 by default), e.g. Human more often than any one fantasy race
        weights = [max(0.0, float(p["opt"][c].get("weight", 1))) for c in cands]
        if sum(weights) > 0:
            return rng.choices(cands, weights=weights)[0]
    return cands[rng.randrange(len(cands))]


def muted(schema, resolved):
    """Parameters switched off by a chosen option ("mutes"), e.g. nail color under a French manicure."""
    out = set()
    for pid, v in resolved.items():
        p = schema.params.get(pid)
        if not p or p.get("type") in ("number", "list"):
            continue
        for one in as_list(v):
            for x in (p["opt"].get(one) or {}).get("mutes", []):
                if x.endswith(".*"):
                    out.update(q for q, qp in schema.params.items() if qp["part"] == x[:-2])
                else:
                    out.add(x if "." in x else f"{p['part']}.{x}")
    return out


def random_entries(seed, pid):
    """A few tattoos with everything left to chance."""
    n = random.Random(seed_for(seed, pid + "~n")).choice([1, 1, 2, 3])
    return [{k: RANDOM for k in ("place", "design", "style", "size", "color", "side")} for _ in range(n)]


def expand_entries(schema, state, seed, pid, entries, resolved):
    """Tattoo entries with every "*" field replaced by a pick of the seed (one draw per field)."""
    p = schema.params[pid]
    adult = bool(state.get("genitals"))
    out = []
    for i, e in enumerate(entries):
        e = dict(e)
        for key, table in (("place", "places"), ("design", "designs"), ("style", "styles"), ("size", "sizes"), ("color", "colors")):
            if e.get(key) != RANDOM:
                continue
            ids = [o["id"] for o in p[table] if adult or not o.get("adult")]
            rng = random.Random(seed_for(seed, f"{pid}#{i}.{key}"))
            e[key] = rng.choice(ids)
        if e.get("side") == RANDOM:
            rng = random.Random(seed_for(seed, f"{pid}#{i}.side"))
            e["side"] = rng.choice(["left", "right", "both", ""])
        if not e.get("side"):
            e.pop("side", None)
        out.append(e)
    return out


def covered_params(schema, covers):
    """Parameters hidden by an outfit: each cover name lists parameter ids, or "part.*" for a whole part."""
    out = set()
    for name in covers or []:
        for x in (schema.covers.get(name) or {}).get("hide", []):
            if x.endswith(".*"):
                part = x[:-2]
                out.update(pid for pid, p in schema.params.items() if p["part"] == part)
            elif x in schema.params:
                out.add(x)
    return out


def read_outfit(bundle):
    """(text, covers) from an outfit bundle; ("", []) when there is none."""
    if not isinstance(bundle, dict):
        return "", []
    o = bundle
    for _ in range(3):  # {"outfit": {"outfit": {...}}} when the wire was packed twice
        if not isinstance(o.get("outfit"), dict):
            break
        o = o["outfit"]
    text = o.get("text") if isinstance(o.get("text"), str) else ""
    covers = [c for c in (o.get("covers") or []) if isinstance(c, str)] if isinstance(o.get("covers"), (list, tuple)) else []
    return text.strip(), covers


def read_outfit_data(bundle):
    """The outfit bundle of an Outfit Builder (or {"text", "covers"}) as one dict; {} when there is none.
    Keys: text, tags (list), template, edit, edit_simple, mode, covers, touched."""
    if not isinstance(bundle, dict):
        return {}
    o = bundle
    for _ in range(3):
        if not isinstance(o.get("outfit"), dict):
            break
        o = o["outfit"]
    def s(k):
        return o[k].strip() if isinstance(o.get(k), str) else ""
    text, covers = read_outfit(bundle)
    tags = [t.strip() for t in s("tags").split(",") if t.strip()]
    return {
        "text": text, "tags": tags, "template": s("template"), "edit": s("edit"), "edit_simple": s("edit_simple"),
        "mode": "edit" if o.get("mode") == "edit" else "create", "covers": covers,
        "touched": [x for x in (o.get("touched") or []) if isinstance(x, str)] if isinstance(o.get("touched"), (list, tuple)) else [],
    }


def outfit_paragraph(outfit, state, pron):
    """(text of the outfit paragraph, whether it is a partial edit) for the description of a character."""
    if not outfit:
        return "", False
    if state.get("mode") == "edit":
        if outfit["mode"] == "edit" and outfit["edit"]:
            return fill_pron(outfit["edit"], pron), True
        if outfit["edit_simple"]:
            return fill_pron(outfit["edit_simple"], pron), False
        if outfit["text"]:
            return fill_pron("Change {pos} outfit to: " + outfit["text"], pron), False
        return "", False
    nat = fill_pron(outfit["template"] or outfit["text"], pron)
    if outfit["tags"] or outfit["template"]:
        return compose(nat, outfit["tags"], state), False
    return nat, False


def apply_macro(schema, state, seed, fixed, randoms, resolved, picked):
    """A macro parameter (a pose preset) is chosen by hand or by random, then its "sets" fill the parameters the
    user left alone (with All random they win over the random picks). Fills `fixed` / `randoms` / `picked` in place;
    state["_macro"] = {"id", "pid"} tells the text which preset is on."""
    mp = schema.macro
    state.pop("_macro", None)
    if not mp or (mp not in fixed and mp not in randoms):
        return
    p = schema.params[mp]
    if mp in fixed:
        mid = fixed.pop(mp)
        mid = mid[0] if isinstance(mid, list) else mid
    else:
        randoms.remove(mp)
        mid = _pick(schema, state, seed, mp, resolved)
        if mid is not None:
            picked[mp] = mid
    opt = p["opt"].get(mid) if mid is not None else None
    if opt is None or (opt.get("explicit") and not state.get("explicit")):
        picked.pop(mp, None)
        return
    resolved[mp] = mid
    state["_macro"] = {"id": mid, "pid": mp}
    allr = bool(state.get("all_random"))
    for pid, val in (opt.get("sets") or {}).items():
        q = schema.params.get(pid)
        if q is None or (pid in fixed or (pid in randoms and not allr)):
            continue
        if q.get("explicit") and not state.get("explicit"):
            continue
        v = valid_value(q, val)
        if v is not None and not state.get("explicit") and q.get("type") not in ("number", "list"):
            keep = [x for x in as_list(v) if not q["opt"][x].get("explicit")]
            v = (keep if q.get("multi") else keep[0]) if keep else None
        if v is None:
            continue
        fixed[pid] = v
        if pid in randoms:
            randoms.remove(pid)
    lv = state.setdefault("levels", {})
    for pid, d in (opt.get("sets_levels") or {}).items():
        for k, x in d.items():
            lv.setdefault(pid, {}).setdefault(k, x)


def resolve(schema, state, seed, covers=None):
    """Returns (resolved, picked): every value that goes into the text, and the random picks alone.
    Parameters hidden by the outfit (covers) are still picked, so a random character stays the
    same with and without clothes; they are only left out of the text."""
    fixed, randoms = {}, []
    for pid, p in schema.params.items():
        if p["part"] == GENITALS and not state.get("genitals"):
            continue  # the Genitals section is switched off: none of it is used
        if p.get("explicit") and not state.get("explicit"):
            continue  # an explicit parameter (e.g. Exposure) is used only when the Explicit switch is on
        # "All random": every parameter is random; the values set by hand are ignored
        v = RANDOM if state.get("all_random") else state["values"].get(pid)
        if p.get("type") == "list" and state.get("all_random"):
            # tattoos are not for everyone: with "All random" about a third of the characters get some
            v = RANDOM if random.Random(seed_for(seed, pid + "~any")).random() < 0.35 else None
        if v is None:
            continue
        if v == RANDOM:
            randoms.append(pid)
            continue
        v = valid_value(p, v)
        if v is not None and not state.get("explicit") and p.get("type") not in ("number", "list"):
            # values saved while Explicit was on stay in the state but are not used
            keep = [x for x in as_list(v) if not p["opt"][x].get("explicit")]
            v = (keep if p.get("multi") else keep[0]) if keep else None
        if v is not None:
            fixed[pid] = v
    resolved, picked = {}, {}
    # sex first: it decides which parameters apply, and the other picks respect it
    SEXP = schema.sex_param
    if SEXP in fixed:
        resolved[SEXP] = fixed[SEXP]
    elif SEXP in randoms and SEXP in schema.params:
        v = _pick(schema, state, seed, SEXP, resolved)
        if v is not None:
            resolved[SEXP] = picked[SEXP] = v
    sex = resolved.get(SEXP)
    apply_macro(schema, state, seed, fixed, randoms, resolved, picked)
    lists = {}
    for pid, v in fixed.items():
        if pid != SEXP and suits(schema.params[pid], sex):
            if schema.params[pid].get("type") == "list":
                lists[pid] = v  # entries with random fields are filled in below
            else:
                resolved[pid] = v
    # the rest in the schema order
    for pid in randoms:
        if pid == SEXP or not suits(schema.params[pid], sex):
            continue
        if schema.params[pid].get("type") == "list":
            lists[pid] = random_entries(seed, pid)
            continue
        v = _pick(schema, state, seed, pid, resolved)
        if v is not None:
            picked[pid] = v
            resolved[pid] = as_list(v) if schema.params[pid].get("multi") else v
    # "requires": e.g. penis size is used only when the parts include a penis; "set": the other one has any value
    for pid in list(resolved):
        need = schema.params[pid].get("requires")
        if not need:
            continue
        have = as_list(resolved.get(need.get("p")))
        ok = bool(have) if need.get("set") else any(x in (need.get("in") or []) for x in have)
        if not ok:
            resolved.pop(pid, None)
            picked.pop(pid, None)
    for pid in muted(schema, resolved):
        resolved.pop(pid, None)
        picked.pop(pid, None)
    for pid in covered_params(schema, covers):
        resolved.pop(pid, None)
    for pid, entries in lists.items():
        out = expand_entries(schema, state, seed, pid, entries, resolved)
        if out:
            resolved[pid] = out
            if any(RANDOM in e.values() for e in entries):
                picked[pid] = out
    return resolved, picked


# ---------------------------------------------------------------------- text

PRONOUNS = {"she": ("She", "is", "has"), "he": ("He", "is", "has")}


def with_article(phrase):
    p = phrase.strip()
    if not p:
        return p
    low = p.lower()
    if low[0].isdigit():
        an = low.startswith("8") or low.startswith("18-") or low.startswith("11-")
    elif low.startswith(("eu", "uni", "use", "one")):
        an = False
    elif low.startswith(("hour", "honest", "heir")):
        an = True
    else:
        an = low[0] in "aeiou"
    return ("an " if an else "a ") + p


def join_list(items):
    items = [i for i in items if i]
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def semi_list(items):
    """Long phrases that contain commas themselves: "a; b; and c"."""
    items = [i for i in items if i]
    if len(items) <= 1 or not any("," in i for i in items):
        return join_list(items)
    if len(items) == 2:
        return f"{items[0]}, and {items[1]}"
    return "; ".join(items[:-1]) + "; and " + items[-1]


def _cap(s):
    return s[:1].upper() + s[1:]


TOKEN = re.compile(r"\{([a-z_]+\.[a-z0-9_]+):(adj|tag|label|text)(?:\|([^}]*))?\}")
POSSESSIVE = {"she": "her", "he": "his"}


class Text:
    def __init__(self, schema, resolved, state=None, covers=()):
        self.schema = schema
        self.resolved = resolved
        self.state = state or {}
        self.covers = set(covers or [])
        self.attrs_off = set(self.state.get("attrs_off") or [])

    def options(self, pid):
        """Every chosen option of a parameter (several for a "multi" parameter)."""
        p = self.schema.params.get(pid)
        v = self.resolved.get(pid)
        if p is None or v is None or p.get("type") in ("number", "list"):
            return []
        out = [self.live(p, p["opt"][x]) for x in as_list(v) if x in p["opt"]]
        return [o for o in out if o]

    def live(self, p, o):
        """The "Custom" color becomes an option made of the typed words (none while the field is empty)."""
        if not o.get("custom"):
            return o
        t = (self.state.get("custom") or {}).get(p["pid"], "")
        if not t:
            return None
        noun = p.get("custom_noun") or p.get("_noun") or ""
        return {"id": "custom", "label": t, "adj": t, "tag": f"{t} {noun}".strip(), "custom": True}

    # ---- words that depend on other parameters

    def adj_of(self, pid, o):
        """The adjective of an option; colours take the chosen shade and tone, and "like the hair" follows the hair."""
        base = o.get("adj", "")
        src = o.get("adj_from")
        if src:
            ho = self.option(src)
            base = self.adj_of(src, ho) if ho else ""
        sh = (self.schema.params.get(pid) or {}).get("shade")
        if sh and base and not o.get("custom"):
            part = pid.split(".")[0]
            lvl, tint = self.option(f"{part}.{sh['level']}"), self.option(f"{part}.{sh['tint']}")
            if lvl and lvl.get("adj") and lvl["adj"] not in base.split():
                base = f"{lvl['adj']} {base}"
            if tint and tint.get("adj"):
                base = f"{tint['adj']} {base}"
        return base

    def fill(self, tpl):
        """Replaces {pid:adj|tag|label} (and {pid:adj|default}) with what is chosen; None when a value is missing and has no default."""
        if tpl is None:
            return None
        missing = False

        def one(m):
            nonlocal missing
            pid, field, default = m.group(1), m.group(2), m.group(3)
            o = self.option(pid)
            val = None
            if o:
                val = self.adj_of(pid, o) if field == "adj" else o.get(field)
            if not val:
                if default is None:
                    missing = True
                    return ""
                return default
            return val

        out = TOKEN.sub(one, tpl)
        return None if missing else out

    def fill_first(self, tpl):
        """A text or a list of texts: the first that can be filled."""
        for t in (tpl if isinstance(tpl, list) else [tpl]):
            r = self.fill(t)
            if r:
                return r
        return None

    def attrs_of(self, race):
        """The attributes of a race that are switched on (and fit the sex)."""
        sex = self.resolved.get(SEX)
        out = []
        for a in race.get("attrs") or []:
            if f"{race['id']}.{a['id']}" in self.attrs_off:
                continue
            if a.get("only") and sex and sex not in a["only"]:
                continue
            out.append(a)
        return out

    def option(self, pid):
        opts = self.options(pid)
        return opts[0] if opts else None

    def pronoun(self):
        o = self.option(SEX)
        return (o or {}).get("pron", "they")

    @staticmethod
    def plain_tag(p, o):
        """A plain tag for an option with no Danbooru tag: its ptag, or the words used in sentences
        ("heart-shaped face", "flat stomach"). Commas are dropped, they would split the tag."""
        t = o.get("ptag")
        if t is None:
            if o.get("text"):
                t = re.sub(r"^(a|an|the)\s+", "", o["text"].strip(), flags=re.I)
            elif o.get("adj"):
                t = f"{o['adj']} {p.get('_noun', '')}"
            else:
                t = f"{o.get('label', '')} {p.get('label', '')}".lower()
        t = t.replace("{n}", p.get("n", "")).replace("{m}", p.get("m", ""))
        return re.sub(r"\s+", " ", re.sub(r"\s*,\s*", " ", t)).strip()

    def tags(self, part):
        """Tags of a part: Danbooru tags where Danbooru has one, plain tags for the rest.
        {n}/{m} come from the parameter, {female:..|male:..} from the sex."""
        sex = self.resolved.get(SEX)
        pick = lambda m: (m.group(1) if sex == "female" else m.group(2) if sex == "male" else "")
        out = []
        for pid in part["pids"]:
            p = self.schema.params[pid]
            v = self.resolved.get(pid)
            if v is None:
                continue
            if p.get("type") == "number":
                if pid == AGE:
                    age = int(v)
                    out.append(f"{age} years old")
                    if age >= 61:
                        out += ["old", "old woman" if sex == "female" else "old man" if sex == "male" else ""]
                    elif age >= 41:
                        out.append("mature female" if sex == "female" else "mature male" if sex == "male" else "")
                continue
            if p.get("type") == "list":
                out += self.tattoo_tags(pid)
                continue
            for o in self.options(pid):
                if o.get("silent"):
                    continue
                raw = o.get("tag", "")
                templ = "{" in raw
                if templ:
                    raw = self.fill(raw)
                    if raw is None:
                        continue
                t = raw.replace("{n}", p.get("n", "")).replace("{m}", p.get("m", ""))
                t = SEX_TAG.sub(pick, t)
                if not t.strip() and not templ:
                    t = SEX_TAG.sub(pick, self.plain_tag(p, o))
                out += [x.strip() for x in t.split(",")]
                if pid == "general.race":
                    for a in self.attrs_of(o):
                        out += [x.strip() for x in SEX_TAG.sub(pick, a.get("tag", "")).split(",")]
        for c in self.combos(part):
            out += [x.strip() for x in SEX_TAG.sub(pick, c.get("tag", "")).split(",")]
        return [x for x in out if x]

    def negative(self):
        """Tags of the parts that are absent, for the negative prompt (only once parts are chosen)."""
        out = []
        for p in self.schema.params.values():
            if not p.get("multi") or p.get("type") == "number":
                continue
            have = set(as_list(self.resolved.get(p["pid"])))
            if not have:
                continue
            out += [o["neg"] for o in p["options"] if o.get("neg") and o["id"] not in have]
        return out

    def by_sex(self, text):
        sex = self.resolved.get(SEX)
        return SEX_TAG.sub(lambda m: m.group(1) if sex == "female" else m.group(2) if sex == "male" else (m.group(1) or m.group(2)), text or "")

    def subject(self):
        sex = self.option(SEX)
        age = self.resolved.get(AGE)
        app = self.option("general.appearance")
        races = self.options("general.race")
        if len(races) > 1:
            return self.mixed_subject(sex, age, app, races)
        race = races[0] if races else {}
        skin = self.skin_words()
        if not (sex or age is not None or app or skin or race):
            return ""
        words = []
        if age is not None:
            words.append(f"{age}-year-old")
        if app and app.get("adj"):
            words.append(app["adj"])
        if race.get("noun"):
            # e.g. "succubus", "cat girl": the race word replaces "woman"
            words.append(self.by_sex(race["noun"]).strip() or (sex["noun"] if sex else "person"))
        else:
            if race.get("word"):
                words.append(race["word"])
            if sex or not race.get("word"):
                words.append(sex["noun"] if sex else "person")
        s = with_article(" ".join(words))
        extra = []
        trait = join_list([self.by_sex(a["text"]).strip() for a in self.attrs_of(race)])
        if trait:
            extra.append(trait)
        if skin:
            extra.append(", ".join(skin) + " skin")
        if extra:
            # "wings and a tail, and fair skin": the comma keeps the two lists apart
            s += " with " + (", and ".join(extra) if " and " in extra[0] and len(extra) > 1 else join_list(extra))
        return _cap(s) + "."

    def skin_words(self):
        """Skin texture and tone (with the chosen shade and undertone) as adjectives."""
        out = []
        for pid in ("general.skin_tone", "general.skin_texture"):
            o = self.option(pid)
            if o:
                a = self.adj_of(pid, o)
                if a:
                    out.append(a)
        return out

    def traits(self, races):
        """Features of several races in one list without repeats: "long pointed ears, fox ears and a tail"."""
        items = []
        for o in races:
            for a in self.attrs_of(o):
                x = self.by_sex(a["text"]).strip()
                if x and x not in items:
                    items.append(x)
        return items

    def mixed_subject(self, sex, age, app, races):
        """Several races mixed: "A 24-year-old woman of mixed elf and fox-folk blood, with ..."."""
        skin = self.skin_words()
        words = []
        if age is not None:
            words.append(f"{age}-year-old")
        if app and app.get("adj"):
            words.append(app["adj"])
        words.append(sex["noun"] if sex else "person")
        names = [self.by_sex(o.get("mix") or o.get("label", "").lower()) for o in races]
        s = with_article(" ".join(words)) + f" of mixed {join_list(names)} blood"
        feats = self.traits(races)
        if feats:
            s += ", with " + join_list(feats)
            if skin:
                s += ", and " + ", ".join(skin) + " skin"
        elif skin:
            s += ", with " + ", ".join(skin) + " skin"
        return _cap(s) + "."

    def active(self, cond):
        """A group's "when": e.g. the penis phrase only when the parts include a penis."""
        return any(x in (cond.get("in") or []) for x in as_list(self.resolved.get(cond.get("p"))))

    def group(self, part_id, g):
        if g.get("when") and not self.active(g["when"]):
            return None
        if g.get("text"):
            return g["text"]
        pre = [(self.schema.params[f"{part_id}.{x}"], self.option(f"{part_id}.{x}")) for x in g.get("pre", [])]
        post_opts = [self.option(f"{part_id}.{x}") for x in g.get("post", [])]
        pre = [(p, o) for p, o in pre if o and not o.get("silent")]
        post, drop = [], set()
        for o in post_opts:
            if not o or o.get("silent") or not o.get("post"):
                continue
            txt = self.fill_first(o["post"])
            if txt:
                post.append(dict(o, post=txt))
                drop.update(o.get("drop_pre") or [])
        pre = [(p, o) for p, o in pre if p["pid"] not in drop]
        if not pre and not post:
            if g.get("when") and g.get("noun"):
                # the part is there but nothing more is set: "a penis", "testicles"
                return with_article(g["noun"]) if g.get("article") else g["noun"]
            return None
        solo = next((o for _, o in pre if o.get("solo") and o.get("text")), None)
        if solo:
            return solo["text"]  # e.g. "a flat chest": the other adjectives do not apply
        if len(g.get("pre", [])) == 1 and not g.get("post") and pre and pre[0][1].get("text"):
            return pre[0][1]["text"]
        adjs = [a for a in (self.adj_of(p["pid"], o) for p, o in pre) if a]
        if g.get("kind") == "is":
            return " ".join(adjs) or None
        # an option may name the thing itself: "horse cock" instead of "penis"
        noun = next((o["noun"] for _, o in pre if o.get("noun")), None) or g.get("noun") or (pre[0][0].get("n", "") if pre else "")
        words = " ".join(adjs + [noun]).strip()
        if g.get("article") and words:
            words = with_article(words)
        # posts starting with a comma follow without a space: "a penis, uncircumcised, fully erect"
        return " ".join([words] + [o["post"] for o in post]).replace(" ,", ",").strip() or None

    # ---- tattoos

    def possessive(self):
        return POSSESSIVE.get(self.pronoun(), "their")

    def tattoo_entries(self, pid):
        """The tattoos that are shown: known places and designs, no covered places, nothing adult while Genitals is off."""
        p = self.schema.params[pid]
        adult = bool(self.state.get("genitals"))
        out = []
        for e in as_list(self.resolved.get(pid)):
            if not isinstance(e, dict):
                continue
            pl = p["places_by"].get(e.get("place"))
            de = p["designs_by"].get(e.get("design"))
            if (pl and pl.get("adult") and not adult) or (de and de.get("adult") and not adult):
                continue
            if pl and any(c in self.covers for c in as_list(pl.get("cover"))):
                continue
            if pl and pl.get("cover_all") and all(c in self.covers for c in pl["cover_all"]):
                continue  # e.g. a sleeve tattoo is hidden only when the whole arm is covered
            out.append((e, pl, de))
        return out

    def tattoo_phrase(self, p, e, pl, de):
        pos = self.possessive()
        style, size, color = (p[t + "_by"].get(e.get(k)) for t, k in (("styles", "style"), ("sizes", "size"), ("colors", "color")))
        ctext = e.get("color_text") if e.get("color") == "custom" else None
        adj = " ".join(x for x in (size and size.get("adj"), color and color.get("adj") or ctext, style and style.get("adj")) if x)
        if de:
            core = de["text"].replace("{a}", adj + " " if adj else "").strip()
            if "{a}" not in de["text"] and adj:
                core = f"{adj} {core}"
            plural = bool(re.search(r"\btattoos\b", core))
            if not (core.lower().startswith(("a ", "an ", "the ")) or plural):
                core = with_article(core)
        else:
            raw = e.get("design_text")
            if raw:
                t = re.sub(r"^(a|an|the)\s+", "", raw.strip(), flags=re.I)
                if "tattoo" not in t.lower():
                    t += " tattoo"
            else:
                t = "tattoo"
            plural = bool(re.search(r"\btattoos\b", t))
            core = f"{adj} {t}".strip()
            if not plural:
                core = with_article(core)
        where = ""
        if pl:
            side = e.get("side") if pl.get("paired") else None
            if side == "both" and pl.get("both"):
                where = pl["both"]
            else:
                where = pl["on"].replace("{side}", f"{side} " if side in ("left", "right") else "")
            where = where.replace("{pos}", pos)
        elif e.get("place_text"):
            where = e["place_text"]
            if not where.lower().startswith(("her ", "his ", "their ", "the ")):
                where = f"{pos} {where}"
        return f"{core} on {where}" if where else core

    def tattoo_text(self, part):
        phrases = []
        for pid in part["pids"]:
            p = self.schema.params[pid]
            if p.get("type") != "list":
                continue
            phrases += [self.tattoo_phrase(p, e, pl, de) for e, pl, de in self.tattoo_entries(pid)]
        if not phrases:
            return ""
        subj, _, have = PRONOUNS.get(self.pronoun(), ("They", "are", "have"))
        return f"{subj} {have} {semi_list(phrases)}."

    def tattoo_tags(self, pid):
        p = self.schema.params[pid]
        out = []
        for e, pl, de in self.tattoo_entries(pid):
            style = p["styles_by"].get(e.get("style"))
            if de:
                out += de.get("tag", "").split(",")
            elif e.get("design_text"):
                t = re.sub(r"^(a|an|the)\s+", "", e["design_text"].strip().lower())
                out.append(t if "tattoo" in t else t + " tattoo")
            if style:
                out += style.get("tag", "").split(",")
            if pl:
                out += pl.get("tag", "").split(",")
            elif e.get("place_text"):
                out.append(e["place_text"].lower() + " tattoo")
            if not de and not e.get("design_text"):
                out.append("tattoo")
        return [x.strip() for x in out if x.strip()]

    def combos(self, part):
        """Combinations of a multi parameter, e.g. vulva + penis on a woman: futanari."""
        out = []
        sex = self.resolved.get(SEX)
        for pid in part["pids"]:
            p = self.schema.params[pid]
            if p.get("type") == "list":
                continue
            have = set(as_list(self.resolved.get(pid)))
            if not have:
                continue
            for c in p.get("combos") or []:
                if c.get("only") and sex not in c["only"]:
                    continue
                if all(x in have for x in c.get("has", [])) and not any(x in have for x in c.get("lacks", [])):
                    out.append(c)
        return out

    def natural(self, part):
        spec = part.get("natural")
        if spec == "subject":
            return self.subject()
        if spec == "tattoos":
            return self.tattoo_text(part)
        is_list, has_list = [], []
        for c in self.combos(part):
            if c.get("lead"):
                is_list.append(c["lead"])  # "She is a futanari, with ..."
        for g in spec or []:
            phrase = self.group(part["id"], g)
            if phrase:
                (is_list if g.get("kind") == "is" else has_list).append(phrase)
        if not is_list and not has_list:
            return ""
        joiner = semi_list if part.get("list") == "semicolon" else join_list
        subj, be, have = PRONOUNS.get(self.pronoun(), ("They", "are", "have"))
        if is_list and has_list:
            return f"{subj} {be} {join_list(is_list)}, with {joiner(has_list)}."
        if is_list:
            return f"{subj} {be} {join_list(is_list)}."
        return f"{subj} {have} {joiner(has_list)}."


def lower_first(t):
    return t[:1].lower() + t[1:] if t else t


class EditText(Text):
    """The same character as instructions for an image-editing model: only what is set, in the imperative."""

    def __init__(self, schema, resolved, state, covers=()):
        super().__init__(schema, resolved, state, covers)
        self.ops = state.get("ops") or {}
        self.subject_word = state.get("edit_subject") or ""
        self.subject_used = False
        self.hidden = covered_params(schema, covers)
        # the attribute sentences ("Change her eyes to ...") never include the features: those have their own sentences
        keep = {pid: v for pid, v in resolved.items() if not (schema.params[pid].get("edit") and not schema.params[pid]["edit"].get("structural"))}
        self.attr = Text(schema, keep, state, covers)
        self.touched = set()

    # ---- words

    def op(self, pid):
        p = self.schema.params[pid]
        op = self.ops.get(pid, "add")
        return op if op in (p.get("edit") or {}).get("ops", EDIT_OPS) else "add"

    def refs(self):
        sex = self.resolved.get(SEX)
        return {"she": ("her", "her"), "he": ("his", "him")}.get(self.pronoun(), ("their", "them"))

    def tpl(self, t, **kw):
        """A template with {pos}/{obj} and the usual tokens filled; None when something is missing."""
        r = self.fill_first(t)
        if not r:
            return None
        pos, obj = self.refs()
        if self.subject_word and not self.subject_used and ("{pos}" in r or "{obj}" in r):
            # the first mention names the person: "Change the woman on the left's hair ..."
            self.subject_used = True
            pos, obj = f"{self.subject_word}'s", self.subject_word
        for k, v in {"pos": pos, "obj": obj, **kw}.items():
            r = r.replace("{" + k + "}", v)
        r = re.sub(r"\s+", " ", r).replace(" ,", ",").replace(" .", ".").strip()
        return r

    def present(self, pid):
        """A feature takes part when it has a value, or it is set to Remove (a value is not needed)."""
        p = self.schema.params[pid]
        if pid in self.hidden or not suits(p, self.resolved.get(SEX)):
            return False
        if p["part"] == GENITALS and not self.state.get("genitals"):
            return False
        return pid in self.resolved or self.ops.get(pid) == "remove"

    def feature(self, pid, phrase=""):
        """The sentence for one feature parameter by its operation, or None."""
        p = self.schema.params[pid]
        e = p["edit"]
        op = self.op(pid)
        o = self.option(pid)
        t = o.get(f"edit_{op}") if o else None
        if t is None:
            t = e.get(op)
        if t is None and op == "replace":
            add = (o.get("edit_add") if o else None) or e.get("add")
            first = self.fill_first(add) if add else None
            if first and e.get("replace_prefix"):
                return self.tpl(e["replace_prefix"] + lower_first(first), phrase=phrase)
            t = add
        if t is None:
            return None
        return self.tpl(t, phrase=phrase)

    # ---- parts

    def sentences(self, part):
        spec = part.get("natural")
        if spec == "subject":
            return self.general()
        if spec == "tattoos":
            return self.tattoos(part)
        out = []
        for g in spec or []:
            out += self.group_edit(part, g)
        return out

    def group_edit(self, part, g):
        pid_of = lambda x: f"{part['id']}.{x}"
        feat = (g.get("edit") or {}).get("feature")
        if feat:
            # the whole group is one feature (a beard): Add / Replace / Remove it
            pid = pid_of(feat)
            if pid in self.hidden or not suits(self.schema.params[pid], self.resolved.get(SEX)):
                return []
            phrase = self.group(part["id"], g) or ""
            if not phrase and self.ops.get(pid) != "remove":
                return []
            s = self.feature(pid, phrase)
            return [s] if s else []
        names = [*g.get("pre", []), *g.get("post", [])]
        out = []
        has_attr = any(self.attr.option(pid_of(x)) for x in names) or (g.get("text") and self.attr.active(g.get("when") or {}))
        if has_attr:
            phrase = self.attr.group(part["id"], g)
            if phrase:
                pos, obj = self.refs()
                noun = g.get("noun")
                if g.get("kind") == "is":
                    out.append(self.tpl("Make {obj} {phrase}.", phrase=phrase))
                elif noun:
                    out.append(self.tpl("Change {pos} {noun} to {phrase}.", noun=noun, phrase=phrase))
                else:
                    out.append(self.tpl("Give {obj} {phrase}.", phrase=phrase))
        for x in names:
            pid = pid_of(x)
            if self.schema.params[pid].get("edit") and not self.schema.params[pid]["edit"].get("structural") and self.present(pid):
                s = self.feature(pid)
                if s:
                    out.append(s)
        return [x for x in out if x]

    def general(self):
        out = []
        pos, obj = self.refs()
        age = self.resolved.get(AGE)
        if age is not None:
            out.append(self.tpl(f"Make {{obj}} look {int(age)} years old."))
            self.touched.add("ident")
        app = self.option("general.appearance")
        if app:
            out.append(self.tpl(f"Give {{obj}} {app.get('adj') or app.get('label', '')} features."))
            self.touched.add("ident")
        races = self.options(RACE)
        if races and self.present(RACE):
            op = self.op(RACE)
            feats = self.traits(races)
            names = [self.by_sex(o.get("mix") or o.get("label", "").lower()) for o in races]
            if op == "remove":
                s = self.tpl("Remove {pos} " + join_list(feats) + ".") if feats else None
                self.touched.add("body")
            elif op == "replace":
                s = self.tpl("Turn {obj} into " + (with_article(names[0]) if len(names) == 1 else f"a mix of {join_list(names)}") + (", with " + join_list(feats) if feats else "") + ".")
                self.touched.add("ident")
            else:
                s = self.tpl("Give {obj} " + join_list(feats) + ".") if feats else self.tpl("Make {obj} " + (with_article(names[0]) if len(names) == 1 else f"a mix of {join_list(names)}") + ".")
                self.touched.add("body")
            if s:
                out.append(s)
        skin = self.skin_words()
        if skin:
            out.append(self.tpl("Change {pos} skin to " + ", ".join(skin) + " skin."))
            self.touched.add("skin")
        return [x for x in out if x]

    def tattoos(self, part):
        out = []
        for pid in part["pids"]:
            p = self.schema.params[pid]
            if p.get("type") != "list" or not self.present(pid) and pid not in self.resolved:
                continue
            op = self.op(pid)
            entries = self.tattoo_entries(pid) if pid in self.resolved else []
            phrases = [self.tattoo_phrase(p, e, pl, de) for e, pl, de in entries]
            if op == "remove":
                if phrases:
                    phrases = [re.sub(r"^(a|an) ", "the ", x) for x in phrases]
                    out.append(self.tpl("Remove " + semi_list(phrases) + "."))
                else:
                    out.append(self.tpl("Remove all of {pos} tattoos, leaving the skin clean."))
            elif phrases:
                out.append(self.tpl(("Replace {pos} tattoos with " if op == "replace" else "Add ") + semi_list(phrases) + "."))
        return out

    def parts_feature(self):
        """Genitals > Parts as an operation: give or remove the parts themselves."""
        pid = "genitals.parts"
        if pid not in self.resolved or not self.present(pid):
            return []
        words = {"vulva": "a pussy", "penis": "a penis", "testicles": "testicles", "anus": "an anus", "smooth": "a smooth, featureless crotch"}
        ids = as_list(self.resolved[pid])
        labels = [words[x] for x in ids if x in words]
        if not labels:
            return []
        op = self.op(pid)
        if op == "remove":
            return [self.tpl("Remove {pos} " + join_list([re.sub(r"^(a|an) ", "", x) for x in labels]) + ".")]
        return [self.tpl(("Replace {pos} genitals with " if op == "replace" else "Give {obj} ") + join_list(labels) + ".")]

    def natural(self, part):
        out = self.sentences(part)
        if part["id"] == "genitals":
            out = self.parts_feature() + out
        if out and part["id"] in EDIT_CATS:
            self.touched.add(EDIT_CATS[part["id"]])
        elif out and part["id"] not in ("general",):
            self.touched.add("body")
        return " ".join(x for x in out if x)

    def tail(self, has_outfit, partial=False):
        """"Keep the rest unchanged", worded after what was touched (the face most carefully)."""
        if not self.touched:
            return ""
        pos, obj = self.refs()
        return edit_tail(pos, obj, self.touched, has_outfit, partial, self.subject_word)


def edit_tail(pos, obj, touched, has_outfit=False, partial=False, subject_word="", drop=()):
    """The "keep everything else unchanged" sentences of an Edit text. `touched`: what the instructions change
    (ident, face, body, hair, skin). `drop`: things that are not in the list because another node changes them
    ("pose", "the camera angle", "the background")."""
    lines = []
    if subject_word:
        lines.append(f"Edit only {subject_word}.")
    if "ident" in touched:
        lines.append(f"Keep {pos} overall likeness where possible.")
    elif "face" in touched:
        lines.append(f"Keep {obj} clearly recognizable as the same person; change only the described features of {pos} face.")
    else:
        lines.append(f"Keep {pos} face and identity exactly the same.")
    rest = [f"{pos} {w}" for w, cat in (("body", "body"), ("hair", "hair"), ("skin", "skin")) if cat not in touched]
    if "pose" not in drop:
        rest.append(f"{pos} pose")
    if not has_outfit:
        rest.append(f"{pos} clothing")
    elif partial:
        rest.append(f"the rest of {pos} clothing")
    rest += [x for x in ("the background", "the lighting", "the camera angle") if x not in drop]
    lines.append(f"Keep everything else unchanged: {join_list(rest)}.")
    if subject_word:
        lines.append("Keep the other people in the picture unchanged.")
    return " ".join(lines)


PRON_TOKENS = {
    "she": {"Pron": "She", "pron": "she", "Pos": "Her", "pos": "her", "obj": "her", "is": "is", "chest": "breasts"},
    "he": {"Pron": "He", "pron": "he", "Pos": "His", "pos": "his", "obj": "him", "is": "is", "chest": "chest"},
    "they": {"Pron": "They", "pron": "they", "Pos": "Their", "pos": "their", "obj": "them", "is": "are", "chest": "chest"},
}


def fill_pron(text, pron):
    """Pronoun tokens ({Pron} {pron} {Pos} {pos} {obj} {is} {chest}) of an outfit text for she / he / they."""
    for k, v in PRON_TOKENS.get(pron, PRON_TOKENS["they"]).items():
        text = text.replace("{" + k + "}", v)
    return text


def unique(tags):
    seen, out = set(), []
    for t in tags:
        if t not in seen:
            seen.add(t)
            out.append(t)
    return out


def compose(natural, tags, state):
    out = []
    if state["natural"] and natural:
        out.append(natural)
    tags = unique(tags)
    if state["tags"] and tags:
        out.append(", ".join(tags))
    return "\n".join(out)


def paragraphs(*texts):
    return "\n\n".join(t.strip() for t in texts if t and t.strip())


def build_texts(schema, resolved, state, outfit_text="", covers=(), partial=False, meta=None):
    """{output key: text} in the order of schema.outputs; the description joins every part,
    then the outfit and the extra prompt, each as its own paragraph."""
    if state.get("mode") == "edit":
        return build_edit_texts(schema, resolved, state, outfit_text, covers, partial, meta)
    t = Text(schema, resolved, state, covers)
    per_part = {}
    for part in schema.parts:
        per_part[part["id"]] = (t.natural(part), t.tags(part))
    out = {}
    used = [o["part"] for o in schema.outputs if o.get("part") in per_part]
    for o in schema.outputs:
        part = o.get("part")
        if o.get("negative"):
            out[o["key"]] = ", ".join(unique(t.negative()))
        elif part is None:
            nat = " ".join(per_part[p][0] for p in used if per_part[p][0])
            tags = [x for p in used for x in per_part[p][1]]
            if meta is not None:
                meta.update(body=compose(nat, tags, state), outfit=outfit_text, extra=state.get("extra", ""), mode="create")
            out[o["key"]] = paragraphs(compose(nat, tags, state), outfit_text, state.get("extra", ""))
        elif part in per_part:
            out[o["key"]] = compose(per_part[part][0], per_part[part][1], state)
        else:
            out[o["key"]] = ""
    return out


def build_edit_texts(schema, resolved, state, outfit_text, covers, partial=False, meta=None):
    """Edit mode: the description is the instructions, then the outfit, the "keep the rest" sentence, the extra prompt."""
    t = EditText(schema, resolved, state, covers)
    per_part = {part["id"]: t.natural(part) for part in schema.parts}
    tail = t.tail(bool(outfit_text), partial) if state.get("edit_keep", True) else ""
    out = {}
    used = [o["part"] for o in schema.outputs if o.get("part") in per_part]
    for o in schema.outputs:
        part = o.get("part")
        if o.get("negative"):
            out[o["key"]] = ""
        elif part is None:
            nat = " ".join(per_part[p] for p in used if per_part[p])
            if meta is not None:
                pos, obj = t.refs()
                meta.update(body=nat, outfit=outfit_text, extra=state.get("extra", ""), mode="edit", pos=pos, obj=obj,
                            touched=sorted(t.touched), has_outfit=bool(outfit_text), partial=bool(partial),
                            subject_word=t.subject_word, keep=bool(state.get("edit_keep", True)))
            out[o["key"]] = paragraphs(nat, outfit_text, tail, state.get("extra", ""))
        else:
            out[o["key"]] = per_part.get(part, "")
    return out


# ---------------------------------------------------------------------- node


def anatomy_of(resolved, genitals_on):
    """What the character has, for the nodes that build on it: vulva, penis, testicles, anus, breasts."""
    sex = resolved.get(SEX)
    parts = as_list(resolved.get("genitals.parts")) if genitals_on else []
    if not parts:
        parts = ["vulva", "anus"] if sex == "female" else ["penis", "testicles", "anus"] if sex == "male" else []
    out = [x for x in parts if x in ("vulva", "penis", "testicles", "anus")]
    if sex == "female":
        out.append("breasts")
    return out


class NDCharacterBuilder:
    CATEGORY = "Neural Dreamer/Prompt"
    DESCRIPTION = (
        "Builds a character description: pick a body section on the left and set its "
        "parameters. Any parameter can be random (picked with the seed). Input: an optional "
        "parameters wire with 'seed' (without it the seed is 0). The output bundle holds the "
        "full description and one text per part; open it with Unpack Parameters. Presets keep "
        "every setting of the node."
    )
    RETURN_TYPES = (PARAMS,)
    RETURN_NAMES = ("params",)
    FUNCTION = "build"
    SEARCH_ALIASES = ["character builder", "character", "appearance", "prompt builder", "character description"]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "state": ("STRING", {"default": json.dumps(DEFAULT_STATE)}),
            },
            "optional": {"params": (PARAMS,)},
        }

    def build(self, state, params=None):
        # the seed comes only on the parameters wire (Pack Parameters: "seed"); without it, 0
        seed = 0
        if isinstance(params, dict) and params.get("seed") is not None:
            try:
                seed = int(params["seed"]) % (MAX_SEED + 1)
            except (TypeError, ValueError):
                log.warning("[Neural Dreamer] Character Builder: seed on the input is not a number: %r", params["seed"])
        schema = load_schema()
        st = parse_state(state)
        if not st["enabled"]:
            st = blank_state(st, DEFAULT_STATE)
        outfit = read_outfit_data(params)
        covers = outfit.get("covers", [])
        resolved, picked = resolve(schema, st, int(seed), covers)
        sex_opt = schema.params[SEX]["opt"].get(resolved.get(SEX)) if SEX in schema.params else None
        outfit_text, partial = outfit_paragraph(outfit, st, (sex_opt or {}).get("pron", "they"))
        meta = {}
        texts = build_texts(schema, resolved, st, outfit_text, covers, partial, meta)
        bundle = NDParams(texts)
        pron = (sex_opt or {}).get("pron", "they")
        bundle["appearance"] = NDParams({
            "description": texts.get("Description", ""),
            "sex": resolved.get(SEX) or "",
            "values": {k: (list(v) if isinstance(v, (list, tuple)) else v) for k, v in resolved.items()},
            "covers": covers,
            # for the Pose Builder: the character in pieces, so that it can add its own paragraph and one common tail
            "version": 2,
            "mode": st["mode"],
            "pron": pron,
            "anatomy": anatomy_of(resolved, st.get("genitals")),
            "body": meta.get("body", ""),
            "outfit": meta.get("outfit", ""),
            "extra": meta.get("extra", ""),
            "tail": {k: meta[k] for k in ("pos", "obj", "touched", "has_outfit", "partial", "subject_word", "keep") if k in meta},
        })
        return {"ui": {"nd_character": [{"seed": int(seed), "picked": picked}]}, "result": (bundle,)}


NODE_CLASS_MAPPINGS = {"NDCharacterBuilder": NDCharacterBuilder}
NODE_DISPLAY_NAME_MAPPINGS = {"NDCharacterBuilder": "ND Character Builder"}
