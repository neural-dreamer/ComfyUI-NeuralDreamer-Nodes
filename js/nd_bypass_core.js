// Neural Dreamer Nodes — the logic of the three Bypass nodes (ND Bypass Upstream, ND Bypass Nodes, ND Bypass Groups).
// Pure code: no imports and no DOM, so it runs in the tests on a model of a graph.  The nodes themselves are in bypass_nodes.js.
//
// The nodes are virtual (they never reach the prompt).  Before the prompt is built ComfyUI calls `applyToGraph()` of every virtual node;
// there `reconcile(graph)` puts the nodes the controllers manage into the mode Bypass (4) or Mute (2), or gives them back (0).
//
// Who owns a mode.  A controller writes what it changed into node.properties.nd_applied ({"<node id>": mode}).  A node that somebody set to
// Bypass / Mute by hand (Ctrl+B) is not in that record and is never touched; a node the controller gave back is only returned to 0 if
// its mode is still the one the controller set.  A node wanted by two controllers stays off while at least one of them is off.
//
// What the graph has to offer: graph._nodes | nodes, graph.getNodeById(id), graph.getLink(id) | links, graph.groups | _groups;
// node.id, mode, type | comfyClass, isVirtualNode, inputs[{name, link, widget}], outputs[{name, links}], widgets, properties.

export const UPSTREAM = "NDBypassUpstream";
export const NODES = "NDBypassNodes";
export const GROUPS = "NDBypassGroups";
export const CLASSES = new Set([UPSTREAM, NODES, GROUPS]);
export const ALWAYS = 0, NEVER = 2, BYPASS = 4;
export const BIG_CHAIN = 8; // a chain longer than this with `start` unplugged gets a warning

const classOf = (n) => n?.comfyClass || n?.type || "";
export const isController = (n) => CLASSES.has(classOf(n));
export const nodesOf = (g) => g?._nodes || g?.nodes || [];
export const linkOf = (g, id) => {
    if (id == null) return null;
    if (typeof g.getLink === "function") return g.getLink(id) || null;
    const l = g.links;
    return (l instanceof Map ? l.get(id) : l?.[id]) || null;
};
export const originOf = (g, node, slot) => {
    const l = linkOf(g, node.inputs?.[slot]?.link);
    const n = l ? g.getNodeById(l.origin_id) : null;
    return n ? { node: n, slot: l.origin_slot, link: l } : null;
};
export const slotOf = (node, name) => (node.inputs || []).findIndex((i) => i.name === name);
export const widgetOf = (node, name) => (node.widgets || []).find((w) => w.name === name) || null;

// Reroute and the like: the wire only passes through
const isPass = (n) => !isController(n) && (n.type === "Reroute" || (n.isVirtualNode && n.inputs?.length === 1 && n.outputs?.length === 1));

/* ------------------------------------------------------------------ the switch (a widget, or a wire to a widget of another node) */

const toBool = (v) => (typeof v === "string" ? !/^(false|0|off|no|)$/i.test(v.trim()) : !!v);

// The origin of an input, also across the border of a subgraph: the wire from the input node of a subgraph (origin id -10) continues
// in the parent graph, at the same-numbered input of the node that holds the subgraph.  -> {node, slot, g} (g: the graph of that node)
const SUBGRAPH_INPUT = -10;
function instanceOf(g) {
    const root = g.rootGraph || g;
    const subs = root.subgraphs ? [...(root.subgraphs.values ? root.subgraphs.values() : root.subgraphs)] : [];
    for (const x of [root, ...subs]) for (const n of nodesOf(x)) if (n.subgraph === g) return n;
    return null;
}
export function originAcross(g, node, slot, depth = 0) {
    const l = linkOf(g, node.inputs?.[slot]?.link);
    if (!l || depth > 8) return null;
    if (l.origin_id === SUBGRAPH_INPUT || (g.inputNode && l.origin_id === g.inputNode.id)) {
        const inst = instanceOf(g);
        return inst ? originAcross(inst.graph || g.rootGraph, inst, l.origin_slot, depth + 1) : null;
    }
    const n = g.getNodeById(l.origin_id);
    return n ? { node: n, slot: l.origin_slot, link: l, g } : null;
}

