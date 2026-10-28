"""
Neural Dreamer Nodes — Composition Settings

The camera, the lens and where the subject sits in the frame, on the same engine as the Character Builder, the Outfit
Builder and the Pose Builder (the data is js/composition_settings.json, the state is one JSON string, the hidden `state`
widget, random picks come from the seed).

    {"kind": "single" | "collage", "mode": "create" | "edit", "explicit": false, "use_pose_camera": true,
     "values": {"camera.height": "low", "camera.orbit": "front34_l", "framing.shot": "waist", ...}, "levels": {...},
     "layout": {"aspect": "3:2", "width": 1536, "height": 1024, "grid": 6, "snap": true, "captions": true, "percent": false},
     "panels": [{"id": "p1", "rect": [0, 0, 0.5, 1], "pose": 1, "caption": "", "z": 0, "values": {...}, "levels": {...}}]}

In a collage every panel has its own camera (its own values); the sheet (kind of sheet, background, borders) and the
Explicit switch are shared. `rect` is [x, y, w, h] in fractions of the canvas, so changing the resolution does not move anything.

Input (ND_PARAMS, Pack Parameters): "seed", "pose", "pose_2" ... "pose_8" (the Pose Builder Out of Pose Builders: the pose
without how the body faces the camera, what that turn is, what the ready-made pose suggests for the camera, who is posed, the
pieces of the character) and "resolution" (an ND Resolution output: width and height). Without a pose only the camera is described.

Output fields:
    Camera        the camera (single shot) or the layout and the camera of every panel (collage), without the poses
    Full          the whole picture: the character, the outfit, the pose and the camera (a collage: every panel with its pose)
    composition   COMPOSITION_PARAMS for nodes that build on it: version, kind, width, height, panels (rect, caption, texts), text, tags, edit
"""

import json
import logging
import math
import os
import re

from .params import PARAMS, NDParams
from .character_builder import (
    MAX_SEED, PRON_TOKENS, RANDOM, as_list, blank_state, compose, edit_tail, fill_pron, join_list, load_schema, muted, paragraphs,
    parse_state, resolve, seed_for, unique, with_article,
)

log = logging.getLogger("NeuralDreamer")

COMP_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "js", "composition_settings.json")
MAX_PANELS = 8
POSE_FIELDS = ["pose"] + [f"pose_{i}" for i in range(2, MAX_PANELS + 1)]
FACING = "pose.facing"
ORBIT = "camera.orbit"
# what a ready-made pose suggests for the camera -> the parameter
HINT_PIDS = {"height": "camera.height", "orbit": ORBIT, "framing": "framing.shot", "special": "viewpoint.special"}
# the parameters "All random" makes random (not the sheet, not the pose link)
NOT_RANDOM_PARTS = ("sheet", "pose", "preset")
NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight"]
DEFAULT_LAYOUT = {"aspect": "1:1", "width": 0, "height": 0, "grid": 6, "snap": True, "captions": True, "percent": False}
SEX_WORD = {"female": "woman", "male": "man", "futa": "woman"}

DEFAULT_STATE = {
    "kind": "single", "mode": "create", "formats": {"natural": True, "tags": False}, "explicit": False, "extra": "", "use_pose_camera": True,
    "edit_keep": True, "values": {}, "levels": {}, "layout": dict(DEFAULT_LAYOUT), "panels": [], "active": "",
}


# ---------------------------------------------------------------------- state


def _num(v, lo, hi, default):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return default
    return default if not math.isfinite(v) else max(lo, min(hi, v))


def clean_rect(r):
    """[x, y, w, h] in fractions of the canvas, inside it, at least 5 % each way."""
    if not isinstance(r, (list, tuple)) or len(r) != 4:
        return [0.0, 0.0, 1.0, 1.0]
    x, y, w, h = (_num(v, 0.0, 1.0, 0.0) for v in r)
    w, h = max(w, 0.05), max(h, 0.05)
    x, y = min(x, 1.0 - w), min(y, 1.0 - h)
    return [round(x, 4), round(y, 4), round(w, 4), round(h, 4)]


