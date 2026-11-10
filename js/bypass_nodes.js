// Neural Dreamer Nodes — the Bypass nodes in the browser: ND Bypass Upstream, ND Bypass Nodes, ND Bypass Groups.
//
// The nodes are virtual: they never go into the prompt.  Right before the prompt is built ComfyUI calls applyToGraph() of every virtual
// node; there the modes of the managed nodes are set (nd_bypass_core.js has the rules).  The same pass runs when a switch is clicked,
// when a workflow is loaded and twice a second while there is a controller in the graph (it catches a changed value of a wired
// switch, a renamed group, a node moved out of a group).
//   ND Bypass Upstream  : output = input; when bypassed and `start` is wired, output = start (resolveVirtualOutput, new frontends)
//   ND Bypass Nodes     : the pins node_1, node_2 ... with their switches on_1, on_2 ... (a new pin appears when the last is wired)
//   ND Bypass Groups    : the names of groups in a text, one per line
// Every node has a status line and, while it is selected, a dashed outline around the nodes it manages.
import { app } from "../../scripts/app.js";
import { chain, toast, isSelected } from "./nd_common.js";
import { tr, ensureLang } from "./lora_gallery.js";
import { LANG_EVENT } from "./nd_i18n.js";
import * as core from "./nd_bypass_core.js";

const ACCENT = "#2f7de1", WARN = "#e0a030", BAD = "#e05555", DIM = "#9aa0a8";
const TITLE_H = 30;
const VERSION = 1;

/* ------------------------------------------------------------------ graphs */

function graphsOf() {
    const root = app.rootGraph || app.graph;
    if (!root) return [];
    const out = [root];
    const subs = root.subgraphs || root._subgraphs;
    if (subs) for (const s of subs.values ? subs.values() : subs) if (s && !out.includes(s)) out.push(s);
    return out;
}
const eachController = (fn) => { for (const g of graphsOf()) for (const n of core.nodesOf(g)) if (core.isController(n)) fn(n, g); };
const dirty = () => { try { app.graph?.setDirtyCanvas?.(true, true); } catch {} };

const sigOf = (n) => { const i = n.__ndInfo; return i ? JSON.stringify([i.on, i.targets?.length, i.missing, i.unreadable, i.long, i.noInput, i.hasStart, i.groups, i.mode, i.inactive, i.pins?.map((p) => p.on)]) : ""; };

// one pass over every graph; returns how many modes changed
export function reconcileAll() {
    let changed = 0;
    for (const g of graphsOf()) changed += core.reconcile(g).changed;
    let repaint = changed > 0;
    eachController((n) => {
        const s = sigOf(n);
        if (s !== n.__ndSig) { n.__ndSig = s; repaint = true; }
        if (n.__ndInfo?.unreadable && !n.__ndWarned) {
            n.__ndWarned = true;
            ensureLang().then(() => toast("warn", tr("ND Bypass"), tr("The value of this switch cannot be read before the run (it is computed by the node that feeds it). The switch on the node is used.")));
        }
        if (!n.__ndInfo?.unreadable) n.__ndWarned = false;
        if (n.comfyClass === core.NODES) refreshPins(n);
    });
    if (repaint) dirty();
    return changed;
}

window.addEventListener(LANG_EVENT, () => dirty());

let timer = null;
function startTimer() {
    if (timer) return;
    timer = setInterval(() => {
        let any = false;
        eachController(() => { any = true; });
        if (!any) { clearInterval(timer); timer = null; return; }
        if (app.configuringGraph) return;
        try { reconcileAll(); } catch (e) { console.warn("[ND Bypass]", e); }
    }, 500);
}

/* ------------------------------------------------------------------ the status line */

function statusLines(node) {
    const i = node.__ndInfo;
    if (!i) return [];
    const out = [];
    const verb = (n) => (i.on ? tr("Controls {n} nodes", { n }) : i.mode === core.NEVER ? tr("Muting {n} nodes", { n }) : tr("Bypassing {n} nodes", { n }));
    if (i.inactive) out.push([tr("This node is bypassed or muted: it does nothing"), WARN]);
    if (i.cls === core.UPSTREAM) {
        if (i.noInput) out.push([tr("Connect the end of the chain to input"), WARN]);
        else out.push([verb(i.targets.length), i.long ? WARN : DIM]);
        if (i.long) out.push([tr("Connect start to limit the chain"), WARN]);
    } else if (i.cls === core.NODES) {
        const total = i.pins?.length || 0, off = (i.pins || []).filter((p) => !p.on).length;
        out.push([total ? tr("{n} of {total} off", { n: off, total }) : tr("Connect nodes to the pins"), total ? DIM : WARN]);
    } else {
        out.push([tr("{g} groups · {n} nodes", { g: i.groups || 0, n: i.targets.length }), DIM]);
        if (i.missing?.length) out.push([tr("Not found: {names}", { names: i.missing.join(", ") }), BAD]);
    }
    if (i.unreadable) out.push([tr("The value cannot be read: using the switch"), WARN]);
    return out;
}

