// Neural Dreamer Nodes — Pack / Unpack Parameters (dynamic sockets)
//
// A parameters bundle (ND_PARAMS) is an ordered {name: value} mapping on one wire.
// Pack Parameters grows a new input as each one is connected. Unpack Parameters
// builds its outputs by tracing its input back to whatever produced the bundle:
//   - Pack Parameters           -> one field per connected input
//   - another Unpack's output   -> the fields of that nested bundle
//   - any node that registers a provider (Load Images, selectors) -> what it reports
// Pack Parameters also looks the other way: when its output goes into one of my
// nodes that registers a consumer, it shows exactly the inputs that node expects.
// Tracing follows reroutes and subgraph boundaries.
import { app } from "../../scripts/app.js";
import { chain, hideWidget, blankSlots } from "./nd_common.js";

const PACK = "NDPack";
const UNPACK = "NDUnpack";
export const PARAMS = "ND_PARAMS";
const MAX_FIELDS = 64;
const SUBGRAPH_INPUT_ID = -10;
const SUBGRAPH_OUTPUT_ID = -20;
const FIELD = /^in_(\d+)$/;
const SPARE_LABEL = "+ value";
const HOLLOW_CIRCLE = 7; // LiteGraph RenderShape.HollowCircle, the optional-input look

// One registry per page, even if this file is imported under two URLs.
// providers: comfyClass -> (node, outputSlot) => [{name, type, sub?: () => fields}] | null
const REG = (window.__ndParams ||= { providers: new Map(), consumers: new Map(), refresh: () => {} });
REG.consumers ||= new Map();
export const registerParamsProvider = (comfyClass, fn) => REG.providers.set(comfyClass, fn);
export const refreshParams = () => REG.refresh();

const classOf = (n) => n?.comfyClass || n?.type;

/* ------------------------------------------------------------ graph access */

function getLink(graph, id) {
    if (id == null || !graph) return null;
    return graph.getLink?.(id) ?? graph.links?.get?.(id) ?? graph.links?.[id] ?? graph._links?.get?.(id) ?? null;
}

function* allGraphs() {
    const root = app.graph;
    if (!root) return;
    yield root;
    const subs = root.subgraphs ?? root._subgraphs;
    if (subs?.values) for (const s of subs.values()) yield s;
}

function allNodes() {
    const out = [];
    for (const g of allGraphs()) for (const n of g._nodes ?? g.nodes ?? []) out.push(n);
    return out;
}

const instanceOf = (sub) => allNodes().find((n) => n.subgraph === sub) ?? null;

// Where the value on input `slot` of `node` comes from, as {node, slot}.
function sourceOf(node, slot, depth = 0) {
    const inp = node?.inputs?.[slot];
    if (!inp || inp.link == null || depth > 32) return null;
    const link = getLink(node.graph, inp.link);
    return link ? originOf(node.graph, link.origin_id, link.origin_slot, depth + 1) : null;
}

function originOf(graph, id, slot, depth) {
    if (depth > 32 || !graph) return null;
    if (Number(id) === SUBGRAPH_INPUT_ID) {
        // a subgraph input: continue outside, at the instance that feeds it
        const inst = instanceOf(graph);
        return inst ? sourceOf(inst, slot, depth + 1) : null;
    }
    const n = graph.getNodeById?.(id);
    if (!n) return null;
    if (n.subgraph) {
        // a subgraph instance: continue inside, at the link into its output
        const lid = n.subgraph.outputs?.[slot]?.linkIds?.[0];
        const l = getLink(n.subgraph, lid);
        return l ? originOf(n.subgraph, l.origin_id, l.origin_slot, depth + 1) : null;
    }
    if (classOf(n) === "Reroute") return sourceOf(n, 0, depth + 1);
    return { node: n, slot };
}

// Where the value leaving output `slot` of `node` goes, as [{node, slot}] (input slots).
function targetsOf(node, slot, depth = 0) {
    const res = [];
    if (depth > 32) return res;
    for (const lid of node?.outputs?.[slot]?.links || []) {
        const l = getLink(node.graph, lid);
        if (l) res.push(...targetAt(node.graph, l.target_id, l.target_slot, depth + 1));
    }
    return res;
}

function targetAt(graph, id, slot, depth) {
    if (depth > 32 || !graph) return [];
    if (Number(id) === SUBGRAPH_OUTPUT_ID) {
        const inst = instanceOf(graph);
        return inst ? targetsOf(inst, slot, depth + 1) : [];
    }
    const n = graph.getNodeById?.(id);
    if (!n) return [];
    if (n.subgraph) {
        const res = [];
        for (const lid of n.subgraph.inputs?.[slot]?.linkIds || []) {
            const l = getLink(n.subgraph, lid);
            if (l) res.push(...targetAt(n.subgraph, l.target_id, l.target_slot, depth + 1));
        }
        return res;
    }
    if (classOf(n) === "Reroute") return targetsOf(n, 0, depth + 1);
    return [{ node: n, slot }];
}

