// Neural Dreamer Nodes — Load Images (modular image loader)
//
// The whole node state lives in the hidden `state` widget (JSON), so it is saved
// with the workflow. The Python side reads the same JSON (nd_nodes/load_images.py).
//
// Per-pin caching: when a prompt is queued, every node fed by this node through
// Unpack Parameters is re-pointed to an internal NDLoadImagesPart that gets only the
// data of that one value (see splitIntoParts), so a value re-runs only when it changes.
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { el, dirty, toast, hideWidget, chain, bindCanvasNavigation, injectStyleOnce, blankSlots, ND_REG, nativeTrackCss, setRangeFill } from "./nd_common.js";

const NODE = "NDLoadImages";
const PART = "NDLoadImagesPart";
const PACK = "NDPack";
const UNPACK = "NDUnpack";
const SLIDER = "NDValueSlider";
const BLOCK_FIELD = "*"; // a part that returns the whole "Image N Parameters" bundle
// images dragged from other nodes of the pack (ND Variant Preview Selector)
export const ND_IMAGE_MIME = "application/x-nd-image";
const MAX_BLOCKS = 20;
const DEFAULT_IMAGE = "example.png";
const KEEP_MODES = ["crop", "pad white", "pad black", "pad edge", "pad edge color", "stretch"];
const SCALE_METHODS = ["nearest-exact", "bilinear", "area", "bicubic", "lanczos"];
const RESERVED = new Set(["image", "mask", "keep_proportion", "enabled"]);
const DEFAULT_SETTINGS = {
    maskButton: true,
    keepEnabled: true,
    keepApply: true,
    scaleMethod: "lanczos",
    sliderEnabled: true,
    sliderName: "Strength",
    sliderMin: 0.0,
    sliderMax: 1.0,
    sliderStep: 0.1,
    lockOrder: false,
};

const REG = ND_REG; // shared with js/params.js (one registry per page)

/* -------------------------------------------------------------------- icons */

const svg = (body, size = 14) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON = {
    gear: svg('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'),
    grip: svg('<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>'),
    upload: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>', 13),
    mask: svg('<path d="M9.06 11.9l8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>', 13),
    crop: svg('<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>', 13),
    rotL: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>', 15),
    rotR: svg('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>', 15),
    flipH: svg('<path d="M12 3v18"/><path d="M16 7l4 5-4 5z"/><path d="M8 7l-4 5 4 5z"/>', 15),
    flipV: svg('<path d="M3 12h18"/><path d="M7 8l5-4 5 4z"/><path d="M7 16l5 4 5-4z"/>', 15),
    close: svg('<path d="M18 6L6 18"/><path d="M6 6l12 12"/>', 12),
    lock: svg('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', 13),
    reset: svg('<path d="M3 12a9 9 0 1 0 2.64-6.36L3 8"/><path d="M3 3v5h5"/>', 14),
    eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>', 15),
    eyeOff: svg('<path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-6.5 0-10-7-10-7a18.4 18.4 0 0 1 5.06-5.94"/><path d="M2 2l20 20"/>', 15),
};

/* -------------------------------------------------------------------- state */

const uid = () => "b" + Math.random().toString(36).slice(2, 9);
const defaultEdit = () => ({ rotate: 0, flipH: false, flipV: false, crop: null });
const defaultBlock = () => ({
    id: uid(), enabled: true, image: DEFAULT_IMAGE, masked: null, edit: defaultEdit(),
    keep: "crop", slider: 1.0, settings: { ...DEFAULT_SETTINGS },
});

function normalizeState(raw) {
    let s;
    try { s = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { s = null; }
    if (!s || typeof s !== "object") s = {};
    let blocks = Array.isArray(s.blocks) && s.blocks.length ? s.blocks.slice(0, MAX_BLOCKS) : [defaultBlock()];
    const seen = new Set();
    blocks = blocks.map((b) => {
        const d = defaultBlock();
        const out = { ...d, ...(b && typeof b === "object" ? b : {}) };
        out.settings = { ...DEFAULT_SETTINGS, ...(b?.settings || {}) };
        out.edit = { ...defaultEdit(), ...(b?.edit || {}) };
        if (!KEEP_MODES.includes(out.keep)) out.keep = "crop";
        if (!SCALE_METHODS.includes(out.settings.scaleMethod)) out.settings.scaleMethod = DEFAULT_SETTINGS.scaleMethod;
        out.settings.lockOrder = !!out.settings.lockOrder;
        if (!out.id || seen.has(out.id)) out.id = uid();
        seen.add(out.id);
        return out;
    });
    return { version: 1, hideBlockSettings: !!s.hideBlockSettings, blocks };
}

const sliderKey = (s) => {
    const n = String(s.sliderName ?? "").trim() || "slider";
    return RESERVED.has(n) ? "slider" : n;
};

// Fields of one block's bundle, in the order the server builds them.
function blockFields(b) {
    const s = b.settings;
    const f = [{ name: "image", type: "IMAGE" }, { name: "mask", type: "MASK" }];
    if (s.keepEnabled) f.push({ name: "keep_proportion", type: "STRING" });
    if (s.sliderEnabled) f.push({ name: sliderKey(s), type: "FLOAT" });
    f.push({ name: "enabled", type: "BOOLEAN" });
    return f;
}

// The "state" widget is the source of truth: it is restored with the workflow before
// the node's UI catches up, and every change in the UI is written to it.
function stateOf(node) {
    const w = node.widgets?.find((x) => x.name === "state");
    if (w && w.value) return normalizeState(w.value);
    return node.ndLI?.state ?? normalizeState(null);
}

// Pack Parameters asks what goes in: the target size for Keep Proportion.
const SIZE_FIELDS = [{ name: "width", type: "INT", optional: true }, { name: "height", type: "INT", optional: true }];
REG.consumers.set(NODE, () => SIZE_FIELDS);

// Unpack Parameters asks this what the output wire contains.
REG.providers.set(NODE, (node, slot) => {
    if (slot !== 0) return null;
    const titles = node.properties?.nd_titles || {};
    return stateOf(node).blocks.map((b, i) => ({
        name: `Image ${i + 1} Parameters`,
        // a block named in its settings shows that name on the Unpack output
        label: String(titles[b.id] ?? "").trim() ? `${String(titles[b.id]).trim()} Parameters` : undefined,
        type: "ND_PARAMS",
        sub: () => blockFields(b),
    }));
});

/* ------------------------------------------------------------------- images */

function splitRef(ref) {
    let s = String(ref || "").replace(/\s*\[(input|output|temp)\]\s*$/, "");
    const i = s.lastIndexOf("/");
    return i >= 0 ? { subfolder: s.slice(0, i), filename: s.slice(i + 1) } : { subfolder: "", filename: s };
}

function viewUrl(ref) {
    const { subfolder, filename } = splitRef(ref);
    const q = new URLSearchParams({ filename, type: "input", subfolder });
    return api.apiURL(`/view?${q.toString()}`);
}

const imgCache = new Map();
const imgReady = new Map(); // url -> loaded image (for synchronous size checks)
function loadImg(ref) {
    const url = viewUrl(ref);
    if (!imgCache.has(url)) {
        imgCache.set(url, new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => { imgReady.set(url, img); resolve(img); };
            img.onerror = () => { imgCache.delete(url); reject(new Error(`Cannot load ${ref}`)); };
            img.src = url;
        }));
    }
    return imgCache.get(url);
}

async function uploadFile(file) {
    const body = new FormData();
    body.append("image", file, file.name);
    body.append("type", "input");
    const res = await api.fetchApi("/upload/image", { method: "POST", body });
    if (!res.ok) throw new Error(`Upload failed (${res.status})`);
    const d = await res.json();
    return d.subfolder ? `${d.subfolder}/${d.name}` : d.name;
}

// An image of another node (ND Variant Preview Selector) or a /view URL: files of the
// input folder are used as they are, temp / output files are copied into it.
function refOfInfo(info) {
    const filename = String(info?.filename || "");
    if (!filename) return null;
    const sub = String(info.subfolder || "");
    return sub ? `${sub}/${filename}` : filename;
}

async function importInfo(info) {
    if ((info.type || "input") === "input") return refOfInfo(info);
    const q = new URLSearchParams({ filename: info.filename, type: info.type || "temp", subfolder: info.subfolder || "" });
    const res = await api.fetchApi(`/view?${q.toString()}`);
    if (!res.ok) throw new Error(`Cannot read ${info.filename} (${res.status})`);
    const blob = await res.blob();
    return uploadFile(new File([blob], info.filename, { type: blob.type || "image/png" }));
}

function infoOfUrl(uri) {
    try {
        const u = new URL(uri, window.location.href);
        if (u.origin === window.location.origin && /\/view$/.test(u.pathname) && u.searchParams.get("filename")) {
            return { filename: u.searchParams.get("filename"), subfolder: u.searchParams.get("subfolder") || "", type: u.searchParams.get("type") || "output" };
        }
    } catch {}
    return null;
}

