"""
Neural Dreamer Nodes — the ND LoRA Stack H3 Temporal node (class NDLoraStackH3Temporal)

The same stack as ND LoRA Stack, but every LoRA can work only in chosen seconds of a MiniMax H3 video.  The list lives in the hidden
text widget `stack` (JSON); an entry may carry the field `t` (see lora_temporal_core.py):

    [{"name": "style/foo.safetensors", "on": true, "sm": 0.8, "sc": 0.8, "link": true, "words": ["foo style"],
      "t": {"v": 1, "on": true, "audio": false, "shared": true, "base": 0,
            "ranges": [{"s": 1.0, "e": 3.5, "fi": 0.25, "fo": 0.25, "w": 1}]}}]

How it works.  A plain LoRA is merged into the weights, so it acts on every token alike.  A LoRA that works in time is not merged:
its two small matrices are computed beside the layer (ComfyUI's bypass mode, `y = f(x) + m[row] * lora(x)`) and `m` is a weight per row
of the packed H3 sequence [text | cond/ref | audio | video]: the video rows of a latent frame get the weight of that moment, the audio
rows the weight of theirs.  One sampling step is still one step (the LoRA path adds two small matrix products to a layer).

Layers that cannot be placed in time (text, reference rows, the modulation by the time step) keep a fixed weight: the full strength
when `shared` is on, zero when it is off.  LoRAs without time settings are merged exactly as the plain ND LoRA Stack does.
On a model that is not MiniMax H3 every LoRA works on the whole video (a warning goes to the console).
"""

import hashlib
import json
import logging
import os
import uuid

from . import lora_temporal_core as core
from .lora_stack import CATEGORY, _load, trigger_words, parse_stack

KEY_PREFIX = "diffusion_model."
_warned = set()


def _warn_once(msg):
    if msg not in _warned:
        _warned.add(msg)
        logging.warning(f"{core.TAG} {msg}")


def parse_entries(text):
    """parse_stack plus the normalised field `t` of every entry (the list of the plain stack ignores it)."""
    entries = parse_stack(text)
    try:
        raw = json.loads(text) if text and str(text).strip() else []
    except Exception:  # noqa: BLE001  (parse_stack has already reported it)
        raw = []
    for i, e in enumerate(entries):
        e["t"] = core.parse_temporal(raw[i].get("t") if i < len(raw) and isinstance(raw[i], dict) else None, i)
    return entries


# ------------------------------------------------------------------ which layer works on which rows

def classify(rel):
    """How the rows of a layer input relate to the packed sequence.  `rel` is the module path without `diffusion_model.`."""
    if rel.startswith("token_refiner.") or rel == "condition_proj":
        return "text"
    if rel.startswith("blocks."):
        tail = rel.split(".", 2)[2] if rel.count(".") >= 2 else ""
        return "global" if tail.startswith("adaln_proj") else "seq"
    if rel == "video_patch_proj":
        return "video_proj"
    if rel == "audio_patch_proj":
        return "audio_proj"
    if rel == "final_layer.video_out":
        return "video_out"
    if rel == "final_layer.audio_out":
        return "audio_out"
    return "global"  # time embedder, adaln and the rest: rows are time steps, not tokens


VIDEO_KINDS = ("cond", "ref_img", "video")
AUDIO_KINDS = ("cond_audio", "ref_audio", "audio")
KINDS_OF = {
    "seq": None,  # every segment
    "text": ("text",),
    "video_proj": VIDEO_KINDS,
    "audio_proj": AUDIO_KINDS,
    "video_out": ("video",),
    "audio_out": ("audio",),
}


class Geometry:
    """Where the rows are: `segments` is [(start, stop, kind)] of the packed sequence (PackedLayout.segments)."""

    def __init__(self, segments, latent_t, audio_t, seq_len):
        self.segments = [tuple(s) for s in segments]
        self.latent_t = int(latent_t)
        self.audio_t = int(audio_t)
        self.seq_len = int(seq_len)
        video = next((b - a for a, b, k in self.segments if k == "video"), 0)
        self.frame_rows = video // self.latent_t if self.latent_t else 0

    def expected_rows(self, cls):
        kinds = KINDS_OF.get(cls)
        if cls == "global":
            return None
        return sum(b - a for a, b, k in self.segments if kinds is None or k in kinds)