// The fields the node fed by this Pack expects, or null if it is not one of mine.
function consumerFields(pack) {
    for (const t of targetsOf(pack, 0)) {
        const fn = REG.consumers.get(classOf(t.node));
        const fields = fn?.(t.node, t.slot);
        if (fields?.length) return expandGrow(pack, fields);
    }
    return null;
}

// A field with grow {max}: "pose", "pose_2" ... one pin per connected input and exactly one empty pin after the last connected one
// (at most max). The server reads the same names. Labels: "Pose Builder", "Pose Builder 2" ...
function expandGrow(pack, fields) {
    const map = pack.properties?.nd_schema || {};
    const out = [];
    for (const f of fields) {
        if (!f.grow) { out.push(f); continue; }
        const nameOf = (n) => (n === 1 ? f.name : `${f.name}_${n}`);
        let highest = 0;
        for (let n = 1; n <= f.grow.max; n++) {
            const slot = Object.keys(map).find((k) => map[k] === nameOf(n));
            const i = slot ? pack.inputs?.findIndex((x) => x.name === slot) : -1;
            if (i >= 0 && pack.inputs[i].link != null) highest = n;
        }
        const show = Math.min(f.grow.max, highest + 1);
        for (let n = 1; n <= show; n++) out.push({ ...f, name: nameOf(n), label: n === 1 ? f.label : `${f.label} ${n}`, grow: undefined });
    }
    return out;
}

// Where the value on the input pin `name` of a node comes from, as {node, slot}.
export function inputSource(node, name) {
    return sourceOf(node, inputIndex(node, name));
}

// Where the value of the field `name` of a Pack Parameters node (schema mode) comes from, as {node, slot}.
export function packFieldSource(pack, name) {
    const map = pack?.properties?.nd_schema || {};
    const slot = Object.keys(map).find((k) => map[k] === name);
    const i = slot ? pack.inputs?.findIndex((x) => x.name === slot) : -1;
    return i >= 0 ? sourceOf(pack, i) : null;
}

// The Pack Parameters node (or nothing) that feeds the input pin `name` of a node
export function packOf(node, name = "params") {
    const src = inputSource(node, name);
    return src && classOf(src.node) === PACK ? src.node : null;
}

/* ------------------------------------------------------------ descriptions */

// Fields of the bundle produced at `src` ({node, slot}), or null if unknown.
function describe(src, depth = 0) {
    if (!src || depth > 16) return null;
    const { node, slot } = src;
    const cls = classOf(node);
    if (cls === PACK) return packFields(node, depth);
    if (cls === UNPACK) {
        const parent = describe(sourceOf(node, inputIndex(node, "params")), depth + 1);
        const field = parent?.[slot];
        return field?.sub ? field.sub() : null;
    }
    const provider = REG.providers.get(cls);
    return provider ? provider(node, slot) ?? null : null;
}

const inputIndex = (node, name) => node.inputs?.findIndex((i) => i.name === name) ?? -1;

function outputName(src) {
    const o = src?.node?.outputs?.[src.slot];
    for (const c of [o?.label, o?.localized_name, o?.name]) {
        const t = String(c ?? "").trim();
        if (t && t !== "*") return t;
    }
    return "value";
}

function outputType(src, fallback) {
    const t = src?.node?.outputs?.[src.slot]?.type;
    return t && t !== -1 ? String(t) : fallback || "*";
}

function packFields(node, depth = 0) {
    node.properties ||= {};
    const autos = (node.properties.nd_auto ||= {});
    const schema = node.properties.nd_schema || {};
    const used = new Set();
    const fields = [];
    (node.inputs || []).forEach((inp, i) => {
        if (!FIELD.test(inp.name) || inp.link == null) return;
        const src = sourceOf(node, i);
        const auto = outputName(src);
        // autos[slot] is the label this node set itself; any other label was set by
        // the user (Rename Slot) and wins over the automatic name. Inputs created for a
        // consumer (schema) carry the field name that node expects.
        const custom = !schema[inp.name] && !!inp.label && inp.label !== SPARE_LABEL && inp.label !== autos[inp.name];
        let name = schema[inp.name] || (custom ? inp.label : auto);
        const base = name;
        for (let k = 2; used.has(name); k++) name = `${base}_${k}`;
        used.add(name);
        const link = getLink(node.graph, inp.link);
        fields.push({ name, type: outputType(src, link?.type), slot: inp.name, custom, sub: () => describe(src, depth + 1) });
    });
    return fields;
}

/* ------------------------------------------------------------ Pack sockets */

const fieldIndexes = (node) => (node.inputs || []).map((inp, i) => (FIELD.test(inp.name) ? i : -1)).filter((i) => i >= 0);