def _dict_of(v, kind=None):
    if not isinstance(v, dict):
        return {}
    return {k: x for k, x in v.items() if isinstance(k, str) and (kind is None or isinstance(x, kind))}


def parse_comp(text):
    """The state of the node: the shared fields of the builders plus the camera parts of this one."""
    try:
        raw = json.loads(text or "")
    except (TypeError, ValueError):
        raw = {}
    if not isinstance(raw, dict):
        raw = {}
    st = parse_state(json.dumps(raw))
    st["kind"] = "collage" if raw.get("kind") == "collage" else "single"
    st["use_pose_camera"] = bool(raw.get("use_pose_camera", True))
    lay = raw.get("layout") if isinstance(raw.get("layout"), dict) else {}
    st["layout"] = {
        "aspect": str(lay.get("aspect") or DEFAULT_LAYOUT["aspect"])[:12],
        "width": int(_num(lay.get("width"), 0, 16384, 0)),
        "height": int(_num(lay.get("height"), 0, 16384, 0)),
        "grid": int(_num(lay.get("grid"), 2, 24, DEFAULT_LAYOUT["grid"])),
        "snap": bool(lay.get("snap", True)),
        "captions": bool(lay.get("captions", True)),
        "percent": bool(lay.get("percent", False)),
    }
    panels = []
    for i, p in enumerate((raw.get("panels") if isinstance(raw.get("panels"), list) else [])[:MAX_PANELS]):
        if not isinstance(p, dict):
            continue
        pid = re.sub(r"[^A-Za-z0-9_-]", "", str(p.get("id") or f"p{i + 1}"))[:12] or f"p{i + 1}"
        if any(x["id"] == pid for x in panels):
            pid = f"p{i + 1}_{len(panels)}"
        panels.append({
            "id": pid,
            "rect": clean_rect(p.get("rect")),
            "pose": int(_num(p.get("pose"), 1, MAX_PANELS, 1)),
            "caption": re.sub(r"\s+", " ", str(p.get("caption") or "")).strip()[:40],
            "z": int(_num(p.get("z"), -100, 100, i)),
            "values": _dict_of(p.get("values")),
            "pools": _dict_of(p.get("pools")),
            "levels": {k: _dict_of(v, str) for k, v in _dict_of(p.get("levels"), dict).items()},
        })
    st["panels"] = panels
    return st


def reading_order(rects):
    """Indexes of the rects in reading order: top to bottom in rows, left to right inside a row.
    A new row starts when a rect's top is more than 0.1 below the top of the first rect of the row."""
    idx = sorted(range(len(rects)), key=lambda i: (rects[i][1], rects[i][0], i))
    rows, cur, top = [], [], None
    for i in idx:
        if top is None or rects[i][1] > top + 0.1:
            if cur:
                rows.append(cur)
            cur, top = [], rects[i][1]
        cur.append(i)
    if cur:
        rows.append(cur)
    return [i for row in rows for i in sorted(row, key=lambda j: (rects[j][0], j))]


# ---------------------------------------------------------------------- poses and resolution


def read_pose(x):
    """The POSE_PARAMS of a Pose Builder (its whole output bundle or the pose field of it); None when there is none."""
    for _ in range(4):
        if not isinstance(x, dict):
            return None
        if "text" in x and "template" in x:
            return x
        x = x.get("pose")
    return None


def read_poses(bundle):
    """[POSE_PARAMS or None] for pose, pose_2 ... pose_8 up to the last one connected."""
    out = [read_pose(bundle.get(k)) if isinstance(bundle, dict) else None for k in POSE_FIELDS]
    while out and out[-1] is None:
        out.pop()
    return out


def read_size(bundle):
    """(width, height) of the "resolution" field (an ND Resolution output); (0, 0) when there is none."""
    r = bundle.get("resolution") if isinstance(bundle, dict) else None
    for _ in range(3):
        if isinstance(r, dict) and "width" not in r and isinstance(r.get("resolution"), dict):
            r = r["resolution"]
    if isinstance(r, dict):
        try:
            w, h = int(r.get("width")), int(r.get("height"))
            if 0 < w <= 65536 and 0 < h <= 65536:
                return w, h
        except (TypeError, ValueError):
            pass
    return 0, 0