def build_rows(cls, spec, geo, device=None):
    """The weight of every row of a layer of the class `cls`: a float when it is the same everywhere, else a float tensor."""
    import torch

    if cls == "global":
        return spec["sh"]
    kinds = KINDS_OF[cls]
    vw = torch.tensor(spec["vw"], dtype=torch.float32)
    aw = torch.tensor(spec["aw"], dtype=torch.float32)
    pieces = []
    for a, b, kind in geo.segments:
        if kinds is not None and kind not in kinds:
            continue
        n = b - a
        if kind == "video":
            if vw.numel() * geo.frame_rows != n:
                raise ValueError("video rows do not fit the latent frames")
            pieces.append(vw.repeat_interleave(geo.frame_rows))
        elif kind == "audio":
            if aw.numel() * 2 != n:
                raise ValueError("audio rows do not fit the latent frames")
            pieces.append(torch.cat([aw, aw]))  # channel-major: the left channel, then the right one
        else:
            pieces.append(torch.full((n,), float(spec["sh"])))
    if not pieces:
        return spec["sh"]
    vec = torch.cat(pieces)
    lo, hi = float(vec.min()), float(vec.max())
    if lo == hi:
        return lo
    return vec.to(device) if device is not None else vec


class Current:
    """What is known about the sampler call that is running now."""

    def __init__(self, geo, specs, store):
        self.geo, self.specs, self.store = geo, specs, store

    def weight(self, lora_idx, cls, rows, device):
        key = (lora_idx, cls, str(device))
        got = self.store.get(key)
        if got is None:
            try:
                got = build_rows(cls, self.specs[lora_idx], self.geo, device)
                expect = self.geo.expected_rows(cls)
                if expect is not None and not isinstance(got, float) and got.shape[0] != expect:
                    raise ValueError("row count differs from the layout")
            except Exception as ex:  # noqa: BLE001
                _warn_once(f"cannot place the layers `{cls}` in time ({ex}); they get the shared strength")
                got = float(self.specs[lora_idx]["sh"])
            self.store[key] = got
        if not isinstance(got, float) and got.shape[0] != rows:
            _warn_once(f"layer rows ({rows}) differ from the layout ({got.shape[0]}) in `{cls}`; it gets the shared strength")
            return float(self.specs[lora_idx]["sh"])
        return got


class TemporalState:
    """Shared by the wrapper (sets `current` around every model call) and the hooks (read it)."""

    def __init__(self, loras):
        self.loras = loras  # [{"strength": float, "t": normal form}] in the order of the hook items
        self.current = None
        self.cache = {}
        self.layouts = {}

    # -- the video and audio latent frames of this call, as numbers in the whole video
    @staticmethod
    def indices(transformer_options, latent_t, audio_t):
        window = (transformer_options or {}).get("context_window")
        if window is None:
            return list(range(latent_t)), list(range(audio_t))

        def local(w, n):
            idx = list(w.index_list)
            anchor = getattr(w, "causal_anchor_index", None)
            if anchor is not None and anchor >= 0:
                idx = [anchor] + idx
            if len(idx) != n:
                _warn_once("a context window has a different length than the latent (guide frames?); the end is guessed")
                idx = (idx + [idx[-1] + 1 + i for i in range(max(0, n - len(idx)))])[:n] if idx else list(range(n))
            return idx

        vi = local(window, latent_t)
        try:
            ai = local(window.get_window_for_modality(1), audio_t)
        except Exception:  # noqa: BLE001
            off = round(core.latent_start(vi[0]) / core.FPS * core.AUDIO_FPS)
            ai = list(range(off, off + audio_t))
        return vi, ai

    def begin(self, args, kwargs):
        x, context = args[0], args[2]
        topts = args[3] if len(args) > 3 else kwargs.get("transformer_options", {})
        payload = kwargs.get("minimax_payload") or {}
        latent_t, audio_t = x[0].shape[2], x[1].shape[-1]
        lat_h, lat_w = (x[0].shape[3] + 1) // 2 * 2, (x[0].shape[4] + 1) // 2 * 2
        text_len = context.shape[1]
        sig = (text_len, latent_t, lat_h, lat_w, audio_t)
        layout = payload.get("layout")
        if layout is None or getattr(layout, "signature", None) != sig:
            key = (sig, id(payload.get("keyframes")), id(payload.get("refs")))
            layout = self.layouts.get(key)
            if layout is None:
                import comfy.ldm.minimax.model as mm

                layout = mm.PackedLayout(text_len, latent_t, lat_h, lat_w, audio_t,
                                         keyframes=payload.get("keyframes"), refs=payload.get("refs"))
                if len(self.layouts) > 4:
                    self.layouts.clear()
                self.layouts[key] = layout
        vi, ai = self.indices(topts, latent_t, audio_t)
        ckey = (sig, tuple(vi), tuple(ai), id(layout))
        if ckey not in self.cache:
            if len(self.cache) > 8:
                self.cache.clear()
            geo = Geometry(layout.segments, latent_t, audio_t, layout.seq_len)
            specs = [{"vw": core.video_weights(vi, l["t"], l["strength"]),
                      "aw": core.audio_weights(ai, l["t"], l["strength"]),
                      "sh": core.shared_weight(l["t"], l["strength"])} for l in self.loras]
            self.cache[ckey] = (geo, specs, {})
        geo, specs, store = self.cache[ckey]
        return Current(geo, specs, store)


