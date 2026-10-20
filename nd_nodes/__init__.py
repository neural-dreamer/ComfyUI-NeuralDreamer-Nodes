"""
Neural Dreamer Nodes — module registry.

To add a new node:
  1. Create nd_nodes/<module>.py with NODE_CLASS_MAPPINGS and NODE_DISPLAY_NAME_MAPPINGS.
  2. Add the module name to MODULES below.
  3. Put the JS part (if any) into the js/ folder — ComfyUI picks it up automatically.

If a module fails to import, the rest of the pack keeps working.
"""

import importlib
import logging

MODULES = [
    "variant_selector",
    "show_any_text",
    "params",
    "load_images",
    "slider",
    "character_builder",
    "live_preview",
]

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

for _name in MODULES:
    try:
        _mod = importlib.import_module(f".{_name}", __name__)
        NODE_CLASS_MAPPINGS.update(getattr(_mod, "NODE_CLASS_MAPPINGS", {}))
        NODE_DISPLAY_NAME_MAPPINGS.update(getattr(_mod, "NODE_DISPLAY_NAME_MAPPINGS", {}))
    except Exception as e:  # noqa: BLE001
        logging.warning(f"[Neural Dreamer Nodes] Failed to load module '{_name}': {e}")
