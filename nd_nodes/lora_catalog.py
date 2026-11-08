"""
Neural Dreamer Nodes — the catalog of LoRAs for ND LoRA Stack (and for other interfaces that show the same stack).

  GET  /nd/loras                       [{name, folder, size, mtime, preview, title, base, words, url, usage, version, notes, nsfw, nsfw_src, nsfw_level}]
  GET  /nd/loras/preview?name=…        a small picture of the LoRA (256 px; &big=1: up to 1024 px)
  GET  /nd/loras/video?name=…          the video preview as it lies on the disk (Range works, so the browser can seek)
  POST /nd/loras/nsfw {name, nsfw}     nsfw: true / false: the person's mark; null: back to automatic. Answers with the new entry.
  GET  /nd/loras/h3info?name=…         what the LoRA changes in a MiniMax H3 model (read from the header of the file only, see h3_info)

`preview` is null (nothing to show) or {kind: "image" | "video", v: <modification time>, image: <true when a still picture exists too>}.
The names come from ComfyUI's own list of LoRAs (folder_paths), so nothing outside the model folders can be asked for.

What shows a LoRA (the first that exists wins):
  1. the file that `preview_url` of LoRA Manager's `name.metadata.json` names, if it lies in the same folder as the LoRA
  2. `name.preview.mp4|webm`, `name.mp4|webm`   (video)
  3. `name.preview.png|jpg|jpeg|webp`, `name.png|…`, then the cover that safetensors keep in their header (picture)
A video that has a picture next to it also gets that picture as its poster (`image: true`).

NSFW. Automatic: `preview_nsfw_level` of LoRA Manager, else `nsfwLevel` of the first image of the Civitai data, else `model.nsfw`; from level 4 (R) up
it counts (Civitai levels: 1 PG, 2 PG-13, 4 R, 8 X, 16 XXX, 32 Blocked). The person's mark lives next to the LoRA in `name.nd.json` ({"nsfw": true}),
a file of our own: the files of other tools are never changed. It beats the automatic value; without the key the value is automatic.

The title, the base model and the trigger words come from what lies next to the file (the first that has them wins):
`name.metadata.json` (LoRA Manager), `name.civitai.info` / `name.info` (Civitai), `name.txt` and the header of a safetensors file.
"""

import base64
import io
import json
import logging
import os
import struct

FOLDER = "loras"
IMAGE_EXT = (".png", ".jpg", ".jpeg", ".webp")
VIDEO_EXT = (".mp4", ".webm")
THUMB = 256
BIG = 1024
NSFW_FROM = 4          # Civitai level R
MARK_SUFFIX = ".nd.json"

_info_cache = {}   # key (see lora_info) -> dict
_thumb_cache = {}  # (path, mtime, size) -> (bytes, content type)
_THUMB_CACHE_MAX = 400


def _folder_paths():
    import folder_paths  # only inside ComfyUI

    return folder_paths


def _stem(path):
    return os.path.splitext(path)[0]


def mark_path(path):
    return _stem(path) + MARK_SUFFIX


# ------------------------------------------------------------------ pictures and videos


def _first_existing(stems, exts):
    for stem in stems:
        for ext in exts:
            p = stem + ext
            if os.path.isfile(p):
                return p
    return None


def side_picture(path):
    """The picture lying next to a LoRA, or None."""
    base = _stem(path)
    return _first_existing((base + ".preview", base), IMAGE_EXT)


def side_video(path):
    """The video lying next to a LoRA, or None."""
    base = _stem(path)
    return _first_existing((base + ".preview", base), VIDEO_EXT)