async function fileOfUrl(uri) {
    const res = await fetch(uri);
    if (!res.ok) throw new Error(`Cannot read the dropped image (${res.status})`);
    const blob = await res.blob();
    if (!/^image\//.test(blob.type)) throw new Error("The dropped item is not an image.");
    let name = "image.png";
    try { name = decodeURIComponent(new URL(uri).pathname.split("/").pop()) || name; } catch {}
    if (!/\.[a-z0-9]+$/i.test(name)) name += "." + (blob.type.split("/")[1] || "png");
    return new File([blob], name, { type: blob.type });
}

const dropKinds = (dt) => {
    const t = [...(dt?.types || [])];
    return { nd: t.includes(ND_IMAGE_MIME), files: t.includes("Files"), uri: t.includes("text/uri-list") };
};

/* ------------------------------------------------------------------ prompt */
// ComfyUI caches a node by the inputs of its whole ancestry, so any change in the state of
// Load Images (a slider, say) would re-run everything after it. In the queued prompt, every
// node fed by Load Images through Unpack Parameters is re-pointed to an internal
// NDLoadImagesPart that gets only the data of that one value; the nodes of the graph stay
// as they are, and the values are the same.

const isWire = (v) => Array.isArray(v) && v.length === 2 && (typeof v[0] === "string" || typeof v[0] === "number") && typeof v[1] === "number";
const jsonList = (t) => { try { const d = JSON.parse(t || "[]"); return Array.isArray(d) ? d : []; } catch { return []; } };
const safeId = (t) => String(t).replace(/[^\w]/g, "_");

// Does the parameters wire carry width and height (a Pack with both fields wired or set)?
function packHasSize(output, wire) {
    const n = isWire(wire) ? output[String(wire[0])] : null;
    if (n?.class_type !== PACK) return false;
    const names = jsonList(n.inputs?.names);
    return ["width", "height"].every((f) => names.some((e) => e?.name === f && e.slot in (n.inputs || {})));
}

// The block reduced to what one value depends on.
function partInputs(output, loadId, st, block, field) {
    const s = block.settings;
    if (field === "image" || field === "mask" || field === BLOCK_FIELD) {
        const keepOn = !!(s.keepEnabled && s.keepApply);
        let mini;
        if (field === BLOCK_FIELD) {
            const { id, ...rest } = block;
            mini = rest;
        } else {
            mini = { image: block.image, masked: block.masked, edit: block.edit, settings: { keepEnabled: keepOn, keepApply: keepOn } };
            if (keepOn) { mini.keep = block.keep; mini.settings.scaleMethod = s.scaleMethod; }
        }
        const inputs = { block: JSON.stringify(mini), field };
        if (keepOn) {
            const L = output[loadId];
            if (isWire(L.inputs?.params)) inputs.params = L.inputs.params;
            if (!packHasSize(output, L.inputs?.params)) {
                const first = st.blocks.find((b) => b.enabled);
                if (first) inputs.size_ref = JSON.stringify({ image: first.image, masked: first.masked, edit: first.edit });
            }
            inputs.owner = String(loadId);
        }
        return inputs;
    }
    let mini;
    if (field === "keep_proportion") mini = { keep: block.keep, settings: { keepEnabled: !!s.keepEnabled } };
    else if (field === "enabled") mini = { enabled: !!block.enabled };
    else if (s.sliderEnabled && sliderKey(s) === field) mini = { slider: block.slider, settings: { sliderEnabled: true, sliderName: s.sliderName } };
    else mini = { settings: { keepEnabled: false, sliderEnabled: false } }; // not in the bundle: None
    return { block: JSON.stringify(mini), field };
}

export function splitIntoParts(output) {
    if (!output || typeof output !== "object") return output;
    const loads = Object.keys(output).filter((id) => output[id]?.class_type === NODE && typeof output[id].inputs?.state === "string");
    if (!loads.length) return output;

    // [load id, "Image N Parameters", field?] for a wire coming out of Load Images / its Unpacks
    const pathOf = (wire, depth = 0) => {
        if (!isWire(wire) || depth > 32) return null;
        const n = output[String(wire[0])];
        if (!n) return null;
        if (n.class_type === NODE) return wire[1] === 0 && loads.includes(String(wire[0])) ? { load: String(wire[0]), path: [] } : null;
        if (n.class_type !== UNPACK) return null;
        const name = jsonList(n.inputs?.names)[wire[1]];
        if (name == null) return null;
        const parent = pathOf(n.inputs?.params, depth + 1);
        return parent ? { load: parent.load, path: [...parent.path, String(name)] } : null;
    };

    const states = new Map();
    const made = new Map(); // inputs as JSON -> part id
    const partFor = ({ load, path }) => {
        if (!path.length || path.length > 2) return null;
        const m = /^Image (\d+) Parameters$/.exec(path[0]);
        if (!m) return null;
        if (!states.has(load)) states.set(load, normalizeState(output[load].inputs.state));
        const st = states.get(load);
        const index = Number(m[1]) - 1;
        const block = st.blocks[index];
        if (!block) return null;
        const field = path.length === 2 ? path[1] : BLOCK_FIELD;
        const inputs = partInputs(output, load, st, block, field);
        const key = JSON.stringify(inputs);
        if (made.has(key)) return made.get(key);
        const base = `nd_li_${safeId(load)}_${index + 1}_${field === BLOCK_FIELD ? "all" : safeId(field)}`;
        let id = base;
        for (let k = 2; output[id]; k++) id = `${base}_${k}`;
        output[id] = { class_type: PART, inputs, _meta: { title: `ND Load Images Part (${path.join(" / ")})` } };
        made.set(key, id);
        return id;
    };

    for (const [id, n] of Object.entries(output)) {
        if (!n?.inputs || n.class_type === UNPACK || n.class_type === PART) continue;
        if (made.size && [...made.values()].includes(id)) continue;
        for (const [key, v] of Object.entries(n.inputs)) {
            const p = pathOf(v);
            if (!p) continue;
            const part = partFor(p);
            if (part) n.inputs[key] = [part, 0];
        }
    }
    return output;
}

function installQueueHook() {
    if (api.__ndLoadImagesHook) return;
    api.__ndLoadImagesHook = true;
    const orig = api.queuePrompt.bind(api);
    api.queuePrompt = async function (number, data, ...rest) {
        try {
            if (data?.output) splitIntoParts(data.output);
        } catch (e) {
            console.warn("[Neural Dreamer] Load Images: prompt split failed", e);
        }
        return orig(number, data, ...rest);
    };
}

/* ------------------------------------------------------------- target size */
// The size Keep Proportion resizes to, for the eye preview: the width and height wired
// into the input when they can be read in the graph, the size of the first enabled image
// without them, otherwise the size the last Run used.

function originOf(node, inputIndex, depth = 0) {
    const inp = node?.inputs?.[inputIndex];
    if (!inp || inp.link == null || depth > 32) return null;
    const link = getLink(node.graph, inp.link);
    const src = link ? node.graph?.getNodeById?.(link.origin_id) : null;
    if (!src) return null;
    if ((src.comfyClass || src.type) === "Reroute") return originOf(src, 0, depth + 1);
    return { node: src, slot: link.origin_slot };
}

function getLink(graph, id) {
    if (id == null || !graph) return null;
    return graph.getLink?.(id) ?? graph.links?.get?.(id) ?? graph.links?.[id] ?? graph._links?.get?.(id) ?? null;
}

// A number set in the graph (ND Slider, a primitive, ND Resolution, a widget named like the output).
function numberAt(src) {
    const n = src?.node;
    if (!n) return null;
    const cls = n.comfyClass || n.type;
    let v = null;
    if (cls === UNPACK) {
        // width / height unpacked from an ND Resolution
        const field = jsonList(n.widgets?.find((w) => w.name === "names")?.value)[src.slot];
        const pi = n.inputs?.findIndex((x) => x.name === "params") ?? -1;
        const from = pi >= 0 ? originOf(n, pi) : null;
        const size = from?.node?.ndRes?.size?.();
        if (!size || (field !== "width" && field !== "height")) return null;
        return field === "width" ? size[0] : size[1];
    }
    if (cls === SLIDER) {
        try { v = JSON.parse(n.widgets?.find((w) => w.name === "state")?.value || "{}").value; } catch {}
    } else if (cls === "PrimitiveNode") {
        v = n.widgets?.[0]?.value;
    } else {
        const out = n.outputs?.[src.slot]?.name;
        v = (n.widgets?.find((w) => w.name === "value") ?? n.widgets?.find((w) => w.name === out))?.value;
    }
    v = Number(v);
    return Number.isFinite(v) ? Math.round(v) : null;
}

// {kind: "size", size} | {kind: "first"} (no width/height) | {kind: "unknown"}
function inputSize(node) {
    const i = node.inputs?.findIndex((x) => x.name === "params") ?? -1;
    const src = i >= 0 ? originOf(node, i) : null;
    if (!src) return { kind: "first" };
    if ((src.node.comfyClass || src.node.type) !== PACK) return { kind: "unknown" };
    const names = jsonList(src.node.widgets?.find((w) => w.name === "names")?.value);
    const val = (f) => {
        const e = names.find((x) => x?.name === f);
        if (!e) return undefined;
        const k = src.node.inputs?.findIndex((x) => x.name === e.slot) ?? -1;
        return k >= 0 ? numberAt(originOf(src.node, k)) : undefined;
    };
    const w = val("width"), h = val("height");
    if (w === undefined || h === undefined) return { kind: "first" };
    if (w == null || h == null) return { kind: "unknown" };
    return w > 0 && h > 0 ? { kind: "size", size: [w, h] } : { kind: "first" };
}

// Prompt ids of nodes inside subgraphs look like "12:5" (subgraph node 12 -> node 5).
function nodeOfApiId(id) {
    const parts = String(id).split(":");
    const get = (g, k) => g?.getNodeById?.(Number(k)) ?? g?.getNodeById?.(k) ?? null;
    let g = app.graph;
    for (let i = 0; i < parts.length - 1 && g; i++) g = get(g, parts[i])?.subgraph ?? null;
    return get(g, parts[parts.length - 1]);
}

// Geometry of the edited image: rotate (clockwise) -> flip -> crop, as on the server.
function editedGeometry(img, edit) {
    const w = img.naturalWidth, h = img.naturalHeight;
    const k = ((Math.round((edit.rotate || 0) / 90) % 4) + 4) % 4;
    const rw = k % 2 ? h : w, rh = k % 2 ? w : h;
    const c = Array.isArray(edit.crop) && edit.crop.length === 4 ? edit.crop : [0, 0, 1, 1];
    return { w, h, k, rw, rh, cx: c[0] * rw, cy: c[1] * rh, cw: Math.max(1, c[2] * rw), ch: Math.max(1, c[3] * rh) };
}

// Sizes `canvas` for a picture of w x h (image px) fitted into maxW x maxH (CSS px);
// returns the context and the scale from image px to canvas px.
function fitCanvas(canvas, w, h, maxW, maxH) {
    const s = Math.max(0.0001, Math.min(maxW / w, maxH / h));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(w * s)), H = Math.max(1, Math.round(h * s));
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return { ctx, k: s * dpr, W, H };
}

