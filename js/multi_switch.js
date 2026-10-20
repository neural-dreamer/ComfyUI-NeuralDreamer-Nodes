// Neural Dreamer Nodes — ND Multi Switch (dynamic pairs of sockets)
//
// Inputs come in pairs (true_N, false_N) with one output (out_N) per pair; a
// toggle picks the side the outputs are taken from. The server declares a pool
// of 32 pairs; this script shows only the pairs in use:
//   - a new pair appears as soon as the last one gets a wire
//   - the first wire connected to a pair gives its data type to the pair's two
//     inputs and its output; pairs are independent of each other
//   - when a pair has no wires left, it becomes free again (type "*")
//   - empty pairs at the end are removed; an empty pair between used ones stays,
//     because the output numbers must not change
//   - the first wire, on either side, also names the pair after the pin at its other
//     end (the pin that feeds an input, or the pin the output feeds):
//     "image (true)", "image (false)", "image (out)"
//   - free pins are labelled "true +", "false +" and "out"
//   - a thin grey line (across the node) separates the pairs
import { app } from "../../scripts/app.js";
import { chain } from "./nd_common.js";

const CLASS = "NDMultiSwitch";
const MAX_PAIRS = 32;
const TRUE = /^true_(\d+)$/;
const FALSE = /^false_(\d+)$/;
const OUT = /^out_(\d+)$/;
const AUTO_LABEL = /^(true \+|false \+|out|(true|false|out) \d+)$/; // our default labels, old and new
const HOLLOW_CIRCLE = 7; // LiteGraph RenderShape.HollowCircle, the optional-input look
const PAIR_GAP = 16; // extra space between two pairs, in canvas px (the grey divider sits in it)

const classOf = (n) => n?.comfyClass || n?.type;
const isReal = (t) => typeof t === "string" && t !== "" && t !== "*";
const pairOf = (name) => Number((TRUE.exec(name) || FALSE.exec(name) || OUT.exec(name) || [])[1]) || 0;

function getLink(graph, id) {
    if (id == null || !graph) return null;
    return graph.getLink?.(id) ?? graph.links?.get?.(id) ?? graph.links?.[id] ?? graph._links?.get?.(id) ?? null;
}

function allNodes() {
    const out = [];
    const root = app.graph;
    if (!root) return out;
    const graphs = [root];
    const subs = root.subgraphs ?? root._subgraphs;
    if (subs?.values) graphs.push(...subs.values());
    for (const g of graphs) for (const n of g._nodes ?? g.nodes ?? []) if (classOf(n) === CLASS) out.push(n);
    return out;
}

// Two types are compatible if either is "*" or they share a name (types can be "A,B" lists).
function compatible(a, b) {
    if (!isReal(a) || !isReal(b)) return true;
    const A = a.toLowerCase().split(",");
    return b.toLowerCase().split(",").some((x) => A.includes(x));
}

// The data type of what feeds input `inp`, or null when unknown / still "*".
function sourceType(node, inp) {
    if (!inp || inp.link == null) return null;
    const link = getLink(node.graph, inp.link);
    if (!link) return null;
    const origin = node.graph?.getNodeById?.(link.origin_id);
    const t = origin?.outputs?.[link.origin_slot]?.type;
    if (isReal(t)) return t;
    return isReal(link.type) ? link.type : null;
}

const inputOf = (node, name) => (node.inputs || []).find((i) => i.name === name);
const outputOf = (node, name) => (node.outputs || []).find((o) => o.name === name);

// the highest pair that has a wire on any of its three sockets
function pairsInUse(node) {
    let n = 0;
    for (const inp of node.inputs || []) if (inp.link != null && (TRUE.test(inp.name) || FALSE.test(inp.name))) n = Math.max(n, pairOf(inp.name));
    for (const o of node.outputs || []) if (o.links?.length && OUT.test(o.name)) n = Math.max(n, pairOf(o.name));
    return n;
}

// A label we set ourselves is replaced freely; a label the user typed (Rename Slot) is kept.
function setLabel(node, slot, text) {
    const autos = (node.properties ||= {}).nd_auto ||= {};
    if (!slot.label || AUTO_LABEL.test(slot.label) || slot.label === autos[slot.name]) {
        slot.label = text;
        slot.localized_name = text;
        autos[slot.name] = text;
    }
}

// The first real type / name among the inputs the output `o` is wired to.
function targetInputs(node, o) {
    const res = [];
    for (const lid of o?.links || []) {
        const link = getLink(node.graph, lid);
        const tin = link ? node.graph?.getNodeById?.(link.target_id)?.inputs?.[link.target_slot] : null;
        if (tin) res.push(tin);
    }
    return res;
}
const targetType = (node, o) => targetInputs(node, o).map((i) => i.type).find(isReal) || null;
function targetName(node, o) {
    for (const tin of targetInputs(node, o)) {
        for (const c of [tin.label, tin.localized_name, tin.name]) {
            const t = String(c ?? "").trim();
            if (t && t !== "*") return t;
        }
    }
    return "";
}

