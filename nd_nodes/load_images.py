"""
Neural Dreamer Nodes — Load Images (modular)

ND Load Images holds 1–20 image blocks. Everything the UI sets (files, mask,
crop/rotate/flip, Keep Proportion, slider, enabled, per-block options) lives in
one JSON string, the hidden `state` widget, so it is saved with the workflow.

Per block, in this order:
  1. load the image (the mask editor's file when a mask was drawn: its RGB is the
     image, its alpha the mask, as with the stock Load Image node)
  2. rotate (clockwise) -> flip -> crop, applied to image and mask alike
  3. Keep Proportion to the target size, if the block applies it, resizing with
     the block's scaling method. The target size is width/height from the input;
     without them it is the size of the first enabled block's image (after step 2).

Input: one optional ND_PARAMS wire with the fields "width" and "height" (from a Pack
Parameters, which creates these pins when connected).
Output: one ND_PARAMS wire {"Image N Parameters": {image, mask, keep_proportion,
<slider name>, enabled}} — open it with Unpack Parameters.

Per-pin caching: ComfyUI caches a node by the inputs of its whole ancestry, so a
change anywhere in the `state` JSON (a slider, say) would re-run everything after
this node. When a prompt is queued, the browser (js/load_images.js) therefore
re-points every node fed through Unpack Parameters to an internal
NDLoadImagesPart that gets only the data of that one value (one block's image,
its slider value, ...). Each output then re-runs only when its own data changes.
"""

import hashlib
import json
import os

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageOps

import folder_paths

try:
    from server import PromptServer
except Exception:  # noqa: BLE001
    PromptServer = None

from .params import ANY, PARAMS, NDParams

MAX_BLOCKS = 20
DEFAULT_IMAGE = "example.png"
KEEP_MODES = ["crop", "pad white", "pad black", "pad edge", "pad edge color", "stretch"]
SCALE_METHODS = ["nearest-exact", "bilinear", "area", "bicubic", "lanczos"]
RESERVED = {"image", "mask", "keep_proportion", "enabled"}

DEFAULT_SETTINGS = {
    "maskButton": True,
    "keepEnabled": True,
    "keepApply": True,
    "scaleMethod": "lanczos",
    "sliderEnabled": True,
    "sliderName": "Strength",
    "sliderMin": 0.0,
    "sliderMax": 1.0,
    "sliderStep": 0.1,
    "lockOrder": False,  # only used by the browser: the block cannot be dragged
}


def default_block(i=0):
    return {
        "id": f"b{i}",
        "enabled": True,
        "image": DEFAULT_IMAGE,
        "masked": None,
        "edit": {"rotate": 0, "flipH": False, "flipV": False, "crop": None},
        "keep": "crop",
        "slider": 1.0,
        "settings": dict(DEFAULT_SETTINGS),
    }


DEFAULT_STATE = json.dumps({"version": 1, "hideBlockSettings": False, "blocks": [default_block(0)]})


def slider_key(settings):
    """Field name of a block's slider (the same rule is used in the browser)."""
    name = str(settings.get("sliderName") or "").strip() or "slider"
    return "slider" if name in RESERVED else name


def parse_state(text):
    try:
        state = json.loads(text or "")
    except (TypeError, ValueError):
        state = {}
    if not isinstance(state, dict):
        state = {}
    blocks = state.get("blocks")
    if not isinstance(blocks, list) or not blocks:
        blocks = [default_block(0)]
    clean = []
    for i, b in enumerate(blocks[:MAX_BLOCKS]):
        if not isinstance(b, dict):
            b = {}
        base = default_block(i)
        base.update({k: v for k, v in b.items() if k in base})
        base["settings"] = {**DEFAULT_SETTINGS, **(b.get("settings") or {})}
        edit = b.get("edit") if isinstance(b.get("edit"), dict) else {}
        base["edit"] = {**default_block(i)["edit"], **edit}
        if base["keep"] not in KEEP_MODES:
            base["keep"] = "crop"
        if base["settings"].get("scaleMethod") not in SCALE_METHODS:
            base["settings"]["scaleMethod"] = DEFAULT_SETTINGS["scaleMethod"]
        clean.append(base)
    state["blocks"] = clean
    return state


def _source_name(block):
    return block.get("masked") or block.get("image") or DEFAULT_IMAGE


def _image_path(name):
    name = str(name or "").strip()
    if not name:
        return None
    try:
        # plain names resolve to the input folder; ComfyUI rejects paths that leave it
        path = folder_paths.get_annotated_filepath(name)
    except Exception:  # noqa: BLE001
        return None
    return path if os.path.isfile(path) else None


# ------------------------------------------------------------------ loading

