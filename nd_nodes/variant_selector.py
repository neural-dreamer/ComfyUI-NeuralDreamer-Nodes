"""
Neural Dreamer Nodes — Variant Selector
Two nodes for picking a variant from a batch and launching an upscale with a dedicated button.
"""

import json
import os
import random

import numpy as np
from PIL import Image
from PIL.PngImagePlugin import PngInfo

import folder_paths

from .params import PARAMS, NDParams

try:
    from comfy.cli_args import args as _comfy_args

    _DISABLE_METADATA = bool(getattr(_comfy_args, "disable_metadata", False))
except Exception:  # noqa: BLE001
    _DISABLE_METADATA = False

DEFAULT_PREFIX = "ND_Image"
DEFAULT_VARIANT = "variant"
DEFAULT_UPSCALED = "upscaled"


def _to_pil(img):
    arr = np.clip(255.0 * img.cpu().numpy(), 0, 255).astype(np.uint8)
    if arr.ndim == 3 and arr.shape[-1] == 1:
        arr = arr[..., 0]
    return Image.fromarray(arr)


def _build_metadata(prompt, extra_pnginfo):
    if _DISABLE_METADATA:
        return None
    meta = PngInfo()
    if prompt is not None:
        meta.add_text("prompt", json.dumps(prompt))
    if extra_pnginfo is not None:
        for key in extra_pnginfo:
            meta.add_text(key, json.dumps(extra_pnginfo[key]))
    return meta


def _write_images(images, prefix, out_dir, img_type, compress_level, metadata=None):
    """Writes a batch with ComfyUI's counter naming and returns UI descriptors
    (with the image size, shown under the preview)."""
    if images is None or len(images) == 0:
        return []
    height, width = int(images[0].shape[0]), int(images[0].shape[1])

    full_folder, filename, counter, subfolder, _ = folder_paths.get_save_image_path(
        prefix, out_dir, images[0].shape[1], images[0].shape[0]
    )
    os.makedirs(full_folder, exist_ok=True)

    results = []
    for img in images:
        file = f"{filename}_{counter:05}_.png"
        _to_pil(img).save(
            os.path.join(full_folder, file), pnginfo=metadata, compress_level=compress_level
        )
        results.append({"filename": file, "subfolder": subfolder, "type": img_type, "width": width, "height": height})
        counter += 1
    return results


def _save_temp_images(images, prefix="ND_preview", metadata=None):
    """Saves the batch to the ComfyUI temp folder (used for previews only). The files carry
    no prompt / workflow unless `metadata` is given (the "Preview with Metadata" option)."""
    suffix = "_" + "".join(random.choice("abcdefghijklmnopqrstuvwxyz") for _ in range(6))
    return _write_images(images, prefix + suffix, folder_paths.get_temp_directory(), "temp", 1, metadata)


def _clean_prefix(prefix):
    prefix = str(prefix or "").strip().strip("/\\")
    return prefix or DEFAULT_PREFIX


def _file_name(prefix, suffix):
    """<file name>_<suffix>, e.g. ND_Image_variant; an empty suffix leaves the name alone."""
    suffix = str(suffix or "").strip().strip("/\\_")
    return _clean_prefix(prefix) + (f"_{suffix}" if suffix else "")


def _save_output_images(images, prefix, prompt=None, extra_pnginfo=None):
    """Saves images to the ComfyUI output folder (like the stock Save Image node)."""
    return _write_images(
        images,
        _clean_prefix(prefix),
        folder_paths.get_output_directory(),
        "output",
        4,
        _build_metadata(prompt, extra_pnginfo),
    )


