"""
Neural Dreamer Nodes — Show Any As Text
Shows any value as readable text. The node UI adds note tabs (see js/show_any_text.js).
"""

import json

MAX_CHARS = 100_000     # text sent to the UI
MAX_ITEMS = 100         # list / dict entries shown per level
MAX_DEPTH = 6


class AnyType(str):
    """Matches every type, so any output can be connected."""

    def __ne__(self, other):
        return False


ANY = AnyType("*")


def _describe_array(v, kind):
    shape = list(getattr(v, "shape", []))
    dtype = str(getattr(v, "dtype", "")).replace("torch.", "")
    text = f"{kind}(shape={shape}, dtype={dtype}"
    device = getattr(v, "device", None)
    if device is not None and kind == "Tensor":
        text += f", device={device}"
    try:
        size = int(v.numel()) if kind == "Tensor" else int(v.size)
        if 0 < size <= 16:
            values = v.detach().cpu().tolist() if kind == "Tensor" else v.tolist()
            text += f", values={values}"
        elif size > 0 and (kind != "Tensor" or v.dtype.is_floating_point):
            data = v.detach().float() if kind == "Tensor" else v.astype("float64")
            text += f", min={float(data.min()):.4g}, max={float(data.max()):.4g}, mean={float(data.mean()):.4g}"
    except Exception:  # noqa: BLE001
        pass
    return text + ")"


def _to_plain(v, depth=0):
    """Converts a value into JSON-friendly data, describing tensors instead of dumping them."""
    try:
        import torch

        if isinstance(v, torch.Tensor):
            return _describe_array(v, "Tensor")
    except ImportError:
        pass
    try:
        import numpy as np

        if isinstance(v, np.ndarray):
            return _describe_array(v, "ndarray")
        if isinstance(v, np.generic):
            return v.item()
    except ImportError:
        pass

    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    if depth >= MAX_DEPTH:
        return f"<{type(v).__name__}>"
    if isinstance(v, dict):
        out = {}
        for i, (k, val) in enumerate(v.items()):
            if i >= MAX_ITEMS:
                out["…"] = f"{len(v) - MAX_ITEMS} more"
                break
            out[str(k)] = _to_plain(val, depth + 1)
        return out
    if isinstance(v, (list, tuple, set)):
        items = list(v)
        out = [_to_plain(x, depth + 1) for x in items[:MAX_ITEMS]]
        if len(items) > MAX_ITEMS:
            out.append(f"… {len(items) - MAX_ITEMS} more")
        return out
    text = repr(v)
    return text if len(text) <= 500 else text[:500] + "…"


def to_text(v):
    if isinstance(v, str):
        return v
    plain = _to_plain(v)
    if isinstance(plain, str):
        return plain
    if plain is None or isinstance(plain, (bool, int, float)):
        return str(plain)
    return json.dumps(plain, indent=2, ensure_ascii=False, default=str)


class NDShowAnyAsText:
    """Displays any input as text, with extra note tabs in the node UI."""

    CATEGORY = "Neural Dreamer/Utils"
    DESCRIPTION = (
        "Shows any connected value as text: strings as is, numbers and booleans as values, "
        "lists and dicts as JSON, tensors as shape/dtype with basic stats. The first tab is "
        "the preview; use + to add note tabs, which are saved with the workflow."
    )
    RETURN_TYPES = ()
    FUNCTION = "run"
    OUTPUT_NODE = True
    INPUT_IS_LIST = True

    @classmethod
    def INPUT_TYPES(cls):
        return {"optional": {"value": (ANY, {})}}

    @classmethod
    def VALIDATE_INPUTS(cls, input_types):
        # accept any connected type
        return True

    def run(self, value=None):
        if value is None:
            text = ""
        elif len(value) == 1:
            text = to_text(value[0])
        else:
            text = "\n\n".join(f"--- {i + 1} / {len(value)} ---\n{to_text(v)}" for i, v in enumerate(value))
        if len(text) > MAX_CHARS:
            text = text[:MAX_CHARS] + f"\n\n… truncated ({len(text) - MAX_CHARS} more characters)"
        return {"ui": {"nd_text": [text]}}


NODE_CLASS_MAPPINGS = {
    "NDShowAnyAsText": NDShowAnyAsText,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NDShowAnyAsText": "ND Show Any As Text",
}
