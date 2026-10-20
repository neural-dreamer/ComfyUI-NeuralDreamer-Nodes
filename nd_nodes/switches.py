"""
Neural Dreamer Nodes — ND Any Switch and ND ON / OFF

ND Any Switch: many inputs of any type (in_1, in_2, ...), one output of any
type. An integer picks which input is passed on. Inputs are lazy: only the
picked one is evaluated, so e.g. only the picked model loader runs.

ND ON / OFF: passes one value through (toggle on) or drops it (toggle off).

The browser side (js/switches.js) adds the dynamic pins, and — for the usual
case of a toggle / index set in the node itself (or fed by a Primitive node) —
rewrites the prompt it sends: a dropped value becomes a *missing link* for the
nodes that were fed by the switch, so an optional input there is simply "not
connected" instead of receiving a None. The code below is what runs when the
control is wired from a computed value, or when the prompt comes from
somewhere else (the API): a dropped value is None, and nothing raises.
"""

import logging

log = logging.getLogger("NeuralDreamer")

MAX_INPUTS = 64


class AnyType(str):
    """Matches every type, so any output can be connected."""

    def __ne__(self, other):
        return False


ANY = AnyType("*")


class NDAnySwitch:
    CATEGORY = "Neural Dreamer/Logic"
    DESCRIPTION = (
        "Passes on one of its inputs, picked by the index (1 = the first pin). A new pin appears as "
        "soon as the last one is connected; every pin takes any type. Only the picked input is "
        "evaluated, the others are ignored as if they led nowhere (e.g. only the picked model loader "
        "runs). If the picked pin is empty, the output is empty too, without an error."
    )
    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("out",)
    FUNCTION = "switch"
    SEARCH_ALIASES = ["any switch", "switch", "select input", "selector", "input switch"]

    @classmethod
    def INPUT_TYPES(cls):
        optional = {f"in_{i}": (ANY, {"lazy": True}) for i in range(1, MAX_INPUTS + 1)}
        return {
            "required": {
                "index": ("INT", {
                    "default": 1, "min": 1, "max": MAX_INPUTS, "step": 1,
                    "tooltip": "Which input is passed on: 1 is the first pin, 2 the second, and so on.",
                }),
            },
            "optional": optional,
        }

    @classmethod
    def VALIDATE_INPUTS(cls, input_types):
        return True

    @staticmethod
    def _key(index):
        try:
            return f"in_{int(index)}"
        except (TypeError, ValueError):
            return ""

    def check_lazy_status(self, index=1, **kwargs):
        key = self._key(index)
        # the picked input, when it is connected and not evaluated yet
        return [key] if key in kwargs and kwargs[key] is None else []

    def switch(self, index=1, **kwargs):
        return (kwargs.get(self._key(index)),)


class NDOnOff:
    CATEGORY = "Neural Dreamer/Logic"
    DESCRIPTION = (
        "Passes the value through when the toggle is true. When it is false nothing comes out, as if "
        "the wire after this node did not exist: an optional input fed by it is just not connected. "
        "The output takes the type of what is connected."
    )
    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("out",)
    FUNCTION = "run"
    SEARCH_ALIASES = ["on off", "on/off", "gate", "enable", "disable", "toggle", "pass through"]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "condition": ("BOOLEAN", {
                    "default": True, "label_on": "true", "label_off": "false",
                    "tooltip": "true: the value passes. false: nothing comes out.",
                }),
            },
            "optional": {"value": (ANY, {"lazy": True})},
        }

    @classmethod
    def VALIDATE_INPUTS(cls, input_types):
        return True

    def check_lazy_status(self, condition=True, **kwargs):
        # when it is off the input is not evaluated at all
        return ["value"] if condition and "value" in kwargs and kwargs["value"] is None else []

    def run(self, condition=True, **kwargs):
        return (kwargs.get("value") if condition else None,)


NODE_CLASS_MAPPINGS = {"NDAnySwitch": NDAnySwitch, "NDOnOff": NDOnOff}
NODE_DISPLAY_NAME_MAPPINGS = {"NDAnySwitch": "ND Any Switch", "NDOnOff": "ND ON / OFF"}