// Draws the edited image (geometry g) with `k` canvas px per image px.
function drawEdited(ctx, img, edit, g, k) {
    ctx.setTransform(k, 0, 0, k, -g.cx * k, -g.cy * k);
    ctx.translate(g.rw / 2, g.rh / 2);
    ctx.scale(edit.flipH ? -1 : 1, edit.flipV ? -1 : 1);
    ctx.rotate((g.k * Math.PI) / 2);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, -g.w / 2, -g.h / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
}

// Draws the edited image into `canvas`, fitted into maxW x maxH (CSS px).
function paintEdited(canvas, img, edit, maxW, maxH, ignoreCrop = false) {
    const e = ignoreCrop ? { ...edit, crop: null } : edit;
    const g = editedGeometry(img, e);
    const { ctx, k, W, H } = fitCanvas(canvas, g.cw, g.ch, maxW, maxH);
    drawEdited(ctx, img, e, g, k);
    return { W, H, g };
}

// Average colour of a row or column of `data` (RGBA), weighted by alpha.
function edgeColor(data, w, h, side) {
    let r = 0, gg = 0, b = 0, a = 0;
    const n = side === "left" || side === "right" ? h : w;
    for (let i = 0; i < n; i++) {
        const x = side === "left" ? 0 : side === "right" ? w - 1 : i;
        const y = side === "top" ? 0 : side === "bottom" ? h - 1 : i;
        const o = (y * w + x) * 4, al = data[o + 3];
        r += data[o] * al; gg += data[o + 1] * al; b += data[o + 2] * al; a += al;
    }
    if (!a) return "rgb(0,0,0)";
    return `rgb(${Math.round(r / a)},${Math.round(gg / a)},${Math.round(b / a)})`;
}