def pointed_media(path, lm):
    """The file that `preview_url` of LoRA Manager points to: (path, kind), or None.
    Only the file NAME counts and it is looked for in the folder of the LoRA: the manager writes the full path of the machine it ran on
    (`Y:/…/Krea2/name.jpeg`), which may be another path here, and nothing outside the folder of the LoRA can be asked for."""
    url = lm.get("preview_url") if isinstance(lm, dict) else None
    if not isinstance(url, str) or not url.strip() or url.strip().startswith(("http://", "https://")):
        return None
    leaf = url.strip().replace("\\", "/").rstrip("/").split("/")[-1]
    ext = os.path.splitext(leaf)[1].lower()
    kind = "video" if ext in VIDEO_EXT else "image" if ext in IMAGE_EXT else ""
    cand = os.path.join(os.path.dirname(path), leaf)
    if kind and leaf not in (".", "..") and os.path.isfile(cand):
        return cand, kind
    return None


def header_meta(path):
    """The `__metadata__` of a safetensors file ({} when there is none or the file is not readable)."""
    if not path.lower().endswith(".safetensors"):
        return {}
    try:
        with open(path, "rb") as f:
            raw = f.read(8)
            if len(raw) < 8:
                return {}
            (n,) = struct.unpack("<Q", raw)
            if n <= 0 or n > 64 * 1024 * 1024:
                return {}
            header = json.loads(f.read(n).decode("utf-8", "replace"))
        meta = header.get("__metadata__")
        return meta if isinstance(meta, dict) else {}
    except Exception:
        return {}


def cover_of(path, meta=None):
    """The first cover picture kept in the metadata of a safetensors file (bytes), or None."""
    try:
        meta = header_meta(path) if meta is None else meta
        covers = meta.get("ssmd_cover_images")
        if not covers:
            return None
        if isinstance(covers, str):
            covers = json.loads(covers)
        if isinstance(covers, list) and covers:
            return base64.b64decode(covers[0])
    except Exception:
        return None
    return None


# ------------------------------------------------------------------ what the files next to the LoRA say


