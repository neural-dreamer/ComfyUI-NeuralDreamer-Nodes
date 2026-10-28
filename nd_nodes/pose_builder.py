"""
Neural Dreamer Nodes — Pose Builder

Builds a pose description (one character, alone) on the same engine as the Character Builder and the Outfit
Builder: the data is js/pose_builder.json, the state is one JSON string (the hidden `state` widget), random
picks come from the seed.

    {"formats": {...}, "explicit": false, "mode": "create", "levels": {"toys.items": {"wand": "clit"}},
     "values": {"pose.preset": "photo_contrapposto", "head.gaze": "camera", ...}}

Input (ND_PARAMS, Pack Parameters): "seed" and "character" (the Character Builder Out of a Character Builder:
sex, anatomy, clothes, and the text pieces for the Full Description). Without a character the Subject parameter
gives the pronouns and the anatomy (not set: female).

Output fields:
    Pose     the pose text (Create: sentences and / or tags; Edit: instructions) with the extra prompt
    Full     the whole picture: the character, the outfit, then the pose (Edit: all instructions with one "keep the rest" sentence)
    pose     POSE_PARAMS (version 2) for nodes that build on it (ND Composition Settings): text, tags, template, edit, edit_simple, mode, touched,
             text_free / tags_free / template_free (without how the body faces the camera), facing, camera_hint, pron, sex, anatomy, full, char
"""

import json
import logging
import os
import random

from .params import PARAMS, NDParams
from .character_builder import (
    MAX_SEED, RANDOM, _pick, anatomy_fits, as_list, blank_state, compose, edit_tail, fill_pron, join_list, load_schema, paragraphs,
    parse_state, resolve, seed_for, unique, with_article,
)

log = logging.getLogger("NeuralDreamer")

POSE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "js", "pose_builder.json")
DEFAULT_STATE = {
    "formats": {"natural": True, "tags": False}, "avoid_conflicts": True, "explicit": False, "extra": "", "custom": {},
    "mode": "create", "ops": {}, "edit_keep": True, "edit_style": "full", "levels": {}, "values": {}, "pools": {},
}
SEX = "subject.sex"
PRESET = "pose.preset"
PRON_OF = {"female": "she", "male": "he", "futa": "she", "neutral": "they"}
LISTS = ("torso.shape",)


def same(a, b):
    return sorted(as_list(a)) == sorted(as_list(b))


def read_character(bundle):
    """The Character Builder Out (appearance) from the input bundle; {} when there is none."""
    c = bundle.get("character") if isinstance(bundle, dict) else None
    for _ in range(3):
        if isinstance(c, dict) and isinstance(c.get("appearance"), dict):
            c = c["appearance"]
    return c if isinstance(c, dict) and c else {}