// The name of the pin that feeds `inp` ("" when it has none).
function sourceName(node, inp) {
    if (!inp || inp.link == null) return "";
    const link = getLink(node.graph, inp.link);
    const o = link ? node.graph?.getNodeById?.(link.origin_id)?.outputs?.[link.origin_slot] : null;
    for (const c of [o?.label, o?.localized_name, o?.name]) {
        const t = String(c ?? "").trim();
        if (t && t !== "*") return t;
    }
    return "";
}

// Row positions: the default vertical layout plus PAIR_GAP before every pair after the first.
function layoutRows(node) {
    const h = window.LiteGraph?.NODE_SLOT_HEIGHT ?? 20;
    for (const inp of node.inputs || []) {
        const tm = TRUE.exec(inp.name), fm = FALSE.exec(inp.name);
        if (!tm && !fm) continue;
        const k = Number((tm || fm)[1]);
        inp.pos = [h * 0.5, (2 * (k - 1) + (tm ? 0 : 1) + 0.7) * h + (k - 1) * PAIR_GAP];
    }
    alignOutputs(node);
}

// The gaps between pairs make the node taller than the default layout assumes.
const gapsHeight = (node) => Math.max(0, Math.max(0, ...(node.inputs || []).filter((i) => TRUE.test(i.name)).map((i) => pairOf(i.name))) - 1) * PAIR_GAP;

// Each output sits level with the middle of its pair. A fixed position does not follow the
// node width by itself, so the x is refreshed whenever the node is resized.
function alignOutputs(node) {
    const h = window.LiteGraph?.NODE_SLOT_HEIGHT ?? 20;
    const x = (node.size?.[0] ?? 200) - h * 0.45;
    for (const o of node.outputs || []) {
        const m = OUT.exec(o.name);
        if (!m) continue;
        const k = Number(m[1]);
        const y = (2 * (k - 1) + 1.2) * h + (k - 1) * PAIR_GAP;
        if (!o.pos || o.pos[0] !== x || o.pos[1] !== y) o.pos = [x, y];
    }
}

function fitHeight(node) {
    const min = node.computeSize?.(); // includes the gaps (see computeSize below)
    if (min && node.size) {
        // follow the pair count while the node has its automatic height; keep a height the user set
        const auto = node.__ndAutoH;
        if (node.size[1] < min[1] || (auto != null && Math.abs(node.size[1] - auto) < 3)) {
            node.setSize([Math.max(node.size[0], min[0]), min[1]]);
        }
        node.__ndAutoH = min[1];
    }
    node.setDirtyCanvas?.(true, true);
}

function syncSwitch(node) {
    if (node.__ndSyncing) return;
    node.__ndSyncing = true;
    try {
        node.inputs ||= [];
        node.outputs ||= [];
        const count = Math.min(MAX_PAIRS, Math.max(1, pairsInUse(node) + 1)); // used pairs + one free pair

        // add what is missing
        for (let k = 1; k <= count; k++) {
            if (!inputOf(node, `true_${k}`)) node.addInput(`true_${k}`, "*");
            if (!inputOf(node, `false_${k}`)) node.addInput(`false_${k}`, "*");
            if (!outputOf(node, `out_${k}`)) node.addOutput(`out_${k}`, "*");
        }
        // remove the free pairs after the last used one
        for (let i = node.inputs.length - 1; i >= 0; i--) {
            const inp = node.inputs[i];
            if ((TRUE.test(inp.name) || FALSE.test(inp.name)) && pairOf(inp.name) > count && inp.link == null) node.removeInput(i);
        }
        for (let i = node.outputs.length - 1; i >= 0; i--) {
            const o = node.outputs[i];
            if (OUT.test(o.name) && pairOf(o.name) > count && !o.links?.length) node.removeOutput(i);
        }

        // data types: each pair follows its own wires
        for (let k = 1; k <= count; k++) {
            const t = inputOf(node, `true_${k}`), f = inputOf(node, `false_${k}`), o = outputOf(node, `out_${k}`);
            if (!t || !f || !o) continue;
            // the type comes from the first wire on either side: the inputs, then what the output feeds
            let type = sourceType(node, t) || sourceType(node, f) || targetType(node, o);
            if (!type) type = o.links?.length && isReal(o.type) ? o.type : "*";
            t.type = f.type = o.type = type;
            if (isReal(type)) {
                // wires on the output that do not fit the new type are removed
                for (const lid of [...(o.links || [])]) {
                    const link = getLink(node.graph, lid);
                    const target = link ? node.graph.getNodeById?.(link.target_id) : null;
                    const tin = target?.inputs?.[link.target_slot];
                    if (tin && !compatible(type, tin.type)) target.disconnectInput?.(link.target_slot);
                }
            }
        }

        // a pair is named after the pin of its first wire, until it is free again
        const names = ((node.properties ||= {}).nd_names ||= {});
        for (let k = 1; k <= count; k++) {
            const t = inputOf(node, `true_${k}`), f = inputOf(node, `false_${k}`), o = outputOf(node, `out_${k}`);
            if (!t || !f || !o) continue;
            if (t.link == null && f.link == null && !o.links?.length) delete names[k];
            else if (!names[k]) {
                const name = sourceName(node, t) || sourceName(node, f) || targetName(node, o);
                if (name) names[k] = name;
            }
        }
        for (const k of Object.keys(names)) if (Number(k) > count) delete names[k];

        // labels and the look of optional inputs
        for (const inp of node.inputs) {
            const tm = TRUE.exec(inp.name), fm = FALSE.exec(inp.name);
            if (!tm && !fm) continue;
            const side = tm ? "true" : "false", k = (tm || fm)[1];
            setLabel(node, inp, names[k] ? `${names[k]} (${side})` : `${side} +`);
            inp.shape = HOLLOW_CIRCLE;
        }
        for (const o of node.outputs) {
            const m = OUT.exec(o.name);
            if (m) setLabel(node, o, names[m[1]] ? `${names[m[1]]} (out)` : "out");
        }
        layoutRows(node);
        fitHeight(node);
    } catch (e) {
        console.warn("[Neural Dreamer] Multi Switch refresh failed", e);
    } finally {
        node.__ndSyncing = false;
    }
}

