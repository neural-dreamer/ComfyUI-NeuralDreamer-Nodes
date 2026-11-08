"""
Neural Dreamer Nodes — the time maths of ND LoRA Stack H3 Temporal (no torch, no ComfyUI: plain functions).

The `t` field of a stack entry (version 1):

    {"v": 1, "on": true, "audio": false, "shared": true, "base": 0,
     "ranges": [{"s": 1.0, "e": 3.5, "fi": 0.25, "fo": 0.25, "w": 1}, {"s": 6, "e": null, "fi": 0.5, "fo": 0, "w": 1}]}

    on      false: the LoRA works on the whole video, as in the plain ND LoRA Stack
    audio   true: the same curve is applied to the audio of the video (video is always on)
    shared  true: text, reference and modulation layers (they cannot be placed in time) keep the full strength
    base    share of the strength outside of the ranges (0..1)
    s, e    start and end in seconds; e = null: to the end of the video
    fi, fo  fade in / fade out in seconds (smoothstep); fi = 0: a hard edge
    w       weight of the range (0..2)

The time grid of MiniMax H3: 24 fps, a video latent frame holds 1, 4, 4, 4, 4 pixel frames in turn (17 frames per 5 latent
frames); the audio latent has 40 frames per second.  The same maths lives in js/lora_temporal.js (tools/tests/temporal_vectors.json
checks both).
"""

import math

TAG = "[ND LoRA Stack H3 Temporal]"
FPS = 24
AUDIO_FPS = 40
FRAME_PER_TOKEN = (1, 4, 4, 4, 4)
_PREFIX = (0, 1, 5, 9, 13)  # pixel frame each latent of a cycle of five starts at
VERSION = 1
W_MAX = 2.0


class TemporalError(ValueError):
    pass


# ------------------------------------------------------------------ the grid

def align_frame_count(n):
    n = max(5, int(n))
    while n % 17 != 5:
        n += 1
    return n


def video_latent_t(frame_count):
    return 2 if frame_count <= 5 else ((frame_count - 5) // 17) * 5 + 2


def temporal_shape(length):
    """(pixel frames, video latent frames, audio latent frames) of a video of `length` frames, as the H3 nodes make it."""
    frames = align_frame_count(length)
    return frames, video_latent_t(frames), round(frames / FPS * AUDIO_FPS)


def duration(length):
    return align_frame_count(length) / FPS


def latent_start(k):
    """Pixel frame the video latent number k starts at (counted from the start of the whole video)."""
    return (k // 5) * 17 + _PREFIX[k % 5]


def latent_center(k, fps=FPS):
    return (latent_start(k) + latent_start(k + 1)) / 2.0 / fps


def audio_center(j):
    return (j + 0.5) / AUDIO_FPS


# ------------------------------------------------------------------ the field `t`

def _num(v, name, idx, lo=None, hi=None, default=None, clamp=False):
    if v is None:
        if default is None:
            raise TemporalError(f"{TAG} entry {idx + 1}: `{name}` is missing")
        return default
    try:
        n = float(v)
    except (TypeError, ValueError):
        raise TemporalError(f"{TAG} entry {idx + 1}: `{name}` is not a number") from None
    if not math.isfinite(n):
        raise TemporalError(f"{TAG} entry {idx + 1}: `{name}` is not a finite number")
    if lo is not None and n < lo:
        if clamp:
            return lo
        raise TemporalError(f"{TAG} entry {idx + 1}: `{name}` must be at least {lo}")
    if hi is not None and n > hi:
        if clamp:
            return hi
        raise TemporalError(f"{TAG} entry {idx + 1}: `{name}` must be at most {hi}")
    return n


def parse_temporal(t, idx=0):
    """The normal form of the field `t` of an entry, or None when the entry has none.  Wrong values give a clear error."""
    if t is None:
        return None
    if not isinstance(t, dict):
        raise TemporalError(f"{TAG} entry {idx + 1}: `t` must be an object")
    ranges = []
    raw = t.get("ranges") or []
    if not isinstance(raw, list):
        raise TemporalError(f"{TAG} entry {idx + 1}: `t.ranges` must be an array")
    for i, r in enumerate(raw):
        if not isinstance(r, dict):
            raise TemporalError(f"{TAG} entry {idx + 1}: range {i + 1} must be an object")
        s = _num(r.get("s", 0), "s", idx, lo=0.0, default=0.0)
        e = r.get("e")
        e = None if e is None else _num(e, "e", idx, lo=0.0)
        if e is not None and e <= s:
            raise TemporalError(f"{TAG} entry {idx + 1}: range {i + 1} ends ({e:g} s) before it starts ({s:g} s)")
        ranges.append({
            "s": s, "e": e,
            "fi": _num(r.get("fi", 0), "fi", idx, lo=0.0, default=0.0),
            "fo": _num(r.get("fo", 0), "fo", idx, lo=0.0, default=0.0),
            "w": _num(r.get("w", 1), "w", idx, lo=0.0, hi=W_MAX, default=1.0, clamp=True),
        })
    return {
        "v": VERSION,
        "on": bool(t.get("on", False)),
        "audio": bool(t.get("audio", False)),
        "shared": bool(t.get("shared", True)),
        "base": _num(t.get("base", 0), "base", idx, lo=0.0, hi=1.0, default=0.0, clamp=True),
        "ranges": ranges,
    }


def is_timed(t):
    """True when the entry really works in time: switched on and with at least one range."""
    return bool(t) and t["on"] and len(t["ranges"]) > 0


def _smooth(u):
    u = min(1.0, max(0.0, u))
    return u * u * (3.0 - 2.0 * u)


def ramp(sec, r):
    """0..1 of one range at the time `sec`."""
    s, e = r["s"], r["e"]
    if sec < s or (e is not None and sec > e):
        return 0.0
    fi, fo = r["fi"], (r["fo"] if e is not None else 0.0)
    if e is not None and fi + fo > e - s:  # the fades do not fit: both shrink in proportion
        k = (e - s) / (fi + fo)
        fi, fo = fi * k, fo * k
    up = 1.0 if fi <= 0 else _smooth((sec - s) / fi)
    down = 1.0 if fo <= 0 else _smooth((e - sec) / fo)
    return min(up, down)


def value(sec, t, strength=1.0):
    """The strength of the LoRA at the time `sec` (seconds from the start of the video)."""
    if not is_timed(t):
        return strength
    v = t["base"]
    for r in t["ranges"]:
        v = max(v, r["w"] * ramp(sec, r))
    return strength * v


# ------------------------------------------------------------------ vectors for the model

def video_weights(latent_idx, t, strength=1.0):
    """One strength per video latent frame; `latent_idx` are the numbers of the latent frames in the whole video."""
    return [value(latent_center(k), t, strength) for k in latent_idx]


def audio_weights(audio_idx, t, strength=1.0):
    """One strength per audio latent frame (zeros when the audio switch is off)."""
    if not (t and t["audio"]):
        return [0.0] * len(list(audio_idx))
    return [value(audio_center(j), t, strength) for j in audio_idx]


def shared_weight(t, strength=1.0):
    return strength if (t is None or t["shared"]) else 0.0


def beyond_video(t, length):
    """True when no range touches the video: worth a warning."""
    if not is_timed(t):
        return False
    d = duration(length)
    return all(r["s"] >= d for r in t["ranges"]) and t["base"] == 0
