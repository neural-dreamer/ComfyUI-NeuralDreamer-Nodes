"""
Neural Dreamer Nodes — ND Batch Images

Joins images into one batch. The first image sets the size: every image added after it
is fitted to that size, the way the node's `fit` says — the same modes as Keep Proportion
in ND Load Images (crop, pad white / black / edge / edge color, stretch).

Inputs: `image_1` (required) and optional `image_2`, `image_3`, ... The browser
(js/batch_images.js) shows two pins at first and adds a new empty one as soon as the last is
connected. An input can itself be a batch; its images are added one after another, in the
order of the pins. Pins left empty are skipped.
"""

import re

import torch

from .load_images import KEEP_MODES, SCALE_METHODS, keep_proportion

MAX_INPUTS = 32
_PIN = re.compile(r"^image_(\d+)$")


def _rgb(frame):
    """[H,W,C] -> [H,W,3] (an alpha channel is dropped, grey is repeated)."""
    c = frame.shape[-1]
    if c == 3:
        return frame
    if c > 3:
        return frame[..., :3]
    return frame[..., :1].expand(-1, -1, 3).contiguous() if c == 1 else frame


def fit_frame(frame, size, mode, method):
    """One [H,W,C] image fitted to size = (height, width); unchanged when it already has it."""
    frame = _rgb(frame)
    th, tw = size
    if int(frame.shape[0]) == th and int(frame.shape[1]) == tw:
        return frame
    mask = frame.new_zeros(frame.shape[:2])  # keep_proportion works on an image and a mask
    return keep_proportion(frame, mask, mode, tw, th, method)[0]


def pins_in_order(kwargs):
    """The connected image pins as [(number, tensor)], by pin number; empty pins are skipped."""
    found = []
    for key, value in kwargs.items():
        m = _PIN.match(key)
        if m and value is not None:
            found.append((int(m.group(1)), value))
    return sorted(found, key=lambda x: x[0])


class NDBatchImages:
    CATEGORY = "Neural Dreamer/Images"
    DESCRIPTION = (
        "Joins images into one batch. The first image sets the size; every image added after it is "
        "fitted to that size the way 'fit' says: crop, pad (white, black, edge, edge color) or stretch. "
        "A new empty pin appears as soon as the last one is connected. An input can be a batch itself."
    )
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    FUNCTION = "run"
    SEARCH_ALIASES = ["batch", "batch images", "image batch", "combine images", "merge images", "pad batch"]

    @classmethod
    def INPUT_TYPES(cls):
        optional = {f"image_{i}": ("IMAGE",) for i in range(2, MAX_INPUTS + 1)}
        return {
            "required": {
                "image_1": ("IMAGE",),
                "fit": (KEEP_MODES, {
                    "default": "crop",
                    "tooltip": "How an image that differs from the first one is fitted to its size.",
                }),
                "scale_method": (SCALE_METHODS, {
                    "default": "lanczos",
                    "tooltip": "The resampling used when an image has to be resized.",
                }),
            },
            "optional": optional,
        }

    def run(self, image_1, fit="crop", scale_method="lanczos", **kwargs):
        if fit not in KEEP_MODES:
            fit = "crop"
        if scale_method not in SCALE_METHODS:
            scale_method = "lanczos"
        size = (int(image_1.shape[1]), int(image_1.shape[2]))  # (height, width) of the first image
        frames = []
        for tensor in [image_1] + [t for _n, t in pins_in_order(kwargs)]:
            for frame in tensor:
                frames.append(fit_frame(frame, size, fit, scale_method))
        return (torch.stack(frames, dim=0),)


NODE_CLASS_MAPPINGS = {"NDBatchImages": NDBatchImages}
NODE_DISPLAY_NAME_MAPPINGS = {"NDBatchImages": "ND Batch Images"}