// A thin grey line between pairs, across the whole node.
function drawDividers(node, ctx) {
    if (!node.getInputPos || !node.pos || node.flags?.collapsed) return; // nothing to separate in a collapsed node
    const rows = {};
    (node.inputs || []).forEach((inp, i) => {
        if (!TRUE.test(inp.name) && !FALSE.test(inp.name)) return;
        const p = node.getInputPos(i);
        if (p) rows[inp.name] = p[1] - node.pos[1];
    });
    const width = node.size?.[0] ?? 200;
    ctx.save();
    ctx.strokeStyle = "rgba(160,160,160,.35)";
    ctx.lineWidth = 1;
    for (let k = 1; k < MAX_PAIRS; k++) {
        const fy = rows[`false_${k}`], next = rows[`true_${k + 1}`];
        if (fy == null || next == null) break;
        const y = (fy + next) / 2;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
    ctx.restore();
}

let loading = false;
function refresh(node) {
    if (loading || node.__ndPending) return;
    node.__ndPending = true;
    setTimeout(() => {
        node.__ndPending = false;
        if (!loading) syncSwitch(node);
    }, 0);
}

app.registerExtension({
    name: "NeuralDreamer.Nodes.MultiSwitch",

    beforeConfigureGraph() {
        loading = true;
        setTimeout(() => { loading = false; }, 5000); // safety net if loading fails midway
    },

    afterConfigureGraph() {
        // after the nodes' own deferred restores have run
        setTimeout(() => {
            loading = false;
            for (const n of allNodes()) syncSwitch(n);
            app.graph?.setDirtyCanvas?.(true, true);
        }, 0);
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== CLASS) return;
        const proto = nodeType.prototype;

        chain(proto, "onNodeCreated", function () {
            // the definition declares the whole pool; show only the first pair
            for (let i = (this.inputs?.length ?? 0) - 1; i >= 0; i--) {
                const inp = this.inputs[i];
                if ((TRUE.test(inp.name) || FALSE.test(inp.name)) && pairOf(inp.name) > 1) this.removeInput(i);
            }
            for (let i = (this.outputs?.length ?? 0) - 1; i >= 0; i--) {
                if (OUT.test(this.outputs[i].name) && pairOf(this.outputs[i].name) > 1) this.removeOutput(i);
            }
            syncSwitch(this);
            const sz = this.computeSize?.();
            if (sz) this.setSize([Math.max(sz[0], 200), sz[1]]);
            this.__ndAutoH = sz?.[1] ?? null;
        });

        // ComfyUI's configure() keeps the sockets the node already has and lays the saved
        // ones over them by position. Clear the pair sockets first so the saved ones come
        // back exactly as they were saved (same as Pack Parameters).
        const configure = proto.configure;
        proto.configure = function (data) {
            if (Array.isArray(data?.inputs) && this.inputs) {
                for (let i = this.inputs.length - 1; i >= 0; i--) {
                    if (TRUE.test(this.inputs[i].name) || FALSE.test(this.inputs[i].name)) this.inputs.splice(i, 1);
                }
            }
            if (Array.isArray(data?.outputs) && this.outputs) {
                for (let i = this.outputs.length - 1; i >= 0; i--) {
                    if (OUT.test(this.outputs[i].name)) this.outputs.splice(i, 1);
                }
            }
            return configure.call(this, data);
        };

        // The smallest size ComfyUI lets the user drag the node to: the rows plus the gaps,
        // so the widget below the pins is never left hanging in the air.
        const computeSize = proto.computeSize;
        proto.computeSize = function (out) {
            const size = computeSize ? computeSize.call(this, out) : out || [200, 80];
            size[1] += gapsHeight(this);
            return size;
        };
        chain(proto, "onResize", function () {
            alignOutputs(this);
        });
        chain(proto, "onDrawForeground", function (ctx) {
            try { alignOutputs(this); drawDividers(this, ctx); } catch {}
        });
        chain(proto, "onConfigure", function () {
            refresh(this);
        });
        chain(proto, "onConnectionsChange", function () {
            refresh(this);
        });
    },
});