class PoseText:
    def __init__(self, schema, resolved, state, seed, pron, have, covers=(), picked=None):
        self.schema, self.r, self.state, self.seed = schema, resolved, state, int(seed)
        self.pron, self.have, self.covers = pron, set(have or []), set(covers or [])
        self.picked = picked or {}
        self.ops = state.get("ops") or {}
        self.preset = None
        m = state.get("_macro")
        if m:
            o = schema.params[PRESET]["opt"].get(m["id"])
            if o and all(same(self.r.get(pid), o["sets"].get(pid)) for pid in o["core"]):
                self.preset = o
        self.toy_color = self.option("toys.color")

    # ---------------------------------------------------------------- lookups
    def option(self, pid):
        v = self.r.get(pid)
        if v is None or isinstance(v, list):
            return None
        return self.schema.params[pid]["opt"].get(v)

    def options(self, pid):
        return [self.schema.params[pid]["opt"][x] for x in as_list(self.r.get(pid)) if x in self.schema.params[pid]["opt"]]

    def level(self, pid, o):
        """The chosen level of a toy / fluid (what the user clicked, else the default, else random for a random pick); None when none fits."""
        levels = o.get("levels") or []
        want = (self.state.get("levels", {}).get(pid) or {}).get(o["id"])
        if isinstance(want, list):
            want = next((w for w in want if any(x["id"] == w for x in levels)), None)
        lv = next((x for x in levels if x["id"] == want), None)
        if lv is not None:
            return lv
        fit = [x for x in levels if anatomy_fits(x, self.have)]
        if not fit:
            return None
        picked = as_list(self.picked.get(pid))
        if o["id"] in picked or self.state.get("all_random"):
            return random.Random(seed_for(self.seed, f"{pid}:{o['id']}:level")).choice(fit)
        return next((x for x in fit if x["id"] == o.get("default_level")), fit[0])

    def level_list(self, pid, o):
        """All the chosen levels of an option. Only a param with multi_levels (the fluids) can have several; else just level()."""
        want = (self.state.get("levels", {}).get(pid) or {}).get(o["id"])
        if self.schema.params[pid].get("multi_levels") and isinstance(want, list) and len(want) > 1:
            got = [x for x in (o.get("levels") or []) if x["id"] in want]
            if got:
                return got
        lv = self.level(pid, o)
        return [lv] if lv is not None else []

    def toy_phrase(self, o):
        col = self.toy_color
        noun = o.get("noun") or o["label"].lower()
        return with_article(f"{col['text']} {noun}" if col else noun)

    def toys(self):
        """[(option, level, phrase)] of the chosen toys that can be used by this body."""
        out = []
        for o in self.options("toys.items"):
            lv = self.level("toys.items", o)
            if lv is not None:
                out.append((o, lv, self.toy_phrase(o)))
        return out

    def fluids(self):
        out = []
        for o in self.options("fluids.items"):
            for lv in self.level_list("fluids.items", o):
                out.append((o, lv))
        return out

    # ---------------------------------------------------------------- Create
    def posture_clause(self, free=False):
        """'sitting on a bed, facing the camera, in a classic pin-up pose, with her back arched' (no subject).
        free: without how the body is turned to the camera (the camera node says it for the panels of a collage)."""
        base, surf, face = self.option("posture.base"), self.option("posture.surface"), (None if free else self.option("posture.facing"))
        head = base["text"] if base else ""
        if surf:
            st = surf["text"]
            head = (head + (", " if st.startswith("leaning") else " ") + st) if head else st
        parts = [head] if head else []
        if face:
            parts.append(face["text"])
        if self.preset and self.preset.get("lead"):
            parts.append(self.preset["lead"])
        bits = [o["text"] for o in self.options("torso.shape")]
        for pid in ("legs.pose", "legs.feet"):
            o = self.option(pid)
            if o:
                bits.append(o["text"])
        clause = ", ".join(parts)
        if bits:
            clause = (clause + ", with " if clause else "has ") + join_list(bits)
        return clause

    def posture_sentence(self, free=False):
        c = self.posture_clause(free)
        if not c:
            return ""
        return ("{Pron} " + c + ".") if c.startswith("has ") else "{Pron} {is} " + c + "."

    def arm_sentences(self):
        out = []
        both = self.option("arms.both")
        if both:
            out.append(both["text"])
        else:
            h1, h2 = self.option("arms.hand1"), self.option("arms.hand2")
            if h1 and h2 and h1["id"] == h2["id"]:
                h2 = None
            if h1 and h2:
                out.append(f"One hand {h1['text']} while the other {h2['text']}.")
            elif h1 or h2:
                out.append(f"One hand {(h1 or h2)['text']}.")
        prop = self.option("arms.prop")
        if prop:
            out.append("{Pron} {is} " + prop["text"] + ".")
        return out

    def acts(self):
        a1, a2 = self.option("pleasure.act1"), self.option("pleasure.act2")
        if a1 and a2 and a1["id"] == a2["id"]:
            a2 = None
        return [a for a in (a1, a2) if a]

    def pleasure_sentences(self):
        acts, body = self.acts(), self.option("pleasure.body")
        inten, clothes = self.option("pleasure.intensity"), self.option("pleasure.clothes")
        doings = []
        for i, a in enumerate(acts):
            t = a["text"]
            if len(acts) == 2 and not any(x.get("both_hands") for x in acts) and " with " not in t:
                t += " with one hand" if i == 0 else " with the other hand"
            doings.append(t)
        if body:
            doings.append(body["text"])
        out = []
        if doings:
            s = "{Pron} {is} " + join_list(doings)
            if clothes:
                s += clothes["text"]
            elif self.covers and any(set(a.get("area") or []) & self.covers for a in acts):
                s += ", slipping a hand inside {pos} clothes"
            if inten and inten.get("text"):
                s += inten["text"]
            out.append(s + ".")
            if inten and inten["id"] == "afterglow" and inten.get("solo"):
                out.append(inten["solo"])
        elif inten and inten.get("solo"):
            out.append(inten["solo"])
        return out

    def toy_sentences(self):
        return ["{Pron} {is} " + lv["text"].replace("{toy}", ph) + "." for o, lv, ph in self.toys()]

    def face_sentence(self):
        gaze, tilt, expr = self.option("head.gaze"), self.option("head.tilt"), self.option("head.expression")
        if gaze:
            return "{Pron} {is} " + ", ".join(x["text"] for x in (gaze, tilt, expr) if x) + "."
        if tilt:
            return "{Pron} has " + ", ".join(x["text"] for x in (tilt, expr) if x) + "."
        return ("{Pron} {is} " + expr["text"] + ".") if expr else ""

    def fluid_sentences(self):
        return [lv["text"] for o, lv in self.fluids()]

    def sentences(self, free=False):
        out = [self.posture_sentence(free)] + self.arm_sentences() + self.pleasure_sentences() + self.toy_sentences() \
            + [self.face_sentence()] + self.fluid_sentences()
        return [s for s in out if s]

    def create(self, free=False):
        """(template natural text, tags list)"""
        return " ".join(unique(self.sentences(free))), self.tags(free)

    def tags(self, free=False):
        out = []
        for pid in ("posture.base", "posture.surface") + (() if free else ("posture.facing",)):
            o = self.option(pid)
            out.append(o.get("tag", "") if o else "")
        if self.preset:
            out.append(self.preset.get("tag", ""))
        for pid in ("torso.shape",):
            out += [o.get("tag", "") for o in self.options(pid)]
        for pid in ("legs.pose", "legs.feet", "head.gaze", "head.tilt", "head.expression", "arms.both", "arms.hand1", "arms.hand2", "arms.prop",
                    "pleasure.act1", "pleasure.act2", "pleasure.body", "pleasure.clothes", "pleasure.intensity"):
            o = self.option(pid)
            out.append(o.get("tag", "") if o else "")
        col = self.toy_color
        for o, lv, _ in self.toys():
            out += [o.get("tag", ""), lv.get("tag", ""), (col or {}).get("tag", "") if col else ""]
        for o, lv in self.fluids():
            out += [o.get("tag", ""), lv.get("tag", "")]
        tags = [t.strip() for x in out for t in x.split(",") if t.strip()]
        if any(self.r.get(p) for p in ("pleasure.act1", "pleasure.act2", "pleasure.body")) or self.toys():
            tags.insert(0, "masturbation")
        if tags:
            tags.insert(0, "solo")
        return unique(tags)

    # ---------------------------------------------------------------- Edit
    def op(self, pid):
        return "remove" if self.ops.get(pid) == "remove" else "add"

    def edit(self):
        """(instruction sentences with tokens, touched)"""
        out = []
        if self.preset:
            c = self.posture_clause()
            if c:
                out.append("Change {pos} pose to " + (c[4:] if c.startswith("has ") else c) + ".")
        else:
            for pid in ("posture.base", "posture.surface", "posture.facing"):
                o = self.option(pid)
                if o and o.get("edit"):
                    out.append(o["edit"])
            for o in self.options("torso.shape"):
                out.append(o["edit"])
            for pid in ("legs.pose", "legs.feet"):
                o = self.option(pid)
                if o and o.get("edit"):
                    out.append(o["edit"])
        for pid in ("head.gaze", "head.tilt", "head.expression", "arms.both", "arms.hand1", "arms.hand2", "arms.prop",
                    "pleasure.act1", "pleasure.act2", "pleasure.body", "pleasure.clothes", "pleasure.intensity"):
            o = self.option(pid)
            if o and o.get("edit"):
                out.append(o["edit"])
        toys = self.toys()
        if toys:
            if self.op("toys.items") == "remove":
                out.append("Remove " + join_list([ph for _, _, ph in toys]) + " from the picture.")
            else:
                out += [lv["edit"].replace("{toy}", ph) for _, lv, ph in toys]
        fl = self.fluids()
        if fl:
            if self.op("fluids.items") == "remove":
                out.append("Clean " + join_list(unique([o["label"].lower() for o, _ in fl])) + " off {pos} body.")
            else:
                out += [lv["edit"] for _, lv in fl]
        out = unique(out)
        return out, (["pose"] if out else [])

    def simple(self):
        """The simple Edit form: "Change her pose to: ..." and the rest of the Create sentences."""
        c = self.posture_clause()
        rest = self.arm_sentences() + self.pleasure_sentences() + self.toy_sentences() + [self.face_sentence()] + self.fluid_sentences()
        out = []
        if c:
            out.append("Change {pos} pose to " + (c[4:] if c.startswith("has ") else c) + ".")
        out += rest
        out = unique([s for s in out if s])
        return out, (["pose"] if out else [])

    def facing(self):
        """The id of the chosen way the body faces the camera (after random), or None."""
        o = self.option("posture.facing")
        return o["id"] if o else None

    def camera_hint(self):
        """What the chosen ready-made pose suggests for the camera ({height, orbit, framing, special}); {} for none.
        The camera node uses it for the parts it was not told about."""
        v = self.r.get(PRESET)
        o = self.schema.params[PRESET]["opt"].get(v) if isinstance(v, str) else None
        cam = (o or {}).get("camera")
        return dict(cam) if isinstance(cam, dict) else {}


