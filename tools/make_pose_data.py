#!/usr/bin/env python3
"""Generates js/pose_builder.json (the data of ND Pose Builder).

Tables: tools/pose_tables.py (options), tools/pose_presets.py (ready-made poses).  Run:  python tools/make_pose_data.py
The JSON is what the node reads; edit it directly if you only tune wording.
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pose_tables as T  # noqa: E402
import pose_presets as PR  # noqa: E402
from make_outfit_data import dump  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "js", "pose_builder.json")

SIT = T.ON_SIT
STAND = ["standing", "walking", "running", "jumping"]
LIE = T.ON_LIE
LEGS_FOR = {
    "tiptoe": STAND, "one_up": STAND + ["sitting"], "knee_fwd": STAND, "warrior": ["standing"], "tree": ["standing"],
    "arabesque": ["standing"], "high_kick": ["standing", "jumping"], "lunge": ["standing", "walking", "crouching"],
    "apart": ["standing", "sitting", "bending"], "wide": ["standing", "bending", "squatting", "crouching"],
    "w_sit": SIT, "kick": ["lying_stomach"], "stretched": SIT + LIE, "tucked": SIT + ["kneeling"],
    "knees_up": SIT + ["lying_back", "jumping"], "split_front": SIT, "split_side": SIT, "chair_foot": ["sitting", "standing"],
    "spread": SIT + ["lying_back", "reclining", "straddle_chair"], "m_legs": SIT + ["lying_back", "reclining"],
    "knees_apart": ["kneeling", "squatting", "all_fours", "lying_stomach", "crouching"],
    "legs_up": ["lying_back", "hips_up", "reclining"], "v_legs": ["lying_back", "hips_up"],
    "armrests": ["sitting"], "behind_head": ["lying_back", "sitting", "hips_up"], "leg_high": ["lying_side", "standing"],
    "pillow_wrap": ["lying_side", "lying_stomach", "lying_back"], "together": ["standing", "sitting", "lying_back", "lying_side", "kneeling"],
    "crossed": STAND[:2] + SIT + ["lying_back", "lying_stomach", "lying_side", "reclining"],
}
for _o in T.LEGS:
    if _o["id"] in LEGS_FOR:
        _o["postures"] = LEGS_FOR[_o["id"]]


def param(id, label, options, *, type="choice", hint=None, **kw):
    p = {"id": id, "label": label, "type": type}
    if hint:
        p["hint"] = hint
    p.update(kw)
    if isinstance(options, str):
        p["set"] = options
    else:
        p["options"] = options
    return p


# The camera moved to ND Composition Settings: what a preset used to set for the view becomes a hint the camera node can use.
ANGLE_TO_CAMERA = {
    "eye": {"height": "eye"}, "low": {"height": "low"}, "high": {"height": "high"}, "above": {"height": "overhead"},
    "below": {"height": "ground"}, "behind": {"orbit": "back"}, "side": {"orbit": "side_l"},
    "pov": {"special": "pov"}, "between": {"special": "between"},
}


def camera_of(sets):
    cam = dict(ANGLE_TO_CAMERA.get(sets.get("view.angle"), {}))
    if sets.get("view.framing"):
        cam["framing"] = sets["view.framing"]
    return cam


PRESET_OPTS = []
for pr in PR.PRESETS:
    d = {"id": pr["id"], "label": pr["label"], "cat": pr["cat"], "group": pr["group"], "icon": pr["icon"]}
    for k in ("lead", "tag", "hint", "anatomy", "anatomy_any", "explicit"):
        if pr.get(k):
            d[k] = pr[k]
    sets = {k: v for k, v in pr["sets"].items() if not k.startswith("view.")}
    cam = camera_of(pr["sets"])
    d["sets"] = sets
    d["core"] = [c for c in pr["core"] if not c.startswith("view.")]
    if cam:
        d["camera"] = cam
    if pr.get("sets_levels"):
        d["sets_levels"] = pr["sets_levels"]
    PRESET_OPTS.append(d)

SEX = [{"id": o["id"], "label": o["label"], "pron": o["pron"], "have": o.get("have", [])} for o in T.SUBJECT]

PARTS = [
    {"id": "subject", "label": "Subject", "params": [
        param("sex", "Subject", SEX, hint="Who is posed: it picks her / his / their words and which poses and acts random may use. With a Character Builder connected its sex and genitals are used instead. Not set means female."),
    ]},
    {"id": "pose", "label": "Ready-made poses", "params": [
        param("preset", "Pose", PRESET_OPTS, macro=True, skip=.25, hint="A ready-made pose: it fills the parameters of the other sections (posture, arms, legs, head, face...). Change any of them afterwards and the pose becomes 'modified'. Click it again to clear."),
    ]},
    {"id": "posture", "label": "Posture", "params": [
        param("base", "Posture", T.BASE, hint="The main position of the body."),
        param("surface", "Where", T.SURFACE, skip=.4, filter_by={"p": "posture.base", "field": "postures"}, hint="The place or the furniture. Random picks only places that fit the posture."),
        param("facing", "Facing", T.FACING, skip=.3, hint="How the body is turned to the camera."),
    ]},
    {"id": "torso", "label": "Torso", "params": [
        param("shape", "Torso", T.TORSO, multi=2, skip=.35, hint="The line of the back and the body. Up to two."),
    ]},
    {"id": "head", "label": "Head & face", "params": [
        param("gaze", "Gaze", T.GAZE, skip=.2, hint="Where the character looks."),
        param("tilt", "Head", T.TILT, skip=.6, hint="How the head is held."),
        param("expression", "Expression", T.EXPRESSION, skip=.2, hint="The expression of the face during the pose. The face itself comes from the Character Builder."),
    ]},
    {"id": "arms", "label": "Arms & hands", "params": [
        param("both", "Both arms", T.BOTH, skip=.5, hint="A pose of both arms. It switches Hand 1 and Hand 2 off."),
        param("hand1", "Hand 1", "hand_poses", skip=.35, hint="What one hand does. The text says 'one hand ... the other', without left or right."),
        param("hand2", "Hand 2", "hand_poses", skip=.5, hint="What the other hand does."),
        param("prop", "Holding", T.PROP, skip=.85, hint="Something held in the hand."),
    ]},
    {"id": "legs", "label": "Legs", "params": [
        param("pose", "Legs", T.LEGS, skip=.3, filter_by={"p": "posture.base", "field": "postures"}, hint="The position of the legs. Random picks only legs that fit the posture."),
        param("feet", "Feet", T.FEET, skip=.75, hint="The position of the feet."),
    ]},
    {"id": "pleasure", "label": "Pleasure", "params": [
        param("act1", "Hand act 1", T.act_copy(1), explicit=True, skip=.25, hint="What one hand does to the body. For fictional adult (18+) characters only."),
        param("act2", "Hand act 2", T.act_copy(2), explicit=True, skip=.6, hint="What the other hand does."),
        param("body", "Body act", T.PBODY, explicit=True, skip=.85, hint="Pleasure without the hands: grinding, humping."),
        param("clothes", "Through clothes", T.CLOTHES, explicit=True, skip=.6, hint="Not set means Auto: when the Character Builder says the area is dressed, the hand slips inside the clothes."),
        param("intensity", "Intensity", T.INTENSITY, explicit=True, scale=True, skip=.3, hint="From teasing to climax and afterglow. Goes into the same sentence."),
    ]},
    {"id": "toys", "label": "Toys", "params": [
        param("items", "Toys", T.TOYS, multi=2, explicit=True, skip=.6, edit={"ops": ["add", "remove"]}, hint="Up to two sex toys. Under the chosen toy pick how it is used."),
        param("color", "Toy color", T.TOY_COLORS, explicit=True, skip=.5, hint="The color of the toys."),
    ]},
    {"id": "fluids", "label": "Fluids", "params": [
        param("items", "Fluids", T.FLUIDS, multi=6, multi_levels=True, skip=.5, edit={"ops": ["add", "remove"]}, hint="Wetness, sweat, oil, cum and the rest. Under each pick how much and where. The explicit ones need the Explicit switch."),
    ]},
]

QUICK = {
    "base": ["head.gaze", "head.expression"],
    "adult": ["head.gaze", "head.expression", "torso.shape", "legs.pose"],
    "solo": ["pleasure.intensity", "head.expression", "toys.items", "toys.color", "fluids.items", "pleasure.clothes"],
}
CAT_ICON = {c: c for c, _, _ in PR.CATS}
ZONES = [{"id": "general", "label": "General", "level": "both", "params": ["subject.sex"], "hide_if_linked": "character"}]
for cid, label, x in PR.CATS:
    quick = QUICK["solo"] if cid == "masturbation" else QUICK["adult"] if cid in ("sensual", "explicit") else QUICK["base"]
    z = {"id": cid, "label": label, "level": "simple", "params": [f"pose.preset@{cid}"] + quick}
    if x:
        z["explicit"] = True
    ZONES.append(z)
ZONES.append({"id": "quick", "label": "Quick", "level": "simple", "params": ["head.gaze", "head.tilt", "head.expression", "torso.shape", "legs.pose"]})
ZONES += [
    {"id": "presets", "label": "Poses", "level": "advanced", "params": ["pose.preset"]},
    {"id": "posture", "label": "Posture", "level": "advanced", "params": ["posture.base", "posture.surface", "posture.facing"]},
    {"id": "torso", "label": "Torso", "level": "advanced", "params": ["torso.shape"]},
    {"id": "head", "label": "Head & face", "level": "advanced", "params": ["head.gaze", "head.tilt", "head.expression"]},
    {"id": "arms", "label": "Arms & hands", "level": "advanced", "params": ["arms.both", "arms.hand1", "arms.hand2", "arms.prop"]},
    {"id": "legs", "label": "Legs", "level": "advanced", "params": ["legs.pose", "legs.feet"]},
    {"id": "pleasure", "label": "Pleasure", "level": "advanced", "explicit": True, "params": ["pleasure.act1", "pleasure.act2", "pleasure.body", "pleasure.clothes", "pleasure.intensity"]},
    {"id": "toys", "label": "Toys", "level": "advanced", "explicit": True, "params": ["toys.items", "toys.color"]},
    {"id": "fluids", "label": "Fluids", "level": "advanced", "params": ["fluids.items"]},
]

DATA = {
    "version": 1,
    "sex_param": "subject.sex",
    "_about": (
        "Data for ND Pose Builder (same engine as the Character Builder, see character_builder.json for the shared fields). "
        "Generated by tools/make_pose_data.py from tools/pose_tables.py and tools/pose_presets.py; edit this file directly to tune wording. "
        "Option fields: text (the words in the Create text; a participle after 'She is', or a full sentence for arms.both and fluids), tag (Danbooru), edit (an instruction for Edit mode), "
        "explicit (needs the Explicit switch), anatomy (the body parts the character must all have: vulva, penis, testicles, breasts, anus), anatomy_any (at least one of them), "
        "postures (the body postures random may pair the option with), mutes (parameters the option switches off, e.g. 'arms.hand1'), group (a heading in the list), "
        "area (what the hand reaches: names of 'covers', used to tell whether it is dressed), both_hands (the act uses both hands), solo (the sentence when nothing else is set), "
        "noun (a toy's name in {toy}), levels / default_level (how a toy is used or how much of a fluid: each level has text, edit, tag, anatomy). "
        "Pose presets (parameter pose.preset, macro): sets (values of other parameters, as ids; a list for a multi parameter), core (the parameters that make the pose 'modified' when changed), "
        "lead (a phrase added to the posture sentence while the pose is unchanged), cat (category zone), icon (a posture id), sets_levels (levels of toys / fluids). "
        "Subject options: pron and have (anatomy). Zones: level (simple / advanced / both), explicit, params ('pose.preset@cat' shows only the poses of a category)."
    ),
    "outputs": [{"key": "Pose", "part": None}],
    "option_sets": {"hand_poses": T.HAND},
    "parts": PARTS,
    "zones": ZONES,
    "covers": {},
    "conflicts": [],
}


def validate():
    errs = []
    P = {}
    for part in PARTS:
        for p in part["params"]:
            opts = p.get("options") or DATA["option_sets"].get(p.get("set"), [])
            P[f"{part['id']}.{p['id']}"] = {o["id"]: o for o in opts}
    base_ids = set(P["posture.base"])
    for pr in PR.PRESETS:
        if pr["icon"] not in base_ids:
            errs.append(f"{pr['id']}: icon {pr['icon']}")
        for pid, v in pr["sets"].items():
            if pid.startswith("view."):
                continue
            if pid not in P:
                errs.append(f"{pr['id']}: no parameter {pid}")
                continue
            for x in (v if isinstance(v, list) else [v]):
                if x not in P[pid]:
                    errs.append(f"{pr['id']}: {pid}={x}")
        for pid in pr["core"]:
            if pid.startswith("view."):
                continue
            if pid not in pr["sets"]:
                errs.append(f"{pr['id']}: core {pid} not set")
        for pid, d in (pr.get("sets_levels") or {}).items():
            for oid, lid in d.items():
                lv = [l["id"] for l in P[pid].get(oid, {}).get("levels", [])]
                if lid not in lv:
                    errs.append(f"{pr['id']}: level {oid}.{lid}")
    ids = [p["id"] for p in PR.PRESETS]
    errs += [f"duplicate preset {i}" for i in set(ids) if ids.count(i) > 1]
    for z in ZONES:
        for pid in z["params"]:
            if pid.split("@")[0] not in P:
                errs.append(f"zone {z['id']}: {pid}")
    for pid, opts in P.items():
        for o in opts.values():
            for m in o.get("mutes", []):
                if m != "part.*" and m not in P:
                    errs.append(f"{pid}.{o['id']} mutes {m}")
            for l in o.get("levels", []):
                if l["id"] == o.get("default_level") or True:
                    pass
            if o.get("levels") and o.get("default_level") not in [l["id"] for l in o["levels"]]:
                errs.append(f"{pid}.{o['id']}: default_level")
    return errs


if __name__ == "__main__":
    errs = validate()
    if errs:
        print("\n".join(errs))
        sys.exit(1)
    from hints.apply import apply_dict  # the English hints live in tools/hints/hints_pose.py
    import hints.hints_pose as _hints
    apply_dict(DATA, _hints)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(dump(DATA) + "\n")
    n = sum(len(p.get("options", [])) for part in PARTS for p in part["params"])
    cats = {}
    for pr in PR.PRESETS:
        cats[pr["cat"]] = cats.get(pr["cat"], 0) + 1
    print(f"wrote {OUT}: {len(PARTS)} parts, {n} options, {len(PR.PRESETS)} presets {cats}")