def fill_subject(text, pron):
    """Pronoun tokens for she / he / they, or "the subject" when there is no pose to say who is shown."""
    if pron in PRON_TOKENS:
        return fill_pron(text, pron)
    for k, v in (("{Pron}", "The subject"), ("{pron}", "the subject"), ("{Pos}", "The subject's"), ("{pos}", "the subject's"),
                 ("{obj}", "the subject"), ("{is}", "is"), ("{chest}", "chest")):
        text = text.replace(k, v)
    return text


# ---------------------------------------------------------------------- one camera


def allowed_orbits(schema, facing):
    """The views that go with the way the body faces the camera, in the order of the data; [] when the pose says nothing."""
    if not facing:
        return []
    return [o["id"] for o in schema.params[ORBIT]["options"] if facing in (o.get("facing_fits") or [])]


def nearest_orbit(schema, cur, allowed):
    """The allowed view closest (round the subject) to `cur`."""
    opts = schema.params[ORBIT]["opt"]
    d0 = opts[cur].get("deg", 0) if cur in opts else 0
    def dist(x):
        d = abs(opts[x].get("deg", 0) - d0) % 360
        return min(d, 360 - d)
    return min(allowed, key=lambda x: (dist(x), allowed.index(x)))


class Shot:
    """The camera of one picture (a single shot or one panel of a collage): the resolved values and their words."""

    def __init__(self, schema, resolved, levels, pron, auto=(), panel=False):
        self.schema, self.r, self.levels, self.pron, self.auto, self.panel = schema, resolved, levels or {}, pron, set(auto), panel

    def say(self, text):
        text = fill_subject(text, self.pron)
        return text.replace("the frame", "the panel") if self.panel else text

    def option(self, pid):
        v = self.r.get(pid)
        if v is None or isinstance(v, list):
            return None
        return self.schema.params[pid]["opt"].get(v)

    def options(self, pid):
        return [self.schema.params[pid]["opt"][x] for x in as_list(self.r.get(pid)) if x in self.schema.params[pid]["opt"]]

    def level(self, pid, o):
        levels = o.get("levels") or []
        want = (self.levels.get(pid) or {}).get(o["id"])
        return next((x for x in levels if x["id"] == want), None) or next((x for x in levels if x["id"] == o.get("default_level")), levels[0] if levels else None)

    def offset(self):
        x, y = self.r.get("placement.offset_x"), self.r.get("placement.offset_y")
        return (x if isinstance(x, int) else None), (y if isinstance(y, int) else None)

    # -- Create
    def shot_sentence(self):
        shot = self.option("framing.shot")
        rest = []
        for pid in ("viewpoint.special", "camera.height"):
            o = self.option(pid)
            if o:
                rest.append(o["text"])
        orbit = self.option(ORBIT)
        if orbit and ORBIT not in self.auto:
            rest.append(orbit["text"])
        o = self.option("camera.distance")
        if o:
            rest.append(o["text"])
        roll = self.option("camera.roll")
        if roll:
            lv = self.level("camera.roll", roll)
            if lv:
                rest.append(lv["text"])
        if not shot and not rest:
            return ""
        head = with_article(shot["text"]) if shot else "Shot"
        s = head + (" " + ", ".join(rest) if rest else "")
        return self.say(s[:1].upper() + s[1:] + ".")

    def focus_sentence(self):
        items = [self.say(o["text"]) for o in self.options("framing.focus")]
        return f"The shot emphasizes {join_list(items)}." if items else ""

    def placement_sentence(self):
        pos, size, rule = self.option("placement.pos"), self.option("placement.size"), self.option("placement.rule")
        ox, oy = self.offset()
        bits = []
        if ox is not None or oy is not None:
            if ox is not None:
                bits.append(f"about {50 + ox}% from the left edge")
            if oy is not None:
                bits.append(f"{50 + oy}% from the top")
            bits = ["positioned " + " and ".join(bits) + " of the frame"]
        elif pos:
            bits.append(pos["text"])
        if size:
            bits.append(size["text"])
        if rule:
            bits.append(rule["text"])
        if not bits:
            return ""
        s = "{Pron} {is} " + ", ".join(bits) + "."
        return self.say(s)

    def lens_sentence(self):
        items = []
        focal, cam = self.option("lens.focal"), self.option("lens.camera")
        if focal:
            t = focal["text"]
            if cam and cam["text"].startswith("shot on "):
                t += " " + cam["text"][5:]
                cam = None
            items.append(t)
        if cam:
            items.append(cam["text"])
        for pid in ("lens.dof", "lens.focus"):
            o = self.option(pid)
            if o:
                items.append(o["text"])
        items += [o["text"] for o in self.options("lens.effects")]
        o = self.option("lens.exposure")
        if o:
            items.append(o["text"])
        if not items:
            return ""
        s = ", ".join(items)
        if not items[0].startswith(("shot", "as ", "with ", "in ", "evenly", "backlit", "focused")):
            s = "Shot " + s
        return self.say(s[:1].upper() + s[1:] + ".")

    def sentences(self):
        return [s for s in (self.shot_sentence(), self.focus_sentence(), self.placement_sentence(), self.lens_sentence()) if s]

    def tags(self):
        out = []
        for pid in (ORBIT, "camera.height", "viewpoint.special"):
            o = self.option(pid)
            out.append(o.get("tag", "") if o else "")
        roll = self.option("camera.roll")
        if roll:
            lv = self.level("camera.roll", roll)
            out.append(lv.get("tag", "") if lv else "")
        for pid in ("camera.distance", "framing.shot"):
            o = self.option(pid)
            out.append(o.get("tag", "") if o else "")
        out += [o.get("tag", "") for o in self.options("framing.focus")]
        out += [self.option(pid).get("tag", "") if self.option(pid) else "" for pid in ("placement.pos", "placement.size", "placement.rule", "lens.focal", "lens.dof", "lens.focus", "lens.camera")]
        out += [o.get("tag", "") for o in self.options("lens.effects")]
        o = self.option("lens.exposure")
        out.append(o.get("tag", "") if o else "")
        return unique([t.strip() for x in out for t in x.split(",") if t.strip()])

    # -- Edit
    def edit_lines(self):
        out = []
        for pid in ("viewpoint.special", "camera.height", ORBIT, "camera.distance"):
            o = self.option(pid)
            if o and o.get("edit") and not (pid == ORBIT and ORBIT in self.auto):
                out.append(o["edit"])
        roll = self.option("camera.roll")
        if roll:
            lv = self.level("camera.roll", roll)
            if lv:
                out.append(lv["edit"])
        for pid in ("framing.shot",):
            o = self.option(pid)
            if o:
                out.append(o["edit"])
        out += [o["edit"] for o in self.options("framing.focus")]
        ox, oy = self.offset()
        if ox is not None or oy is not None:
            bits = ([f"{50 + ox}% from the left edge"] if ox is not None else []) + ([f"{50 + oy}% from the top"] if oy is not None else [])
            out.append("Move {obj} to about " + " and ".join(bits) + " of the frame.")
        else:
            o = self.option("placement.pos")
            if o:
                out.append(o["edit"])
        for pid in ("placement.size", "placement.rule", "lens.focal", "lens.camera", "lens.dof", "lens.focus"):
            o = self.option(pid)
            if o:
                out.append(o["edit"])
        out += [o["edit"] for o in self.options("lens.effects")]
        o = self.option("lens.exposure")
        if o:
            out.append(o["edit"])
        return unique([self.say(x) for x in out if x])

    def caption(self):
        def cap(pid):
            o = self.option(pid)
            return o.get("cap", "") if o else ""
        first = cap(ORBIT) or cap("viewpoint.special") or cap("camera.height")
        shot = cap("framing.shot")
        parts = [first] if first else []
        if shot and (not first or self.r.get("framing.shot") != "full"):
            parts.append(shot)
        return " / ".join(parts)

    def empty(self):
        return not any(self.r.get(p) for p in self.schema.params if p.split(".")[0] not in ("sheet", "pose", "preset"))


