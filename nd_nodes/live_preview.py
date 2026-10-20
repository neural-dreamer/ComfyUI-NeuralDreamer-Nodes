"""
Neural Dreamer Nodes — Live Preview Bridge

Sits on the MODEL wire in front of the samplers. It returns a copy of the model with
a post-CFG hook (the same mechanism model patches use), so every sampler step hands
the predicted image to the hook. The hook turns the image being generated (the first of a batch) into a
small JPEG and sends it to the browser as an "nd_live_frame" message, apart from ComfyUI's
own previews. ND Variant Preview Selector shows the frames.

The second output, preview_data, is only a link: put it into the Pack that feeds a
selector to say which selector the frames are for. Selectors fed by the sampled
images get them too.

Frames are sent only while a selector with Live preview on is fed by the bridge: the
browser marks such selectors in the queued prompt (_meta.nd_live), which does not
change the cache, so turning the preview on or off never re-runs the sampling.
"""

import base64
import io
import logging
import time

log = logging.getLogger("NeuralDreamer")

LIVE_TYPE = "ND_LIVE"
EVENT = "nd_live_frame"
SELECTOR = "NDVariantPreviewSelector"
SINK = "NDUpscaleResultSink"
METHODS = ["latent2rgb", "taesd"]
MIN_INTERVAL = 0.12  # seconds between frames of one sampler (the last step is always sent)


# ------------------------------------------------------------------ helpers

def _is_link(v):
    return isinstance(v, (list, tuple)) and len(v) == 2 and isinstance(v[0], (str, int)) and isinstance(v[1], int)


def upstream(prompt, node_id):
    """Ids of every node the given node depends on, in an API prompt."""
    seen, stack = set(), [str(node_id)]
    while stack:
        cur = stack.pop()
        for v in (prompt.get(cur, {}).get("inputs") or {}).values():
            if _is_link(v):
                src = str(v[0])
                if src not in seen:
                    seen.add(src)
                    stack.append(src)
    return seen


def live_targets(prompt, bridge_id):
    """Selectors with Live preview on that the bridge feeds (its sampled images or its
    preview_data reach them, also through an Upscale sink)."""
    if not isinstance(prompt, dict):
        return None
    bridge_id = str(bridge_id)
    out = []
    for sid, n in prompt.items():
        if not isinstance(n, dict) or n.get("class_type") != SELECTOR:
            continue
        if not (n.get("_meta") or {}).get("nd_live"):
            continue
        ids = upstream(prompt, sid)
        for oid, o in prompt.items():
            if isinstance(o, dict) and o.get("class_type") == SINK and str((o.get("inputs") or {}).get("target_id")) == str(sid):
                ids |= upstream(prompt, oid)
        if bridge_id in ids:
            out.append(str(sid))
    return out


def running_prompt(prompt_id):
    """The API prompt being executed (read from the queue), or None."""
    try:
        from server import PromptServer
        running = PromptServer.instance.prompt_queue.currently_running
        for item in list(running.values()):
            if isinstance(item, (list, tuple)) and len(item) > 2 and item[1] == prompt_id and isinstance(item[2], dict):
                return item[2]
    except Exception:  # noqa: BLE001
        pass
    return None


def executing():
    """(prompt_id, node_id) of the node running now, e.g. the sampler."""
    try:
        from comfy_execution.utils import get_executing_context
        ctx = get_executing_context()
        if ctx is not None:
            return str(ctx.prompt_id), str(ctx.node_id)
    except Exception:  # noqa: BLE001
        pass
    try:
        from server import PromptServer
        s = PromptServer.instance
        return str(s.last_prompt_id), str(s.last_node_id)
    except Exception:  # noqa: BLE001
        return None, None


def send(data):
    try:
        from server import PromptServer
        s = PromptServer.instance
        s.send_sync(EVENT, data, s.client_id)
    except Exception as e:  # noqa: BLE001
        log.debug(f"[ND Live] send failed: {e}")


def step_of(sigma, model_options):
    """(step, steps) for the current sigma, 1-based; (None, None) when unknown."""
    try:
        sigmas = model_options["transformer_options"]["sample_sigmas"]
        s = float(sigma.flatten()[0]) if hasattr(sigma, "flatten") else float(sigma)
        vals = [float(x) for x in sigmas]
        steps = max(1, len(vals) - 1)
        i = min(range(len(vals)), key=lambda k: abs(vals[k] - s))
        return min(i + 1, steps), steps
    except Exception:  # noqa: BLE001
        return None, None


def to_jpeg(img, size):
    img = img.convert("RGB")
    if size and max(img.size) > size:
        img.thumbnail((size, size))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=80)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


# ------------------------------------------------------------ previewers

_TAESD = {}


