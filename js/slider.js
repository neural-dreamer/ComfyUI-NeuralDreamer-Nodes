// Neural Dreamer Nodes — ND Slider
// A slider across the whole node, vertically centred: the settings gear on the
// left, the output pin on the right. The output is INT or FLOAT depending on the
// settings. Value and range live in the hidden "state" widget (JSON).

import { app } from "../../scripts/app.js";
import { el, dirty, hideWidget, chain, bindCanvasNavigation, injectStyleOnce, blankSlots, rangeThumbCss, setRangeFill } from "./nd_common.js";

const NODE = "NDValueSlider";
const DEFAULTS = { value: 0.5, min: 0, max: 1, step: 0.01, integer: false };
const MARGIN = 3; // DOM widget inset inside the node body
const HEIGHT = 26; // default body height: one row, like the stock widgets

const GEAR_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';

/* -------------------------------------------------------------------- state */

const finite = (v, d) => (Number.isFinite(Number(v)) && v !== "" && v !== null ? Number(v) : d);

function decimalsOf(step) {
    const s = String(step);
    if (s.includes("e-")) return Number(s.split("e-")[1]) || 0;
    return s.includes(".") ? s.split(".")[1].length : 0;
}

// Same rules as parse_state() in nd_nodes/slider.py.
function normalize(raw) {
    let s;
    try { s = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { s = null; }
    s = { ...DEFAULTS, ...(s && typeof s === "object" ? s : {}) };
    const integer = !!s.integer;
    let min = finite(s.min, DEFAULTS.min), max = finite(s.max, DEFAULTS.max), step = finite(s.step, 0);
    if (max < min) [min, max] = [max, min];
    if (integer) {
        min = Math.round(min);
        max = Math.round(max);
        step = Math.max(1, Math.round(step));
    } else if (!(step > 0)) {
        step = 0.01;
    }
    return { integer, min, max, step, value: snap(finite(s.value, min), { integer, min, max, step }) };
}

function snap(v, { integer, min, max, step }) {
    let x = Number(v);
    if (!Number.isFinite(x)) x = min;
    if (step > 0) x = min + Math.round((x - min) / step) * step;
    x = Math.min(max, Math.max(min, x));
    if (integer) return Math.round(x);
    return Number(x.toFixed(Math.min(10, Math.max(decimalsOf(step), decimalsOf(min)) + 2)));
}

const fmt = (v, s) => (s.integer ? String(Math.round(v)) : Number(v).toFixed(Math.max(decimalsOf(s.step), 0)));

/* --------------------------------------------------------------- settings */

function stopKeys(elm) {
    for (const t of ["keydown", "keyup", "keypress"]) elm.addEventListener(t, (e) => e.stopPropagation());
}

function openSettings(st, onApply) {
    const back = el("div", "nd-sl-back");
    const box = el("div", "nd-sl-modal");
    const head = el("div", "nd-sl-mhead");
    const x = el("button", "nd-sl-x", "×");
    x.type = "button";
    head.append(el("span", null, "Slider settings"), x);

    const type = el("div", "nd-sl-seg");
    const tInt = el("button", null, "Integer"), tFloat = el("button", null, "Float");
    tInt.type = tFloat.type = "button";
    type.append(tInt, tFloat);
    let integer = st.integer;
    const num = (label, value) => {
        const wrap = el("label", "nd-sl-field");
        const input = el("input");
        input.type = "number";
        input.step = "any";
        input.value = value;
        wrap.append(el("span", null, label), input);
        return { wrap, input };
    };
    const fMin = num("Min", st.min), fMax = num("Max", st.max), fStep = num("Step", st.step);
    const grid = el("div", "nd-sl-grid");
    grid.append(fMin.wrap, fMax.wrap, fStep.wrap);
    const note = el("small", "nd-sl-note");
    const syncType = () => {
        tInt.classList.toggle("on", integer);
        tFloat.classList.toggle("on", !integer);
        for (const f of [fMin, fMax, fStep]) f.input.step = integer ? "1" : "any";
        note.textContent = integer ? "Output: INT. Values are rounded to whole numbers; the step is at least 1." : "Output: FLOAT.";
    };
    tInt.onclick = () => { integer = true; syncType(); };
    tFloat.onclick = () => { integer = false; syncType(); };
    syncType();

    const typeRow = el("div", "nd-sl-field");
    typeRow.append(el("span", null, "Type"), type);
    const content = el("div", "nd-sl-content");
    content.append(typeRow, grid, note);

    const foot = el("div", "nd-sl-foot");
    const cancel = el("button", "nd-sl-btn", "Cancel");
    const ok = el("button", "nd-sl-btn primary", "Apply");
    cancel.type = ok.type = "button";
    foot.append(cancel, ok);
    box.append(head, content, foot);
    back.append(box);

    const close = () => { back.remove(); document.removeEventListener("keydown", onKey, true); };
    const apply = () => {
        onApply({ integer, min: fMin.input.value, max: fMax.input.value, step: fStep.input.value });
        close();
    };
    const onKey = (e) => {
        if (e.key === "Escape") { e.preventDefault(); close(); }
        else if (e.key === "Enter") { e.preventDefault(); apply(); }
    };
    x.onclick = cancel.onclick = close;
    ok.onclick = apply;
    back.addEventListener("pointerdown", (e) => { if (e.target === back) close(); });
    document.addEventListener("keydown", onKey, true);
    stopKeys(back);
    document.body.append(back);
    fMin.input.focus();
}

/* --------------------------------------------------------------------- node */

function setupSlider(node) {
    const wState = hideWidget(node, "state");
    let st = normalize(wState?.value);

    const root = el("div", "nd-sl-root");
    const gear = el("button", "nd-sl-gear");
    gear.type = "button";
    gear.title = "Slider settings";
    gear.innerHTML = GEAR_SVG;
    const track = el("div", "nd-sl-track");
    const range = el("input", "nd-sl-range");
    range.type = "range";
    const val = el("input", "nd-sl-value");
    val.type = "text";
    val.inputMode = "decimal";
    val.title = "Click to type a value";
    track.append(range);
    root.append(gear, track, val, el("span", "nd-sl-pinroom"));

    function save() {
        if (wState) wState.value = JSON.stringify(st);
        app.graph?.change?.();
        dirty();
    }
    function show() {
        range.min = st.min;
        range.max = st.max;
        range.step = st.step;
        range.value = st.value;
        setRangeFill(range);
        if (document.activeElement !== val) val.value = fmt(st.value, st);
        // wide enough for the longest value of the range, so the track does not jump
        const chars = Math.max(fmt(st.min, st).length, fmt(st.max, st).length, 2);
        val.style.width = `calc(${chars}ch + 8px)`;
    }
    function setValue(v, commit = true) {
        st.value = snap(v, st);
        show();
        if (commit) save();
        else dirty();
    }

    range.addEventListener("input", () => setValue(range.value, false));
    range.addEventListener("change", () => save());
    val.addEventListener("change", () => setValue(val.value));
    val.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") val.blur();
        if (e.key === "Escape") { val.value = fmt(st.value, st); val.blur(); }
    });
    val.addEventListener("blur", () => { val.value = fmt(st.value, st); });
    val.addEventListener("focus", () => val.select());
    range.addEventListener("keydown", (e) => e.stopPropagation());

    gear.onclick = () => openSettings(st, (s) => {
        const before = st.integer;
        st = normalize({ ...st, ...s });
        show();
        if (st.integer !== before) setOutputType(node, st.integer);
        save();
    });

    bindCanvasNavigation(root, node);
    node.addDOMWidget("nd_slider", "ND_SLIDER", root, {
        serialize: false,
        hideOnZoom: false,
        margin: MARGIN,
        getMinHeight: () => HEIGHT - 12, // computeSize adds 12 (row gap + bottom padding)
    });

    node.ndSlider = {
        restore() {
            st = normalize(wState?.value);
            setOutputType(node, st.integer);
            show();
        },
    };
    setOutputType(node, st.integer);
    show();
}