def resolve_shot(schema, st, values, levels, pools, seed, facing=None, hint=None, use_hint=True):
    """(resolved values, picks, auto) for one camera: the values of the panel, the pose lock, the camera the pose suggests.
    `auto`: the parameters that were set by the pose (a lone fitting view)."""
    values = dict(values)
    if st.get("all_random"):
        values = {pid: RANDOM for pid in schema.params if pid.split(".")[0] not in NOT_RANDOM_PARTS}
        pools = {}
    if facing:
        values[FACING] = facing
    sub = {"values": values, "pools": dict(pools or {}), "levels": {k: dict(v) for k, v in (levels or {}).items()}, "explicit": st.get("explicit", False),
           "all_random": False, "genitals": False, "avoid_conflicts": True, "anatomy": None}
    resolved, picked = resolve(schema, sub, seed)
    resolved.pop(FACING, None)
    auto = set()
    # what the ready-made pose suggests, for what nothing else decided
    if use_hint and hint:
        for axis, pid in HINT_PIDS.items():
            v = hint.get(axis)
            if v and pid not in resolved and pid in schema.params and v in schema.params[pid]["opt"]:
                if st.get("explicit") or not schema.params[pid]["opt"][v].get("explicit"):
                    if pid not in muted(schema, {**resolved, pid: v}):
                        resolved[pid] = v
    # the lock: the view must go with the way the body faces the camera
    ok = allowed_orbits(schema, facing)
    if ok and ORBIT not in muted(schema, resolved):
        cur = resolved.get(ORBIT)
        if cur not in ok:
            if cur:
                log.info("[Neural Dreamer] Composition Settings: the view %r does not go with a pose that faces %r, using %r", cur, facing, nearest_orbit(schema, cur, ok))
                resolved[ORBIT] = nearest_orbit(schema, cur, ok)
            elif len(ok) == 1:
                resolved[ORBIT] = ok[0]
                auto.add(ORBIT)
    return resolved, picked, auto, sub["levels"]