// The block's final image as the server makes it: the edit, then Keep Proportion to
// target = [w, h] (same maths as keep_proportion() in nd_nodes/load_images.py).
// Without a target (or with Keep Proportion off) it is the edited image.
function paintFinal(canvas, img, block, target, maxW, maxH) {
    const g = editedGeometry(img, block.edit);
    const s = block.settings;
    if (!(s.keepEnabled && s.keepApply && target)) {
        paintEdited(canvas, img, block.edit, maxW, maxH);
        return [Math.round(g.cw), Math.round(g.ch)];
    }
    const [tw, th] = target;
    const cw = Math.max(1, Math.round(g.cw)), ch = Math.max(1, Math.round(g.ch));
    // the edited image, at most 1600 px on its long side
    const s0 = Math.min(1, 1600 / Math.max(cw, ch));
    const ed = document.createElement("canvas");
    ed.width = Math.max(1, Math.round(cw * s0));
    ed.height = Math.max(1, Math.round(ch * s0));
    const ectx = ed.getContext("2d", { willReadFrequently: true });
    drawEdited(ectx, img, block.edit, g, s0);

    const { ctx, k } = fitCanvas(canvas, tw, th, maxW, maxH);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const mode = block.keep;
    if (mode === "stretch") {
        ctx.drawImage(ed, 0, 0, tw, th);
    } else if (mode === "crop") {
        const sc = Math.max(tw / cw, th / ch);
        const nw = Math.max(tw, Math.round(cw * sc)), nh = Math.max(th, Math.round(ch * sc));
        ctx.drawImage(ed, -Math.floor((nw - tw) / 2), -Math.floor((nh - th) / 2), nw, nh);
    } else {
        const sc = Math.min(tw / cw, th / ch);
        const nw = Math.max(1, Math.min(tw, Math.round(cw * sc))), nh = Math.max(1, Math.min(th, Math.round(ch * sc)));
        const left = Math.floor((tw - nw) / 2), top = Math.floor((th - nh) / 2);
        const right = tw - nw - left, bottom = th - nh - top;
        const EW = ed.width, EH = ed.height;
        if (mode === "pad white" || mode === "pad black") {
            ctx.fillStyle = mode === "pad white" ? "#fff" : "#000";
            ctx.fillRect(0, 0, tw, th);
        } else if (mode === "pad edge color") {
            const data = ectx.getImageData(0, 0, EW, EH).data;
            // same order as the server: the top and bottom bands cover the corners
            const fill = (side, x, y, w, h) => { if (w > 0 && h > 0) { ctx.fillStyle = edgeColor(data, EW, EH, side); ctx.fillRect(x, y, w, h); } };
            fill("left", 0, 0, left, th);
            fill("right", left + nw, 0, right, th);
            fill("top", 0, 0, tw, top);
            fill("bottom", 0, top + nh, tw, bottom);
        } else if (mode === "pad edge") {
            // the edge pixels repeated outwards
            ctx.imageSmoothingEnabled = false;
            const strip = (sx, sy, sw, sh, x, y, w, h) => { if (w > 0 && h > 0) ctx.drawImage(ed, sx, sy, sw, sh, x, y, w, h); };
            strip(0, 0, 1, EH, 0, top, left, nh);
            strip(EW - 1, 0, 1, EH, left + nw, top, right, nh);
            strip(0, 0, EW, 1, left, 0, nw, top);
            strip(0, EH - 1, EW, 1, left, top + nh, nw, bottom);
            strip(0, 0, 1, 1, 0, 0, left, top);
            strip(EW - 1, 0, 1, 1, left + nw, 0, right, top);
            strip(0, EH - 1, 1, 1, 0, top + nh, left, bottom);
            strip(EW - 1, EH - 1, 1, 1, left + nw, top + nh, right, bottom);
            ctx.imageSmoothingEnabled = true;
        }
        ctx.drawImage(ed, left, top, nw, nh);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return [tw, th];
}

/* ------------------------------------------------------------- mask editor */
// The stock ComfyUI mask editor reads the image from node.images / node.imgs and,
// on save, uploads its layers through /upload/image. While our session is open we
// point the node at the block's image and pick up the uploaded masked image.

let maskSession = null;
let fetchWrapped = false;

function wrapFetchOnce() {
    if (fetchWrapped) return;
    fetchWrapped = true;
    const orig = api.fetchApi.bind(api);
    api.fetchApi = async function (route, options, ...rest) {
        const res = await orig(route, options, ...rest);
        try {
            const sess = maskSession;
            if (sess && res.ok && /\/upload\/(image|mask)/.test(String(route)) && options?.body instanceof FormData) {
                const file = options.body.get("image");
                const sent = String(file?.name || "");
                const data = await res.clone().json();
                const ref = data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
                const painted = /painted-masked/.test(sent) || /painted-masked/.test(data.name || "");
                const legacy = /\/upload\/mask/.test(String(route)) || /^clipspace-mask-/.test(sent);
                // the new editor's last upload is the painted+masked image: use it at once;
                // older editors save only a "clipspace-mask" file: use it when the editor closes
                if (painted) { sess.result = ref; sess.final = true; sess.apply(ref); }
                else if (legacy && !sess.final) sess.result = ref;
            }
        } catch {}
        return res;
    };
}

function findDialogs() {
    return new Set(document.querySelectorAll(".p-dialog, [role='dialog'], .comfy-modal"));
}

async function openMaskEditor(node, block, onResult) {
    const ComfyApp = app.constructor;
    const ref = block.masked || block.image;
    let img;
    try { img = await loadImg(ref); } catch (e) { toast("error", "Load Images", e.message); return; }
    wrapFetchOnce();
    const { filename, subfolder } = splitRef(ref);
    const before = findDialogs();
    const prev = { images: node.images, imgs: node.imgs, imageIndex: node.imageIndex };
    node.images = [{ filename, subfolder, type: "input" }];
    node.imgs = [img];
    node.imageIndex = 0;

    let dialog = null;
    let observer = null;
    const finish = () => {
        const sess = maskSession;
        if (!sess || sess.node !== node) return;
        maskSession = null;
        if (sess.result && !sess.final) onResult(sess.result);
        observer?.disconnect();
        node.images = prev.images;
        node.imgs = prev.imgs;
        node.imageIndex = prev.imageIndex;
        try { if (app.nodeOutputs) delete app.nodeOutputs[String(node.id)]; } catch {}
        if (ComfyApp && "clipspace_return_node" in ComfyApp) ComfyApp.clipspace_return_node = null;
        dirty();
    };
    maskSession = { node, result: null, final: false, apply: (r) => onResult(r) };
    observer = new MutationObserver(() => {
        if (!dialog) {
            for (const d of document.querySelectorAll(".p-dialog, [role='dialog'], .comfy-modal")) {
                if (!before.has(d) && d.isConnected) { dialog = d; break; }
            }
        } else if (!dialog.isConnected) {
            setTimeout(finish, 300);
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { if (maskSession?.node === node && !dialog) { finish(); toast("warn", "Load Images", "The mask editor did not open."); } }, 5000);

    try {
        if (typeof ComfyApp?.open_maskeditor === "function") {
            try { ComfyApp.copyToClipspace?.(node); } catch {}
            ComfyApp.clipspace_return_node = node;
            ComfyApp.open_maskeditor();
        } else if (app.extensionManager?.command?.execute) {
            app.canvas?.selectNode?.(node, false);
            await app.extensionManager.command.execute("Comfy.MaskEditor.OpenMaskEditor");
        } else {
            throw new Error("The mask editor is not available in this ComfyUI version.");
        }
    } catch (e) {
        finish();
        toast("error", "Load Images", e?.message || String(e));
    }
}

/* ------------------------------------------------------------------ modals */

function stopKeys(elm) {
    for (const t of ["keydown", "keyup", "keypress"]) elm.addEventListener(t, (e) => e.stopPropagation());
}

function openModal({ title, wide = false, width = null, body, onApply, applyLabel = "Apply" }) {
    const back = el("div", "nd-li-back");
    const box = el("div", "nd-li-modal" + (wide ? " wide" : ""));
    if (width) box.style.width = `min(${width}px, 94vw)`;
    const head = el("div", "nd-li-mhead");
    head.append(el("span", null, title));
    const x = el("button", "nd-li-icon");
    x.type = "button";
    x.innerHTML = ICON.close;
    head.append(x);
    const content = el("div", "nd-li-mbody");
    const foot = el("div", "nd-li-mfoot");
    const cancel = el("button", "nd-li-btn", "Cancel");
    const ok = el("button", "nd-li-btn primary", applyLabel);
    cancel.type = ok.type = "button";
    box.append(head, content, foot);
    back.append(box);
    const close = () => { back.remove(); document.removeEventListener("keydown", onKey, true); };
    const apply = () => { if (onApply?.() !== false) close(); };
    const onKey = (e) => {
        if (e.key === "Escape") { e.preventDefault(); close(); }
        else if (e.key === "Enter" && e.target?.tagName !== "TEXTAREA") { e.preventDefault(); apply(); }
    };
    x.onclick = cancel.onclick = close;
    ok.onclick = apply;
    back.addEventListener("pointerdown", (e) => { if (e.target === back) close(); });
    document.addEventListener("keydown", onKey, true);
    stopKeys(back);
    body(content, foot);
    foot.append(el("span", "nd-li-spacer"), cancel, ok);
    injectStyleOnce("nd-li-style", STYLE);
    document.body.append(back);
    return { close, content, foot };
}

const field = (label, input, hint) => {
    const row = el("label", "nd-li-field");
    row.append(el("span", null, label), input);
    if (hint) row.append(el("small", null, hint));
    return row;
};
const checkbox = (label, checked) => {
    const row = el("label", "nd-li-check");
    const input = el("input");
    input.type = "checkbox";
    input.checked = !!checked;
    row.append(input, el("span", null, label));
    return { row, input };
};
const numberInput = (value, step = "any", min, max) => {
    const i = el("input");
    i.type = "number";
    i.step = step;
    if (min != null) i.min = min;
    if (max != null) i.max = max;
    i.value = value;
    return i;
};

function openNodeSettings(st, onApply) {
    let count, hide;
    openModal({
        title: "Load Images — settings",
        body: (c) => {
            count = numberInput(st.blocks.length, 1, 1, MAX_BLOCKS);
            hide = checkbox("Hide block settings", st.hideBlockSettings);
            c.append(
                field("Number of images", count, `1–${MAX_BLOCKS}. Removing images drops the last blocks.`),
                hide.row,
                el("small", "nd-li-note", "Hides the settings button of every block, so the setup of this workflow is not changed by accident."),
            );
        },
        onApply: () => {
            const n = Math.max(1, Math.min(MAX_BLOCKS, Math.round(Number(count.value)) || 1));
            onApply({ count: n, hideBlockSettings: hide.input.checked });
        },
    });
}

function openBlockSettings(block, index, onApply, customTitle = "") {
    const s = block.settings;
    const ui = {};
    openModal({
        title: `${customTitle || `Image ${index + 1}`} — block settings`,
        width: 540,
        body: (c) => {
            ui.title = el("input");
            ui.title.type = "text";
            ui.title.maxLength = 40;
            ui.title.placeholder = `Image ${index + 1}`;
            ui.title.value = customTitle;
            ui.mask = checkbox("Mask button", s.maskButton);
            ui.keep = checkbox("Keep Proportion selector", s.keepEnabled);
            ui.apply = checkbox("Keep Proportion changes the image (resize to the input width and height, or to the first enabled image without them)", s.keepApply);
            ui.scale = el("select");
            for (const m of SCALE_METHODS) { const o = el("option", null, m); o.value = m; ui.scale.append(o); }
            ui.scale.value = s.scaleMethod;
            ui.slider = checkbox("Slider", s.sliderEnabled);
            ui.lock = checkbox("Lock Order Position", s.lockOrder);
            ui.name = el("input");
            ui.name.type = "text";
            ui.name.value = s.sliderName;
            ui.min = numberInput(s.sliderMin);
            ui.max = numberInput(s.sliderMax);
            ui.step = numberInput(s.sliderStep, "any", 0);
            const grid = el("div", "nd-li-grid3");
            grid.append(field("Min", ui.min), field("Max", ui.max), field("Step", ui.step));
            const sub = el("div", "nd-li-sub");
            const scaleRow = field("Scaling method", ui.scale);
            scaleRow.classList.add("nd-li-scale");
            sub.append(ui.apply.row, scaleRow);
            const sub2 = el("div", "nd-li-sub");
            sub2.append(field("Slider name", ui.name), grid);
            const sync = () => {
                sub.classList.toggle("off", !ui.keep.input.checked);
                scaleRow.classList.toggle("off", !ui.apply.input.checked);
                sub2.classList.toggle("off", !ui.slider.input.checked);
            };
            ui.keep.input.onchange = ui.apply.input.onchange = ui.slider.input.onchange = sync;
            sync();
            c.append(field("Block name", ui.title, "Only the title shown in this node. Leave it empty for the default name."),
                el("div", "nd-li-sep"),
                ui.mask.row, ui.keep.row, sub, ui.slider.row, sub2,
                el("small", "nd-li-note", "Disabled options are hidden in the block and removed from its outputs (the mask output is always there)."),
                el("div", "nd-li-sep"), ui.lock.row,
                el("small", "nd-li-note", "The block stays at its current position: it cannot be dragged, and other blocks are reordered around it."));
        },
        onApply: () => {
            let min = Number(ui.min.value), max = Number(ui.max.value), step = Number(ui.step.value);
            if (!Number.isFinite(min)) min = 0;
            if (!Number.isFinite(max)) max = 1;
            if (max < min) [min, max] = [max, min];
            if (!(step > 0)) step = 0.1;
            onApply({
                blockTitle: ui.title.value.trim(),
                maskButton: ui.mask.input.checked,
                keepEnabled: ui.keep.input.checked,
                keepApply: ui.apply.input.checked,
                scaleMethod: ui.scale.value,
                lockOrder: ui.lock.input.checked,
                sliderEnabled: ui.slider.input.checked,
                sliderName: ui.name.value.trim() || "Strength",
                sliderMin: min, sliderMax: max, sliderStep: step,
            });
        },
    });
}

/* ------------------------------------------------------------- crop editor */

function openEditor(img, edit, onApply) {
    let rot = edit.rotate || 0, fh = !!edit.flipH, fv = !!edit.flipV;
    let crop = Array.isArray(edit.crop) ? [...edit.crop] : [0, 0, 1, 1];
    let stage, canvas, box, size, drawn = { W: 1, H: 1, g: null };

    const rotateCrop = (dir) => {
        const [x, y, w, h] = crop;
        crop = dir > 0 ? [1 - y - h, x, h, w] : [y, 1 - x - w, h, w];
    };
    const draw = () => {
        const r = stage.getBoundingClientRect();
        drawn = paintEdited(canvas, img, { rotate: rot, flipH: fh, flipV: fv }, Math.max(50, r.width - 24), Math.max(50, r.height - 24), true);
        placeBox();
    };
    const placeBox = () => {
        const cr = canvas.getBoundingClientRect(), sr = stage.getBoundingClientRect();
        const ox = cr.left - sr.left, oy = cr.top - sr.top;
        Object.assign(box.style, {
            left: `${ox + crop[0] * drawn.W}px`, top: `${oy + crop[1] * drawn.H}px`,
            width: `${crop[2] * drawn.W}px`, height: `${crop[3] * drawn.H}px`,
        });
        const g = drawn.g;
        if (g) size.textContent = `${Math.round(crop[2] * g.rw)} × ${Math.round(crop[3] * g.rh)} px`;
    };

    const modal = openModal({
        title: "Edit image",
        wide: true,
        applyLabel: "Apply",
        body: (c, foot) => {
            stage = el("div", "nd-li-stage");
            canvas = el("canvas", "nd-li-stage-canvas");
            box = el("div", "nd-li-cropbox");
            for (const h of ["nw", "n", "ne", "e", "se", "s", "sw", "w"]) {
                const hd = el("div", `nd-li-h ${h}`);
                hd.dataset.h = h;
                box.append(hd);
            }
            stage.append(canvas, box);
            c.append(stage);
            const tool = (icon, title, fn) => {
                const b = el("button", "nd-li-btn icon");
                b.type = "button";
                b.title = title;
                b.innerHTML = icon;
                b.onclick = () => { fn(); draw(); };
                return b;
            };
            size = el("span", "nd-li-size");
            foot.append(
                tool(ICON.rotL, "Rotate left", () => { rot = (rot + 270) % 360; rotateCrop(-1); }),
                tool(ICON.rotR, "Rotate right", () => { rot = (rot + 90) % 360; rotateCrop(1); }),
                tool(ICON.flipH, "Flip horizontally", () => { fh = !fh; crop = [1 - crop[0] - crop[2], crop[1], crop[2], crop[3]]; }),
                tool(ICON.flipV, "Flip vertically", () => { fv = !fv; crop = [crop[0], 1 - crop[1] - crop[3], crop[2], crop[3]]; }),
            );
            const reset = el("button", "nd-li-btn", "Reset");
            reset.type = "button";
            reset.onclick = () => { rot = 0; fh = fv = false; crop = [0, 0, 1, 1]; draw(); };
            foot.append(reset, size);

            // dragging: move the box or one of its 8 handles
            let drag = null;
            box.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                drag = { h: e.target.dataset.h || "move", x: e.clientX, y: e.clientY, start: [...crop] };
                box.setPointerCapture(e.pointerId);
            });
            box.addEventListener("pointermove", (e) => {
                if (!drag) return;
                const dx = (e.clientX - drag.x) / drawn.W, dy = (e.clientY - drag.y) / drawn.H;
                let [x, y, w, h] = drag.start;
                const MIN = 0.02;
                if (drag.h === "move") {
                    x = Math.min(Math.max(0, x + dx), 1 - w);
                    y = Math.min(Math.max(0, y + dy), 1 - h);
                } else {
                    let x1 = x + w, y1 = y + h;
                    if (drag.h.includes("w")) x = Math.min(Math.max(0, x + dx), x1 - MIN);
                    if (drag.h.includes("e")) x1 = Math.max(Math.min(1, x1 + dx), x + MIN);
                    if (drag.h.includes("n")) y = Math.min(Math.max(0, y + dy), y1 - MIN);
                    if (drag.h.includes("s")) y1 = Math.max(Math.min(1, y1 + dy), y + MIN);
                    w = x1 - x; h = y1 - y;
                }
                crop = [x, y, w, h];
                placeBox();
            });
            const end = () => { drag = null; };
            box.addEventListener("pointerup", end);
            box.addEventListener("pointercancel", end);
        },
        onApply: () => {
            const full = crop[0] < 0.001 && crop[1] < 0.001 && crop[2] > 0.999 && crop[3] > 0.999;
            onApply({ rotate: rot, flipH: fh, flipV: fv, crop: full ? null : crop.map((v) => Math.round(v * 1e5) / 1e5) });
        },
    });
    requestAnimationFrame(draw);
    const ro = new ResizeObserver(() => draw());
    ro.observe(stage);
    const obs = new MutationObserver(() => { if (!stage.isConnected) { ro.disconnect(); obs.disconnect(); } });
    obs.observe(document.body, { childList: true });
    return modal;
}

/* -------------------------------------------------------------- node setup */

const decimalsOf = (step) => {
    const s = String(step);
    return s.includes("e-") ? Number(s.split("e-")[1]) : (s.split(".")[1] || "").length;
};
const snap = (v, s) => {
    const { sliderMin: min, sliderMax: max, sliderStep: step } = s;
    let x = Math.min(max, Math.max(min, Number(v)));
    if (!Number.isFinite(x)) x = min;
    if (step > 0) x = min + Math.round((x - min) / step) * step;
    return Number(Math.min(max, Math.max(min, x)).toFixed(Math.min(8, decimalsOf(step) + 2)));
};
const isEdited = (e) => !!(e && (e.rotate || e.flipH || e.flipV || e.crop));

function setupLoadImages(node) {
    const wState = hideWidget(node, "state");
    let st = normalizeState(wState?.value);
    const views = new Map(); // block id -> view

    const root = el("div", "nd-li-root");
    const top = el("div", "nd-li-top");
    const count = el("span", "nd-li-count");
    const gear = el("button", "nd-li-icon");
    gear.type = "button";
    gear.title = "Node settings";
    gear.innerHTML = ICON.gear;
    top.append(count, el("span", "nd-li-spacer"), gear);
    const grid = el("div", "nd-li-grid");
    root.append(top, grid);

    node.ndLI = { get state() { return st; } };

    // subscribers of node.ndApi (other UIs over the same state): called once per change burst
    const subs = new Set();
    let notifyPending = false;
    const notify = () => {
        if (notifyPending) return;
        notifyPending = true;
        queueMicrotask(() => {
            notifyPending = false;
            for (const fn of [...subs]) { try { fn(); } catch (e) { console.warn("[ND Load Images] subscriber failed", e); } }
        });
    };

    // Block names are a UI-only label: kept in the node's properties (saved with the workflow,
    // never sent to the server, so renaming a block does not re-run anything), keyed by block id.
    const titles = () => ((node.properties ||= {}).nd_titles ||= {});
    const blockTitle = (b, i) => String(titles()[b.id] ?? "").trim() || `Image ${i + 1}`;
    // The eye (final result preview) of each block: UI only, like the names.
    const eyes = () => ((node.properties ||= {}).nd_eye ||= {});
    const eyeOn = (b) => !!node.properties?.nd_eye?.[b.id];
    let runSize = null; // the target size the last Run used (sent by the server)

    // Target size for the eye preview: [w, h], or null; `known` is false when it cannot be read.
    function targetSize() {
        const r = inputSize(node);
        if (r.kind === "size") return { size: r.size, from: "input" };
        if (r.kind === "unknown") return { size: runSize, from: runSize ? "last run" : "unknown" };
        const first = st.blocks.find((b) => b.enabled);
        if (!first) return { size: null, from: "none" };
        const img = imgReady.get(viewUrl(first.masked || first.image));
        if (!img) {
            loadImg(first.masked || first.image).then(() => repaintEyes(true)).catch(() => {});
            return { size: null, from: "loading" };
        }
        const g = editedGeometry(img, first.edit);
        return { size: [Math.round(g.cw), Math.round(g.ch)], from: "first image" };
    }
    let lastTarget = "";
    function repaintEyes(force = false) {
        if (!st.blocks.some(eyeOn)) return;
        const t = JSON.stringify(targetSize());
        if (!force && t === lastTarget) return;
        lastTarget = t;
        for (const b of st.blocks) if (eyeOn(b)) { const v = views.get(b.id); if (v) paintBlock(v); }
    }

    function commit(structural = false) {
        if (wState) wState.value = JSON.stringify(st);
        if (structural) REG.refresh?.();
        app.graph?.change?.();
        dirty();
        // a change in one block can move the target size of the others
        setTimeout(() => repaintEyes(), 0);
        notify();
    }

    gear.onclick = () => openNodeSettings(st, ({ count: n, hideBlockSettings }) => {
        while (st.blocks.length < n) st.blocks.push(defaultBlock());
        st.blocks.length = n;
        st.hideBlockSettings = hideBlockSettings;
        const ids = new Set(st.blocks.map((x) => x.id));
        for (const id of Object.keys(titles())) if (!ids.has(id)) delete titles()[id];
        for (const id of Object.keys(eyes())) if (!ids.has(id)) delete eyes()[id];
        commit(true);
        growNodeFor(n);
        renderAll();
    });

    function growNodeFor(n) {
        const cols = Math.min(n, 4), rows = Math.ceil(n / cols);
        const w = Math.max(node.size[0], cols * 230 + 20), h = Math.max(node.size[1], rows * 330 + 70);
        node.setSize([w, h]);
    }

    /* ---------- one block */
    function buildBlock(block) {
        const v = { block };
        const b = el("div", "nd-li-block");
        b.dataset.id = block.id;

        const head = el("div", "nd-li-head");
        const on = el("button", "nd-li-on");
        on.type = "button";
        on.title = "Enable / disable this image";
        const title = el("span", "nd-li-title");
        const bgear = el("button", "nd-li-icon small");
        bgear.type = "button";
        bgear.title = "Block settings";
        bgear.innerHTML = ICON.gear;
        const grip = el("div", "nd-li-grip");
        grip.title = "Drag to reorder";
        grip.innerHTML = ICON.grip;
        const lock = el("div", "nd-li-lock");
        lock.title = "Position locked (Lock Order Position in the block settings)";
        lock.innerHTML = ICON.lock;
        head.append(on, title, el("span", "nd-li-spacer"), bgear, grip, lock);

        const upload = el("button", "nd-li-btn upload");
        upload.type = "button";
        upload.innerHTML = `${ICON.upload}<span>Upload Image</span>`;
        const file = el("input");
        file.type = "file";
        file.accept = "image/*";
        file.style.display = "none";

        const view = el("div", "nd-li-view");
        const canvas = el("canvas", "nd-li-canvas");
        const missing = el("div", "nd-li-missing");
        const fname = el("div", "nd-li-fname");
        const resetBtn = el("button", "nd-li-reset");
        resetBtn.type = "button";
        resetBtn.title = "Reset to example.png (removes the mask, rotation, flip and crop)";
        resetBtn.innerHTML = ICON.reset;
        const eyeBtn = el("button", "nd-li-eye");
        eyeBtn.type = "button";
        const dims = el("div", "nd-li-dims");
        view.append(canvas, missing, fname, resetBtn, eyeBtn, dims);

        const tools = el("div", "nd-li-tools");
        const maskBtn = el("button", "nd-li-btn tool");
        maskBtn.type = "button";
        maskBtn.title = "Create / edit the mask in the ComfyUI mask editor";
        const maskClear = el("span", "nd-li-clear");
        maskClear.title = "Remove the mask";
        maskClear.innerHTML = ICON.close;
        maskBtn.innerHTML = `${ICON.mask}<span>Mask</span>`;
        maskBtn.append(maskClear);
        const keep = el("select", "nd-li-keep");
        keep.title = "Keep Proportion";
        for (const m of KEEP_MODES) { const o = el("option", null, m); o.value = m; keep.append(o); }
        const editBtn = el("button", "nd-li-btn tool");
        editBtn.type = "button";
        editBtn.title = "Crop, rotate or flip the image";
        editBtn.innerHTML = `${ICON.crop}<span>Edit</span>`;
        tools.append(maskBtn, keep, editBtn);

        const sliderRow = el("div", "nd-li-slider");
        const sLabel = el("span", "nd-li-slabel");
        const sValue = el("span", "nd-li-svalue");
        const range = el("input");
        range.type = "range";
        const sTop = el("div", "nd-li-stop");
        sTop.append(sLabel, sValue);
        sliderRow.append(sTop, range);

        b.append(head, upload, view, tools, sliderRow, file);
        Object.assign(v, { el: b, on, title, bgear, grip, lock, view, canvas, missing, fname, resetBtn, eyeBtn, dims, tools, maskBtn, keep, editBtn, sliderRow, sLabel, sValue, range, upload });

        // a new image for the block: a File (upload / drop) or a function giving its ref
        const setImage = async (f) => {
            if (!f) return;
            if (f instanceof Blob && !/^image\//.test(f.type || "image/")) return;
            try {
                view.classList.add("busy");
                const ref = typeof f === "function" ? await f() : await uploadFile(f);
                if (!ref) return;
                block.image = ref;
                block.masked = null;
                block.edit = defaultEdit();
                commit();
                updateBlock(v);
            } catch (e) {
                toast("error", "Load Images", e?.message || String(e));
            } finally {
                view.classList.remove("busy");
            }
        };

        on.onclick = () => { block.enabled = !block.enabled; commit(); updateBlock(v); };
        bgear.onclick = () => openBlockSettings(block, st.blocks.indexOf(block), ({ blockTitle: name, ...s }) => {
            if (name) titles()[block.id] = name;
            else delete titles()[block.id];
            block.settings = { ...block.settings, ...s };
            block.slider = snap(block.slider, block.settings);
            commit(true);
            updateBlock(v);
            layout();
        }, String(titles()[block.id] ?? "").trim());
        upload.onclick = () => file.click();
        file.onchange = () => { setImage(file.files?.[0]); file.value = ""; };
        // drop: image files, an image dragged from ND Variant Preview Selector, or an image URL
        for (const t of ["dragenter", "dragover"]) {
            b.addEventListener(t, (e) => {
                const k = dropKinds(e.dataTransfer);
                if (!k.nd && !k.files && !k.uri) return;
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "copy";
                view.classList.add("drop");
            });
        }
        b.addEventListener("dragleave", (e) => { if (!b.contains(e.relatedTarget)) view.classList.remove("drop"); });
        b.addEventListener("drop", (e) => {
            const dt = e.dataTransfer;
            const k = dropKinds(dt);
            if (!k.nd && !k.files && !k.uri) return;
            e.preventDefault();
            e.stopPropagation();
            view.classList.remove("drop");
            if (k.nd) {
                let info = null;
                try { info = JSON.parse(dt.getData(ND_IMAGE_MIME)); } catch {}
                if (info?.filename) { setImage(() => importInfo(info)); return; }
            }
            const file = [...(dt.files || [])].find((f) => /^image\//.test(f.type));
            if (file) { setImage(file); return; }
            const uri = (dt.getData("text/uri-list") || "").split(/\r?\n/).find((l) => l && !l.startsWith("#"));
            if (!uri) return;
            const info = infoOfUrl(uri);
            setImage(info ? () => importInfo(info) : async () => uploadFile(await fileOfUrl(uri)));
        });

        eyeBtn.onclick = () => {
            if (eyeOn(block)) delete eyes()[block.id];
            else eyes()[block.id] = true;
            app.graph?.change?.();
            updateBlock(v);
            notify();
        };

        resetBtn.onclick = () => {
            block.image = DEFAULT_IMAGE;
            block.masked = null;
            block.edit = defaultEdit();
            commit();
            updateBlock(v);
        };
        maskBtn.onclick = (e) => {
            if (e.target.closest(".nd-li-clear")) {
                block.masked = null;
                commit();
                updateBlock(v);
                return;
            }
            openMaskEditor(node, block, (ref) => {
                block.masked = ref;
                commit();
                updateBlock(v);
            });
        };
        keep.onchange = () => { block.keep = keep.value; commit(); if (eyeOn(block)) paintBlock(v); };
        editBtn.onclick = async () => {
            let img;
            try { img = await loadImg(block.masked || block.image); } catch (err) { toast("error", "Load Images", err.message); return; }
            openEditor(img, block.edit, (edit) => { block.edit = edit; commit(); updateBlock(v); });
        };
        range.oninput = () => {
            setRangeFill(range);
            block.slider = snap(range.value, block.settings);
            sValue.textContent = block.slider.toFixed(decimalsOf(block.settings.sliderStep));
        };
        range.onchange = () => commit();

        // reorder by dragging the grip
        let drag = null;
        grip.addEventListener("pointerdown", (e) => {
            if (e.button !== 0 || block.settings.lockOrder) return;
            e.preventDefault();
            e.stopPropagation();
            drag = { target: null };
            grip.setPointerCapture(e.pointerId);
            b.classList.add("lifted");
        });
        grip.addEventListener("pointermove", (e) => {
            if (!drag) return;
            const over = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".nd-li-block");
            const other = over && grid.contains(over) && over !== b ? st.blocks.find((x) => x.id === over.dataset.id) : null;
            // locked blocks are not drop targets: they keep their place
            const target = other && !other.settings.lockOrder ? over : null;
            if (drag.target !== target) {
                drag.target?.classList.remove("drop-target");
                target?.classList.add("drop-target");
                drag.target = target;
            }
        });
        const endDrag = () => {
            if (!drag) return;
            const target = drag.target;
            drag.target?.classList.remove("drop-target");
            b.classList.remove("lifted");
            drag = null;
            if (!target) return;
            if (!moveBlock(block, target.dataset.id)) return;
            commit(true);
            renderAll();
        };
        grip.addEventListener("pointerup", endDrag);
        grip.addEventListener("pointercancel", endDrag);
        return v;
    }

    // Move a block to another block's place. Locked blocks stay where they are; the
    // unlocked ones shift through the remaining places.
    function moveBlock(block, targetId) {
        const free = st.blocks.map((x, i) => (x.settings.lockOrder ? -1 : i)).filter((i) => i >= 0);
        const seq = free.map((i) => st.blocks[i]);
        const from = seq.indexOf(block), to = seq.findIndex((x) => x.id === targetId);
        if (from < 0 || to < 0 || from === to) return false;
        seq.splice(to, 0, seq.splice(from, 1)[0]);
        free.forEach((slot, k) => { st.blocks[slot] = seq[k]; });
        return true;
    }

    function updateBlock(v) {
        const b = v.block, s = b.settings;
        const i = st.blocks.indexOf(b);
        v.el.classList.toggle("off", !b.enabled);
        v.on.classList.toggle("active", !!b.enabled);
        v.title.textContent = blockTitle(b, i);
        v.title.title = v.title.textContent;
        v.bgear.style.display = st.hideBlockSettings ? "none" : "";
        v.grip.style.display = s.lockOrder ? "none" : "";
        v.lock.style.display = s.lockOrder ? "" : "none";
        v.maskBtn.style.display = s.maskButton ? "" : "none";
        v.maskBtn.classList.toggle("has", !!b.masked);
        v.keep.style.display = s.keepEnabled ? "" : "none";
        v.keep.value = b.keep;
        v.editBtn.classList.toggle("has", isEdited(b.edit));
        v.resetBtn.classList.toggle("dirty", b.image !== DEFAULT_IMAGE || !!b.masked || isEdited(b.edit));
        v.sliderRow.style.display = s.sliderEnabled ? "" : "none";
        v.range.min = s.sliderMin;
        v.range.max = s.sliderMax;
        v.range.step = s.sliderStep;
        b.slider = snap(b.slider, s);
        v.range.value = b.slider;
        setRangeFill(v.range);
        v.sLabel.textContent = String(s.sliderName ?? "").trim() || "Slider";
        v.sValue.textContent = b.slider.toFixed(decimalsOf(s.sliderStep));
        v.fname.textContent = splitRef(b.image).filename + (b.masked ? "  ·  mask" : "");
        const eye = eyeOn(b);
        v.eyeBtn.classList.toggle("on", eye);
        v.eyeBtn.innerHTML = eye ? ICON.eye : ICON.eyeOff;
        v.eyeBtn.title = eye
            ? "Showing the final image (edit + Keep Proportion). Click to show the source image"
            : "Show the final image: after crop / rotate / flip and Keep Proportion, as it leaves the node";
        v.dims.style.display = eye ? "" : "none";
        paintBlock(v);
    }

    async function paintBlock(v) {
        const b = v.block;
        const ref = b.masked || b.image;
        v.missing.textContent = "";
        let img;
        try {
            img = await loadImg(ref);
        } catch {
            v.canvas.style.display = "none";
            v.missing.textContent = `Not found: ${splitRef(ref).filename}`;
            return;
        }
        if (v.block !== b || (b.masked || b.image) !== ref) return;
        // layout size (CSS px before the canvas zoom transform)
        const w = v.view.clientWidth - 4, h = v.view.clientHeight - 4;
        if (w < 4 || h < 4) return;
        v.canvas.style.display = "";
        if (!eyeOn(b)) { paintEdited(v.canvas, img, b.edit, w, h); return; }
        const t = targetSize();
        const s = b.settings;
        const keepOn = s.keepEnabled && s.keepApply;
        const [fw, fh] = paintFinal(v.canvas, img, b, keepOn ? t.size : null, w, h);
        let note = "";
        if (keepOn) note = t.size ? `${b.keep} · ${t.from}` : t.from === "loading" ? "…" : "target size unknown";
        else note = "no Keep Proportion";
        v.dims.textContent = `${fw} × ${fh}` + (note ? `  ·  ${note}` : "");
        v.dims.title = keepOn && !t.size
            ? "The width and height of the input cannot be read in the graph; they are known after a Run."
            : "Size of the image this block outputs";
    }

    /* ---------- grid */
    function renderAll() {
        const ids = new Set(st.blocks.map((b) => b.id));
        for (const [id, v] of views) if (!ids.has(id)) { v.el.remove(); views.delete(id); }
        grid.replaceChildren();
        for (const b of st.blocks) {
            let v = views.get(b.id);
            if (!v || v.block !== b) { v?.el.remove(); v = buildBlock(b); views.set(b.id, v); }
            grid.append(v.el);
        }
        count.textContent = `${st.blocks.length} image${st.blocks.length === 1 ? "" : "s"}`;
        layout();
        for (const b of st.blocks) updateBlock(views.get(b.id));
    }

    // Columns that give the images the most room for the current node size.
    let lastCols = 0;
    function layout() {
        const n = st.blocks.length;
        const W = grid.clientWidth, H = grid.clientHeight;
        if (!W || !H) return;
        const first = views.get(st.blocks[0]?.id);
        const chrome = first ? Math.max(90, first.el.offsetHeight - first.view.offsetHeight) : 150;
        const gap = 6;
        let best = 1, bestScore = -1;
        for (let c = 1; c <= n; c++) {
            const rows = Math.ceil(n / c);
            const cw = (W - gap * (c - 1)) / c - 12;
            const ch = (H - gap * (rows - 1)) / rows - chrome;
            const score = Math.min(cw, ch);
            if (score > bestScore + 0.5) { bestScore = score; best = c; }
        }
        const rows = Math.ceil(n / best);
        grid.style.gridTemplateColumns = `repeat(${best}, minmax(0, 1fr))`;
        grid.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
        if (best !== lastCols) lastCols = best;
    }

    let rafId = 0;
    const ro = new ResizeObserver(() => {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
            layout();
            for (const v of views.values()) paintBlock(v);
        });
    });
    ro.observe(grid);

    bindCanvasNavigation(root, node);
    node.addDOMWidget("nd_load_images", "ND_LOAD_IMAGES", root, {
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => 220,
    });
    node.setSize([Math.max(node.size[0], 320), Math.max(node.size[1], 500)]);
    // never draw ComfyUI's own image preview on this node (the mask editor sets node.imgs)
    node.onDrawBackground = function () {};

    node.ndLI.restore = () => {
        st = normalizeState(wState?.value);
        if (wState) wState.value = JSON.stringify(st);
        for (const v of views.values()) v.el.remove();
        views.clear();
        renderAll();
        REG.refresh?.();
        notify();
    };
    node.ndLI.dispose = () => { ro.disconnect(); subs.clear(); };
    node.ndLI.setRunSize = (size) => { runSize = size; repaintEyes(true); };
    node.ndLI.checkEyes = () => repaintEyes();

    /* ---------- node.ndApi: the contract other UIs (ND UI Builder widgets) use.
       The node's own UI above is one more user of the same state; nothing here
       changes how it works. version 1 / kind "load-images". */
    const blockOf = (id) => st.blocks.find((b) => b.id === id) || null;
    const refresh = (b) => { const v = views.get(b.id); if (v) updateBlock(v); };
    const sourceToRef = async (src) => {
        if (!src) return null;
        if (src instanceof Blob) {
            if (!/^image\//.test(src.type || "image/")) throw new Error("The file is not an image.");
            return uploadFile(src);
        }
        if (typeof src === "function") return src();
        if (typeof src === "object" && src.filename) return importInfo(src);
        if (typeof src === "string") {
            const info = infoOfUrl(src);
            if (info) return importInfo(info);
            if (/^(https?:|blob:|data:)/.test(src)) return uploadFile(await fileOfUrl(src));
            return src; // a ref of the input folder: "folder/name.png"
        }
        return null;
    };
    node.ndApi = {
        kind: "load-images",
        version: 1,
        getState: () => JSON.parse(JSON.stringify(st)),
        setState(raw) {
            st = normalizeState(raw);
            commit(true);
            for (const v of views.values()) v.el.remove();
            views.clear();
            renderAll();
        },
        subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
        meta() {
            return {
                maxBlocks: MAX_BLOCKS,
                keepModes: [...KEEP_MODES],
                defaultImage: DEFAULT_IMAGE,
                titles: Object.fromEntries(st.blocks.map((b, i) => [b.id, blockTitle(b, i)])),
                eyes: Object.fromEntries(st.blocks.map((b) => [b.id, eyeOn(b)])),
                target: targetSize(),
            };
        },
        viewUrl: (ref) => viewUrl(ref),
        // paint a block into a canvas: the source (with the mask) or, final = true, as the node outputs it
        async paint(id, canvas, w, h, final = false) {
            const b = blockOf(id);
            if (!b) return false;
            const img = await loadImg(b.masked || b.image);
            if (final) {
                const t = targetSize(), s = b.settings;
                paintFinal(canvas, img, b, s.keepEnabled && s.keepApply ? t.size : null, w, h);
            } else paintEdited(canvas, img, b.edit, w, h);
            return true;
        },
        actions: {
            addBlock() {
                if (st.blocks.length >= MAX_BLOCKS) return null;
                const b = defaultBlock();
                st.blocks.push(b);
                commit(true);
                renderAll();
                return b.id;
            },
            removeBlock(id) {
                const b = blockOf(id);
                if (!b || st.blocks.length <= 1) return false;
                st.blocks.splice(st.blocks.indexOf(b), 1);
                delete titles()[id];
                delete eyes()[id];
                commit(true);
                renderAll();
                return true;
            },
            moveBlock(id, targetId) {
                const b = blockOf(id);
                if (!b || !moveBlock(b, targetId)) return false;
                commit(true);
                renderAll();
                return true;
            },
            // a File / Blob (uploaded), a {filename, subfolder, type} info, a /view URL or a ref
            async setFile(id, src) {
                const b = blockOf(id);
                if (!b) return false;
                const ref = await sourceToRef(src);
                if (!ref) return false;
                b.image = ref;
                b.masked = null;
                b.edit = defaultEdit();
                commit();
                refresh(b);
                return true;
            },
            reset(id) {
                const b = blockOf(id);
                if (!b) return false;
                b.image = DEFAULT_IMAGE;
                b.masked = null;
                b.edit = defaultEdit();
                commit();
                refresh(b);
                return true;
            },
            clearMask(id) {
                const b = blockOf(id);
                if (!b) return false;
                b.masked = null;
                commit();
                refresh(b);
                return true;
            },
            setEnabled(id, on) {
                const b = blockOf(id);
                if (!b) return false;
                b.enabled = !!on;
                commit();
                refresh(b);
                return true;
            },
            setKeep(id, mode) {
                const b = blockOf(id);
                if (!b || !KEEP_MODES.includes(mode)) return false;
                b.keep = mode;
                commit();
                refresh(b);
                return true;
            },
            setSlider(id, value) {
                const b = blockOf(id);
                if (!b) return false;
                b.slider = snap(value, b.settings);
                commit();
                refresh(b);
                return true;
            },
            setTitle(id, name) {
                const b = blockOf(id);
                if (!b) return false;
                const t = String(name ?? "").trim();
                if (t) titles()[id] = t; else delete titles()[id];
                commit();
                refresh(b);
                return true;
            },
            setEye(id, on) {
                const b = blockOf(id);
                if (!b) return false;
                if (on) eyes()[id] = true; else delete eyes()[id];
                app.graph?.change?.();
                refresh(b);
                notify();
                return true;
            },
            // heavy dialogs stay in the node: the crop / rotate editor, the mask editor, block settings
            async openEditor(id) {
                const b = blockOf(id);
                if (!b) return false;
                const img = await loadImg(b.masked || b.image);
                openEditor(img, b.edit, (edit) => { b.edit = edit; commit(); refresh(b); });
                return true;
            },
            openMask(id) {
                const b = blockOf(id);
                if (!b) return false;
                openMaskEditor(node, b, (ref) => { b.masked = ref; commit(); refresh(b); });
                return true;
            },
            openSettings(id) {
                const b = blockOf(id);
                if (!b) return false;
                openBlockSettings(b, st.blocks.indexOf(b), ({ blockTitle: name, ...s }) => {
                    if (name) titles()[id] = name; else delete titles()[id];
                    b.settings = { ...b.settings, ...s };
                    b.slider = snap(b.slider, b.settings);
                    commit(true);
                    refresh(b);
                    layout();
                }, String(titles()[id] ?? "").trim());
                return true;
            },
        },
        dispose() { subs.clear(); },
    };
    renderAll();
    if (wState) wState.value = JSON.stringify(st);
}

/* ------------------------------------------------------------------ styles */

const STYLE = `
.nd-li-root{--nd-accent:#2f7de1;display:flex;flex-direction:column;gap:5px;width:100%;height:100%;box-sizing:border-box;padding:2px 2px 4px;font-family:Inter,Arial,sans-serif;font-size:12px;color:var(--input-text,#ddd);user-select:none}
.nd-li-top{display:flex;align-items:center;gap:6px;flex:0 0 auto;height:24px}
.nd-li-count{opacity:.55;font-size:11px;padding-left:2px}
.nd-li-spacer{flex:1 1 auto}
.nd-li-icon{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:24px;height:24px;box-sizing:border-box;padding:0;margin:0;border:1px solid var(--border-color,#444);border-radius:5px;background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);cursor:pointer;line-height:0}
.nd-li-icon svg{display:block;pointer-events:none}
.nd-li-icon:hover{border-color:var(--nd-accent);color:var(--nd-accent)}
.nd-li-icon.small{width:22px;height:22px;border-color:transparent;background:transparent;opacity:.75}
.nd-li-icon.small:hover{opacity:1;border-color:var(--border-color,#444)}
.nd-li-grid{flex:1 1 auto;min-height:0;display:grid;gap:6px;grid-template-columns:1fr;grid-auto-rows:minmax(0,1fr)}
.nd-li-block{position:relative;display:flex;flex-direction:column;gap:5px;min-width:0;min-height:0;box-sizing:border-box;padding:6px;border:1px solid var(--border-color,#444);border-radius:8px;background:rgba(0,0,0,.18);transition:opacity .12s,border-color .12s}
.nd-li-block.lifted{opacity:.55;border-style:dashed}
.nd-li-block.drop-target{border-color:var(--nd-accent);box-shadow:0 0 0 1px var(--nd-accent) inset}
.nd-li-block.off>:not(.nd-li-head){opacity:.35}
.nd-li-block.off .nd-li-title{opacity:.5}
.nd-li-head{display:flex;align-items:center;gap:6px;flex:0 0 auto;height:22px}
.nd-li-on{flex:0 0 auto;width:14px;height:14px;padding:0;margin:0 2px;border-radius:50%;border:2px solid var(--input-text,#ddd);background:transparent;cursor:pointer;opacity:.85;box-sizing:border-box}
.nd-li-on.active{background:var(--nd-accent);border-color:var(--nd-accent);box-shadow:inset 0 0 0 2px var(--comfy-menu-bg,#1e1e1e);opacity:1}
.nd-li-title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nd-li-grip{display:inline-flex;align-items:center;justify-content:center;width:18px;height:22px;cursor:grab;opacity:.6;touch-action:none}
.nd-li-grip:hover{opacity:1}
.nd-li-grip svg{pointer-events:none}
.nd-li-lock{display:inline-flex;align-items:center;justify-content:center;width:18px;height:22px;opacity:.6;cursor:default}
.nd-li-lock svg{pointer-events:none}
.nd-li-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:24px;box-sizing:border-box;padding:0 9px;border:1px solid var(--border-color,#444);border-radius:5px;background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);font-size:12px;cursor:pointer;white-space:nowrap;min-width:0}
.nd-li-btn svg{flex:0 0 auto;pointer-events:none}
.nd-li-btn span{overflow:hidden;text-overflow:ellipsis}
.nd-li-btn:hover{border-color:var(--nd-accent)}
.nd-li-btn.primary{background:var(--nd-accent);border-color:var(--nd-accent);color:#fff}
.nd-li-btn.upload{flex:0 0 auto;width:100%}
.nd-li-btn.has{border-color:var(--nd-accent);color:var(--nd-accent)}
.nd-li-btn.icon{width:30px;padding:0}
.nd-li-clear{display:none;align-items:center;justify-content:center;width:16px;height:16px;margin-right:-4px;border-radius:3px}
.nd-li-btn.has .nd-li-clear{display:inline-flex}
.nd-li-clear:hover{background:#c0392b;color:#fff}
.nd-li-view{position:relative;flex:1 1 auto;min-height:40px;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:6px;background:rgba(0,0,0,.25)}
.nd-li-view.drop{outline:2px dashed var(--nd-accent);outline-offset:-4px}
.nd-li-view.busy{opacity:.5}
.nd-li-canvas{display:block;background-color:#3a3a3a;background-image:linear-gradient(45deg,#2a2a2a 25%,transparent 25%,transparent 75%,#2a2a2a 75%),linear-gradient(45deg,#2a2a2a 25%,transparent 25%,transparent 75%,#2a2a2a 75%);background-size:12px 12px;background-position:0 0,6px 6px}
.nd-li-missing{position:absolute;inset:auto 6px;text-align:center;opacity:.6;font-size:11px}
.nd-li-fname{position:absolute;left:4px;bottom:4px;max-width:calc(100% - 8px);padding:1px 6px;border-radius:3px;background:#000a;color:#fff;font-size:10px;line-height:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;transition:opacity .12s;pointer-events:none}
.nd-li-view:hover .nd-li-fname{opacity:1}
.nd-li-reset{position:absolute;top:6px;right:6px;z-index:2;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;box-sizing:border-box;padding:0;margin:0;border:1px solid rgba(255,255,255,.18);border-radius:6px;background:rgba(0,0,0,.55);color:#fff;cursor:pointer;line-height:0;opacity:.45;transition:opacity .12s,border-color .12s}
.nd-li-reset svg{display:block;pointer-events:none}
.nd-li-reset.dirty{opacity:.85}
.nd-li-reset:hover{opacity:1;border-color:var(--nd-accent);color:#fff;background:rgba(0,0,0,.75)}
.nd-li-eye{position:absolute;top:6px;left:6px;z-index:2;display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;box-sizing:border-box;padding:0;margin:0;border:1px solid rgba(255,255,255,.18);border-radius:6px;background:rgba(0,0,0,.55);color:#fff;cursor:pointer;line-height:0;opacity:.45;transition:opacity .12s,border-color .12s}
.nd-li-eye svg{display:block;pointer-events:none}
.nd-li-eye:hover{opacity:1;border-color:var(--nd-accent);background:rgba(0,0,0,.75)}
.nd-li-eye.on{opacity:1;border-color:var(--nd-accent);background:var(--nd-accent)}
.nd-li-dims{position:absolute;right:4px;bottom:4px;max-width:calc(100% - 8px);padding:1px 6px;border-radius:3px;background:#000b;color:#fff;font-size:10px;line-height:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.nd-li-view:hover .nd-li-dims{opacity:.25}
.nd-li-tools{display:flex;align-items:center;gap:5px;flex:0 0 auto;min-width:0}
.nd-li-btn.tool{flex:0 1 auto}
.nd-li-keep{flex:1 1 auto;min-width:0;height:24px;box-sizing:border-box;padding:0 4px;border:1px solid var(--border-color,#444);border-radius:5px;background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);font-size:12px;cursor:pointer}
.nd-li-slider{flex:0 0 auto;display:flex;flex-direction:column;gap:2px}
.nd-li-stop{display:flex;justify-content:space-between;font-size:11px}
.nd-li-slabel{opacity:.75}
.nd-li-svalue{font-variant-numeric:tabular-nums}
.nd-li-slider input{width:100%;margin:0;accent-color:var(--nd-accent);cursor:pointer}
${nativeTrackCss(".nd-li-slider input[type=range]")}
.nd-li-back{--nd-accent:#2f7de1;position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);font-family:Inter,Arial,sans-serif;font-size:13px;color:var(--input-text,#ddd)}
.nd-li-modal{display:flex;flex-direction:column;width:min(420px,92vw);max-height:90vh;border:1px solid var(--border-color,#444);border-radius:10px;background:var(--comfy-menu-bg,#1e1e1e);box-shadow:0 18px 50px rgba(0,0,0,.6)}
.nd-li-modal.wide{width:min(1100px,94vw);height:min(820px,92vh)}
.nd-li-mhead{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--border-color,#444);font-weight:600}
.nd-li-mhead .nd-li-icon{border:none;background:transparent}
.nd-li-mbody{display:flex;flex-direction:column;gap:10px;padding:14px;overflow-x:hidden;overflow-y:auto;flex:1 1 auto;min-height:0}
.nd-li-mfoot{display:flex;align-items:center;gap:6px;padding:10px 12px;border-top:1px solid var(--border-color,#444);flex-wrap:wrap}
.nd-li-field{display:flex;flex-direction:column;gap:4px;font-size:12px;min-width:0}
.nd-li-field>span{opacity:.75}
.nd-li-field small,.nd-li-note{opacity:.5;font-size:11px;line-height:1.35}
.nd-li-field input{width:100%;min-width:0;height:28px;box-sizing:border-box;padding:0 8px;border:1px solid var(--border-color,#444);border-radius:5px;background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);font-size:13px}
.nd-li-check{display:flex;align-items:center;gap:8px;cursor:pointer}
.nd-li-check input{margin:0;accent-color:var(--nd-accent);width:15px;height:15px}
.nd-li-sub{display:flex;flex-direction:column;gap:8px;margin:-2px 0 2px 23px}
.nd-li-sub.off{opacity:.4;pointer-events:none}
.nd-li-scale.off{opacity:.4;pointer-events:none}
.nd-li-field select{width:100%;min-width:0;height:28px;box-sizing:border-box;padding:0 6px;border:1px solid var(--border-color,#444);border-radius:5px;background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);font-size:13px;cursor:pointer}
.nd-li-sep{height:1px;margin:2px 0;background:var(--border-color,#444);opacity:.6}
.nd-li-grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.nd-li-stage{position:relative;flex:1 1 auto;min-height:200px;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:6px;background:#111;user-select:none}
.nd-li-mbody:has(.nd-li-stage){padding:10px}
.nd-li-stage-canvas{display:block;background-color:#3a3a3a;background-image:linear-gradient(45deg,#2a2a2a 25%,transparent 25%,transparent 75%,#2a2a2a 75%),linear-gradient(45deg,#2a2a2a 25%,transparent 25%,transparent 75%,#2a2a2a 75%);background-size:16px 16px;background-position:0 0,8px 8px}
.nd-li-cropbox{position:absolute;box-sizing:border-box;border:1.5px solid #fff;box-shadow:0 0 0 9999px rgba(0,0,0,.55);cursor:move;touch-action:none}
.nd-li-cropbox::before,.nd-li-cropbox::after{content:"";position:absolute;inset:0;pointer-events:none;border:0 solid rgba(255,255,255,.35)}
.nd-li-cropbox::before{left:33.33%;right:33.33%;border-left-width:1px;border-right-width:1px}
.nd-li-cropbox::after{top:33.33%;bottom:33.33%;border-top-width:1px;border-bottom-width:1px}
.nd-li-h{position:absolute;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:2px;background:#fff;box-shadow:0 0 3px #000a}
.nd-li-h.nw{left:0;top:0;cursor:nwse-resize}.nd-li-h.n{left:50%;top:0;cursor:ns-resize}.nd-li-h.ne{left:100%;top:0;cursor:nesw-resize}
.nd-li-h.e{left:100%;top:50%;cursor:ew-resize}.nd-li-h.se{left:100%;top:100%;cursor:nwse-resize}.nd-li-h.s{left:50%;top:100%;cursor:ns-resize}
.nd-li-h.sw{left:0;top:100%;cursor:nesw-resize}.nd-li-h.w{left:0;top:50%;cursor:ew-resize}
.nd-li-size{margin-left:8px;opacity:.6;font-size:12px;font-variant-numeric:tabular-nums}
`;

app.registerExtension({
    name: "NeuralDreamer.Nodes.LoadImages",

    setup() {
        installQueueHook();
        api.addEventListener("nd_load_images_size", (e) => {
            const d = e.detail || {};
            const n = nodeOfApiId(d.node);
            const w = Number(d.width), h = Number(d.height);
            if (n?.ndLI?.setRunSize && w > 0 && h > 0) n.ndLI.setRunSize([w, h]);
        });
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        const proto = nodeType.prototype;
        if (nodeData.name !== NODE) return;
        const blank = (n) => blankSlots(n, ["params"], [0]);
        chain(proto, "onNodeCreated", function () {
            injectStyleOnce("nd-li-style", STYLE);
            setupLoadImages(this);
            blank(this);
        });
        chain(proto, "onConfigure", function () {
            blank(this);
            setTimeout(() => this.ndLI?.restore?.(), 0);
        });
        chain(proto, "onRemoved", function () {
            this.ndLI?.dispose?.();
        });
        // the canvas redraws after any change in the graph: the eye previews follow the
        // width / height wired into the node
        chain(proto, "onDrawForeground", function () {
            try { this.ndLI?.checkEyes?.(); } catch {}
        });
    },
});
