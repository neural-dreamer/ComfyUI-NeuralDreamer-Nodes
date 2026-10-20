"""
Neural Dreamer Nodes — custom node pack for ComfyUI.
https://github.com/neural-dreamer/ComfyUI-NeuralDreamer-Nodes
"""

from .nd_nodes import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS

__version__ = "1.1.0"

WEB_DIRECTORY = "./js"

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]

print(f"\033[36m[Neural Dreamer Nodes]\033[0m v{__version__} — loaded {len(NODE_CLASS_MAPPINGS)} nodes")