// New inputs get the next number after the highest one in use, so the numbering
// follows the order of the inputs (a reused low number would be moved to the top
// when ComfyUI restores the node). Only when the pool runs out is a gap reused.
function freeFieldName(node) {
    const taken = new Set(fieldIndexes(node).map((i) => Number(FIELD.exec(node.inputs[i].name)[1])));
    const next = Math.max(0, ...taken) + 1;
    if (next <= MAX_FIELDS) return `in_${next}`;
    let k = 1;
    while (taken.has(k)) k++;
    return k <= MAX_FIELDS ? `in_${k}` : null;
}

function syncPack(node) {
    node.properties ||= {};
    const autos = (node.properties.nd_auto ||= {});
    const schema = consumerFields(node);

    if (schema) {
        // Schema mode: exactly the inputs the connected node expects (plus any other
        // inputs that are still wired), labelled with the field names.
        const map = (node.properties.nd_schema ||= {});
        for (const k of Object.keys(map)) {
            if (!schema.some((f) => f.name === map[k]) || !node.inputs.some((i) => i.name === k)) delete map[k];
        }
        for (const f of schema) {
            let slot = Object.keys(map).find((k) => map[k] === f.name);
            if (!slot) {
                const reuse = node.inputs.find((i) => FIELD.test(i.name) && !map[i.name] && (i.label === (f.label || f.name) || i.link == null));
                slot = reuse ? reuse.name : freeFieldName(node);
                if (!slot) continue;
                if (!reuse) node.addInput(slot, f.type || "*");
                map[slot] = f.name;
            }
            const inp = node.inputs.find((i) => i.name === slot);
            inp.label = f.label || f.name; // f.name is the key the server reads; f.label is what the pin shows
            inp.type = f.type || "*";
            autos[slot] = f.label || f.name;
        }
        for (let i = node.inputs.length - 1; i >= 0; i--) {
            const inp = node.inputs[i];
            if (FIELD.test(inp.name) && !map[inp.name] && inp.link == null) node.removeInput(i);
        }
    } else {
        // Free mode: connected inputs plus exactly one empty input at the end.
        if (node.properties.nd_schema) {
            delete node.properties.nd_schema;
            for (const i of fieldIndexes(node)) node.inputs[i].type = "*";
        }
        let idx = fieldIndexes(node);
        for (let k = idx.length - 2; k >= 0; k--) if (node.inputs[idx[k]].link == null) node.removeInput(idx[k]);
        idx = fieldIndexes(node);
        const last = idx.length ? node.inputs[idx[idx.length - 1]] : null;
        if (!last || last.link != null) {
            const slot = freeFieldName(node);
            if (slot) node.addInput(slot, "*", { label: SPARE_LABEL });
        }
    }

    // labels and the names list the server reads
    const fields = packFields(node);
    const map = node.properties.nd_schema || {};
    for (const inp of node.inputs) {
        if (!FIELD.test(inp.name) || map[inp.name]) continue;
        const f = fields.find((x) => x.slot === inp.name);
        if (!f) { inp.label = SPARE_LABEL; delete autos[inp.name]; continue; }
        if (!f.custom) {
            inp.label = f.name;
            autos[inp.name] = f.name;
        }
    }
    // optional inputs are drawn as hollow circles: in free mode every input after
    // the first (including "+ value"), in schema mode the fields the node marks optional
    fieldIndexes(node).forEach((i, k) => {
        const inp = node.inputs[i];
        const field = map[inp.name] ? schema?.find((f) => f.name === map[inp.name]) : null;
        const optional = field ? !!field.optional : k > 0;
        if (optional) inp.shape = HOLLOW_CIRCLE;
        else delete inp.shape;
    });
    setNames(node, JSON.stringify(fields.map((f) => ({ slot: f.slot, name: f.name }))));
    fitHeight(node);
}

/* ---------------------------------------------------------- Unpack sockets */

function syncUnpack(node) {
    const src = sourceOf(node, inputIndex(node, "params"));
    if (!src) return; // disconnected or unknown: keep the outputs as they are
    const fields = describe(src);
    if (!fields) return;
    const list = fields.slice(0, MAX_FIELDS);
    node.outputs ||= [];
    list.forEach((f, i) => {
        if (i >= node.outputs.length) node.addOutput(`out_${i + 1}`, f.type || "*");
        const o = node.outputs[i];
        // f.label is what the pin shows (e.g. a block name set by the user); f.name is the
        // key the server looks the value up by and must stay as it is
        o.label = f.label || f.name;
        o.localized_name = f.label || f.name;
        o.type = f.type || "*";
    });
    for (let i = node.outputs.length - 1; i >= list.length; i--) {
        // while a workflow is loading, a wired output is kept even if the source does
        // not list it yet; the refresh after loading settles it
        if (loading && node.outputs[i].links?.length) break;
        node.removeOutput(i);
    }
    setNames(node, JSON.stringify(list.map((f) => f.name)));
    fitHeight(node);
}