class NDVariantPreviewSelector:
    """
    One ND_PARAMS input, one ND_PARAMS output.

    Input fields (connect a Pack Parameters; it creates these pins by itself):
      images  IMAGE  the batch of variants
      image   IMAGE  optional: the upscaled result, shown back in the node

    Output fields (open with Unpack Parameters):
      multi_variant BOOLEAN, selected_index INT (0-based), upscale BOOLEAN

    The frontend rewrites the queued prompt (js/variant_selector.js): the `image`
    field is cut out of the Pack on every run (so the upscale branch never runs
    on a normal Run) and, on Upscale, wired into an internal sink node instead;
    the outputs reach other nodes through NDVariantValues, so nothing depends on
    this node and the graph can never form a loop.
    """

    CATEGORY = "Neural Dreamer/Variant"
    DESCRIPTION = (
        "Shows a batch of images with thumbnails and lets you pick a variant (click or arrow keys). "
        "It is not an upscaler: the optional Upscale button sends the selected variant to the "
        "upscale branch you build after it (any upscale nodes, also third-party ones). Input: one parameters wire with the fields 'images' (the batch) "
        "and optionally 'image' (the upscaled result) - connect a Pack Parameters and it creates "
        "these inputs. Output: one parameters wire with 'multi_variant', 'selected_index' (0-based) "
        "and 'upscale' (True only for a run started by the Upscale button) - open it with Unpack "
        "Parameters. The gear button sets the file names, the saving of the variants, whether the "
        "Upscale button is shown (without it every batch is saved) and Preview with Metadata (the "
        "shown previews carry the prompt and workflow, like the saved files)."
    )
    RETURN_TYPES = (PARAMS,)
    RETURN_NAMES = ("params",)
    FUNCTION = "run"
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "params": (PARAMS,),
                "multi_variant": ("BOOLEAN", {"default": False}),
                "selected_index": ("INT", {"default": 0, "min": 0, "max": 100000}),
                "upscale_trigger": ("BOOLEAN", {"default": False}),
                "filename_prefix": ("STRING", {"default": DEFAULT_PREFIX}),
                "save_previews": ("BOOLEAN", {"default": False}),
                "variant_suffix": ("STRING", {"default": DEFAULT_VARIANT}),
                "upscaled_suffix": ("STRING", {"default": DEFAULT_UPSCALED}),
                "upscale_button": ("BOOLEAN", {"default": True}),
                "preview_metadata": ("BOOLEAN", {"default": False}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    def run(self, params, multi_variant, selected_index, upscale_trigger,
            filename_prefix=DEFAULT_PREFIX, save_previews=False,
            variant_suffix=DEFAULT_VARIANT, upscaled_suffix=DEFAULT_UPSCALED, upscale_button=True,
            preview_metadata=False, prompt=None, extra_pnginfo=None):
        images = params.get("images") if isinstance(params, dict) else None
        if images is None:
            raise ValueError(
                "Variant Preview Selector: no images. Connect a Pack Parameters to the input "
                "and plug the batch into its 'images' pin."
            )
        count = int(images.shape[0])
        idx = max(0, min(int(selected_index), max(0, count - 1)))
        # the previews are temp files: without the option they hold no prompt / workflow,
        # so dragging one out or opening it in a tab gives a plain picture
        previews = _save_temp_images(images, metadata=_build_metadata(prompt, extra_pnginfo) if preview_metadata else None)

        # Only a normal Run saves the batch; an Upscale run reuses the same batch.
        # Without the Upscale button every batch is saved.
        save = bool(save_previews) or not bool(upscale_button)
        if save and not upscale_trigger:
            _save_output_images(images, _file_name(filename_prefix, variant_suffix), prompt, extra_pnginfo)

        out = NDParams(multi_variant=bool(multi_variant), selected_index=idx, upscale=bool(upscale_trigger))
        return {
            "ui": {"nd_batch": previews, "nd_mode": [bool(upscale_trigger)]},
            "result": (out,),
        }


class NDVariantSliderSelector:
    """INT slider + Multi-Variant toggle + Upscale button. One ND_PARAMS output."""

    CATEGORY = "Neural Dreamer/Variant"
    DESCRIPTION = (
        "Integer slider with a Multi-Variant toggle and an Upscale button (it does not upscale "
        "itself; the button starts the upscale branch you build). Output: one parameters "
        "wire with 'multi_variant', 'value' and 'upscale' (True only for a run started by the "
        "Upscale button) - open it with Unpack Parameters. The slider range is set with the gear "
        "button or in Properties."
    )
    RETURN_TYPES = (PARAMS,)
    RETURN_NAMES = ("params",)
    FUNCTION = "run"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "multi_variant": ("BOOLEAN", {"default": False}),
                "value": ("INT", {"default": 0, "min": -1000000, "max": 1000000}),
                "upscale_trigger": ("BOOLEAN", {"default": False}),
            }
        }

    def run(self, multi_variant, value, upscale_trigger):
        return (NDParams(multi_variant=bool(multi_variant), value=int(value), upscale=bool(upscale_trigger)),)