def load_image_and_mask(name):
    """(image [H,W,3] float, mask [H,W] float); mask = 1 - alpha, zeros without alpha."""
    path = _image_path(name)
    if path is None:
        if os.path.basename(str(name)) == DEFAULT_IMAGE:
            img = torch.zeros((512, 512, 3), dtype=torch.float32)
            return img, torch.zeros((512, 512), dtype=torch.float32)
        raise FileNotFoundError(f"Load Images: file not found in the input folder: {name}")
    with Image.open(path) as im:
        try:
            im.seek(0)
        except EOFError:
            pass
        im = ImageOps.exif_transpose(im)
        if im.mode == "I":
            im = im.point(lambda v: v * (1 / 255))
        rgb = np.asarray(im.convert("RGB"), dtype=np.float32) / 255.0
        if "A" in im.getbands():
            alpha = np.asarray(im.getchannel("A"), dtype=np.float32) / 255.0
            mask = 1.0 - alpha
        else:
            mask = np.zeros(rgb.shape[:2], dtype=np.float32)
    return torch.from_numpy(rgb), torch.from_numpy(mask)


# ------------------------------------------------------------------ editing

def apply_edit(image, mask, edit):
    """rotate (clockwise, multiples of 90) -> flip -> crop (normalized x, y, w, h)."""
    k = (int(edit.get("rotate") or 0) // 90) % 4
    if k:
        image = torch.rot90(image, k=-k, dims=(0, 1))
        mask = torch.rot90(mask, k=-k, dims=(0, 1))
    if edit.get("flipH"):
        image, mask = torch.flip(image, dims=[1]), torch.flip(mask, dims=[1])
    if edit.get("flipV"):
        image, mask = torch.flip(image, dims=[0]), torch.flip(mask, dims=[0])
    crop = edit.get("crop")
    if isinstance(crop, (list, tuple)) and len(crop) == 4:
        h, w = image.shape[:2]
        x, y, cw, ch = (float(v) for v in crop)
        x0 = int(round(max(0.0, min(1.0, x)) * w))
        y0 = int(round(max(0.0, min(1.0, y)) * h))
        x1 = int(round(max(0.0, min(1.0, x + cw)) * w))
        y1 = int(round(max(0.0, min(1.0, y + ch)) * h))
        x1, y1 = max(x1, x0 + 1), max(y1, y0 + 1)
        x1, y1 = min(x1, w), min(y1, h)
        x0, y0 = min(x0, x1 - 1), min(y0, y1 - 1)
        image, mask = image[y0:y1, x0:x1], mask[y0:y1, x0:x1]
    return image.contiguous(), mask.contiguous()


def _lanczos(x, h, w):
    """x: [1,C,H,W] -> [1,C,h,w], Lanczos per channel in float precision (Pillow)."""
    planes = x[0].detach().cpu().float().numpy()
    out = np.stack([
        np.asarray(Image.fromarray(np.ascontiguousarray(p, dtype=np.float32)).resize((w, h), Image.Resampling.LANCZOS))
        for p in planes
    ])
    return torch.from_numpy(out).unsqueeze(0).to(x.device)


def _resize(t, h, w, method="bilinear"):
    """t: [H,W,C] or [H,W] -> resized to (h, w) with one of SCALE_METHODS."""
    is_mask = t.dim() == 2
    x = t.unsqueeze(-1) if is_mask else t
    x = x.permute(2, 0, 1).unsqueeze(0)
    if tuple(x.shape[-2:]) != (h, w):
        if method == "lanczos":
            x = _lanczos(x, h, w)
        elif method in ("bilinear", "bicubic"):
            down = h < x.shape[-2] or w < x.shape[-1]
            x = F.interpolate(x, size=(h, w), mode=method, align_corners=False, antialias=down)
        else:  # nearest-exact, area
            x = F.interpolate(x, size=(h, w), mode=method if method in SCALE_METHODS else "bilinear")
    # bicubic and lanczos overshoot at hard edges
    x = x.squeeze(0).permute(1, 2, 0).clamp(0.0, 1.0)
    return x[..., 0] if is_mask else x


def keep_proportion(image, mask, mode, tw, th, method="lanczos"):
    h, w = image.shape[:2]
    if mode == "stretch":
        return _resize(image, th, tw, method), _resize(mask, th, tw, method)
    if mode == "crop":
        s = max(tw / w, th / h)
        nw, nh = max(tw, round(w * s)), max(th, round(h * s))
        image, mask = _resize(image, nh, nw, method), _resize(mask, nh, nw, method)
        x0, y0 = (nw - tw) // 2, (nh - th) // 2
        return image[y0:y0 + th, x0:x0 + tw].contiguous(), mask[y0:y0 + th, x0:x0 + tw].contiguous()
    # pad modes: fit inside, then pad to the target size
    s = min(tw / w, th / h)
    nw, nh = max(1, min(tw, round(w * s))), max(1, min(th, round(h * s)))
    image, mask = _resize(image, nh, nw, method), _resize(mask, nh, nw, method)
    left, top = (tw - nw) // 2, (th - nh) // 2
    pad = (left, tw - nw - left, top, th - nh - top)
    img = image.permute(2, 0, 1).unsqueeze(0)
    msk = mask.unsqueeze(0).unsqueeze(0)
    if mode == "pad edge color":
        return _pad_edge_color(image, pad), F.pad(msk, pad, mode="constant", value=0.0)[0, 0].contiguous()
    if mode == "pad edge":
        img = F.pad(img, pad, mode="replicate")
        msk = F.pad(msk, pad, mode="replicate")
    else:
        img = F.pad(img, pad, mode="constant", value=1.0 if mode == "pad white" else 0.0)
        msk = F.pad(msk, pad, mode="constant", value=0.0)
    return img.squeeze(0).permute(1, 2, 0).contiguous(), msk[0, 0].contiguous()


def _pad_edge_color(image, pad):
    """Pad [H,W,C] with solid colors: each side gets the average color of the image
    edge next to it (left column, right column, top row, bottom row)."""
    left, right, top, bottom = pad
    h, w, c = image.shape
    out = image.new_zeros((h + top + bottom, w + left + right, c))
    if left:
        out[:, :left] = image[:, 0].mean(dim=0)
    if right:
        out[:, left + w:] = image[:, -1].mean(dim=0)
    if top:
        out[:top] = image[0].mean(dim=0)
    if bottom:
        out[top + h:] = image[-1].mean(dim=0)
    out[top:top + h, left:left + w] = image
    return out.contiguous()


def _resolution(value):
    if isinstance(value, dict):
        w, h = value.get("width"), value.get("height")
    elif isinstance(value, (list, tuple)) and len(value) >= 2:
        w, h = value[0], value[1]
    else:
        return None
    try:
        w, h = int(w), int(h)
    except (TypeError, ValueError):
        return None
    return (w, h) if w > 0 and h > 0 else None


def prepare_block(block):
    """Load the block's image and mask and apply its edits (steps 1-2)."""
    image, mask = load_image_and_mask(_source_name(block))
    if mask.shape != image.shape[:2]:
        mask = _resize(mask, image.shape[0], image.shape[1])
    return apply_edit(image, mask, block["edit"])


def target_size(resolution, blocks, prepared):
    """Input width/height, otherwise the size of the first enabled block's image."""
    if resolution:
        return resolution
    for block, (image, _mask) in zip(blocks, prepared):
        if block.get("enabled", True):
            return int(image.shape[1]), int(image.shape[0])
    return None


def block_scalars(block):
    """The block's fields that need no image: keep_proportion, the slider value, enabled."""
    s = block["settings"]
    out = NDParams()
    if s.get("keepEnabled"):
        out["keep_proportion"] = block.get("keep", "crop")
    if s.get("sliderEnabled"):
        out[slider_key(s)] = float(block.get("slider", 0.0))
    out["enabled"] = bool(block.get("enabled", True))
    return out


def process_block(block, resolution, prepared=None):
    s = block["settings"]
    image, mask = prepared if prepared is not None else prepare_block(block)
    keep = block.get("keep", "crop")
    if s.get("keepEnabled") and s.get("keepApply") and resolution:
        image, mask = keep_proportion(image, mask, keep, resolution[0], resolution[1], s.get("scaleMethod", "lanczos"))

    out = NDParams()
    out["image"] = image.unsqueeze(0)
    out["mask"] = mask.unsqueeze(0)
    out.update(block_scalars(block))
    return out


def report_size(owner, resolution):
    """Tells the browser the target size used, for the eye preview of the blocks."""
    if PromptServer is None or not owner or not resolution:
        return
    try:
        PromptServer.instance.send_sync(
            "nd_load_images_size", {"node": str(owner), "width": int(resolution[0]), "height": int(resolution[1])}
        )
    except Exception:  # noqa: BLE001
        pass


def _files_signature(h, blocks):
    for b in blocks:
        p = _image_path(_source_name(b))
        if p:
            st = os.stat(p)
            h.update(f"{p}:{st.st_mtime_ns}:{st.st_size}".encode("utf-8"))


# -------------------------------------------------------------------- nodes

class NDLoadImages:
    CATEGORY = "Neural Dreamer/Images"
    DESCRIPTION = (
        "Loads 1-20 images, each in its own block with upload/drop, mask editor, crop/rotate/flip "
        "editor, Keep Proportion and a slider. Input: an optional parameters wire with 'width' and "
        "'height' (a Pack Parameters creates these pins when connected); without them the target "
        "size is the size of the first enabled image. "
        "Output: one parameters wire - open it with Unpack Parameters to get 'Image N Parameters', "
        "and open those again for image, mask, keep_proportion, the slider value and enabled. "
        "Block count and options are in the settings."
    )
    RETURN_TYPES = (PARAMS,)
    RETURN_NAMES = ("params",)
    FUNCTION = "load"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"state": ("STRING", {"default": DEFAULT_STATE})},
            "optional": {"params": (PARAMS,)},
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    @classmethod
    def IS_CHANGED(cls, state, params=None, unique_id=None):
        h = hashlib.sha256(str(state).encode("utf-8"))
        _files_signature(h, parse_state(state)["blocks"])
        return h.hexdigest()

    @classmethod
    def VALIDATE_INPUTS(cls, state):
        for i, b in enumerate(parse_state(state)["blocks"], start=1):
            name = _source_name(b)
            if _image_path(name) is None and os.path.basename(str(name)) != DEFAULT_IMAGE:
                return f"Load Images, block {i}: file not found in the input folder: {name}"
        return True

    def load(self, state, params=None, unique_id=None):
        blocks = parse_state(state)["blocks"]
        prepared = [prepare_block(b) for b in blocks]
        res = target_size(_resolution(params), blocks, prepared)
        report_size(unique_id, res)
        out = NDParams()
        for i, (b, p) in enumerate(zip(blocks, prepared), start=1):
            out[f"Image {i} Parameters"] = process_block(b, res, p)
        return (out,)


