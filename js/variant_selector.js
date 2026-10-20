// Neural Dreamer Nodes — Variant Selector
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { el, dirty, toast, hideWidget, isSelected, chain, bindCanvasNavigation, blankSlots, ND_REG, nativeTrackCss, setRangeFill } from "./nd_common.js";

const PREVIEW = "NDVariantPreviewSelector";
const SLIDER = "NDVariantSliderSelector";
const SINK = "NDUpscaleResultSink";
const VALUES = "NDVariantValues";
const PACK = "NDPack";
const BRIDGE = "NDLivePreviewBridge";

// What goes in and out on the parameters wires (read by Pack / Unpack Parameters).
const PREVIEW_IN = [{ name: "images", type: "IMAGE" }, { name: "image", type: "IMAGE", optional: true }, { name: "preview_data", type: "ND_LIVE", optional: true }];
const PREVIEW_OUT = [{ name: "multi_variant", type: "BOOLEAN" }, { name: "selected_index", type: "INT" }, { name: "upscale", type: "BOOLEAN" }];
const SLIDER_OUT = [{ name: "multi_variant", type: "BOOLEAN" }, { name: "value", type: "INT" }, { name: "upscale", type: "BOOLEAN" }];
ND_REG.providers.set(PREVIEW, (node, slot) => (slot === 0 ? PREVIEW_OUT : null));
ND_REG.providers.set(SLIDER, (node, slot) => (slot === 0 ? SLIDER_OUT : null));
ND_REG.consumers.set(PREVIEW, () => PREVIEW_IN);
const ARROWS = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
const DEFAULT_NAME = "ND_Image";
const DEFAULT_VARIANT = "variant";
const DEFAULT_UPSCALED = "upscaled";
const DEFAULT_TOGGLE = "Multi-Variant";
const OLD_DEFAULT_NAME = "ND_variant"; // default file name before the variant / upscaled names

let origQueuePrompt = null;
let lastSnapshot = null; // prompt of the last normal Run

/* ------------------------------------------------------------------ helpers */