function addStatus(node) {
    if (node.widgets?.some((w) => w.name === "nd_status")) return;
    node.addCustomWidget({
        name: "nd_status", type: "nd_status", value: "", serialize: false, options: { serialize: false },
        computeSize(width) { return [width, Math.max(1, statusLines(node).length) * 14 + 6]; },
        draw(ctx, n, width, y) {
            const lines = statusLines(n);
            ctx.save();
            ctx.font = "11px Arial";
            ctx.textAlign = "left";
            lines.forEach(([text, color], k) => { ctx.fillStyle = color; ctx.fillText(text, 12, y + 12 + k * 14, width - 24); });
            ctx.restore();
        },
    });
}
const keepStatusLast = (node) => {
    const i = node.widgets?.findIndex((w) => w.name === "nd_status") ?? -1;
    if (i >= 0 && i !== node.widgets.length - 1) node.widgets.push(...node.widgets.splice(i, 1));
};

/* ------------------------------------------------------------------ drawing: the bar of an off node and the outline of the managed ones */

function drawForeground(node, ctx) {
    const i = node.__ndInfo;
    if (!i) return;
    ctx.save();
    if (!i.on && !i.inactive) { ctx.fillStyle = ACCENT; ctx.fillRect(0, 0, node.size[0], 3); }
    if (isSelected(node) && i.targets?.length) {
        ctx.strokeStyle = ACCENT; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
        for (const t of i.targets) {
            if (!t.pos || !t.size) continue;
            const x = t.pos[0] - node.pos[0] - 5, y = t.pos[1] - node.pos[1] - TITLE_H - 5;
            const w = (t.flags?.collapsed ? t._collapsed_width || 100 : t.size[0]) + 10, h = (t.flags?.collapsed ? 0 : t.size[1]) + TITLE_H + 10;
            ctx.beginPath();
            if (ctx.roundRect) ctx.roundRect(x, y, w, h, 8); else ctx.rect(x, y, w, h);
            ctx.stroke();
        }
    }
    ctx.restore();
}

/* ------------------------------------------------------------------ common setup */

const switchNames = (node) => (node.widgets || []).filter((w) => w.name === "active" || /^on_\d+$/.test(w.name));

function syncLabels(node) { // the off label follows the mode
    const word = core.widgetOf(node, "mode")?.value === "mute" ? "muted" : "bypassed";
    for (const w of switchNames(node)) { w.options = w.options || {}; w.options.off = word; }
}

function changed() { // a click on a switch: set the modes at once
    try { reconcileAll(); } catch (e) { console.warn("[ND Bypass]", e); }
}

function wrapCallback(node, w) {
    if (!w || w.__ndWrapped) return;
    w.__ndWrapped = true;
    const cb = w.callback;
    w.callback = function (...a) { const r = cb?.apply(this, a); syncLabels(node); changed(); return r; };
}

function setupCommon(node) {
    addStatus(node);
    for (const w of node.widgets || []) if (["active", "mode", "groups"].includes(w.name) || /^on_\d+$/.test(w.name)) wrapCallback(node, w);
    syncLabels(node);
    node.size = [Math.max(node.size?.[0] || 0, 250), Math.max(node.size?.[1] || 0, node.computeSize?.()[1] || 0)];
    startTimer();
}

function afterLoad(node) {
    setTimeout(() => {
        for (const w of node.widgets || []) if (["active", "mode", "groups"].includes(w.name) || /^on_\d+$/.test(w.name)) wrapCallback(node, w);
        keepStatusLast(node);
        syncLabels(node);
        if (node.comfyClass === core.NODES) normalizePins(node);
        if (node.comfyClass === core.UPSTREAM) syncOutput(node);
        startTimer();
        changed();
    }, 0);
}

/* ------------------------------------------------------------------ ND Bypass Upstream: the type of the output follows input */

function syncOutput(node) {
    const g = node.graph, out = node.outputs?.[0];
    if (!g || !out) return;
    const o = core.originOf(g, node, core.slotOf(node, "input"));
    const type = o?.node?.outputs?.[o.slot]?.type ?? "*";
    if (out.type !== type) { out.type = type; dirty(); }
}

/* ------------------------------------------------------------------ ND Bypass Nodes: the pins grow and shrink with the wires */

const inputIdx = (node, name) => (node.inputs || []).findIndex((i) => i.name === name);

