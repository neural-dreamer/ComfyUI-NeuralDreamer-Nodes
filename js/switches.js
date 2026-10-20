// Neural Dreamer Nodes — ND Any Switch and ND ON / OFF
//
// ND Any Switch: inputs in_1, in_2, ... of any type, one output of any type; the index picks
// the input that is passed on. A new pin appears as soon as the last one is connected.
// ND ON / OFF: passes one value through, or drops it.
//
// Both nodes are resolved in the prompt this page sends (see resolveSwitches): the switch is
// removed from the prompt and the nodes after it are wired straight to the picked source —
// or, when nothing passes, lose that wire altogether. So only the picked branch runs, and an
// optional input after a dropped value is simply "not connected", not a None. When the
// index / toggle comes from a computed value the node stays in the prompt and the server
// side (nd_nodes/switches.py) does the same job, passing None for "nothing".
import { app } from "../../scripts/app.js";
import { chain } from "./nd_common.js";
import {
    isReal, nodesOfClass, sourceType, sourceName, targetType, targetName, dropIncompatible,
    setLabel, fitHeight, clearOnConfigure,
} from "./nd_wires.js";

const ANY_SWITCH = "NDAnySwitch";
const ON_OFF = "NDOnOff";
const MAX_INPUTS = 64;
const MIN_PINS = 2; // the first pin and a free "+" pin
const IN = /^in_(\d+)$/;
const HOLLOW_CIRCLE = 7; // LiteGraph RenderShape.HollowCircle, the optional-input look
const ANY_DEFAULT_LABEL = /^(in \d+|\+)$/;

/* ------------------------------------------------------------------ prompt */

const isWire = (v) => Array.isArray(v) && v.length === 2 && (typeof v[0] === "string" || typeof v[0] === "number") && typeof v[1] === "number";

// Values of Primitive nodes count as literals: a toggle fed by one still resolves here.
const PRIMITIVES = new Set(["PrimitiveBoolean", "PrimitiveInt", "PrimitiveFloat"]);

function literalOf(output, v) {
    if (!isWire(v)) return { known: true, value: v };
    const src = output[String(v[0])];
    if (src && PRIMITIVES.has(src.class_type) && "value" in (src.inputs || {}) && !isWire(src.inputs.value)) {
        return { known: true, value: src.inputs.value };
    }
    return { known: false };
}

// Removes the switches whose control is known from the prompt (in place) and rewires the nodes
// they fed. `output` is the API prompt: {id: {class_type, inputs}}.
export function resolveSwitches(output) {
    if (!output || typeof output !== "object") return output;
    const gone = new Map(); // switch id -> the wire that replaces it, or null (nothing passes)
    for (const [id, node] of Object.entries(output)) {
        const inputs = node?.inputs || {};
        if (node?.class_type === ON_OFF) {
            const c = literalOf(output, inputs.condition);
            if (!c.known) continue;
            const off = c.value === false || c.value === "false" || c.value === 0;
            gone.set(String(id), off || !isWire(inputs.value) ? null : inputs.value);
        } else if (node?.class_type === ANY_SWITCH) {
            const c = literalOf(output, inputs.index);
            if (!c.known) continue;
            const wire = inputs[`in_${Math.trunc(Number(c.value))}`];
            gone.set(String(id), isWire(wire) ? wire : null);
        }
    }
    if (!gone.size) return output;
    // a replacement can itself be another removed switch: follow the chain
    const follow = (wire) => {
        let w = wire, guard = 0;
        while (w && gone.has(String(w[0])) && guard++ < 1000) w = gone.get(String(w[0]));
        return w;
    };
    for (const id of gone.keys()) delete output[id];
    for (const node of Object.values(output)) {
        for (const [key, v] of Object.entries(node?.inputs || {})) {
            if (!isWire(v) || !gone.has(String(v[0]))) continue;
            const w = follow(v);
            if (w) node.inputs[key] = [w[0], w[1]];
            else delete node.inputs[key];
        }
    }
    return output;
}

function installPromptHook() {
    if (app.__ndSwitchHook) return;
    const orig = app.graphToPrompt;
    if (typeof orig !== "function") return;
    app.__ndSwitchHook = true;
    app.graphToPrompt = async function (...args) {
        const p = await orig.apply(this, args);
        try {
            resolveSwitches(p?.output);
        } catch (e) {
            console.warn("[Neural Dreamer] switch resolve failed", e);
        }
        return p;
    };
}

/* --------------------------------------------------------------- Any Switch */

const pinNumber = (inp) => Number((IN.exec(inp.name) || [])[1]) || 0;
const anyPins = (node) => (node.inputs || []).filter((i) => IN.test(i.name));