/* Readers: nodes that compute a value at the run, but whose value is already known in the browser (it is stored in widgets).
   A reader gets (graph, node, outputSlot, depth, follow) and returns {value, ok}, or null when the value cannot be told (then the switch on the node is used).
   Add a reader for another node pack here (READERS["Node type"] = fn). */
const widgetLines = (n) => { const w = (n.widgets || []).find((x) => typeof x.value === "string" && x.value.includes("\n")) || (n.widgets || [])[0]; return String(w?.value ?? "").split("\n").map((x) => x.trim()).filter(Boolean); };
const stateOf = (n, name) => { // the JSON {"name": value, ...} that ValuePresets keeps
    const cands = [...(n.widgets || []).map((w) => w.value), ...(n.widgets_values || [])];
    for (const v of cands) {
        if (typeof v !== "string" || v[0] !== "{") continue;
        try { const o = JSON.parse(v); if (o && typeof o === "object" && name in o) return o; } catch {}
    }
    return null;
};
// obvpm: ValuePresets -> (Bundle ->) Unbundle -> the wire.  Unbundle output N is the N-th name of its list.
function obvpmValue(g, node, name, depth, follow) {
    const o = originAcross(g, node, 0);
    if (!o || depth > 8) return null;
    const src = o.node;
    if (src.type === "ValuePresets (obvpm)") { const st = stateOf(src, name); return st ? { value: toBool(st[name]), ok: true } : null; }
    if (src.type === "Bundle (obvpm)") { // the names of the bundle: in_1 is the first line
        const i = widgetLines(src).indexOf(name);
        return i >= 0 && src.inputs?.[i]?.link != null ? follow(o.g, src, i, depth + 1) : null;
    }
    return null;
}
export const READERS = {
    "Unbundle (obvpm)": (g, node, slot, depth, follow) => {
        const name = widgetLines(node)[slot];
        return name ? obvpmValue(g, node, name, depth, follow) : null;
    },
};

// -> {value, ok}: ok false when the wire comes from something that is computed by the backend (its value cannot be known before the run)
function followBool(g, node, slot, depth) {
    if (depth > 8) return { ok: false };
    const o = originAcross(g, node, slot);
    if (!o) return { ok: false };
    const src = o.node;
    g = o.g;
    if (isPass(src)) return followBool(g, src, 0, depth + 1);
    const reader = READERS[src.type];
    if (reader) return reader(g, src, o.slot, depth, followBool) || { ok: false };
    const ws = src.widgets || [];
    const outName = src.outputs?.[o.slot]?.name;
    let w = ws.find((x) => x.name === outName);
    if (!w) {
        const bools = ws.filter((x) => x.type === "toggle" || x.type === "boolean" || typeof x.value === "boolean");
        w = bools.length === 1 ? bools[0] : ws.length === 1 ? ws[0] : null;
    }
    if (!w) return { ok: false };
    const idx = (src.inputs || []).findIndex((i) => i.widget?.name === w.name && i.link != null); // that widget is fed by a wire as well
    if (idx >= 0) return followBool(g, src, idx, depth + 1);
    return { value: toBool(w.value), ok: true };
}

// -> {value, unreadable}.  `name` is the widget (active, on_2...)
export function readBool(g, node, name) {
    const w = widgetOf(node, name);
    const local = w ? toBool(w.value) : true;
    const idx = (node.inputs || []).findIndex((i) => (i.widget?.name || i.name) === name && i.link != null);
    if (idx < 0) return { value: local, unreadable: false };
    const r = followBool(g, node, idx, 0);
    return r.ok ? { value: r.value, unreadable: false } : { value: local, unreadable: true };
}

/* ------------------------------------------------------------------ which nodes a controller manages */

function collectAncestors(g, node, out) {
    const stack = [node];
    while (stack.length) {
        const n = stack.pop();
        if (out.has(n.id)) continue;
        out.add(n.id);
        for (let i = 0; i < (n.inputs?.length || 0); i++) { const o = originOf(g, n, i); if (o) stack.push(o.node); }
    }
}