def make_previewer(base_model, method):
    """A ComfyUI latent previewer for this model, independent of the preview setting."""
    import latent_preview
    fmt = getattr(base_model, "latent_format", None)
    if fmt is None:
        return None
    if method == "taesd" and getattr(fmt, "taesd_decoder_name", None) and fmt.taesd_decoder_name not in getattr(latent_preview, "VIDEO_TAES", []):
        key = (fmt.taesd_decoder_name, getattr(fmt, "latent_channels", 4))
        if key not in _TAESD:
            _TAESD[key] = None
            try:
                import folder_paths
                import comfy.model_management
                from comfy.taesd.taesd import TAESD
                name = next((f for f in folder_paths.get_filename_list("vae_approx") if f.startswith(fmt.taesd_decoder_name)), "")
                path = folder_paths.get_full_path("vae_approx", name) if name else None
                if path:
                    dev = comfy.model_management.get_torch_device()
                    _TAESD[key] = latent_preview.TAESDPreviewerImpl(TAESD(None, path, latent_channels=key[1]).to(dev))
                else:
                    log.warning(f"[ND Live] TAESD not found in models/vae_approx/{fmt.taesd_decoder_name}; using latent2rgb")
            except Exception as e:  # noqa: BLE001
                log.warning(f"[ND Live] TAESD could not be loaded: {e}")
        if _TAESD[key] is not None:
            return _TAESD[key]
    if getattr(fmt, "latent_rgb_factors", None) is not None:
        return latent_preview.Latent2RGBPreviewer(fmt.latent_rgb_factors, getattr(fmt, "latent_rgb_factors_bias", None),
                                                  getattr(fmt, "latent_rgb_factors_reshape", None))
    return None


# ------------------------------------------------------------------ hook

class LiveHook:
    """The post-CFG function: returns the prediction unchanged and sends its preview."""

    def __init__(self, bridge_id, method="latent2rgb", size=384):
        self.bridge_id = str(bridge_id)
        self.method = method
        self.size = int(size)
        self.previewers = {}
        self.targets = {}   # prompt id -> list of selector ids (None: unknown)
        self.last = {}      # (prompt id, sampler id) -> time of the last frame

    def wanted(self, prompt_id):
        if prompt_id not in self.targets:
            if len(self.targets) > 32:
                self.targets.clear()
            prompt = running_prompt(prompt_id)
            self.targets[prompt_id] = live_targets(prompt, self.bridge_id) if prompt is not None else None
        return self.targets[prompt_id]

    def previewer(self, base_model):
        key = id(base_model)
        if key not in self.previewers:
            self.previewers[key] = make_previewer(base_model, self.method)
        return self.previewers[key]

    def __call__(self, args):
        denoised = args.get("denoised")
        try:
            self.emit(args, denoised)
        except Exception as e:  # noqa: BLE001 - a preview must never break the sampling
            log.debug(f"[ND Live] frame failed: {e}")
        return denoised

    def emit(self, args, denoised):
        if denoised is None:
            return
        prompt_id, sampler = executing()
        targets = self.wanted(prompt_id)
        if targets is not None and not targets:
            return  # no selector wants frames from this bridge
        step, steps = step_of(args.get("sigma"), args.get("model_options") or {})
        now = time.monotonic()
        key = (prompt_id, sampler)
        if step is None or step < steps:
            if now - self.last.get(key, 0) < MIN_INTERVAL:
                return
        self.last[key] = now
        prev = self.previewer(args.get("model"))
        if prev is None:
            return
        x0 = denoised
        if getattr(x0, "is_nested", False):
            x0 = x0.tensors[0]
        # the image being generated: the first of the batch
        images = [to_jpeg(prev.decode_latent_to_preview(x0[0:1]), self.size)]
        send({
            "bridge": self.bridge_id,
            "sampler": sampler,
            "prompt_id": prompt_id,
            "targets": targets,
            "step": step,
            "steps": steps,
            "images": images,
        })


# ------------------------------------------------------------------ node

class NDLivePreviewBridge:
    CATEGORY = "Neural Dreamer/Variant"
    DESCRIPTION = (
        "Put it on the MODEL wire in front of the samplers. While they run, it sends a live "
        "preview of the image being generated to ND Variant Preview Selector (turn on Live preview "
        "in its settings). preview_data links the bridge to one selector: plug it into the Pack "
        "that feeds the selector. The model passes through unchanged."
    )
    RETURN_TYPES = ("MODEL", LIVE_TYPE)
    RETURN_NAMES = ("model", "preview_data")
    FUNCTION = "run"

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "method": (METHODS, {"default": "latent2rgb", "tooltip": "latent2rgb: fast, rough colours. taesd: sharper, needs the TAESD decoder in models/vae_approx and a little GPU time."}),
                "size": ("INT", {"default": 384, "min": 64, "max": 1024, "step": 32, "tooltip": "Longer side of the preview frames, in pixels."}),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    def run(self, model, method="latent2rgb", size=384, unique_id=None):
        m = model.clone()
        m.set_model_sampler_post_cfg_function(LiveHook(unique_id, method, size))
        return (m, {"bridge": str(unique_id)})


NODE_CLASS_MAPPINGS = {"NDLivePreviewBridge": NDLivePreviewBridge}
NODE_DISPLAY_NAME_MAPPINGS = {"NDLivePreviewBridge": "ND Live Preview Bridge"}