function addPin(node, k) {
    if (inputIdx(node, `node_${k}`) < 0) node.addInput(`node_${k}`, "*");
    let w = core.widgetOf(node, `on_${k}`);
    if (!w) {
        w = node.addWidget("toggle", `on_${k}`, true, () => {}, { on: "on", off: core.widgetOf(node, "mode")?.value === "mute" ? "muted" : "bypassed" });
        keepStatusLast(node);
    }
    if (inputIdx(node, `on_${k}`) < 0) node.addInput(`on_${k}`, "BOOLEAN", { widget: { name: `on_${k}` } });
    wrapCallback(node, w);
}

function removePin(node, k) {
    for (const name of [`node_${k}`, `on_${k}`]) { const i = inputIdx(node, name); if (i >= 0 && node.inputs[i].link == null) node.removeInput(i); }
    const wi = (node.widgets || []).findIndex((w) => w.name === `on_${k}`);
    if (wi >= 0) node.widgets.splice(wi, 1);
}

// the last pin is always free: one more than the highest pin that has a wire (the node or its switch)
function normalizePins(node) {
    if (node.__ndBusy || !node.graph) return;
    node.__ndBusy = true;
    try {
        const ks = core.pinsOf(node);
        let hi = 0;
        for (const k of ks) {
            const a = node.inputs[inputIdx(node, `node_${k}`)], b = node.inputs[inputIdx(node, `on_${k}`)];
            if (a?.link != null || b?.link != null) hi = Math.max(hi, k);
        }
        const want = Math.min(hi + 1, 64);
        for (let k = 1; k <= want; k++) addPin(node, k);
        for (const k of ks.slice().reverse()) { if (k <= want) break; removePin(node, k); }
        const s = node.computeSize();
        node.setSize([Math.max(node.size[0], s[0]), s[1]]);
        dirty();
    } finally { node.__ndBusy = false; }
}

function refreshPins(node) { // the switch shows the title of the node it belongs to
    const g = node.graph;
    if (!g) return;
    for (const k of core.pinsOf(node)) {
        const w = core.widgetOf(node, `on_${k}`);
        if (!w) continue;
        const o = core.originOf(g, node, inputIdx(node, `node_${k}`));
        const label = o ? String(o.node.title || o.node.type || `node ${k}`) : `node ${k}`;
        if (w.label !== label) { w.label = label; dirty(); }
    }
}

/* ------------------------------------------------------------------ registration */

app.registerExtension({
    name: "NeuralDreamer.Nodes.Bypass",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        const cls = nodeData.name;
        if (!core.CLASSES.has(cls)) return;
        const proto = nodeType.prototype;
        proto.isVirtualNode = true; // not in the prompt; applyToGraph() is called before the prompt is built
        proto.applyToGraph = function () { try { reconcileAll(); } catch (e) { console.warn("[ND Bypass]", e); } };
        chain(proto, "onNodeCreated", function () { setupCommon(this); });
        chain(proto, "onConfigure", function () { afterLoad(this); });
        const prevDraw = proto.onDrawForeground;
        proto.onDrawForeground = function (ctx, ...a) { const r = prevDraw?.call(this, ctx, ...a); drawForeground(this, ctx); return r; };
        chain(proto, "onRemoved", function () {
            try { if (this.graph) core.release(this.graph, this); } catch {}
            dirty();
        });
        const cloneOf = proto.clone;
        proto.clone = function (...a) { const c = cloneOf?.apply(this, a); if (c?.properties) c.properties.nd_applied = {}; return c; }; // the ids of the nodes are other ones there

        if (cls === core.UPSTREAM) {
            chain(proto, "onConnectionsChange", function () { setTimeout(() => { syncOutput(this); changed(); }, 0); });
            // bypassed with `start` wired: the value of start goes on instead of input (frontends that know this hook; the others use input)
            proto.resolveVirtualOutput = function (slot) {
                if (slot !== 0 || !this.graph || !core.isOff(this.graph, this)) return undefined;
                const i = core.slotOf(this, "start");
                const o = i >= 0 ? core.originOf(this.graph, this, i) : null;
                return o ? { node: o.node, slot: o.slot } : undefined;
            };
        } else if (cls === core.NODES) {
            const cfg = proto.configure;
            proto.configure = function (info) { // the pins of a saved workflow exist before its values are put in
                try {
                    const ks = (info?.inputs || []).map((i) => /^(?:node|on)_(\d+)$/.exec(i.name)).filter(Boolean).map((m) => +m[1]);
                    for (let k = 1; k <= Math.max(0, ...ks); k++) addPin(this, k);
                } catch (e) { console.warn("[ND Bypass]", e); }
                return cfg.call(this, info);
            };
            chain(proto, "onConnectionsChange", function () { if (!app.configuringGraph) setTimeout(() => { normalizePins(this); changed(); }, 0); });
        } else {
            chain(proto, "onConnectionsChange", function () { setTimeout(changed, 0); });
        }
    },
});

window.ndBypass = window.ndBypass?.version >= VERSION ? window.ndBypass : { version: VERSION, reconcile: reconcileAll, readBool: core.readBool, wantsOf: core.wantsOf };
