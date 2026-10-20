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

Parts, options and the words they turn into are data, in js/character_builder.json
(the same file the browser reads). It is reloaded when it changes on disk, so the
wording can be tuned without restarting ComfyUI.

The output is one ND_PARAMS bundle: the full description plus one text per part.
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
MAX_SEED = 0xFFFFFFFFFFFFFFFF
DEFAULT_STATE = {"formats": {"natural": True, "tags": False}, "avoid_conflicts": True, "genitals": False, "values": {}, "pools": {}}
GENITALS = "genitals"


# ---------------------------------------------------------------------- data


class Schema:
    """Parts, parameters and options from character_builder.json, indexed by full id ("face.eye_size")."""

    def __init__(self, data):
        sets = data.get("option_sets") or {}
        self.outputs = list(data.get("outputs") or [])
        self.conflicts = list(data.get("conflicts") or [])
        self.parts = []
        self.params = {}
        for part in data.get("parts") or []:
            pids = []
            for p in part.get("params") or []:
                pid = f"{part['id']}.{p['id']}"
                q = dict(p, pid=pid, part=part["id"])
                if q.get("type") != "number":
                    opts = q.get("options")
                    if opts is None:
                        opts = sets.get(q.get("set"), [])
                    q["options"] = list(opts)
                    q["opt"] = {o["id"]: o for o in q["options"]}
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


_cache = {"mtime": None, "schema": None}


def load_schema(path=DATA_PATH):
    """The parsed data file; reloaded when the file changes. A broken edit keeps the last good version."""
    try:
        mtime = os.path.getmtime(path)
    except OSError as e:
        if _cache["schema"]:
            return _cache["schema"]
        raise RuntimeError(f"Character Builder: data file not found: {path}") from e
    if _cache["schema"] is None or mtime != _cache["mtime"]:
        try:
            with open(path, "r", encoding="utf-8") as f:
                _cache["schema"] = Schema(json.load(f))
            _cache["mtime"] = mtime
        except (OSError, ValueError, KeyError, TypeError) as e:
            if _cache["schema"] is None:
                raise RuntimeError(f"Character Builder: cannot read {path}: {e}") from e
            log.warning("[Neural Dreamer] Character Builder: %s is broken (%s), using the previous version", path, e)
            _cache["mtime"] = mtime
    return _cache["schema"]


# --------------------------------------------------------------------- state


# Penis shape was one parameter; now curve, girth and veins are set apart.
SPLIT_PARAMS = {
    "genitals.penis_shape": {
        "straight": "genitals.penis_curve", "curved_up": "genitals.penis_curve", "curved_down": "genitals.penis_curve",
        "tapered": "genitals.penis_girth", "thick": "genitals.penis_girth", "veiny": "genitals.penis_veins",
    },
}


