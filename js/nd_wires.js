// Neural Dreamer Nodes — helpers for nodes with dynamic pins whose type and name
// follow what is wired to them. Imported by the node scripts; registers nothing.
import { app } from "../../scripts/app.js";

export const classOf = (n) => n?.comfyClass || n?.type;
export const isReal = (t) => typeof t === "string" && t !== "" && t !== "*";

export function getLink(graph, id) {
    if (id == null || !graph) return null;
    return graph.getLink?.(id) ?? graph.links?.get?.(id) ?? graph.links?.[id] ?? graph._links?.get?.(id) ?? null;
}

// every node of the given class, in the main graph and in subgraphs
export function nodesOfClass(cls) {
    const out = [];
    const root = app.graph;
    if (!root) return out;
    const graphs = [root];
    const subs = root.subgraphs ?? root._subgraphs;
    if (subs?.values) graphs.push(...subs.values());
    for (const g of graphs) for (const n of g._nodes ?? g.nodes ?? []) if (classOf(n) === cls) out.push(n);
    return out;
}

// Two types are compatible if either is "*" or they share a name (types can be "A,B" lists).
export function compatible(a, b) {
    if (!isReal(a) || !isReal(b)) return true;
    const A = a.toLowerCase().split(",");
    return b.toLowerCase().split(",").some((x) => A.includes(x));
}

const firstName = (slot) => {
    for (const c of [slot?.label, slot?.localized_name, slot?.name]) {
        const t = String(c ?? "").trim();
        if (t && t !== "*") return t;
    }
    return "";
};

// The output that feeds input `inp`.
function originOutput(node, inp) {
    if (!inp || inp.link == null) return null;
    const link = getLink(node.graph, inp.link);
    if (!link) return null;
    return { link, out: node.graph?.getNodeById?.(link.origin_id)?.outputs?.[link.origin_slot] ?? null };
}

// Data type of what feeds `inp`, or null when unknown / still "*".
export function sourceType(node, inp) {
    const o = originOutput(node, inp);
    if (!o) return null;
    if (isReal(o.out?.type)) return o.out.type;
    return isReal(o.link.type) ? o.link.type : null;
}

// Name of the pin that feeds `inp` ("" when it has none).
export function sourceName(node, inp) {
    const o = originOutput(node, inp);
    return o?.out ? firstName(o.out) : "";
}

// The inputs the output `out` is wired to.
export function targetInputs(node, out) {
    const res = [];
    for (const lid of out?.links || []) {
        const link = getLink(node.graph, lid);
        const tin = link ? node.graph?.getNodeById?.(link.target_id)?.inputs?.[link.target_slot] : null;
        if (tin) res.push(tin);
    }
    return res;
}
export const targetType = (node, out) => targetInputs(node, out).map((i) => i.type).find(isReal) || null;
export const targetName = (node, out) => targetInputs(node, out).map(firstName).find(Boolean) || "";

// Wires on `out` that do not fit `type` are removed.
export function dropIncompatible(node, out, type) {
    if (!isReal(type)) return;
    for (const lid of [...(out.links || [])]) {
        const link = getLink(node.graph, lid);
        const target = link ? node.graph.getNodeById?.(link.target_id) : null;
        const tin = target?.inputs?.[link.target_slot];
        if (tin && !compatible(type, tin.type)) target.disconnectInput?.(link.target_slot);
    }
}

// A label we set ourselves is replaced freely; one the user typed (Rename Slot) is kept.
export function setLabel(node, slot, text, defaults) {
    const autos = ((node.properties ||= {}).nd_auto ||= {});
    if (!slot.label || defaults?.test(slot.label) || slot.label === autos[slot.name]) {
        slot.label = text;
        slot.localized_name = text;
        autos[slot.name] = text;
    }
}

// Grow the node when it is smaller than its content, and follow the content while the node
// has its automatic height (a height the user set is kept).
export function fitHeight(node) {
    const min = node.computeSize?.();
    if (min && node.size) {
        const auto = node.__ndAutoH;
        if (node.size[1] < min[1] || (auto != null && Math.abs(node.size[1] - auto) < 3)) {
            node.setSize([Math.max(node.size[0], min[0]), min[1]]);
        }
        node.__ndAutoH = min[1];
    }
    node.setDirtyCanvas?.(true, true);
}

// ComfyUI's configure() keeps the sockets the node already has and lays the saved ones over
// them by position: clear ours first so the saved ones come back exactly as they were.
export function clearOnConfigure(proto, isOurInput, isOurOutput) {
    const configure = proto.configure;
    proto.configure = function (data) {
        if (isOurInput && Array.isArray(data?.inputs) && this.inputs) {
            for (let i = this.inputs.length - 1; i >= 0; i--) if (isOurInput(this.inputs[i])) this.inputs.splice(i, 1);
        }
        if (isOurOutput && Array.isArray(data?.outputs) && this.outputs) {
            for (let i = this.outputs.length - 1; i >= 0; i--) if (isOurOutput(this.outputs[i])) this.outputs.splice(i, 1);
        }
        return configure.call(this, data);
    };
}