function syncAny(node) {
    if (node.__ndSyncing) return;
    node.__ndSyncing = true;
    try {
        node.inputs ||= [];
        const used = Math.max(0, ...anyPins(node).filter((i) => i.link != null).map(pinNumber));
        const count = Math.min(MAX_INPUTS, Math.max(MIN_PINS, used + 1));
        for (let k = 1; k <= count; k++) if (!node.inputs.some((i) => i.name === `in_${k}`)) node.addInput(`in_${k}`, "*");
        for (let i = node.inputs.length - 1; i >= 0; i--) {
            const inp = node.inputs[i];
            if (IN.test(inp.name) && pinNumber(inp) > count && inp.link == null) node.removeInput(i);
        }
        for (const inp of anyPins(node)) {
            const k = pinNumber(inp);
            const name = sourceName(node, inp);
            let text;
            if (inp.link != null) text = name ? `${k}: ${name}` : `in ${k}`;
            else text = k === count ? "+" : `in ${k}`;
            setLabel(node, inp, text, ANY_DEFAULT_LABEL);
            // the first pin is the required one (filled), the others are optional (hollow)
            if (k === 1) delete inp.shape;
            else inp.shape = HOLLOW_CIRCLE;
        }
        fitHeight(node);
    } catch (e) {
        console.warn("[Neural Dreamer] Any Switch refresh failed", e);
    } finally {
        node.__ndSyncing = false;
    }
}

// A soft highlight behind the pin the index points at.
function drawPicked(node, ctx) {
    if (!node.getInputPos || !node.pos || node.flags?.collapsed) return;
    const w = node.widgets?.find((x) => x.name === "index");
    const k = Math.trunc(Number(w?.value));
    const i = (node.inputs || []).findIndex((x) => x.name === `in_${k}`);
    if (i < 0) return;
    const p = node.getInputPos(i);
    if (!p) return;
    const width = node.size?.[0] ?? 200;
    ctx.save();
    ctx.fillStyle = "rgba(47,125,225,.2)";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(2, p[1] - node.pos[1] - 9, width - 4, 18, 4);
    else ctx.rect(2, p[1] - node.pos[1] - 9, width - 4, 18);
    ctx.fill();
    ctx.restore();
}

/* ------------------------------------------------------------------- ON/OFF */

function syncOnOff(node) {
    if (node.__ndSyncing) return;
    node.__ndSyncing = true;
    try {
        const inp = (node.inputs || []).find((i) => i.name === "value");
        const out = node.outputs?.[0];
        if (!inp || !out) return;
        // the first wire, on either side, gives the type and the name
        let type = sourceType(node, inp) || targetType(node, out);
        if (!type) type = out.links?.length && isReal(out.type) ? out.type : "*";
        inp.type = out.type = type;
        dropIncompatible(node, out, type);
        const name = sourceName(node, inp) || targetName(node, out);
        setLabel(node, inp, name || "value", /^value$/);
        setLabel(node, out, name || "out", /^out$/);
        node.setDirtyCanvas?.(true, true);
    } catch (e) {
        console.warn("[Neural Dreamer] ON / OFF refresh failed", e);
    } finally {
        node.__ndSyncing = false;
    }
}

/* ----------------------------------------------------------------- refresh */

let loading = false;
function refresh(node, sync) {
    if (loading || node.__ndPending) return;
    node.__ndPending = true;
    setTimeout(() => {
        node.__ndPending = false;
        if (!loading) sync(node);
    }, 0);
}

app.registerExtension({
    name: "NeuralDreamer.Nodes.Switches",

    setup() {
        installPromptHook();
    },

    beforeConfigureGraph() {
        loading = true;
        setTimeout(() => { loading = false; }, 5000); // safety net if loading fails midway
    },

    afterConfigureGraph() {
        setTimeout(() => {
            loading = false;
            for (const n of nodesOfClass(ANY_SWITCH)) syncAny(n);
            for (const n of nodesOfClass(ON_OFF)) syncOnOff(n);
            app.graph?.setDirtyCanvas?.(true, true);
        }, 0);
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        const proto = nodeType.prototype;

        if (nodeData.name === ANY_SWITCH) {
            chain(proto, "onNodeCreated", function () {
                // the definition declares the whole pool; show only the first two pins
                for (let i = (this.inputs?.length ?? 0) - 1; i >= 0; i--) {
                    if (IN.test(this.inputs[i].name) && pinNumber(this.inputs[i]) > MIN_PINS) this.removeInput(i);
                }
                syncAny(this);
                const sz = this.computeSize?.();
                if (sz) this.setSize([Math.max(sz[0], 200), sz[1]]);
                this.__ndAutoH = sz?.[1] ?? null;
            });
            clearOnConfigure(proto, (i) => IN.test(i.name), null);
            chain(proto, "onConfigure", function () { refresh(this, syncAny); });
            chain(proto, "onConnectionsChange", function () { refresh(this, syncAny); });
            chain(proto, "onDrawForeground", function (ctx) {
                try { drawPicked(this, ctx); } catch {}
            });
        }

        if (nodeData.name === ON_OFF) {
            chain(proto, "onNodeCreated", function () {
                syncOnOff(this);
                const sz = this.computeSize?.();
                if (sz) this.setSize([Math.max(sz[0], 200), sz[1]]);
            });
            chain(proto, "onConfigure", function () { refresh(this, syncOnOff); });
            chain(proto, "onConnectionsChange", function () { refresh(this, syncOnOff); });
        }
    },
});