def migrate_values(values, pools):
    """Values saved under parameters that were split later go to the new parameters."""
    for old, where in SPLIT_PARAMS.items():
        v = values.pop(old, None)
        pools.pop(old, None)
        if v in where:
            values.setdefault(where[v], v)
        elif v == RANDOM:
            for new in set(where.values()):
                values.setdefault(new, RANDOM)


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
    return {
        "natural": natural,
        "tags": tags,
        "avoid_conflicts": bool(data.get("avoid_conflicts", True)),
        "all_random": bool(data.get("all_random", False)),
        "genitals": genitals,
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


def valid_value(p, v):
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


def _pick_set(p, state, seed, pid, resolved):
    """Random for a multi parameter with random_sets: one whole combination (e.g. vulva + anus)."""
    pool = state["pools"].get(pid)
    allowed_ids = set(candidates(p, pool))
    sex = resolved.get(SEX)
    sets = [r for r in p["random_sets"] if all(x in allowed_ids for x in r.get("v", []))]
    fit = [r for r in sets if not sex or not r.get("only") or sex in r["only"]]
    sets = fit or sets
    if not sets:
        return None
    rng = random.Random(seed_for(seed, pid))
    r = rng.choices(sets, weights=[max(0.0, float(x.get("weight", 1))) for x in sets])[0]
    return list(r["v"])


def _pick(schema, state, seed, pid, resolved):
    p = schema.params[pid]
    if p.get("multi") and p.get("random_sets"):
        return _pick_set(p, state, seed, pid, resolved)
    cands = candidates(p, state["pools"].get(pid))
    sex = resolved.get(SEX)
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
        if not p or p.get("type") == "number":
            continue
        for one in as_list(v):
            for x in (p["opt"].get(one) or {}).get("mutes", []):
                out.add(f"{p['part']}.{x}")
    return out


def resolve(schema, state, seed):
    """Returns (resolved, picked): every value that goes into the text, and the random picks alone."""
    fixed, randoms = {}, []
    for pid, p in schema.params.items():
        if p["part"] == GENITALS and not state.get("genitals"):
            continue  # the Genitals section is switched off: none of it is used
        # "All random": every parameter is random; the values set by hand are ignored
        v = RANDOM if state.get("all_random") else state["values"].get(pid)
        if v is None:
            continue
        if v == RANDOM:
            randoms.append(pid)
            continue
        v = valid_value(p, v)
        if v is not None:
            fixed[pid] = v
    resolved, picked = {}, {}
    # sex first: it decides which parameters apply, and the other picks respect it
    if SEX in fixed:
        resolved[SEX] = fixed[SEX]
    elif SEX in randoms and SEX in schema.params:
        v = _pick(schema, state, seed, SEX, resolved)
        if v is not None:
            resolved[SEX] = picked[SEX] = v
    sex = resolved.get(SEX)
    for pid, v in fixed.items():
        if pid != SEX and suits(schema.params[pid], sex):
            resolved[pid] = v
    # the rest in the schema order
    for pid in randoms:
        if pid == SEX or not suits(schema.params[pid], sex):
            continue
        v = _pick(schema, state, seed, pid, resolved)
        if v is not None:
            picked[pid] = v
            resolved[pid] = as_list(v) if schema.params[pid].get("multi") else v
    # "requires": e.g. penis size is used only when the parts include a penis
    for pid in list(resolved):
        need = schema.params[pid].get("requires")
        if need and not any(x in (need.get("in") or []) for x in as_list(resolved.get(need.get("p")))):
            resolved.pop(pid, None)
            picked.pop(pid, None)
    for pid in muted(schema, resolved):
        resolved.pop(pid, None)
        picked.pop(pid, None)
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


class Text:
    def __init__(self, schema, resolved):
        self.schema = schema
        self.resolved = resolved

    def options(self, pid):
        """Every chosen option of a parameter (several for a "multi" parameter)."""
        p = self.schema.params.get(pid)
        v = self.resolved.get(pid)
        if p is None or v is None or p.get("type") == "number":
            return []
        return [p["opt"][x] for x in as_list(v) if x in p["opt"]]

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
            for o in self.options(pid):
                t = o.get("tag", "").replace("{n}", p.get("n", "")).replace("{m}", p.get("m", ""))
                t = SEX_TAG.sub(pick, t)
                if not t.strip():
                    t = SEX_TAG.sub(pick, self.plain_tag(p, o))
                out += [x.strip() for x in t.split(",")]
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
        skin = [o["adj"] for o in (self.option("general.skin_tone"), self.option("general.skin_texture")) if o and o.get("adj")]
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
        trait = self.by_sex(race.get("trait", "")).strip()
        if trait:
            extra.append(trait)
        if skin:
            extra.append(", ".join(skin) + " skin")
        if extra:
            # "wings and a tail, and fair skin": the comma keeps the two lists apart
            s += " with " + (", and ".join(extra) if " and " in extra[0] and len(extra) > 1 else join_list(extra))
        return _cap(s) + "."

    def traits(self, races):
        """Features of several races in one list without repeats: "long pointed ears, fox ears and a tail"."""
        items = []
        for o in races:
            for x in re.split(r",\s*(?:and\s+)?|\s+and\s+", self.by_sex(o.get("trait", ""))):
                x = x.strip()
                if x and x not in items:
                    items.append(x)
        return items

    def mixed_subject(self, sex, age, app, races):
        """Several races mixed: "A 24-year-old woman of mixed elf and fox-folk blood, with ..."."""
        skin = [o["adj"] for o in (self.option("general.skin_tone"), self.option("general.skin_texture")) if o and o.get("adj")]
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
        post = [self.option(f"{part_id}.{x}") for x in g.get("post", [])]
        pre = [(p, o) for p, o in pre if o]
        post = [o for o in post if o and o.get("post")]
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
        adjs = [o["adj"] for _, o in pre if o.get("adj")]
        if g.get("kind") == "is":
            return " ".join(adjs) or None
        noun = g.get("noun") or (pre[0][0].get("n", "") if pre else "")
        words = " ".join(adjs + [noun]).strip()
        if g.get("article") and words:
            words = with_article(words)
        # posts starting with a comma follow without a space: "a penis, uncircumcised, fully erect"
        return " ".join([words] + [o["post"] for o in post]).replace(" ,", ",").strip() or None

    def combos(self, part):
        """Combinations of a multi parameter, e.g. vulva + penis on a woman: futanari."""
        out = []
        sex = self.resolved.get(SEX)
        for pid in part["pids"]:
            p = self.schema.params[pid]
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


def build_texts(schema, resolved, state):
    """{output key: text} in the order of schema.outputs; the description joins every part."""
    t = Text(schema, resolved)
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
            out[o["key"]] = compose(nat, tags, state)
        elif part in per_part:
            out[o["key"]] = compose(per_part[part][0], per_part[part][1], state)
        else:
            out[o["key"]] = ""
    return out


# ---------------------------------------------------------------------- node


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
        resolved, picked = resolve(schema, st, int(seed))
        bundle = NDParams(build_texts(schema, resolved, st))
        return {"ui": {"nd_character": [{"seed": int(seed), "picked": picked}]}, "result": (bundle,)}


NODE_CLASS_MAPPINGS = {"NDCharacterBuilder": NDCharacterBuilder}
NODE_DISPLAY_NAME_MAPPINGS = {"NDCharacterBuilder": "ND Character Builder"}
