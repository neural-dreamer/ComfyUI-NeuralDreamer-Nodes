// Neural Dreamer Nodes — ND Batch Images
//
// Pins image_1 (required), image_2, ... (optional). A new empty pin appears as soon as the
// last one is connected; when the last pins are disconnected the extra empty ones go. The
// fit mode and the scaling method are the node's widgets (nd_nodes/batch_images.py).
import { app } from "../../scripts/app.js";
import { chain } from "./nd_common.js";
import { nodesOfClass, sourceName, setLabel, fitHeight, clearOnConfigure } from "./nd_wires.js";

const NODE = "NDBatchImages";
const MAX_INPUTS = 32;
const MIN_PINS = 2; // the first pin and a free "+" pin
const PIN = /^image_(\d+)$/;
const HOLLOW_CIRCLE = 7; // LiteGraph RenderShape.HollowCircle, the optional-input look
const DEFAULT_LABEL = /^(image \d+|\+)$/;

const pinNumber = (inp) => Number((PIN.exec(inp.name) || [])[1]) || 0;
const pins = (node) => (node.inputs || []).filter((i) => PIN.test(i.name));

function sync(node) {
    if (node.__ndSyncing) return;
    node.__ndSyncing = true;
    try {
        node.inputs ||= [];
        const used = Math.max(0, ...pins(node).filter((i) => i.link != null).map(pinNumber));
        const count = Math.min(MAX_INPUTS, Math.max(MIN_PINS, used + 1));
        for (let k = 1; k <= count; k++) if (!node.inputs.some((i) => i.name === `image_${k}`)) node.addInput(`image_${k}`, "IMAGE");
        for (let i = node.inputs.length - 1; i >= 0; i--) {
            const inp = node.inputs[i];
            if (PIN.test(inp.name) && pinNumber(inp) > count && inp.link == null) node.removeInput(i);
        }
        for (const inp of pins(node)) {
            const k = pinNumber(inp);
            const name = sourceName(node, inp);
            let text;
            if (inp.link != null) text = name ? `${k}: ${name}` : `image ${k}`;
            else text = k === count && k > 1 ? "+" : `image ${k}`;
            setLabel(node, inp, text, DEFAULT_LABEL);
            // the first pin is the required one (filled), the others are optional (hollow)
            if (k === 1) delete inp.shape;
            else inp.shape = HOLLOW_CIRCLE;
        }
        fitHeight(node);
    } catch (e) {
        console.warn("[Neural Dreamer] Batch Images refresh failed", e);
    } finally {
        node.__ndSyncing = false;
    }
}

// Pin changes are applied after the current call (adding a pin inside the connect call breaks
// the link being made); not while a workflow loads (the saved pins come back as they were).
let loading = false;
function refresh(node) {
    if (loading || node.__ndPending) return;
    node.__ndPending = true;
    setTimeout(() => {
        node.__ndPending = false;
        if (!loading) sync(node);
    }, 0);
}

app.registerExtension({
    name: "NeuralDreamer.Nodes.BatchImages",

    beforeConfigureGraph() {
        loading = true;
        setTimeout(() => { loading = false; }, 5000); // safety net if loading fails midway
    },

    afterConfigureGraph() {
        setTimeout(() => {
            loading = false;
            for (const n of nodesOfClass(NODE)) sync(n);
            app.graph?.setDirtyCanvas?.(true, true);
        }, 0);
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE) return;
        const proto = nodeType.prototype;
        chain(proto, "onNodeCreated", function () {
            // the definition declares the whole pool; show only the first two pins
            for (let i = (this.inputs?.length ?? 0) - 1; i >= 0; i--) {
                if (PIN.test(this.inputs[i].name) && pinNumber(this.inputs[i]) > MIN_PINS) this.removeInput(i);
            }
            sync(this);
            const sz = this.computeSize?.();
            if (sz) this.setSize([Math.max(sz[0], 220), sz[1]]);
            this.__ndAutoH = sz?.[1] ?? null;
        });
        clearOnConfigure(proto, (i) => PIN.test(i.name), null);
        chain(proto, "onConfigure", function () { refresh(this); });
        chain(proto, "onConnectionsChange", function () { refresh(this); });
    },
});