// The server returns INT or FLOAT through a "*" output; the browser shows the real
// type so only matching inputs accept the wire. Links that no longer fit are removed.
function setOutputType(node, integer) {
    const out = node.outputs?.[0];
    if (!out) return;
    const type = integer ? "INT" : "FLOAT";
    if (out.type === type) return;
    out.type = type;
    const graph = node.graph;
    for (const id of [...(out.links || [])]) {
        const link = graph?.links?.get ? graph.links.get(id) : graph?.links?.[id];
        if (!link) continue;
        link.type = type;
        const target = graph.getNodeById(link.target_id);
        const input = target?.inputs?.[link.target_slot];
        const LG = window.LiteGraph;
        if (input && LG?.isValidConnection && !LG.isValidConnection(type, input.type)) target.disconnectInput(link.target_slot);
    }
    dirty();
}

// Output pin on the right edge, level with the slider (the vertical centre of the body).
function placePin(node) {
    const out = node.outputs?.[0];
    if (!out || !node.size) return;
    const half = (window.LiteGraph?.NODE_SLOT_HEIGHT ?? 20) * 0.5;
    const x = node.size[0] + 1 - half, y = node.size[1] / 2;
    if (!out.pos || out.pos[0] !== x || out.pos[1] !== y) out.pos = [x, y];
}