# ---------------------------------------------------------------------- places on the canvas


def place_words(rect, percent=False):
    x, y, w, h = rect
    cx, cy = x + w / 2, y + h / 2
    full_w, full_h = w >= 0.94, h >= 0.94
    near = lambda a, b, t=0.07: abs(a - b) <= t  # noqa: E731
    col = "left" if cx < 0.34 else "right" if cx > 0.66 else "center"
    row = "top" if cy < 0.34 else "bottom" if cy > 0.66 else "middle"
    if full_w and full_h:
        s = "the whole image"
    elif full_h and near(w, 0.5):
        s = f"the {col} half"
    elif full_w and near(h, 0.5):
        s = f"the {row} half"
    elif full_h and near(w, 1 / 3):
        s = {"left": "the left third", "center": "the middle third", "right": "the right third"}[col]
    elif full_w and near(h, 1 / 3):
        s = {"top": "the top third", "middle": "the middle third", "bottom": "the bottom third"}[row]
    elif near(w, 0.5) and near(h, 0.5) and col != "center" and row != "middle":
        s = f"the {row}-{col} quarter"
    else:
        where = {("left", "top"): "top-left", ("center", "top"): "top", ("right", "top"): "top-right", ("left", "middle"): "left",
                 ("center", "middle"): "center", ("right", "middle"): "right", ("left", "bottom"): "bottom-left",
                 ("center", "bottom"): "bottom", ("right", "bottom"): "bottom-right"}[(col, row)]
        area = w * h
        corner = "-" in where
        if area < 0.1 and corner:
            s = f"a small inset in the {where} corner"
        else:
            size = "large" if area >= 0.4 else "medium" if area >= 0.15 else "small"
            s = f"a {size} panel " + ("in the center" if where == "center" else f"at the {where}")
        if full_h:
            s += ", full height"
        elif full_w:
            s += ", full width"
    if percent:
        s += f" (x {round(x * 100)}-{round((x + w) * 100)} %, y {round(y * 100)}-{round((y + h) * 100)} %)"
    return s