def build_pose(schema, st, seed, char):
    """(resolved, picked, PoseText, pron, fields) for a parsed state and an optional Character Builder Out."""
    seed = int(seed)
    sex_opts = schema.params[SEX]["opt"]
    if char:
        have = [x for x in as_list(char.get("anatomy")) if isinstance(x, str)]
        pron = char.get("pron") if char.get("pron") in ("she", "he", "they") else PRON_OF.get(char.get("sex"), "they")
        covers = [c for c in as_list(char.get("covers")) if isinstance(c, str)]
        if char.get("sex") or have:
            pass
    else:
        v = RANDOM if st.get("all_random") else st["values"].get(SEX)
        if v == RANDOM:
            v = _pick(schema, dict(st, anatomy=None), seed, SEX, {})
        v = v if v in sex_opts else "female"
        o = sex_opts[v]
        have, pron, covers = list(o.get("have", [])), o.get("pron", "she"), []
    st["anatomy"] = have
    resolved, picked = resolve(schema, st, seed)
    t = PoseText(schema, resolved, st, seed, pron, have, covers, picked)
    tpl, tags = t.create()
    tpl_free, tags_free = t.create(True)
    full, touched = t.edit()
    simple, _ = t.simple()
    fields = {"template": tpl, "tags": ", ".join(tags), "text": fill_pron(tpl, pron), "edit": " ".join(full), "edit_simple": " ".join(simple), "touched": touched,
              "template_free": tpl_free, "tags_free": ", ".join(tags_free), "text_free": fill_pron(tpl_free, pron)}
    return resolved, picked, t, pron, fields