/* ------------------------------------------------------------------ shared */

function setNames(node, value) {
    const w = node.widgets?.find((x) => x.name === "names");
    if (w && w.value !== value) w.value = value;
}

function fitHeight(node) {
    const min = node.computeSize?.();
    if (min && node.size && node.size[1] < min[1]) node.setSize([Math.max(node.size[0], min[0]), min[1]]);
    node.setDirtyCanvas?.(true, true);
}

let pending = false;
let loading = false;
function refreshAll() {
    if (pending) return;
    pending = true;
    setTimeout(() => {
        pending = false;
        try {
            const nodes = allNodes();
            for (const n of nodes) if (classOf(n) === PACK) syncPack(n);
            for (const n of nodes) if (classOf(n) === UNPACK) syncUnpack(n);
            app.graph?.setDirtyCanvas?.(true, true);
        } catch (e) {
            console.warn("[Neural Dreamer] params refresh failed", e);
        }
    }, 0);
}
REG.refresh = refreshAll;

// The older link-release menu (LiteGraph search box / context menu) lists nodes
// from these maps: put Unpack first for parameters outputs, Pack for inputs.
function preferPackUnpack() {
    const LG = window.LiteGraph;
    if (!LG) return;
    for (const [map, id] of [[LG.slot_types_default_out, UNPACK], [LG.slot_types_default_in, PACK]]) {
        if (!map) continue;
        const list = Array.isArray(map[PARAMS]) ? map[PARAMS].filter((x) => x !== id) : [];
        map[PARAMS] = [id, ...list];
    }
}

app.registerExtension({
    name: "NeuralDreamer.Nodes.Params",

    setup() {
        const colors = { ND_PARAMS: "#d6a64f", OUTFIT_PARAMS: "#e0709a", CHARACTER_PARAMS: "#7c9be0", POSE_PARAMS: "#8fd18f", COMPOSITION_PARAMS: "#e0a46a" };
        try { Object.assign(app.canvas?.constructor?.link_type_colors ?? {}, colors); } catch {}
        try { Object.assign((app.canvas.default_connection_color_byType ||= {}), colors); } catch {}
        preferPackUnpack();
        setTimeout(preferPackUnpack, 1500);
    },

    beforeConfigureGraph() {
        loading = true;
        setTimeout(() => { loading = false; }, 5000); // safety net if loading fails midway
    },

    afterConfigureGraph() {
        refreshAll();
        // after the nodes' own deferred restores (setTimeout 0) have run
        setTimeout(() => { loading = false; refreshAll(); }, 0);
        preferPackUnpack();
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== PACK && nodeData.name !== UNPACK) return;
        const isPack = nodeData.name === PACK;
        const proto = nodeType.prototype;

        const blank = (n) => (isPack ? blankSlots(n, [], [0]) : blankSlots(n, ["params"], []));
        chain(proto, "onNodeCreated", function () {
            hideWidget(this, "names");
            // the definition declares a pool of sockets; show only the ones in use
            if (isPack) {
                for (let i = (this.inputs?.length ?? 0) - 1; i >= 0; i--) {
                    const inp = this.inputs[i];
                    if (FIELD.test(inp.name) && inp.name !== "in_1") this.removeInput(i);
                }
                const first = this.inputs?.find((x) => x.name === "in_1");
                if (first) first.label = SPARE_LABEL;
            } else {
                for (let i = (this.outputs?.length ?? 0) - 1; i >= 0; i--) this.removeOutput(i);
            }
            blank(this);
            const sz = this.computeSize?.();
            if (sz) this.setSize([Math.max(sz[0], 220), sz[1]]);
        });
        if (isPack) {
            // ComfyUI's configure() puts the inputs the node already has (here the
            // fresh "in_1") first and appends the saved ones after them, which would
            // move "in_1" to the top and reorder the fields. Clear the fresh field
            // inputs so the saved inputs come back exactly in their saved order.
            // (No link check here: in newer frontends input.link is looked up by slot
            // index, so the placeholder can appear "connected" to a saved link.)
            const configure = proto.configure;
            proto.configure = function (data) {
                if (Array.isArray(data?.inputs) && this.inputs) {
                    for (let i = this.inputs.length - 1; i >= 0; i--) {
                        if (FIELD.test(this.inputs[i].name)) this.inputs.splice(i, 1);
                    }
                }
                return configure.call(this, data);
            };
        }
        chain(proto, "onConfigure", function () {
            hideWidget(this, "names");
            blank(this);
            refreshAll();
        });
        chain(proto, "onConnectionsChange", function () {
            refreshAll();
        });
    },
});
