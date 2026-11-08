"""
Neural Dreamer Nodes — the Bypass nodes: ND Bypass Upstream, ND Bypass Nodes, ND Bypass Groups

These nodes switch other nodes into the mode Bypass (or Mute) with a switch that can be wired to the widget of another node.
Bypass is a feature of the browser: a bypassed node is simply left out of the prompt that goes to the server.  So the three nodes are
virtual: js/bypass_nodes.js marks them as such, they are never sent to the server, and the work is done there (js/nd_bypass_core.js)
right before the prompt is built.  The classes below only describe the nodes (inputs, widgets, texts) so that they appear in the
search, the library and object_info.  If one of them is ever run by the server, it says what is wrong.

  ND Bypass Upstream  the nodes that feed only this node, up to the optional `start` (the node on `start` and everything above it stay on)
  ND Bypass Nodes     the nodes wired to its pins node_1, node_2 ...; every pin has its own switch on_1, on_2 ...
  ND Bypass Groups    the nodes inside the groups whose names are listed (one per line, `*` is any text)

The switch of every node is a BOOLEAN widget; wire the widget of another node (a Boolean primitive, a widget of ND UI Builder) to it
to control it from outside.  Only a value that is a widget of another node can be used: what a node computes is not known before the run.
"""

CATEGORY = "Neural Dreamer/Logic"
MODES = ["bypass", "mute"]
_WHY = "ND Bypass nodes work in the browser and are not meant to run on the server. Update the pack and reload the page."


class _Any(str):
    """The wildcard type: it equals every other type."""

    def __ne__(self, other):
        return False


ANY = _Any("*")
_MODE = (MODES, {"default": "bypass", "tooltip": "bypass: the nodes are left out and the data passes through them as in ComfyUI Bypass. mute: the nodes are left out and give nothing."})


def _active(tip):
    return ("BOOLEAN", {"default": True, "label_on": "on", "label_off": "bypassed", "tooltip": tip})


class NDBypassUpstream:
    DESCRIPTION = (
        "Bypasses the logic wired before this node. The nodes that feed only this node are switched off together; a node that something "
        "else also uses stays on. Wire a node to `start` to keep it and everything above it on: when this node is bypassed, `output` "
        "gives the value of `start` instead of `input`. Without `start` the whole chain that feeds only this node is bypassed."
    )
    CATEGORY = CATEGORY
    FUNCTION = "run"
    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("output",)

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "input": (ANY, {"tooltip": "The end of the chain that is switched off."}),
                "active": _active("On: the chain works. Off: the chain is bypassed. Wire a widget of another node to it to control it from outside."),
                "mode": _MODE,
            },
            "optional": {"start": (ANY, {"tooltip": "The border: this node and everything above it stay on. When this node is bypassed, `output` gives its value."})},
        }

    def run(self, *_a, **_k):
        raise RuntimeError(_WHY)


class NDBypassNodes:
    DESCRIPTION = (
        "Bypasses single nodes. Wire a node to a pin: it gets its own switch, and a new pin appears. Every switch can be wired to a "
        "widget of another node. A node that is wired to a pin is bypassed (or muted) when its switch is off."
    )
    CATEGORY = CATEGORY
    FUNCTION = "run"
    RETURN_TYPES = ()

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"mode": _MODE},
            "optional": {
                "node_1": (ANY, {"tooltip": "Wire any output of the node to switch. A new pin appears after it."}),
                "on_1": _active("On: the node works. Off: the node is bypassed."),
            },
        }

    def run(self, *_a, **_k):
        raise RuntimeError(_WHY)


class NDBypassGroups:
    DESCRIPTION = (
        "Bypasses groups. Write the names of the groups, one per line (`*` stands for any text, capital letters do not matter, "
        "lines with # are ignored). All the nodes inside these groups are bypassed (or muted) when the switch is off."
    )
    CATEGORY = CATEGORY
    FUNCTION = "run"
    RETURN_TYPES = ()

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "groups": ("STRING", {"default": "", "multiline": True, "tooltip": "The names of the groups, one per line. `*` is any text: Upscale* takes Upscale Face and Upscale Body."}),
                "active": _active("On: the groups work. Off: the groups are bypassed. Wire a widget of another node to it to control it from outside."),
                "mode": _MODE,
            }
        }

    def run(self, *_a, **_k):
        raise RuntimeError(_WHY)


NODE_CLASS_MAPPINGS = {"NDBypassUpstream": NDBypassUpstream, "NDBypassNodes": NDBypassNodes, "NDBypassGroups": NDBypassGroups}
NODE_DISPLAY_NAME_MAPPINGS = {"NDBypassUpstream": "ND Bypass Upstream", "NDBypassNodes": "ND Bypass Nodes", "NDBypassGroups": "ND Bypass Groups"}