def _read_json(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _words_of(value):
    """A list of words from a list or from a comma separated string; clean, no repeats, in order."""
    if isinstance(value, str):
        value = [x for line in value.splitlines() for x in line.split(",")]
    out = []
    if isinstance(value, (list, tuple)):
        for w in value:
            w = str(w).strip()
            if w and w not in out:
                out.append(w)
    return out


def _top_tags(meta, limit=8):
    """The most used tags of the training set (`ss_tag_frequency`): {dataset: {tag: count}}."""
    try:
        freq = meta.get("ss_tag_frequency")
        if isinstance(freq, str):
            freq = json.loads(freq)
        total = {}
        for tags in (freq or {}).values():
            for tag, n in (tags or {}).items():
                total[tag] = total.get(tag, 0) + int(n)
        return [t for t, _ in sorted(total.items(), key=lambda kv: -kv[1])[:limit]]
    except Exception:
        return []


def side_files(path):
    """The files next to the LoRA that carry its description or the person's mark (the ones that exist)."""
    base = _stem(path)
    return [p for p in (base + ".metadata.json", base + ".civitai.info", base + ".info", base + ".txt", base + MARK_SUFFIX) if os.path.isfile(p)]


def _usage_text(value):
    """The usage tips as plain text: LoRA Manager keeps them as a JSON string ({"strength_range": ..., ...}) or as free text."""
    if value is None:
        return ""
    if isinstance(value, str):
        v = value.strip()
        if v[:1] in "{[":
            try:
                value = json.loads(v)
            except Exception:
                return v
        else:
            return v
    if isinstance(value, dict):
        lines = []
        for k, x in value.items():
            if x in (None, "", [], {}):
                continue
            lines.append(f"{str(k).replace('_', ' ')}: {x}")
        return "\n".join(lines)
    if isinstance(value, (list, tuple)):
        return "\n".join(str(x) for x in value if x not in (None, ""))
    return str(value)


def _extras(lm, cv, info):
    """(page url, usage tips, version name, notes) — only what the files really say."""
    url = ""
    for d in (lm, info, cv):
        for k in ("source_url", "civitai_url", "url"):
            v = d.get(k)
            if isinstance(v, str) and v.startswith(("http://", "https://")):
                url = url or v
    if not url:
        for d in (cv, info):
            mid = d.get("modelId")
            if mid is None and isinstance(d.get("model"), dict):
                mid = d["model"].get("id")
            if isinstance(mid, (int, str)) and str(mid).strip().isdigit():
                vid = d.get("id")
                url = f"https://civitai.com/models/{int(str(mid))}" + (f"?modelVersionId={int(str(vid))}" if isinstance(vid, (int, str)) and str(vid).strip().isdigit() else "")
                break
    usage = _usage_text(lm.get("usage_tips"))
    version = ""
    for d in (cv, info):
        version = version or str(d.get("name") or "")
    notes = str(lm.get("notes") or "").strip()
    return url, usage, version, notes[:2000]


def _level(value):
    """A Civitai level as a whole number (0 when there is none)."""
    if isinstance(value, bool):
        return 0
    try:
        n = int(value)
        return n if n > 0 else 0
    except (TypeError, ValueError):
        return 0


def auto_nsfw(lm, cv, info):
    """(is it NSFW, the level it comes from) by the data of the files: level of the preview, level of the first image, `model.nsfw`."""
    level = _level(lm.get("preview_nsfw_level"))
    if not level:
        for d in (cv, info):
            images = d.get("images")
            if isinstance(images, list) and images and isinstance(images[0], dict):
                level = _level(images[0].get("nsfwLevel"))
                if level:
                    break
    if level:
        return level >= NSFW_FROM, level
    for d in (cv, info):
        m = d.get("model") if isinstance(d.get("model"), dict) else {}
        if m.get("nsfw") is True:
            return True, 0
    return False, 0


def describe(path):
    """{title, base, words, url, usage, version, notes, auto_nsfw, nsfw_level, pointed} from the side files and the header of the model file."""
    title, base, words = "", "", []
    meta = header_meta(path)
    stem = os.path.splitext(os.path.basename(path))[0]
    side = {os.path.basename(p)[len(stem):]: p for p in side_files(path)}
    lm = _read_json(side[".metadata.json"]) if ".metadata.json" in side else {}
    cv = lm.get("civitai") if isinstance(lm.get("civitai"), dict) else {}
    info = {}
    for k in (".civitai.info", ".info"):
        if k in side:
            info = _read_json(side[k])
            break
    for c in (cv, info):
        words = words or _words_of(c.get("trainedWords"))
        base = base or str(c.get("baseModel") or "")
        m = c.get("model") if isinstance(c.get("model"), dict) else {}
        title = title or str(m.get("name") or "")
    base = str(lm.get("base_model") or "") or base
    title = str(lm.get("model_name") or "") or title
    if not words and ".txt" in side:
        try:
            with open(side[".txt"], "r", encoding="utf-8", errors="replace") as f:
                words = _words_of(f.read(4000))
        except Exception:
            pass
    words = words or _words_of(meta.get("modelspec.trigger_phrase")) or _top_tags(meta)
    base = base or str(meta.get("modelspec.architecture") or meta.get("ss_base_model_version") or "")
    title = title or str(meta.get("modelspec.title") or "")
    url, usage, version, notes = _extras(lm, cv, info)
    nsfw, level = auto_nsfw(lm, cv, info)
    return {"title": title, "base": base, "words": words[:24], "url": url, "usage": usage, "version": version, "notes": notes,
            "auto_nsfw": nsfw, "nsfw_level": level, "pointed": pointed_media(path, lm)}


def read_mark(path):
    """The person's mark: True / False, or None (no file, no key, a broken file)."""
    v = _read_json(mark_path(path)).get("nsfw")
    return v if isinstance(v, bool) else None


def write_mark(path, value):
    """Writes (True / False) or removes (None) the person's mark. The other keys of the file stay as they are; an empty file is removed."""
    mp = mark_path(path)
    data = _read_json(mp) if os.path.isfile(mp) else {}
    if value is None:
        data.pop("nsfw", None)
    else:
        data["nsfw"] = bool(value)
    if not data:
        try:
            os.remove(mp)
        except FileNotFoundError:
            pass
        return
    tmp = mp + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, mp)


