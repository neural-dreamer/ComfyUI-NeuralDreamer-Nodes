"""
Neural Dreamer Nodes — ND Multi Switch

Two columns of inputs (true_1, true_2, ... and false_1, false_2, ...) and one
output per pair (out_1, out_2, ...). A toggle picks the column the outputs are
taken from: out_N = true_N when the toggle is on, false_N when it is off.

The browser side (js/multi_switch.js) shows only the pairs in use: a new pair
appears as soon as the last one is connected, and each pair takes the data type
of the first wire connected to it (its two inputs and its output then share
that type; pairs are independent of each other).

Inputs are lazy: only the column that is selected is evaluated, so the nodes
that feed the other column are not run just for the switch.
"""

import logging

log = logging.getLogger("NeuralDreamer")

MAX_PAIRS = 32

try:  # moved between ComfyUI versions
    from comfy_execution.graph_utils import ExecutionBlocker
except Exception:  # noqa: BLE001
    try:
        from comfy_execution.graph import ExecutionBlocker
    except Exception:  # noqa: BLE001
        ExecutionBlocker = None


class AnyType(str):
    """Matches every type, so any output can be connected."""

    def __ne__(self, other):
        return False


ANY = AnyType("*")


def _blocked():
    # A silent block: nodes fed by this output are skipped, with no error.
    return ExecutionBlocker(None) if ExecutionBlocker is not None else None


class NDMultiSwitch:
    CATEGORY = "Neural Dreamer/Logic"
    DESCRIPTION = (
        "Switches whole groups of values at once. Connect values to the true_N and false_N inputs "
        "(a new pair appears as soon as the last one is connected); out_N is taken from true_N or "
        "false_N depending on the toggle. Every pair has its own data type, set by the first wire "
        "connected to it. Only the selected side is evaluated. If the selected side of a pair has "
        "nothing connected, that output blocks the nodes after it."
    )
    RETURN_TYPES = (ANY,) * MAX_PAIRS
    RETURN_NAMES = tuple(f"out_{i}" for i in range(1, MAX_PAIRS + 1))
    FUNCTION = "switch"
    SEARCH_ALIASES = ["multi switch", "switch", "if else", "true false", "selector"]

    @classmethod
    def INPUT_TYPES(cls):
        optional = {}
        for i in range(1, MAX_PAIRS + 1):
            optional[f"true_{i}"] = (ANY, {"lazy": True})
            optional[f"false_{i}"] = (ANY, {"lazy": True})
        return {
            "required": {
                "condition": ("BOOLEAN", {
                    "default": True,
                    "label_on": "true",
                    "label_off": "false",
                    "tooltip": "true: the outputs come from the true inputs. false: from the false inputs.",
                }),
            },
            "optional": optional,
        }

    @classmethod
    def VALIDATE_INPUTS(cls, input_types):
        # every data type is accepted on every pin
        return True

    def check_lazy_status(self, condition=True, **kwargs):
        side = "true_" if condition else "false_"
        # connected inputs of the selected side that have not been evaluated yet
        return [k for k, v in kwargs.items() if k.startswith(side) and v is None]

    def switch(self, condition=True, **kwargs):
        side, other = ("true_", "false_") if condition else ("false_", "true_")
        out = []
        for i in range(1, MAX_PAIRS + 1):
            if f"{side}{i}" in kwargs:
                out.append(kwargs[f"{side}{i}"])
            elif f"{other}{i}" in kwargs:
                out.append(_blocked())  # the pair is in use, but not on the selected side
            else:
                out.append(None)
        return tuple(out)


NODE_CLASS_MAPPINGS = {"NDMultiSwitch": NDMultiSwitch}
NODE_DISPLAY_NAME_MAPPINGS = {"NDMultiSwitch": "ND Multi Switch"}