// The DOM widget covers the whole body, including the output pin on the right, and
// would take the pointer from the canvas. Only the controls take pointer events;
// everything else (the pin, the gaps) goes through to the canvas.
const STYLE = `
.dom-widget:has(> .nd-sl-root){pointer-events:none!important}
.nd-sl-root{pointer-events:none}
.nd-sl-gear,.nd-sl-track,.nd-sl-value{pointer-events:auto}
.nd-sl-root{--nd-accent:#2f7de1;display:grid;grid-template-columns:18px minmax(0,1fr) auto 18px;align-items:center;gap:8px;width:100%;height:100%;box-sizing:border-box;padding:0;font-family:Inter,Arial,sans-serif;color:var(--input-text,#ddd);user-select:none}
.nd-sl-gear{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;box-sizing:border-box;padding:0;margin:0;border:1px solid var(--border-color,#444);border-radius:4px;background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);cursor:pointer;line-height:0}
.nd-sl-gear:hover{border-color:var(--nd-accent);color:var(--nd-accent)}
.nd-sl-gear svg{pointer-events:none}
.nd-sl-track{height:18px;display:flex;align-items:center;min-width:0}
.nd-sl-range{-webkit-appearance:none;appearance:none;width:100%;height:18px;margin:0;background:transparent;cursor:pointer;--p:50%}
.nd-sl-range::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:linear-gradient(to right,var(--nd-accent) 0 var(--p),var(--border-color,#444) var(--p) 100%)}
.nd-sl-range::-moz-range-track{height:4px;border-radius:2px;background:var(--border-color,#444)}
.nd-sl-range::-moz-range-progress{height:4px;border-radius:2px;background:var(--nd-accent)}
${rangeThumbCss(".nd-sl-range", 4)}
.nd-sl-value{box-sizing:border-box;height:18px;margin:0;padding:0 3px;border:1px solid transparent;border-radius:3px;background:transparent;color:var(--input-text,#ddd);font:600 12px/16px Inter,Arial,sans-serif;font-variant-numeric:tabular-nums;text-align:right;cursor:text}
.nd-sl-value:hover{border-color:var(--border-color,#444)}
.nd-sl-value:focus{outline:none;border-color:var(--nd-accent);background:var(--comfy-input-bg,#222)}
.nd-sl-back{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.45);--nd-accent:#2f7de1}
.nd-sl-modal{width:min(340px,94vw);background:var(--comfy-menu-bg,#1f1f1f);color:var(--input-text,#ddd);border:1px solid var(--border-color,#444);border-radius:8px;box-shadow:0 12px 40px rgba(0,0,0,.5);font:13px Inter,Arial,sans-serif}
.nd-sl-mhead{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--border-color,#444);font-weight:600}
.nd-sl-x{border:0;background:none;color:inherit;font-size:18px;line-height:1;cursor:pointer;opacity:.7;padding:0 2px}
.nd-sl-x:hover{opacity:1}
.nd-sl-content{display:flex;flex-direction:column;gap:12px;padding:12px}
.nd-sl-field{display:flex;flex-direction:column;gap:4px;min-width:0;font-size:12px}
.nd-sl-field>span{opacity:.75}
.nd-sl-field input{width:100%;min-width:0;height:28px;box-sizing:border-box;padding:0 8px;border:1px solid var(--border-color,#444);border-radius:5px;background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);font-size:13px}
.nd-sl-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.nd-sl-seg{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--border-color,#444);border-radius:5px;overflow:hidden}
.nd-sl-seg button{height:28px;border:0;background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);font-size:13px;cursor:pointer}
.nd-sl-seg button+button{border-left:1px solid var(--border-color,#444)}
.nd-sl-seg button.on{background:var(--nd-accent);color:#fff}
.nd-sl-note{opacity:.5;font-size:11px;line-height:1.35}
.nd-sl-foot{display:flex;justify-content:flex-end;gap:8px;padding:10px 12px;border-top:1px solid var(--border-color,#444)}
.nd-sl-btn{height:28px;padding:0 14px;border:1px solid var(--border-color,#444);border-radius:5px;background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);cursor:pointer;font-size:13px}
.nd-sl-btn.primary{background:var(--nd-accent);border-color:var(--nd-accent);color:#fff}
`;

app.registerExtension({
    name: "NeuralDreamer.Nodes.Slider",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE) return;
        const proto = nodeType.prototype;
        const blank = (n) => blankSlots(n, [], [0]);
        chain(proto, "onNodeCreated", function () {
            injectStyleOnce("nd-sl-style", STYLE);
            this.widgets_start_y = 0; // the slider uses the whole body; the pin is placed by hand
            setupSlider(this);
            blank(this);
            this.setSize([Math.max(this.size[0], 260), HEIGHT]);
            placePin(this);
        });
        chain(proto, "onConfigure", function () {
            this.widgets_start_y = 0;
            blank(this);
            this.ndSlider?.restore?.();
            setTimeout(() => { this.ndSlider?.restore?.(); placePin(this); }, 0);
            placePin(this);
        });
        chain(proto, "onResize", function () {
            placePin(this);
        });
        chain(proto, "onDrawForeground", function () {
            placePin(this); // cheap; also covers size changes made without onResize
        });
    },
});