class NDUpscaleResultSink:
    """
    Internal node. The frontend adds it to the prompt automatically on Upscale
    and feeds it the wire that goes into the 'image' field of the selector's Pack.
    It saves the upscaled image (as "<file name>_<suffix>", ND_Image_upscaled by
    default) and reports it back to
    the preview node. There is no need to place it manually.
    """

    CATEGORY = "Neural Dreamer/internal"
    DEV_ONLY = True  # hidden from the node search; added to the prompt by the frontend
    DESCRIPTION = "Internal helper added automatically by the Upscale button. Do not place it manually."
    RETURN_TYPES = ()
    FUNCTION = "run"
    OUTPUT_NODE = True

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "target_id": ("STRING", {"default": ""}),
                "filename_prefix": ("STRING", {"default": DEFAULT_PREFIX}),
                "suffix": ("STRING", {"default": DEFAULT_UPSCALED}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    def run(self, image, target_id, filename_prefix=DEFAULT_PREFIX, suffix=DEFAULT_UPSCALED,
            prompt=None, extra_pnginfo=None):
        saved = _save_output_images(image[:1], _file_name(filename_prefix, suffix), prompt, extra_pnginfo)
        return {"ui": {"nd_final": saved[:1], "nd_target": [str(target_id)]}}


class NDVariantValues:
    """
    Internal node. The frontend routes a selector's output through it: it has no
    inputs from the graph, only the values shown in the selector at queue time, so
    a selector can feed nodes that also feed it (no circular connection), while
    consumers still receive the same parameters wire.
    """

    CATEGORY = "Neural Dreamer/internal"
    DEV_ONLY = True  # hidden from the node search; added to the prompt by the frontend
    DESCRIPTION = "Internal helper added automatically by the selector nodes. Do not place it manually."
    RETURN_TYPES = (PARAMS,)
    RETURN_NAMES = ("params",)
    FUNCTION = "run"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "multi_variant": ("BOOLEAN", {"default": False}),
                "value": ("INT", {"default": 0, "min": -2147483648, "max": 2147483647}),
                "upscale": ("BOOLEAN", {"default": False}),
                # field name of the value: "selected_index" (preview) or "value" (slider)
                "value_name": ("STRING", {"default": "value"}),
            }
        }

    def run(self, multi_variant, value, upscale, value_name="value"):
        out = NDParams()
        out["multi_variant"] = bool(multi_variant)
        out[str(value_name or "value")] = int(value)
        out["upscale"] = bool(upscale)
        return (out,)


NODE_CLASS_MAPPINGS = {
    "NDVariantPreviewSelector": NDVariantPreviewSelector,
    "NDVariantSliderSelector": NDVariantSliderSelector,
    "NDUpscaleResultSink": NDUpscaleResultSink,
    "NDVariantValues": NDVariantValues,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "NDVariantPreviewSelector": "ND Variant Preview Selector",
    "NDVariantSliderSelector": "ND Variant Slider Selector",
    "NDUpscaleResultSink": "ND Upscale Result (internal)",
    "NDVariantValues": "ND Variant Values (internal)",
}