// the nodes after `node` that really use its output (through Reroutes; the Bypass controllers do not count)
function realConsumers(g, node, seen = new Set()) {
    const out = [];
    for (const o of node.outputs || []) {
        for (const lid of o.links || []) {
            const l = linkOf(g, lid);
            const t = l ? g.getNodeById(l.target_id) : null;
            if (!t || isController(t)) continue;
            if (t.isVirtualNode) { if (!seen.has(t.id)) { seen.add(t.id); out.push(...realConsumers(g, t, seen)); } continue; }
            out.push(t);
        }
    }
    return out;
}

// ND Bypass Upstream: everything that feeds only this node, up to `start` (the node on `start` and everything above it stay on)
export function upstreamTargets(g, ctrl) {
    const iIn = slotOf(ctrl, "input"), iStart = slotOf(ctrl, "start");
    const first = iIn >= 0 ? originOf(g, ctrl, iIn) : null;
    if (!first) return { nodes: [], noInput: true, hasStart: false, long: false };
    const startO = iStart >= 0 ? originOf(g, ctrl, iStart) : null;
    const stop = new Set();
    if (startO) collectAncestors(g, startO.node, stop);
    const set = new Map(), seen = new Set();
    const stack = [first.node];
    while (stack.length) {
        const n = stack.pop();
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        if (isController(n) || stop.has(n.id)) continue;
        if (!n.isVirtualNode) set.set(n.id, n);
        for (let i = 0; i < (n.inputs?.length || 0); i++) { const o = originOf(g, n, i); if (o) stack.push(o.node); }
    }
    // a node that something outside the chain uses has to stay on, and so does everything that feeds it
    let changed = true;
    while (changed) {
        changed = false;
        for (const [id, n] of set) {
            if (realConsumers(g, n).some((c) => c !== ctrl && !set.has(c.id))) { set.delete(id); changed = true; }
        }
    }
    const nodes = [...set.values()];
    return { nodes, noInput: false, hasStart: !!startO, long: !startO && nodes.length > BIG_CHAIN };
}

// ND Bypass Nodes: the pins node_1, node_2... each with its own switch on_N -> [{node, pin, on, unreadable}]
export function pinsOf(ctrl) {
    const pins = [];
    for (const i of ctrl.inputs || []) { const m = /^node_(\d+)$/.exec(i.name); if (m) pins.push(+m[1]); }
    return pins.sort((a, b) => a - b);
}
export function nodesTargets(g, ctrl) {
    const out = [];
    for (const k of pinsOf(ctrl)) {
        let o = originOf(g, ctrl, slotOf(ctrl, `node_${k}`));
        for (let d = 0; o && isPass(o.node) && d < 8; d++) o = originOf(g, o.node, 0);
        if (!o || isController(o.node) || o.node.isVirtualNode) continue;
        const b = readBool(g, ctrl, `on_${k}`);
        out.push({ node: o.node, pin: k, on: b.value, unreadable: b.unreadable });
    }
    return out;
}

// ND Bypass Groups: one name per line, case does not matter, `*` is any text, lines with # are comments
export function parseGroupNames(text) {
    return String(text || "").split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
}
const maskRe = (m) => new RegExp(`^${m.trim().replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`, "i");
export function groupsTargets(g, ctrl, text) {
    const names = parseGroupNames(text);
    const groups = g.groups || g._groups || [];
    const found = new Set(), nodes = new Map(), hit = [];
    for (const m of names) {
        const re = maskRe(m);
        let any = false;
        for (const gr of groups) {
            if (!re.test(String(gr.title || "").trim())) continue;
            any = true;
            if (found.has(gr)) continue;
            found.add(gr);
            gr.recomputeInsideNodes?.();
            for (const n of gr.nodes ?? gr._nodes ?? []) if (n && !isController(n) && !n.isVirtualNode) nodes.set(n.id, n);
        }
        if (!any) hit.push(m);
    }
    return { nodes: [...nodes.values()], groups: found.size, missing: hit };
}

/* ------------------------------------------------------------------ what a controller wants now */

export const modeOf = (ctrl) => (widgetOf(ctrl, "mode")?.value === "mute" ? NEVER : BYPASS);

