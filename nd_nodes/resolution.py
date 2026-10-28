"""
Neural Dreamer Nodes — ND Resolution

Sets an image size from an aspect ratio and one number. The aspect ratio is a preset
or a typed ratio ("21:9"); the number is read as megapixels, as the long side or as the
short side, whichever method the settings (the gear) are set to. Both sides are rounded
to a multiple of 8 / 16 / 32 / 64.

Everything the UI shows lives in one JSON string, the hidden `state` widget, so it is
saved with the workflow. The browser (js/resolution.js) computes the same size for the
display; the rules below are the ones it mirrors.

Output: one ND_PARAMS wire {width, height} — open it with Unpack Parameters.
"""

import json
import math
import re

from .params import PARAMS, NDParams

PRESETS = ["1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "21:9", "9:21"]
CUSTOM = "custom"
METHODS = ["megapixels", "long side", "short side"]
MULTIPLES = [8, 16, 32, 64]

# 1 megapixel = 1024 x 1024 pixels, as in ComfyUI's "Scale Image to Total Pixels"
MP_PIXELS = 1024 * 1024
MP_RANGE = (0.01, 64.0)
SIDE_RANGE = (16, 16384)

DEFAULT_STATE = {
    "version": 1,
    "ratio": "1:1",        # a preset, or "custom" (then `custom` is used)
    "custom": "21:9",
    "method": "megapixels",
    "mp": 1.0,
    "long": 1024,
    "short": 1024,
    "multiple": 16,
    "show_custom": False,  # UI only: keep the Custom Ratio field visible
}

_RATIO = re.compile(r"(\d+(?:\.\d+)?)\s*[:/x×]\s*(\d+(?:\.\d+)?)")


def parse_ratio(text):
    """'21:9', '21/9', '21x9' or a single number ('2.39' = 2.39:1) -> (a, b), or None."""
    t = str(text or "").strip().lower().replace(",", ".")
    m = _RATIO.fullmatch(t)
    try:
        if m:
            a, b = float(m.group(1)), float(m.group(2))
        else:
            a, b = float(t), 1.0
    except ValueError:
        return None
    if not (math.isfinite(a) and math.isfinite(b)) or a <= 0 or b <= 0:
        return None
    return a, b


def _num(v, fallback):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return fallback
    return v if math.isfinite(v) else fallback


def normalize(raw):
    if isinstance(raw, str):
        try:
            raw = json.loads(raw or "")
        except ValueError:
            raw = {}
    s = {**DEFAULT_STATE, **(raw if isinstance(raw, dict) else {})}
    if s["ratio"] != CUSTOM and s["ratio"] not in PRESETS:
        s["ratio"] = DEFAULT_STATE["ratio"]
    s["custom"] = str(s.get("custom") if s.get("custom") is not None else "")
    if s["method"] not in METHODS:
        s["method"] = DEFAULT_STATE["method"]
    s["mp"] = min(MP_RANGE[1], max(MP_RANGE[0], _num(s["mp"], DEFAULT_STATE["mp"])))
    for k in ("long", "short"):
        s[k] = int(min(SIDE_RANGE[1], max(SIDE_RANGE[0], round(_num(s[k], DEFAULT_STATE[k])))))
    s["multiple"] = int(s["multiple"]) if s["multiple"] in MULTIPLES else DEFAULT_STATE["multiple"]
    s["show_custom"] = s.get("show_custom") is True
    return s


def ratio_of(s):
    """(a, b) of the state, or None when the typed ratio cannot be read."""
    return parse_ratio(s["custom"]) if s["ratio"] == CUSTOM else parse_ratio(s["ratio"])


def compute(s):
    """(width, height) of a normalized state; None when the ratio cannot be read."""
    ab = ratio_of(s)
    if ab is None:
        return None
    r = ab[0] / ab[1]
    if s["method"] == "megapixels":
        h = math.sqrt(s["mp"] * MP_PIXELS / r)
        w = h * r
    elif s["method"] == "long side":
        n = s["long"]
        w, h = (n, n / r) if r >= 1 else (n * r, n)
    else:
        n = s["short"]
        w, h = (n * r, n) if r >= 1 else (n, n / r)
    m = s["multiple"]

    def q(v):  # round to the nearest multiple (halves up), at least one multiple
        return max(m, int(math.floor(v / m + 0.5)) * m)

    return q(w), q(h)


class NDResolution:
    CATEGORY = "Neural Dreamer/Images"
    DESCRIPTION = (
        "Sets an image size from an aspect ratio (a preset, or typed like 21:9) and one number, "
        "which is megapixels (1 = 1024 x 1024 pixels), the long side or the short side - the method is "
        "chosen in the settings (gear), together with the multiple both sides are rounded to. "
        "Output: one parameters wire with 'width' and 'height' - open it with Unpack Parameters."
    )
    RETURN_TYPES = (PARAMS,)
    RETURN_NAMES = ("params",)
    FUNCTION = "run"
    SEARCH_ALIASES = ["resolution", "aspect ratio", "image size", "width height", "megapixels"]

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"state": ("STRING", {"default": json.dumps(DEFAULT_STATE)})}}

    def run(self, state):
        s = normalize(state)
        size = compute(s)
        if size is None:
            raise ValueError(
                f"ND Resolution: cannot read the aspect ratio {s['custom']!r}. Type it like 21:9 (or 16/9, or 2.39)."
            )
        return (NDParams(width=size[0], height=size[1]),)


NODE_CLASS_MAPPINGS = {"NDResolution": NDResolution}
NODE_DISPLAY_NAME_MAPPINGS = {"NDResolution": "ND Resolution"}