def overlap_of(a, b):
    """The share of rect `a` that rect `b` covers."""
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    ix, iy = max(0.0, min(ax + aw, bx + bw) - max(ax, bx)), max(0.0, min(ay + ah, by + bh) - max(ay, by))
    return (ix * iy) / (aw * ah) if aw * ah else 0.0


# ---------------------------------------------------------------------- the texts


def orient_of(w, h):
    return "landscape" if w > h * 1.05 else "portrait" if h > w * 1.05 else "square"


def header_text(schema, sheet, n, w, h, captions):
    def opt(pid):
        v = sheet.get(pid)
        return schema.params[pid]["opt"].get(v) if isinstance(v, str) else None
    style, bg, borders = opt("sheet.style"), opt("sheet.background"), opt("sheet.borders")
    s = f"A {style['text'] if style else 'collage of photos'}"
    s += f" on one {orient_of(w, h)} image" + (f" ({w}x{h})" if w and h else "")
    s += f", with {NUMBER_WORDS[n] if n < len(NUMBER_WORDS) else n} panel{'s' if n != 1 else ''}"
    if borders and borders["text"]:
        s += " " + borders["text"]
    if bg and bg["text"]:
        s += ", " + bg["text"]
    if captions:
        s += "; each panel carries a small caption naming its view"
    return s + "."


def sheet_tags(schema, sheet):
    out = ["multiple views"]
    for pid in ("sheet.style", "sheet.background"):
        v = sheet.get(pid)
        o = schema.params[pid]["opt"].get(v) if isinstance(v, str) else None
        if o and o.get("tag"):
            out += [t.strip() for t in o["tag"].split(",")]
    return unique(out)


def build_single(schema, st, seed, poses, size):
    """(Camera text, Full text, composition dict, picked, facing) for one picture."""
    pose = poses[0] if poses and poses[0] else None
    facing = (pose or {}).get("facing") or None
    pron = (pose or {}).get("pron")
    resolved, picked, auto, levels = resolve_shot(schema, st, st["values"], st["levels"], st["pools"], seed, facing, (pose or {}).get("camera_hint"), st["use_pose_camera"])
    shot = Shot(schema, resolved, levels, pron, auto)
    extra = st["extra"]
    char = (pose or {}).get("char") or {}
    tags = shot.tags()
    comp = {"version": 1, "kind": "single", "width": size[0], "height": size[1], "panels": [], "tags": ", ".join(tags)}
    if st["mode"] == "edit":
        cam_lines = " ".join(shot.edit_lines())
        pose_lines = ""
        pose_touched = bool(pose and pose.get("mode") == "edit" and pose.get("touched"))
        if pose_touched:
            pose_lines = fill_pron((pose.get("edit_simple") if pose.get("edit_style") == "simple" else pose.get("edit")) or "", pron)
        tail = ""
        if st["edit_keep"] and (pose_touched or cam_lines):
            tl = char.get("tail") if isinstance(char.get("tail"), dict) else {}
            drop = set()
            if pose_touched:
                drop.add("pose")
            if cam_lines:
                drop.add("the camera angle")
            tail = fill_subject(edit_tail(tl.get("pos", "{pos}"), tl.get("obj", "{obj}"), set(tl.get("touched") or []), bool(tl.get("has_outfit")),
                                          bool(tl.get("partial")), tl.get("subject_word", ""), drop), pron)
        tail_cam = fill_subject(edit_tail("{pos}", "{obj}", set(), False, False, "", {"the camera angle"}), pron) if st["edit_keep"] and cam_lines else ""
        camera = paragraphs(cam_lines, tail_cam, extra)
        tl = char.get("tail") if isinstance(char.get("tail"), dict) else None
        if char.get("mode") == "edit" and tl:
            full = paragraphs(char.get("body", ""), char.get("outfit", ""), pose_lines, cam_lines, tail, char.get("extra", ""), extra)
        else:
            full = paragraphs(char.get("description", ""), pose_lines, cam_lines, tail, extra)
        comp["text"], comp["edit"] = camera, cam_lines
    else:
        cam = compose(" ".join(shot.sentences()), tags, st)
        camera = paragraphs(cam, extra)
        base = ""
        if pose:
            base = pose.get("full") if pose.get("mode") == "create" and pose.get("full") else paragraphs(char.get("description", ""), pose.get("pose_text", ""))
        full = paragraphs(base, cam, extra)
        comp["text"], comp["edit"] = cam, ""
    return camera, full, comp, picked, facing