def media_of(path, pointed=None):
    """(file, kind) that shows the LoRA, or None; kind is "video" or "image" (the cover of a safetensors file has no file: ("", "image"))."""
    if pointed:
        return pointed
    v = side_video(path)
    if v:
        return v, "video"
    p = side_picture(path)
    if p:
        return p, "image"
    if cover_of(path):
        return "", "image"
    return None


def _hit(path):
    """The cached facts about one LoRA file (keys that start with _ are for this module only), or None when the file cannot be read."""
    try:
        key = (path, os.path.getmtime(path), tuple((p, os.path.getmtime(p)) for p in side_files(path)), side_video(path), side_picture(path))
    except OSError:
        return None
    hit = _info_cache.get(key)
    if hit is None:
        d = describe(path)
        got = media_of(path, d.pop("pointed"))
        preview, file, kind = None, "", ""
        if got:
            file, kind = got
            has_image = kind == "image" or bool(side_picture(path) or cover_of(path))
            try:
                v = int(os.path.getmtime(file)) if file else int(key[1])
            except OSError:
                v = int(key[1])
            preview = {"kind": kind, "v": v, "image": has_image}
        mark = read_mark(path)
        hit = {**d, "preview": preview, "nsfw": mark if mark is not None else d["auto_nsfw"], "nsfw_src": "user" if mark is not None else "auto", "_file": file, "_kind": kind}
        hit.pop("auto_nsfw")
        if len(_info_cache) > 5000:
            _info_cache.clear()
        _info_cache[key] = hit
    return hit


EMPTY = {"preview": None, "title": "", "base": "", "words": [], "url": "", "usage": "", "version": "", "notes": "", "nsfw": False, "nsfw_src": "auto", "nsfw_level": 0}


def lora_info(path):
    """The description, the preview and the NSFW flag of one LoRA file, cached by the modification times of the file and of what lies next to it."""
    hit = _hit(path)
    return {k: (list(v) if isinstance(v, list) else dict(v) if isinstance(v, dict) else v) for k, v in hit.items() if not k.startswith("_")} if hit else dict(EMPTY)


def media_file(path):
    """(file, kind) that shows the LoRA ("" for the cover inside a safetensors file), or None."""
    hit = _hit(path)
    return (hit["_file"], hit["_kind"]) if hit and hit["_kind"] else None


# ------------------------------------------------------------------ the picture


def picture_bytes(path):
    """(bytes, content type) of the still picture of a LoRA, or None. A LoRA that is shown by a video may have one next to it too."""
    got = media_file(path)
    p = got[0] if got and got[0] and got[1] == "image" else None
    p = p or side_picture(path)
    if p:
        with open(p, "rb") as f:
            data = f.read()
        ext = os.path.splitext(p)[1].lower()
        return data, {".png": "image/png", ".webp": "image/webp"}.get(ext, "image/jpeg")
    data = cover_of(path)
    if data:
        return data, "image/png" if data[:4] == b"\x89PNG" else ("image/webp" if data[8:12] == b"WEBP" else "image/jpeg")
    return None


def thumbnail(path, size=THUMB):
    """A picture of at most `size` px (PIL when there is one), cached by the modification time."""
    try:
        key = (path, os.path.getmtime(path), size)
    except OSError:
        return None
    if key in _thumb_cache:
        return _thumb_cache[key]
    got = picture_bytes(path)
    if got is None:
        return None
    data, ctype = got
    try:
        from PIL import Image

        im = Image.open(io.BytesIO(data))
        im.thumbnail((size, size))
        out = io.BytesIO()
        if im.mode in ("RGBA", "LA", "P"):
            im.convert("RGBA").save(out, "PNG")
            ctype = "image/png"
        else:
            im.convert("RGB").save(out, "JPEG", quality=84)
            ctype = "image/jpeg"
        data = out.getvalue()
    except Exception:
        pass  # without PIL the picture goes as it is
    if len(_thumb_cache) >= _THUMB_CACHE_MAX:
        _thumb_cache.clear()
    _thumb_cache[key] = (data, ctype)
    return _thumb_cache[key]