class NDPoseBuilder:
    CATEGORY = "Neural Dreamer/Prompt"
    DESCRIPTION = (
        "Builds a pose description for one character: pick a ready-made pose in Simple mode or set every part of "
        "the body in Advanced. Any parameter can be random (picked with the seed). Input: an optional parameters wire "
        "with 'seed' and 'character' (the Character Builder Out of a Character Builder). Outputs: the pose text, the "
        "full description (character, outfit and pose in one text) and a Pose Builder Out bundle. "
        "For fictional adult (18+) characters only."
    )
    RETURN_TYPES = (PARAMS,)
    RETURN_NAMES = ("params",)
    FUNCTION = "build"
    SEARCH_ALIASES = ["pose builder", "pose", "posture", "position", "pose description"]

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
                log.warning("[Neural Dreamer] Pose Builder: seed on the input is not a number: %r", params["seed"])
        schema = load_schema(POSE_PATH)
        st = parse_state(state)
        if not st["enabled"]:
            st = blank_state(st, DEFAULT_STATE)
        char = read_character(params)
        resolved, picked, t, pron, f = build_pose(schema, st, seed, char)
        extra = st.get("extra", "")
        mode = st["mode"]
        drop = ("pose",)
        if mode == "edit":
            lines = f["edit_simple"] if st.get("edit_style") == "simple" else f["edit"]
            touched = f["touched"]
            tail = ""
            if st.get("edit_keep", True) and touched:
                tail = edit_tail("{pos}", "{obj}", set(), False, False, "", drop)
            pose_text = paragraphs(fill_pron(lines, pron), fill_pron(tail, pron), extra)
        else:
            pose_text = paragraphs(compose(f["text"], f["tags"].split(", ") if f["tags"] else [], st), extra)
        full = pose_text
        if char:
            cb_mode = "edit" if char.get("mode") == "edit" else "create"
            if mode == cb_mode == "create":
                full = paragraphs(char.get("body", ""), char.get("outfit", ""), char.get("extra", ""),
                                  compose(f["text"], f["tags"].split(", ") if f["tags"] else [], st), extra)
            elif mode == cb_mode == "edit":
                lines = f["edit_simple"] if st.get("edit_style") == "simple" else f["edit"]
                tl = char.get("tail") if isinstance(char.get("tail"), dict) else {}
                tail = ""
                if st.get("edit_keep", True) and (f["touched"] or tl.get("touched")):
                    tail = edit_tail(tl.get("pos", "{pos}"), tl.get("obj", "{obj}"), set(tl.get("touched") or []),
                                     bool(tl.get("has_outfit")), bool(tl.get("partial")), tl.get("subject_word", ""), drop)
                full = paragraphs(char.get("body", ""), char.get("outfit", ""), fill_pron(lines, pron), fill_pron(tail, pron),
                                  char.get("extra", ""), extra) if tl else paragraphs(char.get("description", ""), pose_text)
            else:
                full = paragraphs(char.get("description", ""), pose_text)
        keep = ("body", "outfit", "extra", "description", "tail", "mode")
        pose = NDParams({
            "version": 2,
            "text": f["text"],
            "tags": f["tags"],
            "template": f["template"],
            "edit": f["edit"],
            "edit_simple": f["edit_simple"],
            "mode": mode,
            "touched": f["touched"],
            # for ND Composition Settings: the pose without how the body is turned to the camera, what that turn is,
            # what the ready-made pose suggests for the camera, who is posed and the pieces of the character
            "text_free": f["text_free"],
            "tags_free": f["tags_free"],
            "template_free": f["template_free"],
            "facing": t.facing(),
            "camera_hint": t.camera_hint(),
            "pron": pron,
            "sex": (char.get("sex") if char else resolved.get(SEX)) or "female",
            "anatomy": list(st.get("anatomy") or []),
            "full": full,
            "pose_text": pose_text,
            "char": {k: char[k] for k in keep if k in char} if char else {},
            "extra": extra,
            "edit_keep": bool(st.get("edit_keep", True)),
            "edit_style": st.get("edit_style", "full"),
        })
        bundle = NDParams({"Pose": pose_text, "Full": full, "pose": pose})
        return {"ui": {"nd_character": [{"seed": int(seed), "picked": picked}]}, "result": (bundle,)}


NODE_CLASS_MAPPINGS = {"NDPoseBuilder": NDPoseBuilder}
NODE_DISPLAY_NAME_MAPPINGS = {"NDPoseBuilder": "ND Pose Builder"}
