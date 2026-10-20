"""
Neural Dreamer Nodes — Pack / Unpack Parameters

A parameters bundle (type ND_PARAMS) is an ordered {name: value} mapping that
travels on one wire. Bundles can be nested: a value inside a bundle can itself
be a bundle, which another Unpack Parameters opens ("matryoshka").

The browser side (js/params.js) shows only the sockets in use: Pack grows a new
input as each one is connected, and Unpack builds its outputs by tracing its
input wire back to whatever produced the bundle.
"""

import json
import logging

PARAMS = "ND_PARAMS"
MAX_FIELDS = 64

log = logging.getLogger("NeuralDreamer")


class AnyType(str):
    """Matches every type, so any output can be connected."""

    def __ne__(self, other):
        return False


ANY = AnyType("*")


class NDParams(dict):
    """An ordered name -> value mapping carried by an ND_PARAMS wire."""


def _json_list(text):
    try:
        data = json.loads(text or "[]")
        return data if isinstance(data, list) else []
    except (TypeError, ValueError):
        return []


class NDPack:
    CATEGORY = "Neural Dreamer/Parameters"
    DESCRIPTION = (
        "Packs any values into one ND_PARAMS wire. A new input appears as soon as the last "
        "one is connected; each field is named after what is connected to it (rename an "
        "input to rename its field). Open the bundle with Unpack Parameters."
    )
    RETURN_TYPES = (PARAMS,)
    RETURN_NAMES = ("params",)
    FUNCTION = "pack"
    # The node search that opens when a wire is dragged out ranks equally popular
    # nodes by their shortest name (class key or display name), so the short key
    # "NDPack" puts this node first for parameters inputs. Keep other keys longer.
    SEARCH_ALIASES = ["pack", "bundle", "pack parameters"]

    @classmethod
    def INPUT_TYPES(cls):
        optional = {f"in_{i}": (ANY, {}) for i in range(1, MAX_FIELDS + 1)}
        # written by the browser: [{"slot": "in_3", "name": "image"}, ...]
        optional["names"] = ("STRING", {"default": "[]"})
        return {"required": {}, "optional": optional}

    @classmethod
    def VALIDATE_INPUTS(cls, input_types):
        return True

    def pack(self, names="[]", **kwargs):
        packed = NDParams()
        for entry in _json_list(names):
            if not isinstance(entry, dict):
                continue
            slot, name = str(entry.get("slot", "")), str(entry.get("name", "")).strip()
            if not slot or not name:
                continue
            if name in packed:
                log.warning("[Neural Dreamer] Pack Parameters: field %r is listed twice, the last one wins", name)
            packed[name] = kwargs.get(slot)
        return (packed,)


class NDUnpack:
    CATEGORY = "Neural Dreamer/Parameters"
    DESCRIPTION = (
        "Opens an ND_PARAMS bundle: one output per field, named after the field. Outputs are "
        "built automatically from the node that produced the bundle (Pack Parameters, Load "
        "Images or another Unpack). A field that is itself a bundle can be opened with "
        "another Unpack Parameters."
    )
    RETURN_TYPES = (ANY,) * MAX_FIELDS
    RETURN_NAMES = tuple(f"out_{i}" for i in range(1, MAX_FIELDS + 1))
    FUNCTION = "unpack"
    # short class key "NDUnpack": first in the search list when a parameters
    # output is dragged out (see NDPack)
    SEARCH_ALIASES = ["unpack", "unbundle", "unpack parameters"]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"params": (PARAMS,)},
            # written by the browser: the field names in output order
            "optional": {"names": ("STRING", {"default": "[]"})},
        }

    def unpack(self, params, names="[]"):
        if params is None:
            raise ValueError("Unpack Parameters: nothing came in. Connect a Pack Parameters or Load Images output.")
        if not isinstance(params, dict):
            raise ValueError(
                f"Unpack Parameters: expected a parameters bundle, got {type(params).__name__}."
            )
        wanted = [str(n) for n in _json_list(names)][:MAX_FIELDS]
        if wanted:
            missing = [n for n in wanted if n not in params]
            if missing:
                log.info("[Neural Dreamer] Unpack Parameters: %s not in the bundle, output None", ", ".join(missing))
            values = [params.get(n) for n in wanted]
        else:
            values = list(params.values())[:MAX_FIELDS]
        values += [None] * (MAX_FIELDS - len(values))
        return tuple(values)


NODE_CLASS_MAPPINGS = {
    "NDPack": NDPack,
    "NDUnpack": NDUnpack,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NDPack": "ND Pack Parameters",
    "NDUnpack": "ND Unpack Parameters",
}
