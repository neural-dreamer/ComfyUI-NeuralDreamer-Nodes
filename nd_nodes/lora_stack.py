"""
Neural Dreamer Nodes — the ND LoRA Stack node (class NDLoraStack)

A stack of LoRAs in one node. The list lives in the hidden text widget `stack` (JSON), which the node's own list and the
LoRA widgets of other interfaces both edit (the widget finds the node by its class name):

    [{"name": "style/foo.safetensors", "on": true, "sm": 0.8, "sc": 0.8, "link": true, "words": ["foo style"]}]

    name   file of the LoRA as ComfyUI lists it (folder `loras`)
    on     false: skipped
    sm     strength for the model;  sc: strength for the CLIP;  link: the CLIP strength follows the model strength
    words  chosen trigger words

The LoRAs are applied one after another as the core `Load LoRA` does it (comfy.sd.load_lora_for_models). The loaded files are kept
between runs (by path and modification time), so a second run does not read the disk. Without a CLIP only the model is changed.
The third output is the trigger words of the enabled LoRAs, separated by commas.
"""

import hashlib
import json
import os

CATEGORY = "Neural Dreamer/Loaders"
_CACHE_MAX = 12
_cache = {}  # (path, mtime) -> the loaded LoRA, oldest first


class LoraStackError(ValueError):
    pass


def parse_stack(text):
    """The list of entries from the text of the widget; wrong input gives a clear error."""
    if text is None or not str(text).strip():
        return []
    try:
        data = json.loads(text)
    except Exception as e:  # noqa: BLE001
        raise LoraStackError(f"[ND LoRA Stack] the list of LoRAs is not valid JSON: {e}") from None
    if not isinstance(data, list):
        raise LoraStackError("[ND LoRA Stack] the list of LoRAs must be an array")
    out = []
    for i, e in enumerate(data):
        if not isinstance(e, dict) or not str(e.get("name") or "").strip():
            raise LoraStackError(f"[ND LoRA Stack] entry {i + 1} has no LoRA name")
        sm = _num(e.get("sm", 1.0), 1.0)
        link = bool(e.get("link", True))
        out.append({
            "name": str(e["name"]),
            "on": bool(e.get("on", True)),
            "sm": sm,
            "sc": sm if link else _num(e.get("sc", sm), sm),
            "link": link,
            "words": [str(w).strip() for w in (e.get("words") or []) if str(w).strip()],
        })
    return out


def _num(v, default):
    try:
        n = float(v)
        return n if n == n and abs(n) != float("inf") else default
    except (TypeError, ValueError):
        return default


def trigger_words(entries):
    """The words of the enabled entries, no repeats, in the order of the stack."""
    seen, out = set(), []
    for e in entries:
        if not e["on"]:
            continue
        for w in e["words"]:
            if w.lower() not in seen:
                seen.add(w.lower())
                out.append(w)
    return ", ".join(out)


def _load(path):
    import comfy.utils

    key = (path, os.path.getmtime(path))
    if key in _cache:
        _cache[key] = _cache.pop(key)  # the freshest goes last
        return _cache[key]
    lora = comfy.utils.load_torch_file(path, safe_load=True)
    for k in [k for k in _cache if k[0] == path]:
        del _cache[k]
    _cache[key] = lora
    while len(_cache) > _CACHE_MAX:
        _cache.pop(next(iter(_cache)))
    return lora


class NDLoraStack:
    DESCRIPTION = (
        "A stack of LoRAs: switch each one on or off, set the strength of the model and of the CLIP (or let the CLIP follow the model), "
        "change the order. The enabled LoRAs are applied one after another. The third output holds the trigger words of the enabled LoRAs. "
        "The list in the node has pictures, video previews and ± buttons for the strength."
    )
    CATEGORY = CATEGORY
    FUNCTION = "apply"
    RETURN_TYPES = ("MODEL", "CLIP", "STRING")
    RETURN_NAMES = ("model", "clip", "trigger_words")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL", {"tooltip": "The model the LoRAs are applied to."}),
                "stack": ("STRING", {"default": "[]", "multiline": True, "tooltip": "The list of LoRAs (JSON). Edit it in the node."}),
            },
            "optional": {"clip": ("CLIP", {"tooltip": "The CLIP. Without it only the model is changed."})},
        }

    @classmethod
    def IS_CHANGED(cls, stack="[]", **_kw):
        return hashlib.sha1(str(stack).encode("utf-8")).hexdigest()

    def apply(self, model, stack="[]", clip=None):
        import comfy.sd
        import folder_paths

        entries = parse_stack(stack)
        for e in entries:
            if not e["on"] or (e["sm"] == 0 and (e["sc"] == 0 or clip is None)):
                continue
            path = folder_paths.get_full_path("loras", e["name"])
            if not path or not os.path.isfile(path):
                raise FileNotFoundError(f"[ND LoRA Stack] LoRA not found: {e['name']}")
            lora = _load(path)
            model, clip = comfy.sd.load_lora_for_models(model, clip, lora, e["sm"], e["sc"] if clip is not None else 0.0)
        return (model, clip, trigger_words(entries))


NODE_CLASS_MAPPINGS = {"NDLoraStack": NDLoraStack}
NODE_DISPLAY_NAME_MAPPINGS = {"NDLoraStack": "ND LoRA Stack"}