def make_wrapper(state):
    """A DIFFUSION_MODEL wrapper: tells the hooks, for the time of one model call, where the rows are."""

    def wrapper(executor, *args, **kwargs):
        try:
            state.current = state.begin(args, kwargs)
        except Exception as ex:  # noqa: BLE001
            _warn_once(f"cannot read the layout of the model call ({ex}); the LoRAs work on the whole video")
            state.current = None
        try:
            return executor(*args, **kwargs)
        finally:
            state.current = None

    return wrapper


class TemporalModuleHook:
    """Replaces the forward of one layer: f(x) + sum over LoRAs of weight[row] * lora(x)."""

    def __init__(self, module, cls, state, items):
        self.module, self.cls, self.state = module, cls, state
        self.items = items  # [(lora index, adapter, helper)]
        self.orig = None
        self.orig_force = False
        self.had_own = False

    def inject(self):
        if self.orig is not None:
            return
        import comfy.model_management
        import torch

        device = comfy.model_management.get_torch_device()
        dtype = getattr(getattr(self.module, "weight", None), "dtype", None)
        if dtype not in (torch.float32, torch.float16, torch.bfloat16):
            dtype = None
        for _i, _adapter, helper in self.items:
            helper._move_adapter_weights_to_device(device, dtype)
        self.attach()

    def attach(self):
        self.had_own = "forward" in self.module.__dict__
        self.orig = self.module.forward
        self.orig_force = getattr(self.module, "comfy_force_forward", False)
        self.module.comfy_force_forward = True  # the fused / quantised fast paths must call forward
        self.module.forward = self.forward

    def eject(self):
        if self.orig is None:
            return
        if self.had_own:
            self.module.forward = self.orig
        else:
            self.module.__dict__.pop("forward", None)
        self.module.comfy_force_forward = self.orig_force
        self.orig = None

    def forward(self, x, *a, **kw):
        out = self.orig(x, *a, **kw)
        cur = self.state.current
        rows = x.shape[-2] if x.dim() >= 2 else 1
        for idx, adapter, _helper in self.items:
            if cur is None:  # called outside of the wrapper: the LoRA works on everything
                w = float(self.state.loras[idx]["strength"])
            else:
                w = cur.weight(idx, self.cls, rows, x.device)
            if isinstance(w, float):
                if w == 0.0:
                    continue
                h = adapter.h(x, out)
                out = out + (h if w == 1.0 else h * w)
            else:
                h = adapter.h(x, out)
                out = out + h * w.to(dtype=h.dtype).unsqueeze(-1)
        return out


# ------------------------------------------------------------------ the node

def _module_of(root, key):
    m = root
    for part in key.split("."):
        m = m[int(part)] if part.isdigit() else getattr(m, part, None)
        if m is None:
            return None
    return m


def _is_h3(model):
    try:
        import comfy.model_base

        return isinstance(model.model, comfy.model_base.MiniMaxH3)
    except Exception:  # noqa: BLE001
        return False