const clone = (o) => (typeof structuredClone === "function" ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
const isLink = (v) =>
    Array.isArray(v) && v.length === 2 && (typeof v[0] === "string" || typeof v[0] === "number") && typeof v[1] === "number";

function addArrowHandler(node, root, step) {
    const h = (e) => {
        const d = ARROWS[e.key];
        if (!d || e.ctrlKey || e.metaKey || e.altKey) return;
        const t = e.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        if (node.graph && app.canvas?.graph && node.graph !== app.canvas.graph) return;
        if (!isSelected(node) && !root.matches(":hover")) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        step(d);
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
}

function viewUrl(info) {
    const q = new URLSearchParams({
        filename: info.filename,
        type: info.type || "temp",
        subfolder: info.subfolder || "",
    });
    let extra = "";
    try { extra = app.getPreviewFormatParam?.() || ""; } catch {}
    return api.apiURL(`/view?${q.toString()}${extra}&r=${Date.now()}${Math.floor(Math.random() * 1000)}`);
}

// Gear icon (Lucide "settings", ISC license) — an SVG centres exactly, unlike the ⚙ glyph.
const GEAR_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';

function makeGear(title) {
    const b = el("button", "nd-vs-gear");
    b.type = "button";
    b.title = title;
    b.innerHTML = GEAR_SVG;
    return b;
}

function makeToggle(text) {
    const wrap = el("label", "nd-vs-toggle");
    wrap.title = "Passed to the multi_variant output";
    const input = el("input");
    input.type = "checkbox";
    const label = el("span", null, text);
    wrap.append(input, el("span", "nd-vs-switch"), label);
    return { wrap, input, label };
}

/* --------------------------------------------------------- prompt handling */

// The upscaled image reaches the selector as the "image" field of the Pack that
// feeds it. That wire is cut out of every queued prompt, so a normal Run never
// evaluates the upscale branch; it is returned so an Upscale run can wire it
// into the result sink instead.
function stripFeedback(output) {
    const links = {};
    for (const [id, n] of Object.entries(output)) {
        if (n?.class_type !== PREVIEW || !n.inputs) continue;
        const src = n.inputs.params;
        if (!isLink(src)) continue;
        const pack = output[String(src[0])];
        if (pack?.class_type !== PACK || !pack.inputs) continue;
        let entries = [];
        try { entries = JSON.parse(pack.inputs.names || "[]"); } catch {}
        const field = Array.isArray(entries) ? entries.find((e) => e?.name === "image") : null;
        if (!field || !(field.slot in pack.inputs)) continue;
        if (isLink(pack.inputs[field.slot])) links[id] = pack.inputs[field.slot];
        delete pack.inputs[field.slot];
    }
    return links;
}

// A selector's output is fully determined by what the node shows at queue time.
// Its links are re-pointed to an internal NDVariantValues node that has no graph
// inputs and outputs the same parameters wire. Nothing then depends on the
// selector, so a loop is impossible however the wires are routed (same subgraph,
// Pack/Unpack round trips, ...).
function rerouteSelectorOutputs(output) {
    for (const [id, n] of Object.entries(Object.assign({}, output))) {
        if ((n?.class_type !== PREVIEW && n?.class_type !== SLIDER) || !n.inputs) continue;
        const num = n.class_type === PREVIEW ? n.inputs.selected_index : n.inputs.value;
        if (isLink(num) || isLink(n.inputs.multi_variant)) continue;
        const valsId = `nd_vals_${String(id).replace(/[^\w]/g, "_")}`;
        let used = false;
        for (const [oid, other] of Object.entries(output)) {
            if (oid === valsId || !other?.inputs) continue;
            for (const [k, v] of Object.entries(other.inputs)) {
                if (isLink(v) && String(v[0]) === String(id) && v[1] === 0) {
                    other.inputs[k] = [valsId, 0];
                    used = true;
                }
            }
        }
        if (used) {
            output[valsId] = {
                class_type: VALUES,
                inputs: {
                    multi_variant: !!n.inputs.multi_variant,
                    value: Math.round(Number(num)) || 0,
                    upscale: !!n.inputs.upscale_trigger,
                    value_name: n.class_type === PREVIEW ? "selected_index" : "value",
                },
                _meta: { title: "ND Variant Values" },
            };
        }
    }
}

function descendants(output, rootId) {
    const children = {};
    for (const [id, n] of Object.entries(output)) {
        for (const v of Object.values(n?.inputs || {})) {
            if (isLink(v)) (children[String(v[0])] ||= []).push(id);
        }
    }
    const seen = new Set();
    const stack = [String(rootId)];
    while (stack.length) {
        const cur = stack.pop();
        for (const c of children[cur] || []) {
            if (!seen.has(c)) { seen.add(c); stack.push(c); }
        }
    }
    return seen;
}

// Prompt ids of nodes inside subgraphs look like "12:5" (subgraph node 12 -> node 5).
function findNodeByApiId(id) {
    if (id == null) return null;
    const parts = String(id).split(":");
    const get = (g, k) => g?.getNodeById?.(Number(k)) ?? g?.getNodeById?.(k) ?? null;
    let g = app.graph;
    for (let i = 0; i < parts.length - 1 && g; i++) g = get(g, parts[i])?.subgraph ?? null;
    const found = get(g, parts[parts.length - 1]);
    if (found || parts.length === 1) return found;
    return get(app.canvas?.graph, parts[parts.length - 1]); // fallback for older frontends
}

function resolveApiId(node, output) {
    const cls = node.comfyClass || node.type;
    const id = String(node.id);
    if (output[id]?.class_type === cls && (!node.graph || node.graph === app.graph)) return id;
    const cands = Object.keys(output).filter((k) => k.split(":").pop() === id && output[k]?.class_type === cls);
    return cands.find((k) => findNodeByApiId(k) === node) ?? cands[0] ?? (output[id]?.class_type === cls ? id : null);
}

function controlledWidgetNames(gnode) {
    if (!gnode?.widgets) return null;
    const out = [];
    for (const w of gnode.widgets) {
        if (w.linkedWidgets?.some((l) => /control_(after|before)_generate/.test(l?.name || ""))) out.push(w.name);
    }
    return out;
}

// Seeds with control_after_generate (randomize/increment) change after a Run.
// For every node that does not depend on ours we restore the values from the
// last Run, so the generation is served from cache and not re-executed.
function restoreControlledValues(output, targetId) {
    if (!lastSnapshot) return;
    const desc = descendants(output, targetId);
    for (const [id, n] of Object.entries(output)) {
        if (id === targetId || desc.has(id)) continue;
        const snap = lastSnapshot[id];
        if (!snap || snap.class_type !== n.class_type || !n.inputs) continue;
        const names = controlledWidgetNames(findNodeByApiId(id)) ?? ["seed", "noise_seed"];
        for (const name of names) {
            if (name in snap.inputs && name in n.inputs && !isLink(n.inputs[name])) n.inputs[name] = snap.inputs[name];
        }
    }
}

// Writes the values currently shown in each selector into its prompt inputs, so the
// outputs always match the node UI (the index picked right before Upscale included).
function applyLiveValues(output, only) {
    for (const [id, n] of Object.entries(output)) {
        if (n?.class_type !== PREVIEW && n?.class_type !== SLIDER) continue;
        if (only && only.id !== id) continue;
        const gnode = only ? only.node : findNodeByApiId(id);
        if (!gnode?.ndApi?.promptValues || (gnode.comfyClass || gnode.type) !== n.class_type) continue;
        Object.assign(n.inputs ||= {}, gnode.ndApi.promptValues());
    }
}

function installQueueHook() {
    if (origQueuePrompt) return;
    origQueuePrompt = api.queuePrompt.bind(api);
    api.queuePrompt = async function (number, data, ...rest) {
        try {
            if (data?.output) {
                stripFeedback(data.output);
                applyLiveValues(data.output);
                rerouteSelectorOutputs(data.output);
                recordLiveRoutes(data.output);
                // a selector with Live preview fed by a bridge: ComfyUI's own sampler preview is off for this run
                if (markLive(data.output)) rest[0] = { ...(rest[0] || {}), previewMethod: "none" };
                lastSnapshot = clone(data.output);
            }
        } catch (e) {
            console.warn("[ND Variant]", e);
        }
        return origQueuePrompt(number, data, ...rest);
    };
}

async function runUpscale(node) {
    if (node.__ndBusy) return;
    node.__ndBusy = true;
    try {
        installQueueHook();
        const p = await app.graphToPrompt();
        const output = p.output;
        const targetId = resolveApiId(node, output);
        if (!targetId) throw new Error("The node is not part of the prompt (it may be bypassed or muted).");

        const links = stripFeedback(output);
        restoreControlledValues(output, targetId);
        applyLiveValues(output, { id: targetId, node });
        output[targetId].inputs.upscale_trigger = true;
        rerouteSelectorOutputs(output); // after the flag is set, so downstream sees upscale = true

        const fb = links[targetId];
        if (fb) {
            const sinkId = `nd_sink_${String(targetId).replace(/[^\w]/g, "_")}`;
            output[sinkId] = {
                class_type: SINK,
                inputs: {
                    image: fb,
                    target_id: String(targetId),
                    filename_prefix: output[targetId].inputs.filename_prefix || DEFAULT_NAME,
                    suffix: output[targetId].inputs.upscaled_suffix ?? DEFAULT_UPSCALED,
                },
                _meta: { title: "ND Upscale Result" },
            };
        }
        recordLiveRoutes(output);
        const mute = markLive(output);
        // Sent straight to the API, bypassing app.queuePrompt: seeds do not advance.
        await origQueuePrompt(0, { output, workflow: p.workflow }, mute ? { previewMethod: "none" } : undefined);
    } catch (e) {
        console.error("[ND Variant]", e);
        toast("error", "ND Upscale", e?.message || String(e));
    } finally {
        node.__ndBusy = false;
    }
}

function bindUpscaleButton(btn, node, canRun) {
    btn.addEventListener("click", async () => {
        if (canRun && !canRun()) return;
        node.ndApi?.markSource?.();
        btn.classList.add("busy");
        try { await runUpscale(node); } finally { setTimeout(() => btn.classList.remove("busy"), 250); }
    });
}

/* -------------------------------------------------------- shown images cache */

// What each preview node shows is kept in memory for the browser session, so
// switching to another workflow tab and back (the frontend rebuilds the nodes)
// brings the images back. A page reload clears it, and after a ComfyUI restart the
// temp files are gone, which is checked before anything is shown again.
const VIEW_CACHE = new Map();
const VIEW_CACHE_MAX = 200;
const livePreviews = new Set();
const missingFiles = new Set(); // temp files found deleted (ComfyUI restarted)

// The frontend also keeps the last outputs of every workflow tab, including runs that
// finished while another tab was open (app.nodeOutputs, by node locator id).
function nativeOutput(node) {
    const g = node.graph;
    const root = g?.rootGraph ?? g;
    const loc = g && g !== root ? `${g.id}:${node.id}` : String(node.id);
    try {
        return app.nodeOutputs?.[loc] ?? null;
    } catch {
        return null;
    }
}

// workflow (root graph id) + subgraph + node id; null when the frontend gives no graph id
function viewKey(node) {
    const g = node.graph;
    const root = g?.rootGraph ?? g;
    if (!root?.id || node.id == null || node.id === -1) return null;
    return `${root.id}/${g && g !== root ? g.id ?? "" : ""}/${node.id}`;
}

function cacheView(key, view) {
    if (!key) return;
    VIEW_CACHE.delete(key);
    if (!view) return;
    VIEW_CACHE.set(key, view);
    while (VIEW_CACHE.size > VIEW_CACHE_MAX) VIEW_CACHE.delete(VIEW_CACHE.keys().next().value);
}

// false only when the server answers that the file is not there (temp folder cleared)
async function fileExists(info) {
    try {
        const r = await fetch(viewUrl(info), { method: "HEAD", cache: "no-store" });
        return r.ok || (r.status !== 404 && r.status !== 400);
    } catch {
        return true;
    }
}

/* -------------------------------------------------------------- live preview */

// While a sampler runs, ComfyUI sends its preview frames over the websocket (when its
// live previews are on). A selector with "Live preview" on shows the frames of the
// samplers that feed it, and of its Upscale branch. Which nodes feed which selector is
// taken from every queued prompt. For a batch, ComfyUI previews its first image only.
const LIVE_ROUTES = new Map(); // selector prompt id -> { graph, ids: Set of upstream prompt ids }
let liveExec = null; // node running now, for frontends whose previews carry no node id
let skipLegacy = false;
let liveHintShown = false;
const LIVE_EVENT = "nd_live_frame";

function upstream(output, ids) {
    const seen = new Set();
    const stack = ids.map(String);
    while (stack.length) {
        const cur = stack.pop();
        for (const v of Object.values(output[cur]?.inputs || {})) {
            if (!isLink(v)) continue;
            const src = String(v[0]);
            if (!seen.has(src)) { seen.add(src); stack.push(src); }
        }
    }
    return seen;
}

function recordLiveRoutes(output) {
    try {
        const sinks = {};
        for (const [id, n] of Object.entries(output)) {
            if (n?.class_type === SINK && n.inputs?.target_id != null) (sinks[String(n.inputs.target_id)] ||= []).push(id);
        }
        const graph = app.graph?.id ?? null;
        for (const [id, n] of Object.entries(output)) {
            if (n?.class_type !== PREVIEW) continue;
            const own = sinks[id] || [];
            const ids = upstream(output, [id, ...own]);
            for (const s of own) ids.add(s);
            LIVE_ROUTES.set(id, { graph, ids });
        }
    } catch (e) {
        console.warn("[ND Variant] live preview", e);
    }
}

const linkOf = (graph, id) => graph?.getLink?.(id) ?? graph?.links?.get?.(id) ?? graph?.links?.[id] ?? null;
const liveLog = (...a) => { try { if (window.NDLiveDebug) console.log("[ND Live]", ...a); } catch {} };

// Ids of the subgraph nodes that contain this node, from the root ([] at the root).
function graphPath(node) {
    const target = node.graph;
    const root = target?.rootGraph ?? app.rootGraph ?? app.graph;
    if (!target || target === root) return [];
    const walk = (g, path, seen) => {
        for (const n of g?._nodes ?? g?.nodes ?? []) {
            const sg = n.subgraph;
            if (!sg || seen.has(sg)) continue;
            if (sg === target) return [...path, String(n.id)];
            seen.add(sg);
            const r = walk(sg, [...path, String(n.id)], seen);
            if (r) return r;
        }
        return null;
    };
    return walk(root, [], new Set()) ?? [];
}

// Ids of the nodes upstream of the selector in its own graph (a subgraph node counts as one).
function upstreamInGraph(node) {
    const g = node.graph;
    const seen = new Set();
    const stack = [node];
    while (stack.length) {
        const cur = stack.pop();
        for (const inp of cur.inputs || []) {
            if (inp?.link == null) continue;
            const l = linkOf(g, inp.link);
            const src = l ? g.getNodeById?.(l.origin_id) : null;
            if (!src || seen.has(String(src.id))) continue;
            seen.add(String(src.id));
            stack.push(src);
        }
    }
    return seen;
}

// The node at the selector's level that an execution id ("12:5:7") belongs to.
function atLevel(id, path) {
    const segs = String(id).split(":").map((x) => x.split(".")[0]);
    if (segs.length <= path.length) return null;
    for (let i = 0; i < path.length; i++) if (segs[i] !== path[i]) return null;
    return segs[path.length];
}

// The live preview handlers of the selectors fed by any of these execution ids. A node
// feeds a selector when it is upstream of it in the queued prompt, or in the graph
// (then a frame from inside a subgraph counts for the subgraph node).
function liveTargets(ids) {
    const want = ids.filter((i) => i != null && i !== "").map(String);
    if (!want.length) return [];
    const out = new Set();
    for (const [sid, r] of LIVE_ROUTES) {
        if (r.graph != null && app.graph?.id != null && r.graph !== app.graph.id) continue; // another workflow tab
        if (!want.some((i) => r.ids.has(i))) continue;
        const n = findNodeByApiId(sid);
        if ((n?.comfyClass || n?.type) === PREVIEW && n.ndApi?.live) out.add(n.ndApi.live);
    }
    for (const p of livePreviews) {
        const n = p.node;
        if (!p.live || !n?.graph || out.has(p.live)) continue;
        const now = Date.now();
        if (!p.fed || now - p.fed.at > 1500) p.fed = { at: now, path: graphPath(n), ids: upstreamInGraph(n) };
        if (want.some((i) => { const k = atLevel(i, p.fed.path); return k != null && p.fed.ids.has(k); })) out.add(p.live);
    }
    return [...out];
}

// Marks the selectors whose Live preview is on and shown (_meta.nd_live, read by the
// bridge; _meta does not change the cache). True when a selector with Live preview
// ticked (shown or hidden) is fed by a bridge: then ComfyUI's own sampler previews are
// turned off for the run.
function markLive(output) {
    let mute = false;
    const sinks = {};
    for (const [id, n] of Object.entries(output)) {
        if (n?.class_type === SINK && n.inputs?.target_id != null) (sinks[String(n.inputs.target_id)] ||= []).push(id);
    }
    for (const [id, n] of Object.entries(output)) {
        if (n?.class_type !== PREVIEW) continue;
        const g = findNodeByApiId(id);
        const on = (g?.comfyClass || g?.type) === PREVIEW && !!g.properties?.nd_live;
        // frames are sent only while the preview is shown (eye); ComfyUI's own sampler
        // preview stays off whenever Live preview is ticked, shown or not
        if (on && !g.properties?.nd_live_hidden) (n._meta ||= {}).nd_live = true;
        else if (n._meta) delete n._meta.nd_live;
        if (!on) continue;
        const ids = upstream(output, [id, ...(sinks[id] || [])]);
        if ([...ids].some((k) => output[k]?.class_type === BRIDGE)) mute = true;
    }
    return mute;
}

function endLive() {
    liveExec = null;
    for (const p of livePreviews) p.live?.end();
}

// The frame the frontend keeps for a node: it stores each preview for the node and for
// every subgraph node around it (by node locator id; at the root that is the node id).
function storedPreview(execId) {
    try {
        const map = app.nodePreviewImages;
        if (!map || execId == null) return null;
        const segs = String(execId).split(":");
        for (const k of [String(execId), segs[0]]) {
            const v = map[k];
            if (Array.isArray(v) && v.length && typeof v[v.length - 1] === "string") return v[v.length - 1];
        }
    } catch {}
    return null;
}

const isBlob = (b) => !!b && typeof b === "object" && typeof b.size === "number" && typeof b.type === "string" && typeof b.slice === "function";
const guard = (name, fn) => (ev) => {
    try { fn(ev?.detail); } catch (e) { console.warn(`[ND Live] ${name}`, e); }
};

function installLiveListeners() {
    api.addEventListener("b_preview_with_metadata", guard("frame", (d) => {
        liveLog("frame event", d?.displayNodeId, d?.nodeId, isBlob(d?.blob));
        if (!isBlob(d?.blob)) return;
        skipLegacy = true; // the same frame follows as a plain b_preview
        const t = liveTargets([d.displayNodeId, d.nodeId, d.realNodeId, d.parentNodeId]);
        liveLog("frame", d.displayNodeId, "->", t.length);
        for (const l of t) l.frame(d.blob);
    }));
    api.addEventListener("b_preview", guard("frame", (b) => {
        if (skipLegacy) { skipLegacy = false; return; }
        liveLog("frame event (no metadata)", liveExec, isBlob(b));
        if (!isBlob(b)) return;
        const t = liveTargets([liveExec]);
        liveLog("frame (no metadata)", liveExec, "->", t.length);
        for (const l of t) l.frame(b);
    }));
    api.addEventListener("executing", guard("executing", (d) => {
        const id = d && typeof d === "object" ? d.display_node ?? d.node : d;
        if (id == null) endLive(); // the prompt is done
        else liveExec = String(id);
    }));
    api.addEventListener("progress", guard("progress", (d) => {
        if (!d) return;
        const t = liveTargets([d.node]);
        const url = t.length ? storedPreview(d.node) : null;
        liveLog("progress", d.node, `${d.value}/${d.max}`, "->", t.length, url ? "stored frame" : "no stored frame");
        for (const l of t) l.progress(d.value, d.max, url);
    }));
    // frames of every image of the batch, sent by ND Live Preview Bridge
    api.addEventListener(LIVE_EVENT, guard("bridge frame", (d) => {
        if (!d || !Array.isArray(d.images) || !d.images.length) return;
        let t;
        if (Array.isArray(d.targets)) {
            t = d.targets.map((id) => findNodeByApiId(id))
                .filter((n) => (n?.comfyClass || n?.type) === PREVIEW && n.ndApi?.live)
                .map((n) => n.ndApi.live);
        } else {
            t = liveTargets([d.bridge]);
            if (t.length > 1) {
                const by = liveTargets([d.sampler]);
                const both = t.filter((x) => by.includes(x));
                if (both.length) t = both;
            }
        }
        liveLog("bridge frame", d.bridge, d.sampler, `${d.step}/${d.steps}`, `${d.images.length} image(s)`, "->", t.length);
        for (const l of t) l.batch(d.images, d.step, d.steps, d.sampler);
    }));
    for (const t of ["execution_success", "execution_error", "execution_interrupted"]) api.addEventListener(t, guard(t, endLive));
}

// Lucide "eye" / "eye-off" (ISC license)
const EYE_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c4.36 0 8.3 2.7 9.94 6.65a1 1 0 0 1 0 .7 10.75 10.75 0 0 1-1.44 2.49"/><path d="M14.08 14.16a3 3 0 0 1-4.24-4.24"/><path d="M17.48 17.5a10.75 10.75 0 0 1-15.42-5.15 1 1 0 0 1 0-.7 10.75 10.75 0 0 1 4.45-5.14"/><path d="m2 2 20 20"/></svg>';
// ComfyUI's "Live preview method" setting: "default" leaves it to the server (often none)
function previewsMayBeOff() {
    let v = "default";
    try { v = app.extensionManager?.setting?.get?.("Comfy.Execution.PreviewMethod") ?? app.ui?.settings?.getSettingValue?.("Comfy.Execution.PreviewMethod") ?? "default"; } catch {}
    return v === "none" || v === "default" || v == null;
}
const LIVE_OFF_HINT = "No preview frames came from ComfyUI. Set Settings → Comfy → Execution → Live preview method to auto (or start ComfyUI with --preview-method auto).";

/* ------------------------------------------------------------ preview node */

function setupPreview(node) {
    const wMV = hideWidget(node, "multi_variant");
    const wIdx = hideWidget(node, "selected_index");
    const wUp = hideWidget(node, "upscale_trigger");
    const wPrefix = hideWidget(node, "filename_prefix");
    const wSave = hideWidget(node, "save_previews");
    const wVariant = hideWidget(node, "variant_suffix");
    const wUpName = hideWidget(node, "upscaled_suffix");
    const wUpOn = hideWidget(node, "upscale_button");
    if (wUp) wUp.value = false;
    const upscaleOn = () => wUpOn?.value !== false;

    const st = { images: [], sel: 0, final: null, source: null, viewFinal: false, compare: false };
    let cmpPos = 50;

    const root = el("div", "nd-vs-root");
    const thumbs = el("div", "nd-vs-thumbs");
    const main = el("div", "nd-vs-main");
    const mainImg = el("img", "nd-vs-mainimg");
    mainImg.draggable = false;
    const empty = el("div", "nd-vs-empty", "Press Run to generate variants");

    // before / after comparison overlay
    const cmp = el("div", "nd-vs-cmp");
    const cmpUp = el("img");
    const cmpSrc = el("img");
    const cmpLine = el("div", "nd-vs-cmp-line");
    cmpLine.append(el("div", "nd-vs-cmp-knob", "⇄"));
    cmp.append(cmpUp, cmpSrc, cmpLine, el("span", "nd-vs-cmp-lbl l", "Original"), el("span", "nd-vs-cmp-lbl r", "Upscaled"));
    for (const i of [cmpUp, cmpSrc]) i.draggable = false;

    const badge = el("div", "nd-vs-badge");
    const cmpBtn = el("button", "nd-vs-cmpbtn", "Compare");
    cmpBtn.title = "Toggle before / after comparison with the image that was sent to upscale";
    // live preview: the sampler's frames while it runs, and an eye to hide them in this node
    const liveImg = el("img", "nd-vs-liveimg");
    liveImg.draggable = false;
    const eye = el("button", "nd-vs-eye");
    eye.type = "button";
    main.append(mainImg, empty, cmp, liveImg, cmpBtn, badge, eye);

    // size of the image shown above (both sizes while comparing)
    const info = el("div", "nd-vs-info");

    const upBtn = el("button", "nd-vs-btn nd-vs-upbtn", "Upscale");
    upBtn.title = "Queue a run with the upscale output set to True";

    // bottom row: Multi-Variant toggle (left) + save settings gear (right)
    const bottom = el("div", "nd-vs-bottom");
    const tg = makeToggle(DEFAULT_TOGGLE);
    const gear = makeGear("Settings");
    bottom.append(tg.wrap, gear);

    // save settings popover
    const pop = el("div", "nd-vs-pop");
    pop.style.display = "none";
    const textRow = (label, placeholder, title) => {
        const row = el("label", "nd-vs-prow");
        const input = el("input");
        input.type = "text";
        input.placeholder = placeholder;
        input.spellcheck = false;
        row.title = title;
        row.append(el("span", null, label), input);
        return { row, input };
    };
    const checkRow = (label, title) => {
        const row = el("label", "nd-vs-check");
        const input = el("input");
        input.type = "checkbox";
        row.title = title;
        row.append(input, el("span", null, label));
        return { row, input };
    };
    const fToggle = textRow("Toggle label", DEFAULT_TOGGLE, "Name shown next to the toggle. Only the label in the node changes; the output is still multi_variant.");
    const fName = textRow("File name", DEFAULT_NAME, "Common start of the saved file names. A subfolder like folder/name works.");
    const fVariant = textRow("Variant name", DEFAULT_VARIANT, "Added after the file name for the variants: ND_Image_variant. Leave empty to save them under the file name alone.");
    const fUpName = textRow("Upscaled name", DEFAULT_UPSCALED, "Added after the file name for the upscaled result: ND_Image_upscaled.");
    const cUpOn = checkRow("Upscale button", "Show the Upscale button. Without it every batch of variants is saved.");
    const cSave = checkRow("Save variants", "Save each batch of variants to the output folder.");
    const nameHint = el("div", "nd-vs-hint");
    const cLive = checkRow("Live preview", "Show the sampler's preview frames in the node while the variants (and the Upscale pass) are generated. ComfyUI's live previews must be on. For a batch, ComfyUI previews its first image only.");
    const liveHint = el("div", "nd-vs-hint nd-vs-warn", LIVE_OFF_HINT);
    pop.append(fToggle.row, fName.row, fVariant.row, fUpName.row, cUpOn.row, cSave.row, nameHint, cLive.row, liveHint);

    root.append(main, info, thumbs, upBtn, bottom, pop);

    const idx = () => {
        const n = st.images.length;
        const v = Math.round(Number(st.sel)) || 0;
        return n ? Math.max(0, Math.min(n - 1, v)) : Math.max(0, v);
    };
    const setSel = (v) => {
        st.sel = v;
        if (wIdx) wIdx.value = v;
    };
    const withUrl = (i) => (i ? { ...i, url: viewUrl(i) } : null);
    // Only the Compare preference is saved with the workflow. Image references are
    // never stored: they point to temp files that are gone after a restart.
    // The shown images are kept in memory only (VIEW_CACHE), for switching workflow tabs.
    let cacheOn = false; // set once the node has its final id (loaded or run)
    const saveView = () => {
        if (!cacheOn) return;
        const key = viewKey(node);
        if (!key) return;
        const has = st.images.length || st.final;
        cacheView(key, has ? { images: st.images, final: st.final, source: st.source, viewFinal: st.viewFinal, sel: idx() } : null);
    };
    const persist = () => {
        node.properties ||= {};
        node.properties.nd_preview = { compare: st.compare };
        saveView();
    };
    const setSrc = (img, url) => {
        if (img.dataset.src !== url) { img.src = url; img.dataset.src = url; }
    };

    function makeThumb(info, label, extraCls, onClick) {
        const t = el("div", "nd-vs-thumb" + (extraCls ? " " + extraCls : ""));
        const img = el("img");
        img.src = info.url;
        img.draggable = false;
        img.onerror = () => t.classList.add("broken");
        t.append(img, el("span", null, label));
        t.addEventListener("click", onClick);
        return t;
    }

    function buildThumbs() {
        thumbs.replaceChildren();
        st.images.forEach((im, i) => thumbs.append(makeThumb(im, String(i + 1), "", () => select(i))));
        if (st.final) {
            thumbs.append(makeThumb(st.final, "UP", "final", () => { st.viewFinal = true; saveView(); render(); }));
        }
        thumbs.style.display = st.images.length || st.final ? "" : "none";
    }

    function applyCmp() {
        cmpSrc.style.clipPath = `inset(0 ${100 - cmpPos}% 0 0)`;
        cmpLine.style.left = cmpPos + "%";
    }

    // live preview settings live in the node properties (UI only)
    const liveOn = () => !!node.properties?.nd_live;
    const liveShown = () => !node.properties?.nd_live_hidden;
    // lv.url: the frame shown; own object URLs (made here from a frame) are revoked, the
    // frontend's own preview URLs are not
    const lv = { url: null, own: false, prev: null, active: false, step: null, frames: 0, steps: 0, noFrames: false, eventAt: 0, storeUrl: null };
    liveImg.onload = () => { if (lv.prev) { URL.revokeObjectURL(lv.prev); lv.prev = null; } };
    function dropLiveUrls() {
        if (lv.prev) URL.revokeObjectURL(lv.prev);
        if (lv.url && lv.own) URL.revokeObjectURL(lv.url);
        lv.url = lv.prev = lv.storeUrl = null;
        lv.own = false;
    }
    function clearLive() {
        lv.active = false;
        lv.step = null;
        lv.frames = lv.steps = 0;
        dropLiveUrls();
        liveImg.removeAttribute("src");
    }
    function showFrame(url, own) {
        if (lv.prev) URL.revokeObjectURL(lv.prev);
        lv.prev = lv.own ? lv.url : null; // the old own URL goes once the new frame is drawn
        lv.url = url;
        lv.own = own;
        liveImg.src = url;
        render();
    }
    function gotFrame() {
        lv.active = true;
        lv.frames++;
        if (lv.noFrames) { lv.noFrames = false; syncSettings(); }
    }
    const live = {
        // frames from ND Live Preview Bridge: the image being generated right now
        // (the first one when a sampler makes a batch)
        batch(images, step, steps) {
            if (!liveOn()) return;
            gotFrame();
            lv.eventAt = Date.now();
            if (step) lv.step = [step, steps];
            if (liveShown()) showFrame(images[0], false);
        },
        // a frame from the websocket
        frame(blob) {
            if (!liveOn()) return;
            gotFrame();
            lv.eventAt = Date.now();
            if (liveShown()) showFrame(URL.createObjectURL(blob), true);
        },
        // a sampler step; url: the frame the frontend keeps for that node, used when the
        // frames do not reach this node as events
        progress(value, max, url) {
            if (!liveOn()) return;
            lv.active = true;
            lv.steps++;
            lv.step = [value, max];
            if (url && url !== lv.storeUrl && Date.now() - lv.eventAt > 1000) {
                lv.storeUrl = url;
                gotFrame();
                if (liveShown()) { showFrame(url, false); return; }
            }
            if (lv.url && liveShown()) render();
        },
        // the run is over (or the node got its images): back to the normal view
        end() {
            if (!lv.active && !lv.url) return;
            if (liveOn() && lv.steps && !lv.frames && previewsMayBeOff()) {
                // the sampler ran but ComfyUI sent no frames: its live previews are off
                lv.noFrames = true;
                syncSettings();
                if (!liveHintShown) { liveHintShown = true; toast("warn", "ND Live preview", LIVE_OFF_HINT); }
            }
            clearLive();
            render();
        },
    };

    function render() {
        const n = st.images.length;
        const i = idx();
        const kids = thumbs.children;
        for (let k = 0; k < kids.length; k++) {
            const isFinal = kids[k].classList.contains("final");
            kids[k].classList.toggle("sel", st.viewFinal ? isFinal : !isFinal && k === i);
        }

        const showFinal = !!(st.viewFinal && st.final);
        const canCmp = showFinal && !!st.source;
        const cmpOn = canCmp && st.compare;
        const cur = showFinal ? st.final : st.images[i];

        cmpBtn.style.display = canCmp ? "" : "none";
        upBtn.style.display = upscaleOn() ? "" : "none";
        upBtn.disabled = !st.images.length || showFinal;
        cmpBtn.classList.toggle("on", !!st.compare);
        cmp.style.display = cmpOn ? "block" : "none";
        if (cmpOn) {
            setSrc(cmpUp, st.final.url);
            setSrc(cmpSrc, st.source.url);
            applyCmp();
        }

        if (cur && !cmpOn) {
            setSrc(mainImg, cur.url);
            mainImg.style.display = "";
        } else {
            mainImg.style.display = "none";
            if (!cur) { mainImg.removeAttribute("src"); mainImg.dataset.src = ""; }
        }
        empty.style.display = cur ? "none" : "";
        badge.style.display = cur && !cmpOn ? "" : "none";
        badge.textContent = showFinal ? "Upscaled" : `${i + 1}/${n}`;

        // live preview over everything else while a sampler sends frames
        const showLive = liveOn() && liveShown() && lv.active && !!lv.url;
        liveImg.style.display = showLive ? "" : "none";
        badge.classList.toggle("live", showLive);
        if (showLive) {
            empty.style.display = "none";
            cmpBtn.style.display = "none";
            badge.style.display = "";
            badge.textContent = lv.step ? `LIVE ${lv.step[0]}/${lv.step[1]}` : "LIVE";
        }
        eye.style.display = liveOn() ? "" : "none";
        eye.classList.toggle("off", !liveShown());
        eye.innerHTML = liveShown() ? EYE_SVG : EYE_OFF_SVG;
        eye.title = liveShown() ? "Hide the live preview in this node" : "Show the live preview in this node";

        const size = (im) => (im?.width && im?.height ? `${im.width} × ${im.height}` : "");
        const text = cmpOn && size(st.source) && size(st.final) ? `${size(st.source)} → ${size(st.final)}` : size(cur);
        info.textContent = text ? `${text} px` : "";
        info.style.display = cur ? "" : "none";

        const sel = thumbs.querySelector(".nd-vs-thumb.sel");
        if (sel) {
            const l = sel.offsetLeft, r = l + sel.offsetWidth;
            if (l < thumbs.scrollLeft) thumbs.scrollLeft = l - 4;
            else if (r > thumbs.scrollLeft + thumbs.clientWidth) thumbs.scrollLeft = r - thumbs.clientWidth + 4;
        }
    }

    function select(i) {
        const n = st.images.length;
        if (!n) return;
        setSel(Math.max(0, Math.min(n - 1, i)));
        st.viewFinal = false;
        saveView();
        render();
        dirty();
    }

    const removeKeys = addArrowHandler(node, root, (d) => {
        const n = st.images.length;
        if (!n) return;
        if (st.viewFinal) { st.viewFinal = false; saveView(); render(); return; }
        select((idx() + d + n) % n);
    });

    // Plain wheel zooms the canvas (forwarded by the root); a horizontal swipe or
    // Shift+wheel scrolls the strip when it does not fit.
    thumbs.addEventListener("wheel", (e) => {
        const horizontal = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
        if (!horizontal || e.ctrlKey || thumbs.scrollWidth <= thumbs.clientWidth) return;
        thumbs.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        e.preventDefault();
        e.stopPropagation();
    }, { passive: false });

    // comparison: toggle + draggable divider
    cmpBtn.addEventListener("click", () => { st.compare = !st.compare; persist(); render(); });
    let dragging = false;
    const movePos = (e) => {
        const r = cmp.getBoundingClientRect();
        if (!r.width) return;
        cmpPos = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
        applyCmp();
    };
    cmp.addEventListener("pointerdown", (e) => {
        dragging = true;
        try { cmp.setPointerCapture(e.pointerId); } catch {}
        movePos(e);
        e.preventDefault();
    });
    cmp.addEventListener("pointermove", (e) => { if (dragging) movePos(e); });
    const endDrag = (e) => {
        dragging = false;
        try { cmp.releasePointerCapture(e.pointerId); } catch {}
    };
    cmp.addEventListener("pointerup", endDrag);
    cmp.addEventListener("pointercancel", endDrag);

    // save settings
    const closePop = () => { pop.style.display = "none"; gear.classList.remove("on"); };
    gear.addEventListener("click", () => {
        const open = pop.style.display === "none";
        pop.style.display = open ? "" : "none";
        gear.classList.toggle("on", open);
    });
    const onDocDown = (e) => {
        if (pop.style.display !== "none" && !pop.contains(e.target) && !gear.contains(e.target)) closePop();
    };
    document.addEventListener("pointerdown", onDocDown, true);
    // the options shown, and an example of the names the files get
    function syncSettings() {
        const on = upscaleOn();
        fUpName.row.style.display = on ? "" : "none";
        cUpOn.input.checked = on;
        // without the Upscale button every batch is saved
        cSave.input.checked = !on || !!wSave?.value;
        cSave.input.disabled = !on;
        cSave.row.classList.toggle("locked", !on);
        cSave.row.title = on ? "Save each batch of variants to the output folder." : "Always on without the Upscale button.";
        const name = (suffix) => {
            const base = (wPrefix?.value || "").trim().replace(/^[\\/]+|[\\/]+$/g, "") || DEFAULT_NAME;
            const sfx = String(suffix ?? "").trim().replace(/^[_\\/]+|[_\\/]+$/g, "");
            return `${base}${sfx ? "_" + sfx : ""}_00001_.png`;
        };
        nameHint.textContent = `Saved to the ComfyUI output folder: ${name(wVariant?.value)}` + (on ? `, ${name(wUpName?.value)}` : "");
        cLive.input.checked = liveOn();
        liveHint.style.display = liveOn() && lv.noFrames ? "" : "none";
    }
    const bindText = (f, w, fallback) => {
        f.input.addEventListener("input", () => { if (w) w.value = f.input.value; syncSettings(); dirty(); });
        if (fallback != null) {
            f.input.addEventListener("blur", () => {
                if (f.input.value.trim()) return;
                f.input.value = fallback;
                if (w) w.value = fallback;
                syncSettings();
            });
        }
    };
    bindText(fName, wPrefix, DEFAULT_NAME); // the file name cannot be empty
    // the toggle label is only for the node UI: kept in the node properties
    const toggleLabel = () => String(node.properties?.nd_toggle_label ?? "").trim() || DEFAULT_TOGGLE;
    const applyToggleLabel = () => { tg.label.textContent = toggleLabel(); };
    fToggle.input.addEventListener("input", () => {
        node.properties.nd_toggle_label = fToggle.input.value;
        applyToggleLabel();
        dirty();
    });
    fToggle.input.addEventListener("blur", () => {
        if (fToggle.input.value.trim()) return;
        fToggle.input.value = DEFAULT_TOGGLE;
        node.properties.nd_toggle_label = DEFAULT_TOGGLE;
        applyToggleLabel();
    });
    bindText(fVariant, wVariant, null);
    bindText(fUpName, wUpName, null);
    cUpOn.input.addEventListener("change", () => {
        if (wUpOn) wUpOn.value = cUpOn.input.checked;
        // no Upscale button: no upscaled result to show either
        if (!cUpOn.input.checked) { st.final = null; st.source = null; st.viewFinal = false; buildThumbs(); saveView(); }
        syncSettings(); render(); dirty();
    });
    cSave.input.addEventListener("change", () => { if (wSave) wSave.value = cSave.input.checked; syncSettings(); dirty(); });
    cLive.input.addEventListener("change", () => {
        node.properties.nd_live = cLive.input.checked;
        if (!cLive.input.checked) { clearLive(); lv.noFrames = false; }
        syncSettings(); render(); dirty();
    });
    eye.addEventListener("click", (e) => {
        e.stopPropagation();
        node.properties.nd_live_hidden = liveShown();
        if (!liveShown()) dropLiveUrls(); // hidden: drop the frame shown; new frames are not kept
        render(); dirty();
    });

    tg.input.addEventListener("change", () => { if (wMV) wMV.value = tg.input.checked; dirty(); });
    bindUpscaleButton(upBtn, node, () => {
        if (!upscaleOn()) return false;
        if (!st.images.length) { toast("warn", "ND Upscale", "Run the workflow first to get variants."); return false; }
        return true;
    });
    bindCanvasNavigation(root, node);

    node.addDOMWidget("nd_variant_preview", "ND_VARIANT_PREVIEW", root, {
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => 260,
    });
    node.setSize([Math.max(node.size[0], 440), Math.max(node.size[1], 560)]);

    node.ndApi = {
        // values the node outputs, taken from what is shown in the node right now
        promptValues() {
            return { selected_index: idx(), multi_variant: !!tg.input.checked };
        },
        live,
        node,
        onExecuted(msg) {
            if (!msg?.nd_batch) return;
            live.end();
            cacheOn = true;
            st.images = msg.nd_batch.map(withUrl);
            if (!msg.nd_mode?.[0]) { st.final = null; st.source = null; st.viewFinal = false; }
            if (st.sel >= st.images.length) setSel(Math.max(0, st.images.length - 1));
            buildThumbs(); persist(); render(); dirty();
        },
        // remember which image goes to upscale — it is the "before" in the comparison
        markSource() {
            const cur = st.images[idx()];
            st.source = cur ? { ...cur } : null;
            persist();
        },
        setFinal(info) {
            live.end();
            cacheOn = true;
            st.final = withUrl(info);
            st.viewFinal = true;
            buildThumbs(); persist(); render(); dirty();
        },
        // loaded: true when called after the node was configured from a workflow
        // (opened, or shown again after switching tabs); then the images it showed
        // in this browser session come back from memory.
        restore(loaded = false) {
            const saved = node.properties?.nd_preview;
            st.compare = !!saved?.compare;
            if (saved && (saved.images || saved.final || saved.source)) persist(); // drop stale refs from older saves
            const cached = loaded ? VIEW_CACHE.get(viewKey(node)) : null;
            if (loaded) cacheOn = true;
            if (cached) {
                // same URLs as before, so the browser shows them from its cache
                st.images = cached.images.slice();
                st.final = cached.final;
                st.source = cached.source;
                st.viewFinal = !!cached.viewFinal && !!st.final;
                setSel(cached.sel);
                this.checkFiles();
            } else {
                // a node without images from this session starts empty until a Run
                st.images = [];
                st.final = null;
                st.source = null;
                st.viewFinal = false;
                setSel(0); // starts at variant 1 (index 0) until one is picked
            }
            tg.input.checked = !!wMV?.value;
            fToggle.input.value = toggleLabel();
            applyToggleLabel();
            fName.input.value = wPrefix?.value || DEFAULT_NAME;
            fVariant.input.value = wVariant?.value ?? DEFAULT_VARIANT;
            fUpName.input.value = wUpName?.value ?? DEFAULT_UPSCALED;
            if (wUp) wUp.value = false;
            syncSettings(); buildThumbs(); render();
            // the frontend puts back the outputs of a workflow tab a moment after its nodes
            if (loaded) for (const ms of [0, 300, 1200]) setTimeout(() => this.syncNative(), ms);
        },
        // Takes a newer batch from the frontend's outputs of this workflow, e.g. one
        // that finished while another workflow tab was open.
        syncNative() {
            if (!livePreviews.has(this)) return;
            const out = nativeOutput(node);
            const batch = Array.isArray(out?.nd_batch) ? out.nd_batch : null;
            const first = batch?.[0]?.filename;
            if (!first || missingFiles.has(first) || st.images[0]?.filename === first) return;
            cacheOn = true;
            st.images = batch.map(withUrl);
            if (!out.nd_mode?.[0]) { st.final = null; st.source = null; st.viewFinal = false; }
            if (idx() !== st.sel) setSel(idx());
            buildThumbs(); persist(); render(); dirty();
            this.checkFiles();
        },
        // Workflows saved before the variant / upscaled names had the file name
        // "ND_variant" by default; it becomes "ND_Image" so files read ND_Image_variant.
        migrate(info) {
            if (!info?.properties?.nd_vs_names && wPrefix?.value === OLD_DEFAULT_NAME) wPrefix.value = DEFAULT_NAME;
            node.properties.nd_vs_names = 1;
        },
        // After a ComfyUI restart the temp files of the previews are deleted:
        // then the node is emptied (and its memory entry dropped).
        async checkFiles() {
            const first = st.images[0] || st.final;
            if (!first || (await fileExists(first))) return;
            if (first !== (st.images[0] || st.final)) return; // replaced by a new run meanwhile
            missingFiles.add(first.filename);
            st.images = [];
            st.final = null;
            st.source = null;
            st.viewFinal = false;
            setSel(0);
            cacheView(viewKey(node), null);
            buildThumbs(); render(); dirty();
        },
        dispose() {
            clearLive();
            removeKeys();
            document.removeEventListener("pointerdown", onDocDown, true);
            livePreviews.delete(node.ndApi);
        },
    };
    livePreviews.add(node.ndApi);
    node.properties ||= {};
    node.properties.nd_vs_names = 1;
    node.ndApi.restore();
}

/* ------------------------------------------------------------- slider node */

function numField(label) {
    const wrap = el("label", "nd-vs-field");
    const input = el("input");
    input.type = "number";
    wrap.append(el("span", null, label), input);
    return { wrap, input };
}

function setupSlider(node) {
    const wMV = hideWidget(node, "multi_variant");
    const wVal = hideWidget(node, "value");
    const wUp = hideWidget(node, "upscale_trigger");
    if (wUp) wUp.value = false;

    node.properties ||= {};
    for (const [k, v] of Object.entries({ min: 0, max: 10, step: 1 })) {
        if (node.properties[k] === undefined) node.properties[k] = v;
    }

    const root = el("div", "nd-vs-root nd-vs-slider-root");
    const head = el("div", "nd-vs-head");
    const num = el("input", "nd-vs-num");
    num.type = "number";
    const gear = makeGear("Slider range");
    head.append(el("span", "nd-vs-title", "Value"), num, gear);

    const settings = el("div", "nd-vs-settings");
    settings.style.display = "none";
    const fMin = numField("Min"), fMax = numField("Max"), fStep = numField("Step");
    settings.append(fMin.wrap, fMax.wrap, fStep.wrap);

    const range = el("input", "nd-vs-range");
    range.type = "range";
    const scale = el("div", "nd-vs-scale");
    const sMin = el("span"), sMax = el("span");
    scale.append(sMin, sMax);

    const upBtn = el("button", "nd-vs-btn", "Upscale");
    upBtn.title = "Queue a run with the upscale output set to True";
    const bottom = el("div", "nd-vs-bottom");
    const tg = makeToggle("Multi-Variant");
    bottom.append(tg.wrap);
    root.append(head, settings, range, scale, upBtn, bottom);

    const getRange = () => {
        let min = Math.round(Number(node.properties.min));
        let max = Math.round(Number(node.properties.max));
        const step = Math.max(1, Math.round(Number(node.properties.step) || 1));
        if (!Number.isFinite(min)) min = 0;
        if (!Number.isFinite(max)) max = min;
        if (max < min) [min, max] = [max, min];
        return { min, max, step };
    };

    let current = 0;
    function setValue(v) {
        const { min, max, step } = getRange();
        v = Math.round(Number(v));
        if (!Number.isFinite(v)) v = min;
        v = min + Math.round((v - min) / step) * step;
        v = Math.max(min, Math.min(max, v));
        current = v;
        if (wVal) wVal.value = v;
        range.value = String(v);
        setRangeFill(range);
        num.value = String(v);
        dirty();
    }

    function applyRange() {
        const { min, max, step } = getRange();
        for (const e of [range, num]) { e.min = min; e.max = max; e.step = step; }
        fMin.input.value = min; fMax.input.value = max; fStep.input.value = step;
        sMin.textContent = min; sMax.textContent = max;
        setValue(wVal?.value ?? min);
    }

    range.addEventListener("input", () => setValue(range.value));
    num.addEventListener("change", () => setValue(num.value));
    for (const [f, key] of [[fMin, "min"], [fMax, "max"], [fStep, "step"]]) {
        f.input.addEventListener("change", () => { node.properties[key] = Number(f.input.value); applyRange(); });
    }

    let open = false;
    gear.addEventListener("click", () => {
        open = !open;
        settings.style.display = open ? "" : "none";
        gear.classList.toggle("on", open);
        requestAnimationFrame(() => {
            const sz = node.computeSize?.();
            if (sz) node.setSize([node.size[0], open ? Math.max(node.size[1], sz[1]) : node.size[1]]);
            dirty();
        });
    });

    const removeKeys = addArrowHandler(node, root, (d) => setValue((Number(wVal?.value) || 0) + d * getRange().step));
    tg.input.addEventListener("change", () => { if (wMV) wMV.value = tg.input.checked; dirty(); });
    bindUpscaleButton(upBtn, node);
    bindCanvasNavigation(root, node);

    node.addDOMWidget("nd_variant_slider", "ND_VARIANT_SLIDER", root, {
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => (open ? 190 : 152),
    });
    node.setSize([Math.max(node.size[0], 320), Math.max(node.size[1], 210)]);

    node.ndApi = {
        promptValues() {
            return { value: current, multi_variant: !!tg.input.checked };
        },
        restore() {
            tg.input.checked = !!wMV?.value;
            if (wUp) wUp.value = false;
            applyRange();
        },
        dispose: removeKeys,
    };
    node.ndApi.restore();
}

/* ------------------------------------------------------------------ styles */

const STYLE = `
.nd-vs-root{--nd-accent:#2f7de1;position:relative;display:flex;flex-direction:column;gap:6px;width:100%;height:100%;box-sizing:border-box;padding:4px 2px;font-family:Inter,Arial,sans-serif;font-size:12px;color:var(--input-text,#ddd);user-select:none}
.nd-vs-thumbs{position:relative;display:flex;gap:4px;overflow-x:auto;overflow-y:hidden;flex:0 0 auto;padding:2px 0 3px;scrollbar-width:thin}
.nd-vs-thumbs>:first-child{margin-left:auto}
.nd-vs-thumbs>:last-child{margin-right:auto}
.nd-vs-thumb{position:relative;flex:0 0 auto;height:56px;min-width:40px;border-radius:5px;overflow:hidden;cursor:pointer;outline:2px solid transparent;outline-offset:-2px;opacity:.6;background:#0004;transition:opacity .12s,outline-color .12s}
.nd-vs-thumb img{height:100%;width:auto;display:block;pointer-events:none}
.nd-vs-thumb:hover{opacity:.9}
.nd-vs-thumb.sel{outline-color:var(--nd-accent);opacity:1}
.nd-vs-thumb.broken{opacity:.25}
.nd-vs-thumb span{position:absolute;left:3px;bottom:2px;font-size:10px;line-height:14px;background:#000b;color:#fff;padding:0 4px;border-radius:3px}
.nd-vs-thumb.final span{background:var(--nd-accent)}
.nd-vs-main{position:relative;flex:1 1 auto;min-height:120px;background:#0004;border-radius:6px;overflow:hidden;display:flex;align-items:center;justify-content:center}
.nd-vs-mainimg{max-width:100%;max-height:100%;object-fit:contain;display:block}
.nd-vs-empty{position:absolute;opacity:.5;text-align:center;padding:0 10px}
.nd-vs-badge{position:absolute;right:6px;bottom:6px;background:#000b;color:#fff;padding:1px 7px;border-radius:4px;font-size:11px;line-height:16px}
.nd-vs-btn{flex:0 0 auto;height:30px;border:none;border-radius:6px;background:var(--nd-accent);color:#fff;font-weight:600;font-size:13px;cursor:pointer;letter-spacing:.3px}
.nd-vs-btn:hover{filter:brightness(1.12)}.nd-vs-btn:active{filter:brightness(.9)}.nd-vs-btn.busy{opacity:.55;pointer-events:none}
.nd-vs-upbtn{align-self:center;width:60%;min-width:120px}
.nd-vs-btn:disabled{opacity:.4;filter:none;cursor:default}
.nd-vs-info{flex:0 0 auto;text-align:center;font-size:11px;line-height:14px;opacity:.7;font-variant-numeric:tabular-nums}
.nd-vs-bottom{display:flex;align-items:center;justify-content:space-between;flex:0 0 auto;min-height:18px}
.nd-vs-toggle{display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;opacity:.9}
.nd-vs-toggle{min-width:0}.nd-vs-toggle>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nd-vs-toggle input{display:none}
.nd-vs-switch{width:28px;height:15px;border-radius:8px;background:#555;position:relative;transition:background .15s;flex:0 0 auto}
.nd-vs-switch::after{content:"";position:absolute;left:2px;top:2px;width:11px;height:11px;border-radius:50%;background:#fff;transition:left .15s}
.nd-vs-toggle input:checked+.nd-vs-switch{background:var(--nd-accent)}
.nd-vs-toggle input:checked+.nd-vs-switch::after{left:15px}
.nd-vs-head{display:flex;align-items:center;gap:6px;flex:0 0 auto}
.nd-vs-title{flex:1 1 auto;opacity:.8}
.nd-vs-num,.nd-vs-field input{width:64px;height:22px;box-sizing:border-box;border:1px solid var(--border-color,#444);border-radius:4px;background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);padding:0 5px;font-size:12px}
.nd-vs-gear{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:24px;height:24px;box-sizing:border-box;border:1px solid var(--border-color,#444);border-radius:4px;background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);cursor:pointer;padding:0;margin:0;line-height:0}
.nd-vs-gear svg{display:block;flex:0 0 auto;pointer-events:none}
.nd-vs-gear.on{border-color:var(--nd-accent);color:var(--nd-accent)}
.nd-vs-settings{display:flex;gap:6px;flex:0 0 auto}
.nd-vs-field{display:flex;align-items:center;gap:4px;flex:1 1 0;font-size:11px;opacity:.9}
.nd-vs-field input{width:100%;min-width:0}
.nd-vs-range{width:100%;margin:0;accent-color:var(--nd-accent);flex:0 0 auto;cursor:pointer}
${nativeTrackCss(".nd-vs-range")}
.nd-vs-cmpbtn{position:absolute;left:6px;top:6px;z-index:3;height:20px;padding:0 9px;border:1px solid #fff4;border-radius:4px;background:#000b;color:#fff;font-size:11px;cursor:pointer}
.nd-vs-cmpbtn:hover{background:#000d}.nd-vs-cmpbtn.on{background:var(--nd-accent);border-color:var(--nd-accent)}
.nd-vs-cmp{position:absolute;inset:0;display:none;cursor:ew-resize;touch-action:none}
.nd-vs-cmp img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;user-select:none}
.nd-vs-cmp-line{position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:#fff;box-shadow:0 0 4px #000a;pointer-events:none}
.nd-vs-cmp-knob{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:24px;height:24px;border-radius:50%;background:#fff;color:#222;font-size:13px;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 5px #0009}
.nd-vs-cmp-lbl{position:absolute;bottom:6px;background:#000b;color:#fff;font-size:10px;line-height:16px;padding:0 7px;border-radius:3px;pointer-events:none}
.nd-vs-cmp-lbl.l{left:6px}.nd-vs-cmp-lbl.r{right:6px}
.nd-vs-pop{position:absolute;right:2px;bottom:32px;width:min(270px,calc(100% - 4px));box-sizing:border-box;display:flex;flex-direction:column;gap:9px;padding:10px;border:1px solid var(--border-color,#444);border-radius:8px;background:var(--comfy-menu-bg,#1e1e1e);box-shadow:0 8px 22px #000a;z-index:10}
.nd-vs-prow{display:flex;flex-direction:column;gap:4px;font-size:11px}
.nd-vs-prow input{height:24px;box-sizing:border-box;border:1px solid var(--border-color,#444);border-radius:4px;background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);padding:0 7px;font-size:12px;user-select:text}
.nd-vs-check{display:flex;align-items:center;gap:7px;font-size:12px;cursor:pointer}
.nd-vs-check input{margin:0;accent-color:var(--nd-accent);cursor:pointer}
.nd-vs-check.locked{opacity:.55;cursor:default}.nd-vs-check.locked input{cursor:default}
.nd-vs-hint{font-size:10px;line-height:1.35;opacity:.55}
.nd-vs-hint.nd-vs-warn{opacity:.85;color:#e8b04a}
.nd-vs-liveimg{position:absolute;inset:0;z-index:2;width:100%;height:100%;object-fit:contain;background:#141414}
.nd-vs-badge{z-index:3}
.nd-vs-badge.live{background:#c0392bdd}
.nd-vs-eye{position:absolute;left:6px;bottom:6px;z-index:4;display:inline-flex;align-items:center;justify-content:center;width:24px;height:22px;padding:0;border:1px solid #fff4;border-radius:4px;background:#000b;color:#fff;cursor:pointer;opacity:.7;line-height:0}
.nd-vs-eye:hover{opacity:1}.nd-vs-eye.off{color:#aaa}
.nd-vs-eye svg{display:block;pointer-events:none}
.nd-vs-scale{display:flex;justify-content:space-between;font-size:10px;opacity:.55;flex:0 0 auto;margin-top:-4px}
`;

function injectStyle() {
    if (document.getElementById("nd-vs-style")) return;
    const s = el("style");
    s.id = "nd-vs-style";
    s.textContent = STYLE;
    document.head.appendChild(s);
}

/* --------------------------------------------------------------- extension */

app.registerExtension({
    name: "NeuralDreamer.Nodes.VariantSelector",

    setup() {
        injectStyle();
        installQueueHook();
        installLiveListeners();
        // The connection comes back after a ComfyUI restart: previews whose temp files
        // are gone are emptied. Memory entries of other tabs are checked when shown.
        api.addEventListener("reconnected", () => {
            for (const p of livePreviews) p.checkFiles?.();
        });
        api.addEventListener("executed", (ev) => {
            const out = ev?.detail?.output;
            if (!out?.nd_final?.length) return;
            findNodeByApiId(out.nd_target?.[0])?.ndApi?.setFinal?.(out.nd_final[0]);
        });
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== PREVIEW && nodeData.name !== SLIDER) return;
        const isPreview = nodeData.name === PREVIEW;
        const proto = nodeType.prototype;

        const blank = (n) => blankSlots(n, ["params"], [0]);
        chain(proto, "onNodeCreated", function () {
            injectStyle();
            isPreview ? setupPreview(this) : setupSlider(this);
            blank(this);
        });
        chain(proto, "onConfigure", function (info) {
            blank(this);
            this.ndApi?.migrate?.(info);
            // widget values and properties are already restored from the workflow
            setTimeout(() => this.ndApi?.restore?.(true), 0);
        });
        chain(proto, "onRemoved", function () {
            this.ndApi?.dispose?.();
        });
        if (isPreview) {
            chain(proto, "onExecuted", function (msg) {
                this.ndApi?.onExecuted?.(msg);
            });
        } else {
            chain(proto, "onPropertyChanged", function () {
                setTimeout(() => this.ndApi?.restore?.(), 0);
            });
        }
    },
});