def build_collage(schema, st, seed, poses, size):
    panels = st["panels"]
    lay = st["layout"]
    w, h = size if size[0] and size[1] else (lay["width"], lay["height"])
    sheet = st["values"]
    n = len(panels)
    if not n:
        return "", "", {"version": 1, "kind": "collage", "width": w, "height": h, "panels": [], "text": "", "tags": ""}, {}, {}
    rects = [p["rect"] for p in panels]
    order = reading_order(rects)  # reading order: position -> index in `panels`
    number = {i: k + 1 for k, i in enumerate(order)}
    pose_of = lambda p: (poses[p["pose"] - 1] if 0 < p["pose"] <= len(poses) else None) or (poses[0] if poses else None)  # noqa: E731
    lines, tags, picks_by, facings, out_panels = {}, [], {}, {}, []
    for i, p in enumerate(panels):
        pose = pose_of(p)
        main = i == 0
        facing = ((pose or {}).get("facing") or None) if main else None
        panel_seed = seed_for(seed, f"panel:{p['id']}")
        resolved, picked, auto, levels = resolve_shot(schema, st, p["values"], p["levels"], p["pools"], panel_seed, facing,
                                                      (pose or {}).get("camera_hint"), st["use_pose_camera"])
        shot = Shot(schema, resolved, levels, (pose or {}).get("pron"), auto, panel=True)
        picks_by[p["id"]] = picked
        facings[p["id"]] = facing
        cap = p["caption"] or shot.caption()
        # an inset: it lies over an earlier panel
        over = None
        for j, q in enumerate(panels):
            if j != i and (q["z"], j) < (p["z"], i) and overlap_of(p["rect"], q["rect"]) > 0.15:
                if over is None or overlap_of(p["rect"], q["rect"]) > overlap_of(p["rect"], panels[over]["rect"]):
                    over = j
        place = place_words(p["rect"], lay["percent"])
        if over is not None and "inset" not in place:
            place = f"a panel placed over panel {number[over]} ({place})"
        elif over is not None:
            place += f", over panel {number[over]}"
        pose_text = ""
        if pose:
            pose_text = (pose.get("text") if main or not pose.get("text_free") else pose.get("text_free")) or ""
            if st["tags"] and not st["natural"]:
                pose_text = ""
        lines[i] = {"place": place, "caption": cap if lay["captions"] else "", "cam": " ".join(shot.sentences()), "pose": pose_text, "tags": shot.tags()}
        tags += lines[i]["tags"] + [t.strip() for t in ((pose or {}).get("tags_free" if not main else "tags") or "").split(",") if t.strip()]
        out_panels.append({"id": p["id"], "n": number[i], "rect": p["rect"], "caption": cap, "pose": p["pose"], "camera_text": lines[i]["cam"], "pose_text": pose_text, "place": place})
    head = header_text(schema, sheet, n, w, h, lay["captions"])
    pose1 = pose_of(panels[0])
    who = SEX_WORD.get((pose1 or {}).get("sex"), "character")
    same = f"The same {who} appears in every panel."
    def line(i, with_pose):
        d = lines[i]
        cap = f', caption "{d["caption"]}"' if d["caption"] else ""
        body = " ".join(x for x in (d["cam"], d["pose"] if with_pose else "") if x)
        return f"Panel {number[i]}, {d['place']}{cap}: {body}".rstrip(": ").rstrip()
    ordered = [i for i in order]
    cam_text = paragraphs(head, "\n".join(line(i, False) for i in ordered))
    desc = ((pose1 or {}).get("char") or {}).get("description", "") if pose1 else ""
    nat = paragraphs(head, same, desc, "\n".join(line(i, True) for i in ordered))
    all_tags = unique(sheet_tags(schema, sheet) + tags)
    if st["natural"]:
        camera = paragraphs(cam_text, ", ".join(all_tags) if st["tags"] else "", st["extra"])
        full = paragraphs(nat, ", ".join(all_tags) if st["tags"] else "", st["extra"])
    else:
        camera = full = paragraphs(", ".join(all_tags), st["extra"])
    comp = {"version": 1, "kind": "collage", "width": w, "height": h, "panels": sorted(out_panels, key=lambda x: x["n"]), "text": cam_text, "tags": ", ".join(all_tags), "edit": ""}
    return camera, full, comp, picks_by, facings