# ------------------------------------------------------------------ the list


def entry(name, full):
    """One record of the catalog (None when the file cannot be read)."""
    try:
        st = os.stat(full)
    except OSError:
        return None
    return {"name": name, "folder": FOLDER, "size": st.st_size, "mtime": int(st.st_mtime), **lora_info(full)}


def list_loras(fp=None):
    fp = fp or _folder_paths()
    out = []
    for name in fp.get_filename_list(FOLDER):
        full = fp.get_full_path(FOLDER, name)
        e = entry(name, full) if full else None
        if e:
            out.append(e)
    return out


def full_path(name, fp=None):
    """The file of a LoRA, only when ComfyUI lists it."""
    fp = fp or _folder_paths()
    if not isinstance(name, str) or name not in set(fp.get_filename_list(FOLDER)):
        return None
    return fp.get_full_path(FOLDER, name)


def video_path(name, fp=None):
    """The video file that shows the LoRA, or None."""
    full = full_path(name, fp)
    if not full:
        return None
    got = media_file(full)
    return got[0] if got and got[1] == "video" and got[0] else None


def set_mark(name, value, fp=None):
    """The person's mark (True / False / None = automatic); the new entry, or None when there is no such LoRA."""
    full = full_path(name, fp)
    if not full:
        return None
    if value is not None and not isinstance(value, bool):
        raise ValueError("nsfw must be true, false or null")
    write_mark(full, value)
    return entry(name, full)


_H3_SUFFIXES = (".lora_down.weight", ".lora_up.weight", ".lora_A.weight", ".lora_B.weight", ".lora_A.default.weight",
                ".lora_B.default.weight", ".alpha", ".dora_scale", ".diff", ".diff_b", ".lokr_w1", ".lokr_w2", ".lokr_w1_a",
                ".lokr_w1_b", ".lokr_w2_a", ".lokr_w2_b", ".lokr_t2", ".hada_w1_a", ".hada_w1_b", ".hada_w2_a", ".hada_w2_b")
_H3_GROUPS = (("adaln", "adaln_proj"), ("refiner", "token_refiner"), ("refiner", "condition_proj"), ("patch_proj", "patch_proj"),
              ("final", "final_layer"), ("attn", "_attn_"), ("mlp", "_mlp_"))
_h3_cache = {}  # (path, mtime) -> dict


def read_safetensors_header(path, limit=64 * 1024 * 1024):
    """The JSON header of a .safetensors file (the tensors are not read), or None."""
    try:
        with open(path, "rb") as f:
            raw = f.read(8)
            if len(raw) < 8:
                return None
            n = struct.unpack("<Q", raw)[0]
            if n <= 0 or n > limit:
                return None
            head = json.loads(f.read(n).decode("utf-8"))
        return head if isinstance(head, dict) else None
    except (OSError, ValueError, UnicodeDecodeError):
        return None


def h3_group(base):
    """The group of layers a LoRA module belongs to in MiniMax H3, by its name (any usual key style)."""
    k = "_" + base.replace(".", "_") + "_"
    for group, token in _H3_GROUPS:
        if token in k:
            return group
    return "other"