class NDLoraStackH3Temporal:
    DESCRIPTION = (
        "A stack of LoRAs for MiniMax H3 where every LoRA can work only in chosen seconds of the video (and, if you wish, of its audio). "
        "Open the clock button of a row to set the ranges. LoRAs without time settings are applied as in ND LoRA Stack. "
        "The third output holds the trigger words of the enabled LoRAs."
    )
    CATEGORY = CATEGORY
    FUNCTION = "apply"
    RETURN_TYPES = ("MODEL", "CLIP", "STRING")
    RETURN_NAMES = ("model", "clip", "trigger_words")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL", {"tooltip": "The MiniMax H3 model the LoRAs are applied to."}),
                "stack": ("STRING", {"default": "[]", "multiline": True, "tooltip": "The list of LoRAs (JSON). Edit it in the node."}),
                "length": ("INT", {"default": 124, "min": 5, "max": 3600, "step": 17,
                                   "tooltip": "Frame count of the video (24 fps). Only the time scale of the node uses it: connect the same number as in the latent."}),
            },
            "optional": {"clip": ("CLIP", {"tooltip": "The CLIP. Without it only the model is changed."})},
        }

    @classmethod
    def IS_CHANGED(cls, stack="[]", **_kw):
        return hashlib.sha1(str(stack).encode("utf-8")).hexdigest()

    def apply(self, model, stack="[]", length=124, clip=None):
        import comfy.lora
        import comfy.lora_convert
        import comfy.sd
        import comfy.weight_adapter
        import folder_paths

        entries = parse_entries(stack)
        h3 = _is_h3(model)
        timed = []  # [(entry, patches)]
        for e in entries:
            if not e["on"] or (e["sm"] == 0 and (e["sc"] == 0 or clip is None)):
                continue
            path = folder_paths.get_full_path("loras", e["name"])
            if not path or not os.path.isfile(path):
                raise FileNotFoundError(f"{core.TAG} LoRA not found: {e['name']}")
            lora = _load(path)
            sc = e["sc"] if clip is not None else 0.0
            if not core.is_timed(e["t"]):
                model, clip = comfy.sd.load_lora_for_models(model, clip, lora, e["sm"], sc)
                continue
            if not h3:
                _warn_once("the model is not MiniMax H3: the LoRAs with time settings work on the whole video")
                model, clip = comfy.sd.load_lora_for_models(model, clip, lora, e["sm"], sc)
                continue
            if core.beyond_video(e["t"], length):
                _warn_once(f"no range of `{e['name']}` touches the first {core.duration(length):g} s: the LoRA does nothing")
            if clip is not None and sc != 0.0:  # the text is not placed in time
                _, clip = comfy.sd.load_lora_for_models(None, clip, lora, 0.0, sc)
            timed.append((e, lora))

        if timed:
            model = self._apply_timed(model, timed)
        return (model, clip, trigger_words(entries))

    def _apply_timed(self, model, timed):
        import comfy.lora
        import comfy.lora_convert
        import comfy.weight_adapter
        from comfy.patcher_extension import PatcherInjection, WrappersMP
        from comfy.weight_adapter.bypass import BypassForwardHook

        model = model.clone()
        base = model.model
        key_map = comfy.lora.model_lora_keys_unet(base, {})
        pdd = int(getattr(base.model_config, "unet_config", {}).get("pdd_steps", 1) or 1)
        loras = []
        per_module = {}  # module key -> (cls, [(lora index, adapter, helper)])
        for e, lora in timed:
            idx = len(loras)
            loras.append({"strength": float(e["sm"]), "t": e["t"]})
            loaded = comfy.lora.load_lora(comfy.lora_convert.convert_lora(lora), key_map)
            regular = {}
            for key, patch in loaded.items():
                if isinstance(key, tuple) or not isinstance(patch, comfy.weight_adapter.WeightAdapterBase):
                    regular[key] = patch
                    continue
                mkey = key[:-len(".weight")] if key.endswith(".weight") else key
                rel = mkey[len(KEY_PREFIX):] if mkey.startswith(KEY_PREFIX) else mkey
                module = _module_of(base, mkey)
                if module is None or not hasattr(module, "weight"):
                    _warn_once(f"layer not found for `{key}`; skipped")
                    continue
                if pdd > 1 and rel in ("final_layer.video_out", "final_layer.audio_out"):
                    _warn_once("the output heads of a PDD checkpoint cannot work in time; they are skipped")
                    continue
                helper = BypassForwardHook(module, patch, multiplier=1.0)
                per_module.setdefault(mkey, (classify(rel), module, []))[2].append((idx, patch, helper))
            if regular:  # biases, weight differences: they cannot be placed in time, they act on the whole video
                _warn_once(f"`{e['name']}` has parts that are not low-rank adapters; they work on the whole video")
                model.add_patches(regular, e["sm"])

        state = TemporalState(loras)
        hooks = [TemporalModuleHook(module, cls, state, items) for cls, module, items in per_module.values()]

        def inject_all(_mp):
            for h in hooks:
                h.inject()

        def eject_all(_mp):
            for h in reversed(hooks):
                h.eject()

        tag = uuid.uuid4().hex[:8]
        model.set_injections(f"nd_h3_temporal_{tag}", [PatcherInjection(inject=inject_all, eject=eject_all)])
        model.add_wrapper_with_key(WrappersMP.DIFFUSION_MODEL, f"nd_h3_temporal_{tag}", make_wrapper(state))
        return model


NODE_CLASS_MAPPINGS = {"NDLoraStackH3Temporal": NDLoraStackH3Temporal}
NODE_DISPLAY_NAME_MAPPINGS = {"NDLoraStackH3Temporal": "ND LoRA Stack H3 Temporal"}
