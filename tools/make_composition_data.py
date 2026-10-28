#!/usr/bin/env python3
"""Generates js/composition_settings.json (the data of ND Composition Settings: the camera, the lens, where the subject sits in the frame).

Run:  python tools/make_composition_data.py
The JSON is what the node reads; edit it directly if you only tune wording.
Left and right are counted from the camera, as seen in the picture ("turned toward the left side of the frame").
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_outfit_data import dump  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "js", "composition_settings.json")


def o(id, label, text="", tag="", edit="", **kw):
    d = {"id": id, "label": label, "text": text}
    if tag:
        d["tag"] = tag
    if edit:
        d["edit"] = edit
    d.update({k: v for k, v in kw.items() if v not in (None, "", [])})
    return d


def param(id, label, options, *, type="choice", hint=None, **kw):
    p = {"id": id, "label": label, "type": type}
    if hint:
        p["hint"] = hint
    p.update(kw)
    p["options"] = options
    return p


# ---------------------------------------------------------------- camera
HEIGHT = [
    o("ground", "Ground level", "from ground level, looking up", "from below, worm's-eye view", "Move the camera to ground level, looking up at {obj}.", cap="WORM'S-EYE VIEW"),
    o("low", "Low angle", "from a low angle", "from below", "Lower the camera so that {pron} {is} seen from a low angle.", cap="LOW ANGLE"),
    o("eye", "Eye level", "at eye level", "straight-on", "Put the camera at eye level with {obj}."),
    o("chest", "Chest height", "at chest height", "", "Put the camera at chest height."),
    o("waist", "Waist height", "at waist height", "", "Put the camera at waist height."),
    o("high", "High angle", "from a high angle", "from above", "Raise the camera so that {pron} {is} seen from a high angle.", cap="HIGH ANGLE"),
    o("overhead", "Overhead", "from directly above, looking straight down", "from above, top-down view, overhead view", "Move the camera directly above {obj}, looking straight down.", cap="TOP VIEW"),
]

# facing_fits: the ways the body can face the camera (Pose Builder, posture.facing) that go with the view
ORBIT = [
    o("front", "Front", "from the front", "front view", "Show {obj} from the front.", facing_fits=["camera"], cap="FRONT VIEW", deg=0),
    o("front34_l", "Front 3/4, facing left", "in a three-quarter view, turned toward the left side of the frame", "three-quarter view", "Rotate the view so that {pron} {is} seen in a three-quarter view, turned toward the left side of the frame.", facing_fits=["three_q"], cap="3/4 VIEW", deg=45),
    o("front34_r", "Front 3/4, facing right", "in a three-quarter view, turned toward the right side of the frame", "three-quarter view", "Rotate the view so that {pron} {is} seen in a three-quarter view, turned toward the right side of the frame.", facing_fits=["three_q"], cap="3/4 VIEW", deg=315),
    o("side_l", "Profile, facing left", "in profile, facing the left side of the frame", "from side, profile", "Rotate the view so that {pron} {is} seen in profile, facing the left side of the frame.", facing_fits=["profile"], cap="SIDE VIEW", deg=90),
    o("side_r", "Profile, facing right", "in profile, facing the right side of the frame", "from side, profile", "Rotate the view so that {pron} {is} seen in profile, facing the right side of the frame.", facing_fits=["profile"], cap="SIDE VIEW", deg=270),
    o("back34_l", "Back 3/4, facing left", "in a three-quarter rear view, turned toward the left side of the frame", "from behind, three-quarter view", "Rotate the view so that {pron} {is} seen from behind at a three-quarter angle, turned toward the left side of the frame.", facing_fits=["back"], cap="BACK 3/4 VIEW", deg=135),
    o("back34_r", "Back 3/4, facing right", "in a three-quarter rear view, turned toward the right side of the frame", "from behind, three-quarter view", "Rotate the view so that {pron} {is} seen from behind at a three-quarter angle, turned toward the right side of the frame.", facing_fits=["back"], cap="BACK 3/4 VIEW", deg=225),
    o("back", "Back", "from behind", "from behind", "Show {obj} from behind.", facing_fits=["back"], cap="BACK VIEW", deg=180),
]

ROLL = [
    {**o("left", "Tilted left", "", "", ""), "default_level": "slight", "levels": [
        {"id": "slight", "label": "Slightly", "text": "with the camera tilted slightly to the left", "edit": "Tilt the camera slightly to the left.", "tag": "tilted frame"},
        {"id": "dutch", "label": "Dutch angle", "text": "with a strong dutch angle, the camera tilted to the left", "edit": "Tilt the camera strongly to the left, in a dutch angle.", "tag": "dutch angle"},
    ]},
    {**o("right", "Tilted right", "", "", ""), "default_level": "slight", "levels": [
        {"id": "slight", "label": "Slightly", "text": "with the camera tilted slightly to the right", "edit": "Tilt the camera slightly to the right.", "tag": "tilted frame"},
        {"id": "dutch", "label": "Dutch angle", "text": "with a strong dutch angle, the camera tilted to the right", "edit": "Tilt the camera strongly to the right, in a dutch angle.", "tag": "dutch angle"},
    ]},
]

DISTANCE = [
    o("extreme_close", "Extremely close", "from extremely close up", "extreme close-up", "Move the camera extremely close to {obj}."),
    o("close", "Close", "from close up", "close-up", "Move the camera close to {obj}."),
    o("medium", "Medium distance", "from a medium distance", "medium shot", "Put the camera at a medium distance from {obj}."),
    o("far", "Far", "from far away", "wide shot", "Move the camera far away from {obj}."),
    o("extreme_far", "Very far", "from very far away, the subject tiny in the scene", "distant, very wide shot", "Move the camera very far away, so that {pron} {is} tiny in the scene."),
]

SPECIAL = [
    o("pov", "First person (POV)", "from a first-person point of view", "pov", "Show the picture from a first-person point of view.", mutes=["camera.orbit"], cap="POV"),
    o("between", "Between the legs", "from between {pos} legs", "from between legs, pov", "Show {obj} from between {pos} legs.", mutes=["camera.orbit", "camera.height"], cap="POV"),
    o("selfie", "Selfie", "as a selfie taken at arm's length", "selfie", "Make the picture a selfie taken at arm's length.", mutes=["camera.orbit", "camera.height"], cap="SELFIE"),
    o("mirror", "Mirror reflection", "as a reflection in a mirror", "mirror, reflection", "Show {obj} as a reflection in a mirror.", cap="MIRROR"),
    o("doorway", "Through a doorway", "seen through a slightly open door", "doorway", "Show {obj} through a slightly open door.", cap="DOORWAY"),
    o("window", "Through a window", "seen through a window from outside", "through window", "Show {obj} through a window from outside.", cap="WINDOW"),
    o("cctv", "Security camera", "as a grainy security-camera still from a high corner", "security camera", "Make the picture look like a grainy security-camera still from a high corner.", mutes=["camera.height"], cap="CCTV"),
    o("phone_photo", "Candid phone photo", "as a candid phone photo taken from a distance", "candid", "Make the picture look like a candid phone photo taken from a distance.", cap="CANDID"),
    o("drone", "Drone shot", "as a drone shot from high above", "aerial view, from above", "Make the picture a drone shot from high above.", mutes=["camera.height"], cap="DRONE"),
]

SHOT = [
    o("full", "Full body", "full-body shot", "full body", "Frame {obj} full body.", cap="FULL BODY"),
    o("cowboy", "Knees up", "cowboy shot, from the knees up", "cowboy shot", "Frame {obj} from the knees up.", cap="KNEES UP"),
    o("waist", "Waist up", "waist-up shot", "upper body", "Frame {obj} from the waist up.", cap="WAIST UP"),
    o("portrait", "Portrait", "head-and-shoulders portrait", "portrait", "Frame {obj} as a head-and-shoulders portrait.", cap="PORTRAIT"),
    o("face", "Face close-up", "close-up on the face", "close-up, face focus", "Frame {obj} in a close-up on the face.", cap="FACE"),
    o("feet", "Feet close-up", "close-up on the feet", "foot focus, close-up", "Frame {obj} in a close-up on the feet.", cap="FEET"),
    o("breasts", "Breasts close-up", "close-up on the breasts", "breast focus, close-up", "Frame {obj} in a close-up on the breasts.", explicit=True, cap="CLOSE-UP"),
    o("crotch", "Crotch close-up", "close-up on the crotch", "crotch focus, close-up", "Frame {obj} in a close-up on the crotch.", explicit=True, cap="CLOSE-UP"),
]

FOCUS_ON = [
    o("face", "Face", "{pos} face", "face focus", "Keep the focus of the shot on {pos} face."),
    o("eyes", "Eyes", "{pos} eyes", "eye focus", "Keep the focus of the shot on {pos} eyes."),
    o("lips", "Lips", "{pos} lips", "lips focus", "Keep the focus of the shot on {pos} lips."),
    o("hands", "Hands", "{pos} hands", "hand focus", "Keep the focus of the shot on {pos} hands."),
    o("feet", "Feet", "{pos} feet", "foot focus", "Keep the focus of the shot on {pos} feet."),
    o("outfit", "Outfit", "{pos} outfit", "", "Keep the focus of the shot on {pos} outfit."),
    o("butt", "Butt", "{pos} butt", "ass focus", "Keep the focus of the shot on {pos} butt.", explicit=True),
    o("breasts", "Breasts", "{pos} {chest}", "breast focus", "Keep the focus of the shot on {pos} {chest}.", explicit=True),
    o("crotch", "Crotch", "{pos} crotch", "crotch focus", "Keep the focus of the shot on {pos} crotch.", explicit=True),
]

POS = [
    o("center", "Centered", "in the center of the frame", "centered", "Put {obj} in the center of the frame.", cap=""),
    o("left", "Left", "on the left side of the frame", "", "Move {obj} to the left side of the frame."),
    o("right", "Right", "on the right side of the frame", "", "Move {obj} to the right side of the frame."),
    o("top", "Top", "in the upper part of the frame", "", "Move {obj} to the upper part of the frame."),
    o("bottom", "Bottom", "in the lower part of the frame", "", "Move {obj} to the lower part of the frame."),
    o("top_left", "Top left", "in the top-left corner of the frame", "", "Move {obj} to the top-left corner of the frame."),
    o("top_right", "Top right", "in the top-right corner of the frame", "", "Move {obj} to the top-right corner of the frame."),
    o("bottom_left", "Bottom left", "in the bottom-left corner of the frame", "", "Move {obj} to the bottom-left corner of the frame."),
    o("bottom_right", "Bottom right", "in the bottom-right corner of the frame", "", "Move {obj} to the bottom-right corner of the frame."),
]
SIZE = [
    o("fill", "Fills the frame", "filling most of the frame", "", "Make {obj} fill most of the frame."),
    o("large", "Large", "large in the frame", "", "Make {obj} large in the frame."),
    o("medium", "Medium", "of medium size in the frame", "", "Make {obj} medium-sized in the frame."),
    o("small", "Small", "small in the frame, with plenty of space around", "", "Make {obj} small in the frame, with plenty of space around."),
    o("tiny", "Tiny", "tiny in a vast space", "", "Make {obj} tiny in a vast space."),
]
RULE = [
    o("thirds", "Rule of thirds", "composed by the rule of thirds", "rule of thirds", "Compose the picture by the rule of thirds."),
    o("symmetric", "Symmetrical", "in a strictly symmetrical composition", "symmetry", "Make the composition strictly symmetrical."),
    o("lead_room", "Room to look", "with open space ahead of {obj}, in the direction of {pos} gaze", "", "Leave open space ahead of {obj}, in the direction of {pos} gaze."),
    o("negative", "Negative space", "with a lot of empty negative space around", "negative space", "Leave a lot of empty negative space around {obj}."),
]

# ---------------------------------------------------------------- lens
FOCAL = [
    o("fisheye", "Fisheye", "shot with a fisheye lens", "fisheye", "Re-shoot with a fisheye lens."),
    o("ultra_wide", "Ultra-wide (14 mm)", "shot with an ultra-wide 14mm lens", "wide angle", "Re-shoot with an ultra-wide 14mm lens."),
    o("wide", "Wide (24 mm)", "shot with a 24mm wide-angle lens", "wide angle", "Re-shoot with a 24mm wide-angle lens."),
    o("normal", "Normal (50 mm)", "shot with a 50mm lens", "", "Re-shoot with a 50mm lens."),
    o("portrait", "Portrait (85 mm)", "shot with an 85mm portrait lens", "", "Re-shoot with an 85mm portrait lens."),
    o("tele", "Telephoto (200 mm)", "shot with a 200mm telephoto lens", "telephoto lens", "Re-shoot with a 200mm telephoto lens."),
    o("macro", "Macro", "shot with a macro lens", "macro", "Re-shoot with a macro lens."),
]
DOF = [
    o("deep", "Deep focus", "with everything in sharp focus", "deep focus", "Make everything sharp, with a deep depth of field."),
    o("shallow", "Shallow depth", "with a shallow depth of field", "depth of field", "Use a shallow depth of field."),
    o("very_shallow", "Very shallow depth", "with a very shallow depth of field and a creamy blurred background", "depth of field, blurry background", "Use a very shallow depth of field, with a creamy blurred background."),
]
FOCUS_AT = [
    o("subject", "On the subject", "focused sharply on the subject", "", "Focus sharply on {obj}."),
    o("face", "On the face", "focused sharply on the face", "", "Focus sharply on {pos} face."),
    o("eyes", "On the eyes", "focused sharply on the eyes", "", "Focus sharply on {pos} eyes."),
    o("foreground", "Foreground", "with the foreground in focus and the rest soft", "", "Focus on the foreground and leave the rest soft."),
    o("background", "Background", "with the background in focus and the subject soft", "", "Focus on the background and leave the subject soft."),
    o("soft", "Soft focus", "with a soft, dreamy focus", "soft focus", "Give the picture a soft, dreamy focus."),
]
CAMERA = [
    o("dslr", "DSLR", "shot on a DSLR camera", "", "Make the picture look shot on a DSLR camera."),
    o("mirrorless", "Mirrorless", "shot on a mirrorless camera", "", "Make the picture look shot on a mirrorless camera."),
    o("film35", "35 mm film", "shot on 35mm film", "film grain", "Make the picture look shot on 35mm film."),
    o("medium_format", "Medium format", "shot on medium-format film", "", "Make the picture look shot on medium-format film."),
    o("polaroid", "Polaroid", "as an instant Polaroid photo", "polaroid", "Make the picture look like an instant Polaroid photo."),
    o("disposable", "Disposable camera", "as a disposable-camera snapshot with a harsh flash", "flash photography", "Make the picture look like a disposable-camera snapshot with a harsh flash."),
    o("phone", "Smartphone", "shot on a smartphone", "", "Make the picture look shot on a smartphone."),
    o("cctv", "CCTV", "as a grainy CCTV recording", "cctv", "Make the picture look like a grainy CCTV recording."),
    o("webcam", "Webcam", "as a low-resolution webcam capture", "webcam", "Make the picture look like a low-resolution webcam capture."),
    o("cinema", "Cinema camera", "shot on a cinema camera, with an anamorphic widescreen look", "cinematic", "Make the picture look shot on a cinema camera, with an anamorphic widescreen look."),
]
EFFECTS = [
    o("bokeh", "Bokeh", "with soft bokeh highlights", "bokeh", "Add soft bokeh highlights."),
    o("flare", "Lens flare", "with lens flare", "lens flare", "Add lens flare."),
    o("chromatic", "Chromatic aberration", "with slight chromatic aberration", "chromatic aberration", "Add slight chromatic aberration."),
    o("vignette", "Vignette", "with a vignette", "vignetting", "Add a vignette."),
    o("grain", "Film grain", "with film grain", "film grain", "Add film grain."),
    o("motion_blur", "Motion blur", "with motion blur", "motion blur", "Add motion blur."),
    o("tilt_shift", "Tilt-shift", "in a tilt-shift look", "tilt-shift", "Give the picture a tilt-shift look."),
    o("long_exposure", "Long exposure", "as a long exposure", "long exposure", "Make the picture a long exposure."),
    o("light_leak", "Light leaks", "with light leaks", "light leaks", "Add light leaks."),
]
EXPOSURE = [
    o("bright", "Bright", "with a bright, high-key exposure", "high key", "Make the exposure bright and high-key."),
    o("normal", "Even", "evenly exposed", "", "Make the exposure even."),
    o("dark", "Dark", "with a dark, low-key exposure", "low key", "Make the exposure dark and low-key."),
    o("backlit", "Backlit", "backlit", "backlighting", "Make the picture backlit."),
]

# ---------------------------------------------------------------- the collage as a whole
SHEET_STYLE = [
    o("character_sheet", "Character sheet", "character sheet", "character sheet, multiple views"),
    o("reference_sheet", "Reference sheet", "character reference sheet", "reference sheet, multiple views"),
    o("turnaround", "Turnaround", "character turnaround sheet", "character turnaround, multiple views"),
    o("collage", "Collage", "collage of photos", "collage, multiple views"),
    o("photo_grid", "Photo grid", "grid of photos", "multiple views"),
    o("comic_page", "Comic page", "comic page", "comic, multiple views"),
    o("contact_sheet", "Contact sheet", "contact sheet of photos", "multiple views"),
]
SHEET_BG = [
    o("plain_white", "Plain white", "on a plain white background", "white background"),
    o("plain_gray", "Plain gray", "on a plain light-gray background", "grey background"),
    o("plain_dark", "Plain dark", "on a plain dark background", "black background"),
    o("same_scene", "One scene", "with every panel showing the same scene", ""),
    o("each_own", "Each its own", "with each panel on its own background", ""),
]
SHEET_BORDER = [
    o("none", "None", "", ""),
    o("thin", "Thin lines", "separated by thin lines", ""),
    o("gutters", "Wide gutters", "separated by wide gutters", ""),
    o("rounded", "Rounded frames", "each in a rounded frame", ""),
]

PARTS = [
    {"id": "preset", "label": "Presets", "params": [
        param("camera", "Camera preset", [], macro=True, skip=.3),
    ]},
    {"id": "camera", "label": "Camera", "params": [
        param("height", "Height", HEIGHT, skip=.4),
        param("orbit", "Around the subject", ORBIT, skip=.35, filter_by={"p": "pose.facing", "field": "facing_fits"}),
        param("roll", "Tilt", ROLL, skip=.85, scale=False),
        param("distance", "Distance", DISTANCE, skip=.6),
    ]},
    {"id": "viewpoint", "label": "Viewpoint", "params": [
        param("special", "Special viewpoint", SPECIAL, skip=.85),
    ]},
    {"id": "framing", "label": "Framing", "params": [
        param("shot", "Framing", SHOT, skip=.3),
        param("focus", "Focus of the shot", FOCUS_ON, multi=2, skip=.8),
    ]},
    {"id": "placement", "label": "Placement", "params": [
        param("pos", "Position in the frame", POS, skip=.5),
        param("size", "Size in the frame", SIZE, skip=.6),
        param("rule", "Composition", RULE, skip=.75),
        {"id": "offset_x", "label": "Shift sideways", "type": "number", "min": -50, "max": 50, "default": 0, "skip": .9, "stages": [
            {"from": -50, "to": -31, "label": "far left"}, {"from": -30, "to": -11, "label": "left"}, {"from": -10, "to": 10, "label": "centered"},
            {"from": 11, "to": 30, "label": "right"}, {"from": 31, "to": 50, "label": "far right"}]},
        {"id": "offset_y", "label": "Shift up or down", "type": "number", "min": -50, "max": 50, "default": 0, "skip": .9, "stages": [
            {"from": -50, "to": -31, "label": "far up"}, {"from": -30, "to": -11, "label": "up"}, {"from": -10, "to": 10, "label": "centered"},
            {"from": 11, "to": 30, "label": "down"}, {"from": 31, "to": 50, "label": "far down"}]},
    ]},
    {"id": "lens", "label": "Optics", "params": [
        param("focal", "Lens", FOCAL, skip=.5),
        param("dof", "Depth of field", DOF, skip=.5),
        param("focus", "Focus", FOCUS_AT, skip=.7),
        param("camera", "Camera", CAMERA, skip=.7),
        param("effects", "Effects", EFFECTS, multi=3, skip=.7),
        param("exposure", "Exposure", EXPOSURE, skip=.8),
    ]},
    {"id": "sheet", "label": "Sheet", "params": [
        param("style", "Kind of sheet", SHEET_STYLE),
        param("background", "Background", SHEET_BG),
        param("borders", "Panel borders", SHEET_BORDER),
    ]},
    # not shown: the way the body faces the camera in the Pose Builder (the camera node reads it from the pose)
    {"id": "pose", "label": "Pose", "params": [
        param("facing", "Pose faces", [o("camera", "To the camera"), o("three_q", "Three-quarter"), o("profile", "Profile"), o("back", "Back to camera")]),
    ]},
]


# ---------------------------------------------------------------- camera presets (sets: parameter -> option id or list)
def pre(id, label, group, sets, hint="", levels=None):
    d = {"id": id, "label": label, "text": "", "group": group, "sets": sets, "core": list(sets)[:3]}
    if levels:
        d["sets_levels"] = levels
    return d


PRESETS = [
    pre("selfie", "Selfie", "Phone", {"viewpoint.special": "selfie", "framing.shot": "waist", "lens.focal": "wide", "lens.camera": "phone"}),
    pre("mirror_selfie", "Mirror selfie", "Phone", {"viewpoint.special": "mirror", "framing.shot": "cowboy", "lens.camera": "phone"}),
    pre("candid_phone", "Candid phone photo", "Phone", {"viewpoint.special": "phone_photo", "framing.shot": "cowboy", "lens.camera": "phone", "lens.dof": "deep"}),
    pre("glamour_portrait", "Glamour portrait", "Portrait", {"camera.height": "eye", "framing.shot": "portrait", "lens.focal": "portrait", "lens.dof": "very_shallow", "lens.effects": ["bokeh"]}),
    pre("close_face", "Face close-up", "Portrait", {"framing.shot": "face", "lens.focal": "portrait", "lens.dof": "very_shallow", "lens.focus": "eyes"}),
    pre("fashion_full", "Fashion full body", "Fashion", {"camera.height": "eye", "camera.orbit": "front", "framing.shot": "full", "lens.focal": "portrait", "lens.dof": "shallow", "placement.rule": "thirds"}),
    pre("candid_street", "Candid street", "Fashion", {"camera.height": "eye", "camera.orbit": "front34_l", "framing.shot": "cowboy", "lens.focal": "normal", "lens.camera": "film35", "lens.effects": ["grain"]}),
    pre("polaroid", "Polaroid snapshot", "Fashion", {"framing.shot": "cowboy", "lens.camera": "polaroid", "lens.exposure": "bright", "lens.effects": ["light_leak"]}),
    pre("hero_below", "Hero from below", "Dramatic", {"camera.height": "low", "framing.shot": "full", "lens.focal": "wide", "placement.size": "large"}),
    pre("dutch_action", "Dutch-angle action", "Dramatic", {"camera.height": "low", "camera.roll": "left", "framing.shot": "full", "lens.focal": "ultra_wide"}, levels={"camera.roll": {"left": "dutch"}}),
    pre("fisheye_fun", "Fisheye fun", "Dramatic", {"camera.height": "low", "framing.shot": "waist", "lens.focal": "fisheye"}),
    pre("low_back", "Low from behind", "Dramatic", {"camera.height": "low", "camera.orbit": "back", "framing.shot": "full"}),
    pre("over_shoulder", "Over the shoulder", "Dramatic", {"camera.height": "eye", "camera.orbit": "back34_l", "framing.shot": "waist", "lens.dof": "shallow"}),
    pre("cinematic_wide", "Cinematic wide", "Cinema", {"camera.height": "eye", "framing.shot": "full", "lens.focal": "wide", "lens.dof": "deep", "lens.camera": "cinema", "placement.size": "small", "placement.rule": "thirds"}),
    pre("negative_space", "Negative space", "Cinema", {"framing.shot": "full", "placement.pos": "left", "placement.size": "small", "placement.rule": "negative"}),
    pre("tele_compress", "Telephoto compression", "Cinema", {"camera.distance": "far", "framing.shot": "waist", "lens.focal": "tele", "lens.dof": "shallow"}),
    pre("pinup_above", "Pin-up from above", "From above", {"camera.height": "high", "framing.shot": "full", "lens.focal": "wide"}),
    pre("bed_above", "Straight down", "From above", {"camera.height": "overhead", "framing.shot": "full", "placement.pos": "center", "placement.size": "large"}),
    pre("drone_top", "Drone from above", "From above", {"viewpoint.special": "drone", "camera.height": "overhead", "framing.shot": "full", "placement.size": "small"}),
    pre("paparazzi", "Paparazzi", "Voyeur", {"viewpoint.special": "phone_photo", "framing.shot": "cowboy", "lens.focal": "tele", "lens.dof": "shallow"}),
    pre("doorway", "Through the door", "Voyeur", {"viewpoint.special": "doorway", "framing.shot": "waist", "lens.dof": "shallow"}),
    pre("cctv", "Security camera", "Voyeur", {"viewpoint.special": "cctv", "framing.shot": "full", "lens.camera": "cctv"}),
    pre("feet_close", "Feet close-up", "Close-ups", {"framing.shot": "feet", "lens.focal": "normal", "lens.dof": "shallow"}),
]
PARTS[0]["params"][0]["options"] = PRESETS

QUICK = ["camera.height", "camera.orbit", "framing.shot", "placement.pos", "placement.size", "viewpoint.special"]
ZONES = [
    {"id": "layout", "label": "Layout", "level": "both", "params": [], "custom": "layout", "collage_only": True},
    {"id": "presets", "label": "Presets", "level": "simple", "params": ["preset.camera"]},
    {"id": "quick", "label": "Shot", "level": "simple", "params": QUICK},
    {"id": "camera", "label": "Camera", "level": "advanced", "params": ["camera.height", "camera.orbit", "camera.roll", "camera.distance"]},
    {"id": "viewpoint", "label": "Viewpoint", "level": "advanced", "params": ["viewpoint.special"]},
    {"id": "framing", "label": "Framing", "level": "advanced", "params": ["framing.shot", "framing.focus"]},
    {"id": "placement", "label": "Placement", "level": "advanced", "params": ["placement.pos", "placement.size", "placement.rule", "placement.offset_x", "placement.offset_y"]},
    {"id": "lens", "label": "Optics", "level": "advanced", "params": ["lens.focal", "lens.dof", "lens.focus", "lens.camera", "lens.effects", "lens.exposure"]},
    {"id": "sheet", "label": "Sheet", "level": "both", "params": ["sheet.style", "sheet.background", "sheet.borders"], "collage_only": True},
]

DATA = {
    "version": 1,
    "sex_param": "pose.none",
    "_about": (
        "Data for ND Composition Settings (same engine as the Character Builder, see character_builder.json for the shared fields). "
        "Generated by tools/make_composition_data.py; edit this file directly to tune wording. "
        "Option fields: text (the words in the Create text, after 'shot'), tag (Danbooru), edit (an instruction for Edit mode), cap (the caption of a panel), "
        "facing_fits (camera.orbit: the ways the body faces the camera in the Pose Builder that go with this view), deg (the angle around the subject), "
        "mutes (parameters the option switches off), explicit (needs the Explicit switch), levels / default_level (a tilt: slightly or a dutch angle). "
        "Camera presets (parameter preset.camera, macro): sets (values of other parameters), core (the ones that make the preset 'modified' when changed), sets_levels. "
        "Left and right are counted from the camera, as seen in the picture. pose.facing is never shown: the camera node fills it from the Pose Builder."
    ),
    "outputs": [{"key": "Camera", "part": None}],
    "option_sets": {},
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
            P[f"{part['id']}.{p['id']}"] = {x["id"]: x for x in p.get("options", [])}
    for pr in PRESETS:
        for pid, v in pr["sets"].items():
            if pid not in P:
                errs.append(f"{pr['id']}: no parameter {pid}")
                continue
            for x in (v if isinstance(v, list) else [v]):
                if x not in P[pid]:
                    errs.append(f"{pr['id']}: {pid}={x}")
        for pid, d in (pr.get("sets_levels") or {}).items():
            for oid, lid in d.items():
                if lid not in [l["id"] for l in P[pid].get(oid, {}).get("levels", [])]:
                    errs.append(f"{pr['id']}: level {oid}.{lid}")
    ids = [p["id"] for p in PRESETS]
    errs += [f"duplicate preset {i}" for i in set(ids) if ids.count(i) > 1]
    for z in ZONES:
        for pid in z["params"]:
            if pid not in P:
                errs.append(f"zone {z['id']}: {pid}")
    for pid, opts in P.items():
        for op in opts.values():
            for m in op.get("mutes", []):
                if m not in P:
                    errs.append(f"{pid}.{op['id']} mutes {m}")
    for x in ORBIT:
        if not x.get("facing_fits"):
            errs.append(f"orbit {x['id']}: facing_fits")
    return errs


if __name__ == "__main__":
    errs = validate()
    if errs:
        print("\n".join(errs))
        sys.exit(1)
    from hints.apply import apply_dict  # the English hints live in tools/hints/hints_composition.py
    import hints.hints_composition as _hints
    apply_dict(DATA, _hints)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(dump(DATA) + "\n")
    n = sum(len(p.get("options", [])) for part in PARTS for p in part["params"])
    print(f"wrote {OUT}: {len(PARTS)} parts, {n} options, {len(PRESETS)} presets")