def h3_info_from_header(head):
    """What a LoRA changes in MiniMax H3, from the header of its safetensors file."""
    modules, ranks, dtypes, clip = {}, [], {}, False
    for key, meta in head.items():
        if key == "__metadata__" or not isinstance(meta, dict):
            continue
        low = key.lower()
        if "lora_te" in low or "text_encoder" in low or low.startswith("te_") or "clip" in low:
            clip = True
            continue
        base = key
        for suf in _H3_SUFFIXES:
            if key.endswith(suf):
                base = key[:-len(suf)]
                break
        modules.setdefault(base, key)
        shape = meta.get("shape") or []
        if key.endswith((".lora_down.weight", ".lora_A.weight", ".lora_A.default.weight")) and len(shape) == 2:
            ranks.append(int(shape[0]))
        elif key.endswith((".lora_up.weight", ".lora_B.weight", ".lora_B.default.weight")) and len(shape) == 2:
            ranks.append(int(shape[1]))
        dt = meta.get("dtype")
        if dt:
            dtypes[dt] = dtypes.get(dt, 0) + 1
    groups = {}
    for base in modules:
        g = h3_group(base)
        groups[g] = groups.get(g, 0) + 1
    total = len(modules)
    known = total - groups.get("other", 0)
    timeable = sum(groups.get(g, 0) for g in ("attn", "mlp", "patch_proj", "final"))
    return {
        "format": "safetensors", "modules": total, "rank": [min(ranks), max(ranks)] if ranks else None,
        "groups": groups, "timeable": timeable, "fixed": groups.get("adaln", 0) + groups.get("refiner", 0),
        "match": round(100.0 * known / total) if total else 0, "clip": clip,
        "dtype": max(dtypes, key=dtypes.get) if dtypes else None,
    }


def h3_info(path):
    """What the LoRA at `path` changes in MiniMax H3 (cached by the modification time)."""
    try:
        key = (path, os.path.getmtime(path))
    except OSError:
        return None
    got = _h3_cache.get(key)
    if got is None:
        head = read_safetensors_header(path) if path.lower().endswith(".safetensors") else None
        got = h3_info_from_header(head) if head is not None else {"format": "other"}
        for k in [k for k in _h3_cache if k[0] == path]:
            del _h3_cache[k]
        _h3_cache[key] = got
        while len(_h3_cache) > 200:
            _h3_cache.pop(next(iter(_h3_cache)))
    return got


def register():
    try:
        from aiohttp import web
        from server import PromptServer

        routes = PromptServer.instance.routes
    except Exception:
        return  # no server (tests, a plain import)

    @routes.get("/nd/loras/preview")
    async def nd_loras_preview(request):
        path = full_path(request.query.get("name", ""))
        if not path:
            return web.Response(status=404)
        got = thumbnail(path, BIG if request.query.get("big") else THUMB)
        if got is None:
            return web.Response(status=404)
        return web.Response(body=got[0], content_type=got[1], headers={"Cache-Control": "max-age=3600"})

    @routes.get("/nd/loras/video")
    async def nd_loras_video(request):
        path = video_path(request.query.get("name", ""))
        if not path:
            return web.Response(status=404)
        return web.FileResponse(path, headers={"Cache-Control": "max-age=3600"})

    @routes.get("/nd/loras/h3info")
    async def nd_loras_h3info(request):
        path = full_path(request.query.get("name", ""))
        info = h3_info(path) if path else None
        if info is None:
            return web.Response(status=404)
        return web.json_response(info)

    @routes.post("/nd/loras/nsfw")
    async def nd_loras_nsfw(request):
        try:
            data = await request.json()
            if not isinstance(data, dict) or "nsfw" not in data:
                raise ValueError("nsfw is missing")
            e = set_mark(data.get("name"), data["nsfw"])
        except ValueError as ex:
            return web.json_response({"error": str(ex)}, status=400)
        except Exception as ex:  # the folder is read only, the disk is full…
            logging.warning("[Neural Dreamer Nodes] cannot save the NSFW mark: %s", ex)
            return web.json_response({"error": "cannot save the mark"}, status=500)
        if e is None:
            return web.json_response({"error": "unknown LoRA"}, status=404)
        return web.json_response(e)

    @routes.get("/nd/loras")
    async def nd_loras_list(request):
        try:
            return web.json_response(list_loras())
        except Exception as e:  # a broken file must not break the gallery
            logging.warning("[Neural Dreamer Nodes] LoRA list failed: %s", e)
            return web.json_response([])


register()

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