// -> {want: Map(id -> {node, mode}), info}.  `info` is for the status line and the outline on the canvas.
export function wantsOf(g, ctrl) {
    const cls = classOf(ctrl), mode = modeOf(ctrl);
    const want = new Map();
    const info = { cls, mode, targets: [], on: true, unreadable: false, inactive: ctrl.mode !== ALWAYS && ctrl.mode != null };
    if (cls === NODES) {
        const list = nodesTargets(g, ctrl);
        info.targets = list.map((t) => t.node);
        info.pins = list.map((t) => ({ pin: t.pin, node: t.node, on: t.on }));
        info.unreadable = list.some((t) => t.unreadable);
        info.on = list.every((t) => t.on);
        if (!info.inactive) for (const t of list) if (!t.on) want.set(t.node.id, { node: t.node, mode });
        return { want, info };
    }
    const b = readBool(g, ctrl, "active");
    info.on = b.value; info.unreadable = b.unreadable;
    let t;
    if (cls === UPSTREAM) {
        t = upstreamTargets(g, ctrl);
        Object.assign(info, { noInput: t.noInput, hasStart: t.hasStart, long: t.long });
    } else {
        t = groupsTargets(g, ctrl, widgetOf(ctrl, "groups")?.value);
        Object.assign(info, { groups: t.groups, missing: t.missing });
    }
    info.targets = t.nodes;
    if (!b.value && !info.inactive) for (const n of t.nodes) want.set(n.id, { node: n, mode });
    return { want, info };
}

// is the logic of this controller switched off now (what ND Bypass Upstream hands on)
export function isOff(g, ctrl) {
    if (ctrl.mode !== ALWAYS && ctrl.mode != null) return false;
    return !readBool(g, ctrl, "active").value;
}

/* ------------------------------------------------------------------ the reconciliation */

const applied = (c) => { const p = (c.properties ||= {}); if (!p.nd_applied || typeof p.nd_applied !== "object") p.nd_applied = {}; return p.nd_applied; };

// Brings the modes of the managed nodes in line with the controllers of one graph.  -> {changed: how many modes were written}
export function reconcile(g) {
    const ctrls = nodesOf(g).filter(isController);
    if (!ctrls.length) return { changed: 0 };
    const wants = new Map(); // controller -> Map(id -> {node, mode})
    const merged = new Map(); // id -> {node, mode}: Mute is stronger than Bypass
    for (const c of ctrls) {
        const { want, info } = wantsOf(g, c);
        c.__ndInfo = info;
        wants.set(c, want);
        for (const [id, w] of want) {
            const cur = merged.get(id);
            if (!cur || w.mode === NEVER) merged.set(id, { node: w.node, mode: cur?.mode === NEVER ? NEVER : w.mode });
        }
    }
    const ownedBy = (id) => ctrls.some((c) => Object.hasOwn(applied(c), id));
    let changed = 0;
    // 1. put what is wanted
    for (const [id, { node, mode }] of merged) {
        if (node.mode === mode) { // already so: ours, or set by hand
            if (ownedBy(id)) for (const c of ctrls) if (wants.get(c).has(id)) applied(c)[id] = mode;
            continue;
        }
        if (node.mode !== ALWAYS && !ownedBy(id)) continue; // set by hand to something else: not ours
        node.mode = mode; changed++;
        for (const c of ctrls) if (wants.get(c).has(id)) applied(c)[id] = mode;
    }
    // 2. give back what is not wanted any more
    for (const c of ctrls) {
        const rec = applied(c);
        for (const id of Object.keys(rec)) {
            if (wants.get(c).has(+id) || wants.get(c).has(id)) continue;
            const set = rec[id];
            delete rec[id];
            if (merged.has(+id) || merged.has(id) || ownedBy(id)) continue;
            const n = g.getNodeById(+id);
            if (n && n.mode === set) { n.mode = ALWAYS; changed++; }
        }
    }
    return { changed };
}

// a controller leaves (deleted): its nodes go back
export function release(g, ctrl) {
    const rec = applied(ctrl);
    const others = nodesOf(g).filter((n) => isController(n) && n !== ctrl);
    let changed = 0;
    for (const id of Object.keys(rec)) {
        const set = rec[id];
        delete rec[id];
        if (others.some((c) => Object.hasOwn(applied(c), id))) continue;
        const n = g.getNodeById(+id);
        if (n && n.mode === set) { n.mode = ALWAYS; changed++; }
    }
    return { changed };
}