BLOCK_FIELD = "*"  # NDLoadImagesPart field for the whole "Image N Parameters" bundle
IMAGE_FIELDS = {"image", "mask", BLOCK_FIELD}


def _parse_block(text):
    try:
        data = json.loads(text or "")
    except (TypeError, ValueError):
        data = None
    return parse_state(json.dumps({"blocks": [data if isinstance(data, dict) else {}]}))["blocks"][0]


class NDLoadImagesPart:
    """
    Internal node. When a prompt is queued, the browser re-points every node fed by an
    ND Load Images (through Unpack Parameters) to one of these. It gets only the data
    of that one value — one block (only the settings that value depends on) and, for
    the image and the mask, what sets the target size — so it re-runs only when that
    data changes. The values are the same as those of ND Load Images.
    """

    CATEGORY = "Neural Dreamer/internal"
    DEV_ONLY = True  # hidden from the node search; added to the prompt by the frontend
    DESCRIPTION = "Internal helper added automatically by ND Load Images. Do not place it manually."
    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("value",)
    FUNCTION = "run"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # the block as JSON, reduced to what `field` depends on
                "block": ("STRING", {"default": "{}"}),
                # "image", "mask", "keep_proportion", "enabled", the slider name, or "*" (the whole block)
                "field": ("STRING", {"default": BLOCK_FIELD}),
            },
            "optional": {
                # the image/edit of the first enabled block: the target size without width/height
                "size_ref": ("STRING", {"default": ""}),
                "params": (PARAMS,),
                # prompt id of the ND Load Images, to report the target size to its UI
                "owner": ("STRING", {"default": ""}),
            },
        }

    @classmethod
    def _sources(cls, block, field, size_ref):
        if field not in IMAGE_FIELDS:
            return []
        blocks = [_parse_block(block)]
        if size_ref:
            blocks.append(_parse_block(size_ref))
        return blocks

    @classmethod
    def IS_CHANGED(cls, block, field, size_ref="", params=None, owner=""):
        h = hashlib.sha256(f"{block}|{field}|{size_ref}".encode("utf-8"))
        _files_signature(h, cls._sources(block, field, size_ref))
        return h.hexdigest()

    @classmethod
    def VALIDATE_INPUTS(cls, block, field, size_ref=""):
        for b in cls._sources(block, field, size_ref):
            name = _source_name(b)
            if _image_path(name) is None and os.path.basename(str(name)) != DEFAULT_IMAGE:
                return f"Load Images: file not found in the input folder: {name}"
        return True

    def run(self, block, field, size_ref="", params=None, owner=""):
        b = _parse_block(block)
        if field not in IMAGE_FIELDS:
            return (block_scalars(b).get(field),)
        prepared = prepare_block(b)
        res = _resolution(params)
        if not res and size_ref:
            ref = _parse_block(size_ref)
            same = all(ref.get(k) == b.get(k) for k in ("image", "masked", "edit"))
            image = prepared[0] if same else prepare_block(ref)[0]
            res = (int(image.shape[1]), int(image.shape[0]))
        report_size(owner, res)
        out = process_block(b, res, prepared)
        return (out if field == BLOCK_FIELD else out.get(field),)


NODE_CLASS_MAPPINGS = {
    "NDLoadImages": NDLoadImages,
    "NDLoadImagesPart": NDLoadImagesPart,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NDLoadImages": "ND Load Images",
    "NDLoadImagesPart": "ND Load Images Part (internal)",
}
