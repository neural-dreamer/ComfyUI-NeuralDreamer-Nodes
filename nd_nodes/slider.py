"""
Neural Dreamer Nodes — Slider

A plain value slider with a configurable range. The node has no inputs and one
output: INT when the slider is set to integers, FLOAT otherwise. The browser
(js/slider.js) draws the slider and sets the output type; everything it shows
lives in one JSON string, the hidden `state` widget, so it is saved with the
workflow.
"""

import json
import math

from .params import ANY

DEFAULT_STATE = {"value": 0.5, "min": 0.0, "max": 1.0, "step": 0.01, "integer": False}


def _num(v, fallback):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return fallback
    return v if math.isfinite(v) else fallback


def parse_state(text):
    """Returns (value, integer) from the state JSON, snapped and clamped like the UI."""
    try:
        data = json.loads(text or "")
    except (TypeError, ValueError):
        data = {}
    if not isinstance(data, dict):
        data = {}
    s = {**DEFAULT_STATE, **data}
    integer = bool(s.get("integer"))
    lo = _num(s.get("min"), DEFAULT_STATE["min"])
    hi = _num(s.get("max"), DEFAULT_STATE["max"])
    step = _num(s.get("step"), 0.0)
    if hi < lo:
        lo, hi = hi, lo
    value = _num(s.get("value"), lo)
    if integer:
        lo, hi = round(lo), round(hi)
        step = max(1, round(step))
    elif step <= 0:
        step = 0.01
    if step > 0:
        value = lo + round((value - lo) / step) * step
    value = min(hi, max(lo, value))
    if integer:
        return int(round(value)), True
    return float(round(value, 10)), False


class NDValueSlider:
    CATEGORY = "Neural Dreamer/Utils"
    DESCRIPTION = (
        "A slider with a configurable range. The gear sets the type (integer or float), "
        "the min and max values and the step. The output is INT for integers and FLOAT otherwise."
    )
    RETURN_TYPES = (ANY,)  # the browser shows it as INT or FLOAT
    RETURN_NAMES = ("value",)
    FUNCTION = "run"
    SEARCH_ALIASES = ["slider", "value slider", "int slider", "float slider", "number"]

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"state": ("STRING", {"default": json.dumps(DEFAULT_STATE)})}}

    def run(self, state):
        value, _ = parse_state(state)
        return (value,)


NODE_CLASS_MAPPINGS = {"NDValueSlider": NDValueSlider}
NODE_DISPLAY_NAME_MAPPINGS = {"NDValueSlider": "ND Slider"}
