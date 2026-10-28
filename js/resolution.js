// Neural Dreamer Nodes — ND Resolution
//
// An aspect ratio (a preset or a typed one like 21:9) and one number. What the number means
// — megapixels, long side or short side — is set in the gear, together with the multiple both
// sides are rounded to: the method is chosen once per workflow, the ratio changes often, so
// only the ratio and the number are on the node. Everything lives in the hidden "state"
// widget (JSON); the size is computed here for the display and on the server for the output
// (nd_nodes/resolution.py: the same rules).
import { app } from "../../scripts/app.js";
import { el, dirty, hideWidget, chain, bindCanvasNavigation, injectStyleOnce, blankSlots, ND_REG } from "./nd_common.js";

const NODE = "NDResolution";
const PRESETS = ["1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "21:9", "9:21"];
// the presets by orientation, in the order the list shows them
const PRESET_GROUPS = [
    ["Square", ["1:1"]],
    ["Landscape", ["4:3", "3:2", "16:9", "21:9"]],
    ["Portrait", ["3:4", "2:3", "9:16", "9:21"]],
];
const CUSTOM = "custom";
const METHODS = ["megapixels", "long side", "short side"];
const MULTIPLES = [8, 16, 32, 64];
const MP_PIXELS = 1024 * 1024; // 1 megapixel = 1024 x 1024, as in ComfyUI's "Scale Image to Total Pixels"
const MP_RANGE = [0.01, 64];
const SIDE_RANGE = [16, 16384];
const DEFAULTS = { version: 1, ratio: "1:1", custom: "21:9", method: "megapixels", mp: 1.0, long: 1024, short: 1024, multiple: 16, show_custom: false };
const METHOD_LABEL = { "megapixels": "Megapixels", "long side": "Long side, px", "short side": "Short side, px" };

const GEAR_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';

/* ------------------------------------------------------------------- maths */
// The same rules as nd_nodes/resolution.py.

const finite = (v, d) => (v !== "" && v !== null && Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

export function parseRatio(text) {
    const t = String(text ?? "").trim().toLowerCase().replace(",", ".");
    const m = /^(\d+(?:\.\d+)?)\s*[:/x×]\s*(\d+(?:\.\d+)?)$/.exec(t);
    let a, b;
    if (m) { a = Number(m[1]); b = Number(m[2]); }
    else if (/^\d+(\.\d+)?$|^\.\d+$/.test(t)) { a = Number(t); b = 1; }
    else return null;
    return Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0 ? [a, b] : null;
}

export function normalize(raw) {
    let s;
    try { s = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { s = null; }
    s = { ...DEFAULTS, ...(s && typeof s === "object" ? s : {}) };
    if (s.ratio !== CUSTOM && !PRESETS.includes(s.ratio)) s.ratio = DEFAULTS.ratio;
    s.custom = String(s.custom ?? "");
    if (!METHODS.includes(s.method)) s.method = DEFAULTS.method;
    s.mp = clamp(finite(s.mp, DEFAULTS.mp), MP_RANGE);
    s.long = Math.round(clamp(finite(s.long, DEFAULTS.long), SIDE_RANGE));
    s.short = Math.round(clamp(finite(s.short, DEFAULTS.short), SIDE_RANGE));
    s.multiple = MULTIPLES.includes(Number(s.multiple)) ? Number(s.multiple) : DEFAULTS.multiple;
    s.show_custom = s.show_custom === true;
    return s;
}

export const ratioOf = (s) => parseRatio(s.ratio === CUSTOM ? s.custom : s.ratio);

// [width, height], or null when the typed ratio cannot be read
export function computeSize(s) {
    const ab = ratioOf(s);
    if (!ab) return null;
    const r = ab[0] / ab[1];
    let w, h;
    if (s.method === "megapixels") { h = Math.sqrt((s.mp * MP_PIXELS) / r); w = h * r; }
    else if (s.method === "long side") { const n = s.long; [w, h] = r >= 1 ? [n, n / r] : [n * r, n]; }
    else { const n = s.short; [w, h] = r >= 1 ? [n * r, n] : [n, n / r]; }
    const m = s.multiple;
    const q = (v) => Math.max(m, Math.floor(v / m + 0.5) * m);
    return [q(w), q(h)];
}

/* ---------------------------------------------------------- the parameters wire */

ND_REG.providers.set(NODE, (node, slot) => (slot === 0 ? [{ name: "width", type: "INT" }, { name: "height", type: "INT" }] : null));

/* ---------------------------------------------------------------- settings */

function stopKeys(elm) {
    for (const t of ["keydown", "keyup", "keypress"]) elm.addEventListener(t, (e) => e.stopPropagation());
}

function openSettings(st, onApply) {
    const back = el("div", "nd-rs-back");
    const box = el("div", "nd-rs-modal");
    const head = el("div", "nd-rs-mhead");
    const x = el("button", "nd-rs-x", "×");
    x.type = "button";
    head.append(el("span", null, "Resolution settings"), x);

    let method = st.method;
    const seg = el("div", "nd-rs-seg");
    const segBtns = METHODS.map((m) => {
        const b = el("button", null, m === "megapixels" ? "Megapixels" : m === "long side" ? "Long side" : "Short side");
        b.type = "button";
        b.onclick = () => { method = m; sync(); };
        seg.append(b);
        return [m, b];
    });
    const note = el("small", "nd-rs-note");
    const NOTES = {
        "megapixels": "The number is the total size of the image in megapixels (1 = 1024 × 1024 pixels).",
        "long side": "The number is the length of the longer side, in pixels. The other side follows the ratio.",
        "short side": "The number is the length of the shorter side, in pixels. The other side follows the ratio.",
    };
    const sync = () => {
        for (const [m, b] of segBtns) b.classList.toggle("on", m === method);
        note.textContent = NOTES[method];
    };
    sync();

    const mulSel = el("select", "nd-rs-select");
    for (const m of MULTIPLES) { const o = el("option", null, String(m)); o.value = String(m); mulSel.append(o); }
    mulSel.value = String(st.multiple);

    const row = (label, input, hint) => {
        const f = el("label", "nd-rs-field");
        f.append(el("span", null, label), input);
        if (hint) f.append(el("small", "nd-rs-note", hint));
        return f;
    };
    const mr = el("div", "nd-rs-field");
    mr.append(el("span", null, "The number sets"), seg, note);
    const content = el("div", "nd-rs-content");
    content.append(mr, row("Round both sides to a multiple of", mulSel, "Most models need 8, many need 16 or 64."));

    const cb = el("input");
    cb.type = "checkbox";
    cb.checked = !!st.show_custom;
    const cbRow = el("label", "nd-rs-check");
    cbRow.append(cb, el("span", null, "Show Custom Ratio always"));
    const cbNote = el("small", "nd-rs-note", "Keeps the Custom Ratio field visible when a preset is chosen. Typing or stepping it switches Aspect Ratio to Custom.");
    content.append(cbRow, cbNote);

    const foot = el("div", "nd-rs-foot");
    const cancel = el("button", "nd-rs-btn", "Cancel");
    const ok = el("button", "nd-rs-btn primary", "Apply");
    cancel.type = ok.type = "button";
    foot.append(cancel, ok);
    box.append(head, content, foot);
    back.append(box);

    const close = () => { back.remove(); document.removeEventListener("keydown", onKey, true); };
    const apply = () => { onApply({ method, multiple: Number(mulSel.value), show_custom: cb.checked }); close(); };
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
}

/* ---------------------------------------------------------------- steppers */
// A field with an arrow at each end, like the stock widgets: click for one step, hold to
// repeat. step(dir, shiftKey) does the step; the node dims an arrow at the end of a range.

const ARROW = {
    "-1": '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M16 4v16L5 12z"/></svg>',
    "1": '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M8 4v16l11-8z"/></svg>',
};

function stepper(field, step, titles) {
    const wrap = el("div", "nd-rs-step");
    const mk = (dir) => {
        const b = el("button", "nd-rs-arrow");
        b.type = "button";
        b.title = titles[dir];
        b.innerHTML = ARROW[dir];
        let t1 = 0, t2 = 0;
        const stop = () => { clearTimeout(t1); clearInterval(t2); t1 = t2 = 0; };
        b.addEventListener("pointerdown", (e) => {
            if (e.button !== 0 || b.disabled) return;
            e.preventDefault();
            const shift = e.shiftKey;
            step(Number(dir), shift);
            t1 = setTimeout(() => { t2 = setInterval(() => { if (b.disabled) stop(); else step(Number(dir), shift); }, 80); }, 420);
        });
        for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, stop);
        return b;
    };
    const left = mk("-1"), right = mk("1");
    wrap.append(left, field, right);
    return { wrap, left, right };
}

// SLOT_H: the output pin row above the widget. The size and the settings button live in that row (the widget reaches up into
// it), so the node has no empty strip under the title; the widget itself holds only the rows of fields.
const MIN_W = 270, ROW = 30, MIN_H = 66, MIN_H_CUSTOM = MIN_H + ROW, SLOT_H = 28;
const fmtNum = (v) => String(Number(Number(v).toFixed(2)));

/* -------------------------------------------------------------------- node */

function setupResolution(node) {
    const wState = hideWidget(node, "state");
    let st = normalize(wState?.value);

    const root = el("div", "nd-rs-root");
    const layer = el("div", "nd-rs-layer");
    const head = el("div", "nd-rs-head");
    const body = el("div", "nd-rs-body");
    const top = el("div", "nd-rs-row");
    const ratio = el("select", "nd-rs-ratio");
    ratio.title = "Aspect ratio";
    // grouped by orientation; every option names its type, so the closed list says it too
    for (const [group, list] of PRESET_GROUPS) {
        const g = el("optgroup");
        g.label = group;
        for (const p of list) { const o = el("option", null, `${p}  ·  ${group}`); o.value = p; g.append(o); }
        ratio.append(g);
    }
    const oc = el("option", null, "Custom…");
    oc.value = CUSTOM;
    ratio.append(oc);
    const gear = el("button", "nd-rs-gear");
    gear.type = "button";
    gear.title = "Settings: what the number means (megapixels, long side or short side) and the rounding";
    gear.innerHTML = GEAR_SVG;
    const ratioStep = stepper(ratio, (dir) => stepRatio(dir), { "-1": "Previous aspect ratio", "1": "Next aspect ratio" });
    top.append(el("span", "nd-rs-label", "Aspect Ratio"), ratioStep.wrap);

    const customRow = el("div", "nd-rs-row nd-rs-custom");
    const custom = el("input", "nd-rs-input");
    custom.type = "text";
    custom.placeholder = "21:9";
    custom.spellcheck = false;
    custom.title = "Type a ratio: 21:9, 16/9, 2.39";
    const customStep = stepper(custom, (dir, shift) => stepCustom(dir, shift), {
        "-1": "Left number −1 (Shift: the right number)",
        "1": "Left number +1 (Shift: the right number)",
    });
    customRow.append(el("span", "nd-rs-label", "Custom Ratio"), customStep.wrap);

    const numRow = el("div", "nd-rs-row");
    const label = el("span", "nd-rs-label");
    const num = el("input", "nd-rs-input");
    num.type = "number";
    const numStep = stepper(num, (dir) => stepNumber(dir), { "-1": "Decrease", "1": "Increase" });
    numRow.append(label, numStep.wrap);

    // the top row, level with the output pin: the settings button at the left, the size in the middle
    const result = el("div", "nd-rs-result");
    head.append(gear, result);
    body.append(top, customRow, numRow);
    layer.append(head, body);
    root.append(layer);

    function save() {
        if (wState) wState.value = JSON.stringify(st);
        app.graph?.change?.();
        dirty();
    }
    const current = () => (st.method === "megapixels" ? st.mp : st.method === "long side" ? st.long : st.short);

    const customShown = () => st.ratio === CUSTOM || st.show_custom;
    function show() {
        ratio.value = st.ratio;
        customRow.style.display = customShown() ? "" : "none";
        if (node.size) { const m = node.computeSize(); if (node.size[1] < m[1]) node.setSize([node.size[0], m[1]]); }
        if (document.activeElement !== custom) custom.value = st.custom;
        label.textContent = METHOD_LABEL[st.method];
        num.step = st.method === "megapixels" ? "0.05" : String(st.multiple);
        num.min = st.method === "megapixels" ? MP_RANGE[0] : SIDE_RANGE[0];
        num.max = st.method === "megapixels" ? MP_RANGE[1] : SIDE_RANGE[1];
        if (document.activeElement !== num) num.value = current();
        const bad = st.ratio === CUSTOM && !ratioOf(st);
        customStep.wrap.classList.toggle("bad", bad);
        const opts = [...ratio.options].map((o) => o.value), at = opts.indexOf(st.ratio);
        ratioStep.left.disabled = at <= 0;
        ratioStep.right.disabled = at >= opts.length - 1;
        customStep.left.disabled = customStep.right.disabled = !parseRatio(st.custom);
        const [lo, hi] = st.method === "megapixels" ? MP_RANGE : SIDE_RANGE;
        numStep.left.disabled = current() <= lo;
        numStep.right.disabled = current() >= hi;
        const size = computeSize(st);
        result.classList.toggle("bad", bad);
        result.textContent = size ? `${size[0]} × ${size[1]}  ·  ${((size[0] * size[1]) / MP_PIXELS).toFixed(2)} MP` : "Type a ratio like 21:9";
        node.ndRes = { size: () => computeSize(st) };
    }

    // one step along the list: the presets by orientation, then Custom
    function stepRatio(dir) {
        const opts = [...ratio.options].map((o) => o.value);
        const j = Math.max(0, Math.min(opts.length - 1, opts.indexOf(st.ratio) + dir));
        if (opts[j] === st.ratio) return;
        st.ratio = opts[j];
        show(); save();
    }
    // 21:9 -> 22:9 (Shift: 21:10); a decimal ratio steps by 0.1
    function stepCustom(dir, shift) {
        const ab = parseRatio(st.custom);
        if (!ab) return;
        let [a, b] = ab;
        const whole = Number.isInteger(a) && Number.isInteger(b);
        const d = whole ? dir : dir * 0.1;
        if (shift) b = Math.min(1000, Math.max(whole ? 1 : 0.1, b + d));
        else a = Math.min(1000, Math.max(whole ? 1 : 0.1, a + d));
        st.custom = `${fmtNum(a)}:${fmtNum(b)}`;
        st.ratio = CUSTOM;
        custom.value = st.custom;
        show(); save();
    }
    // megapixels by 0.1; pixels to the next multiple
    function stepNumber(dir) {
        const key = st.method === "megapixels" ? "mp" : st.method === "long side" ? "long" : "short";
        const v = st[key], m = st.multiple;
        let next;
        if (key === "mp") next = Math.round((v + dir * 0.1) * 100) / 100;
        else next = dir > 0 ? (Math.floor(v / m) + 1) * m : (Math.ceil(v / m) - 1) * m;
        st = normalize({ ...st, [key]: next });
        num.value = current();
        show(); save();
    }

    ratio.addEventListener("change", () => {
        st.ratio = ratio.value;
        show(); save();
        if (st.ratio === CUSTOM) { custom.focus(); custom.select(); }
    });
    custom.addEventListener("input", () => { st.custom = custom.value; st.ratio = CUSTOM; show(); save(); });
    custom.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") custom.blur(); });
    custom.addEventListener("blur", () => { custom.value = st.custom; show(); });
    custom.addEventListener("focus", () => custom.select());

    const setNumber = () => {
        const v = finite(num.value, null);
        if (v != null) {
            const key = st.method === "megapixels" ? "mp" : st.method === "long side" ? "long" : "short";
            st = normalize({ ...st, [key]: v });
            save();
        }
        num.value = current();
        show();
    };
    num.addEventListener("input", () => {
        // follow the typing without rewriting the field
        const v = finite(num.value, null);
        if (v == null) return;
        const key = st.method === "megapixels" ? "mp" : st.method === "long side" ? "long" : "short";
        st = normalize({ ...st, [key]: v });
        show(); save();
    });
    num.addEventListener("change", setNumber);
    num.addEventListener("blur", setNumber);
    num.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") num.blur(); });
    num.addEventListener("focus", () => num.select());

    gear.onclick = () => openSettings(st, (s) => { st = normalize({ ...st, ...s }); show(); save(); });

    bindCanvasNavigation(root, node);
    const domWidget = node.addDOMWidget("nd_resolution", "ND_RESOLUTION", root, {
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => (customShown() ? MIN_H_CUSTOM : MIN_H),
    });
    // the layer reaches up over the pin row: its height is how far the widget starts below the top of the node body
    const lift = (px) => layer.style.setProperty("--nd-up", `${px}px`);
    lift(SLOT_H);
    chain(node, "onDrawForeground", function () {
        const y = Number(domWidget?.y);
        const up = Number.isFinite(y) && y > 0 && y < 80 ? Math.round(y) : SLOT_H;
        if (layer.dataset.up !== String(up)) { layer.dataset.up = String(up); lift(up); }
    });
    // the node never gets smaller than its content (a narrower node broke the rows)
    const baseSize = node.computeSize?.bind(node);
    node.computeSize = function (...a) {
        const r = baseSize ? baseSize(...a) : [MIN_W, MIN_H];
        return [Math.max(r[0], MIN_W), Math.max(r[1], SLOT_H + (customShown() ? MIN_H_CUSTOM : MIN_H))];
    };
    node.setSize([Math.max(node.size[0], MIN_W), Math.max(node.size[1], node.computeSize()[1])]);

    node.ndRes = { size: () => computeSize(st) };
    node.ndResApi = {
        restore() {
            st = normalize(wState?.value);
            if (wState) wState.value = JSON.stringify(st);
            show();
            ND_REG.refresh?.();
        },
    };
    show();
    if (wState) wState.value = JSON.stringify(st);
}

/* ------------------------------------------------------------------ styles */

const STYLE = `
/* two columns: the names on the left, the fields on the right, all of one width */
.nd-rs-root{--nd-accent:#2f7de1;position:relative;width:100%;height:100%;box-sizing:border-box;font-family:Inter,Arial,sans-serif;font-size:12px;color:var(--input-text,#ddd)}
/* the layer starts at the top of the node body (over the output pin row) and the fields start where the widget does */
.nd-rs-layer{position:absolute;left:0;right:0;bottom:0;top:calc(-1 * var(--nd-up,28px));display:flex;flex-direction:column;box-sizing:border-box}
.nd-rs-head{flex:none;height:var(--nd-up,28px);display:grid;grid-template-columns:92px minmax(0,1fr);align-items:center;gap:8px;box-sizing:border-box;padding:0 16px 0 6px;min-width:0}
.nd-rs-body{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:92px minmax(0,1fr);align-content:start;align-items:center;gap:6px 8px;box-sizing:border-box;padding:2px 6px 4px;overflow:hidden}
.nd-rs-row{display:contents}
.nd-rs-label{opacity:.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* a field with an arrow at each end (the look of the stock widgets) */
.nd-rs-step{display:flex;align-items:stretch;height:24px;min-width:0;box-sizing:border-box;border:1px solid var(--border-color,#444);border-radius:12px;background:var(--comfy-input-bg,#222);overflow:hidden}
.nd-rs-step:focus-within{border-color:var(--nd-accent)}
.nd-rs-step.bad{border-color:#c0392b}
.nd-rs-arrow{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:30px;padding:0;margin:0;border:none;background:transparent;color:var(--input-text,#ddd);line-height:0;cursor:pointer;opacity:.65}
.nd-rs-arrow svg{display:block;pointer-events:none}
.nd-rs-arrow:hover:not(:disabled){opacity:1;color:var(--nd-accent);background:rgba(255,255,255,.05)}
.nd-rs-arrow:disabled{opacity:.2;cursor:default}
.nd-rs-ratio,.nd-rs-input{flex:1 1 auto;width:0;min-width:0;height:100%;box-sizing:border-box;padding:0 2px;border:none;border-radius:0;background:transparent;color:var(--input-text,#ddd);font-size:13px;text-align:center;text-align-last:center}
.nd-rs-ratio{cursor:pointer;-webkit-appearance:none;appearance:none}
.nd-rs-ratio option,.nd-rs-ratio optgroup{background:#222;color:#ddd;text-align:left}
.nd-rs-input:focus,.nd-rs-ratio:focus{outline:none}
.nd-rs-input[type=number]{-moz-appearance:textfield;appearance:textfield}
.nd-rs-input[type=number]::-webkit-inner-spin-button,.nd-rs-input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
.nd-rs-gear{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:24px;height:24px;box-sizing:border-box;padding:0;margin:0;border:1px solid var(--border-color,#444);border-radius:5px;background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);cursor:pointer;line-height:0;justify-self:start}
.nd-rs-gear svg{display:block;pointer-events:none}
.nd-rs-gear:hover{border-color:var(--nd-accent);color:var(--nd-accent)}
.nd-rs-result{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0;text-align:center;font-variant-numeric:tabular-nums;font-size:13px;font-weight:600;letter-spacing:.2px}
.nd-rs-result.bad{color:#e0776b;font-weight:400}
.nd-rs-back{--nd-accent:#2f7de1;position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);font-family:Inter,Arial,sans-serif;font-size:13px;color:var(--input-text,#ddd)}
.nd-rs-modal{display:flex;flex-direction:column;width:min(380px,92vw);border:1px solid var(--border-color,#444);border-radius:10px;background:var(--comfy-menu-bg,#1e1e1e);box-shadow:0 18px 50px rgba(0,0,0,.6)}
.nd-rs-mhead{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--border-color,#444);font-weight:600}
.nd-rs-x{border:none;background:transparent;color:inherit;font-size:18px;line-height:1;cursor:pointer;opacity:.7}
.nd-rs-x:hover{opacity:1}
.nd-rs-content{display:flex;flex-direction:column;gap:14px;padding:14px}
.nd-rs-field{display:flex;flex-direction:column;gap:5px;font-size:12px}
.nd-rs-field>span{opacity:.75}
.nd-rs-check{display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer}
.nd-rs-check input{margin:0;accent-color:var(--nd-accent)}
.nd-rs-note{opacity:.5;font-size:11px;line-height:1.35}
.nd-rs-seg{display:flex;border:1px solid var(--border-color,#444);border-radius:6px;overflow:hidden}
.nd-rs-seg button{flex:1 1 0;height:28px;border:none;border-right:1px solid var(--border-color,#444);background:var(--comfy-input-bg,#222);color:inherit;font-size:12px;cursor:pointer}
.nd-rs-seg button:last-child{border-right:none}
.nd-rs-seg button.on{background:var(--nd-accent);color:#fff}
.nd-rs-select{height:28px;box-sizing:border-box;padding:0 6px;border:1px solid var(--border-color,#444);border-radius:5px;background:var(--comfy-input-bg,#222);color:inherit;font-size:13px}
.nd-rs-foot{display:flex;justify-content:flex-end;gap:6px;padding:10px 12px;border-top:1px solid var(--border-color,#444)}
.nd-rs-btn{height:26px;padding:0 12px;border:1px solid var(--border-color,#444);border-radius:5px;background:var(--comfy-input-bg,#222);color:inherit;font-size:12px;cursor:pointer}
.nd-rs-btn:hover{border-color:var(--nd-accent)}
.nd-rs-btn.primary{background:var(--nd-accent);border-color:var(--nd-accent);color:#fff}
`;

app.registerExtension({
    name: "NeuralDreamer.Nodes.Resolution",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE) return;
        const proto = nodeType.prototype;
        const blank = (n) => blankSlots(n, [], [0]);
        chain(proto, "onNodeCreated", function () {
            injectStyleOnce("nd-rs-style", STYLE);
            setupResolution(this);
            blank(this);
        });
        chain(proto, "onConfigure", function () {
            blank(this);
            setTimeout(() => this.ndResApi?.restore?.(), 0);
        });
    },
});