# ---------------------------------------------------------------------- the node


class NDCompositionSettings:
    CATEGORY = "Neural Dreamer/Prompt"
    DESCRIPTION = (
        "The camera of the picture: height, the view around the subject, tilt, framing, the lens and where the subject sits in the "
        "frame. In Collage mode: up to 8 panels on one canvas, each with its own camera and pose, placed where you want them (a "
        "character sheet, a collage). Input: an optional parameters wire with 'seed', 'pose' (the Pose Builder Out of a Pose "
        "Builder; 'pose_2'... for more) and 'resolution'. Outputs: the camera text, the full description (character, outfit, pose "
        "and camera in one text) and a Composition Settings Out bundle. For fictional adult (18+) characters only."
    )
    RETURN_TYPES = (PARAMS,)
    RETURN_NAMES = ("params",)
    FUNCTION = "build"
    SEARCH_ALIASES = ["composition", "camera", "camera settings", "angle", "framing", "lens", "character sheet", "collage"]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"state": ("STRING", {"default": json.dumps(DEFAULT_STATE)})},
            "optional": {"params": (PARAMS,)},
        }

    def build(self, state, params=None):
        seed = 0
        if isinstance(params, dict) and params.get("seed") is not None:
            try:
                seed = int(params["seed"]) % (MAX_SEED + 1)
            except (TypeError, ValueError):
                log.warning("[Neural Dreamer] Composition Settings: seed on the input is not a number: %r", params["seed"])
        schema = load_schema(COMP_PATH)
        st = parse_comp(state)
        if not st["enabled"]:
            base = blank_state(st, DEFAULT_STATE, parse_comp)
            base["use_pose_camera"] = False  # a switched-off camera does not add the camera of the pose either
            st = base
        poses = read_poses(params)
        size = read_size(params)
        if st["kind"] == "collage":
            if st["mode"] == "edit":
                st["mode"] = "create"  # Edit is for a single shot
            camera, full, comp, picks, facing = build_collage(schema, st, seed, poses, size)
            picked, extra_ui = {}, {"panels": picks, "facing": facing}
        else:
            camera, full, comp, picked, facing = build_single(schema, st, seed, poses, size)
            extra_ui = {"facing": {"single": facing}}
        comp["mode"] = st["mode"]
        bundle = NDParams({"Camera": camera, "Full": full, "composition": NDParams(comp)})
        ui = {"seed": int(seed), "picked": picked, "width": size[0] or st["layout"]["width"], "height": size[1] or st["layout"]["height"],
              "poses": len(poses), **extra_ui}
        return {"ui": {"nd_character": [ui]}, "result": (bundle,)}


NODE_CLASS_MAPPINGS = {"NDCompositionSettings": NDCompositionSettings}
NODE_DISPLAY_NAME_MAPPINGS = {"NDCompositionSettings": "ND Composition Settings"}
