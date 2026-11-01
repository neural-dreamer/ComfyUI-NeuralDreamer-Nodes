// Neural Dreamer Nodes — ND LoRA Stack: the list inside the node.
//
// The list lives in the hidden text widget `stack` (JSON), which this view and other LoRA widgets both edit:
//   [{"name": "style/foo.safetensors", "on": true, "sm": 0.8, "sc": 0.8, "link": true, "words": ["foo style"]}]
// Other interfaces find the node by its class (NDLoraStack) and write the same text, so nothing here depends on it.
//
// A row: the switch, the picture (a video plays while the pointer is over the row), the name, the strength with the arrows ◀ ▶
// (step 0.05, Shift: 0.25, hold to repeat; a number typed by hand is never limited) and the button that removes the LoRA.
import { app } from "../../scripts/app.js";
import { el, chain, bindCanvasNavigation, injectStyleOnce, hideWidget, dropHiddenSockets } from "./nd_common.js";
import { LANG_EVENT } from "./nd_i18n.js";
import { tr, LANG, ensureLang, icon, catalog, mediaThumb, openGallery, nsfwButton, MARK_EVENT, dirName, stemName, GALLERY_CSS } from "./lora_gallery.js";

const CLASS = "NDLoraStack";
const STEP = 0.05, STEP_BIG = 0.25;
const fmt = (v) => String(+Number(v).toFixed(2));
// the result of an arrow stays on the grid of 0.05, so repeated steps do not drift (0.8500000001)
const onGrid = (v) => +(Math.round(v / STEP) * STEP).toFixed(3);

/* ------------------------------------------------------------------ the list in the hidden widget */

const stackWidget = (node) => node?.widgets?.find((w) => w.name === "stack") || null;
function normalize(raw) {
    let a = [];
    try { a = JSON.parse(raw); } catch {}
    if (!Array.isArray(a)) return [];
    return a.filter((e) => e && typeof e.name === "string" && e.name).map((e) => ({
        name: e.name, on: e.on !== false, sm: Number.isFinite(+e.sm) ? +e.sm : 1,
        sc: Number.isFinite(+e.sc) ? +e.sc : Number.isFinite(+e.sm) ? +e.sm : 1, link: e.link !== false,
        words: Array.isArray(e.words) ? e.words.map(String) : [],
    }));
}
const stackText = (node) => String(stackWidget(node)?.value ?? "");
const readStack = (node) => normalize(stackText(node));
function writeStack(node, list) {
    const w = stackWidget(node);
    if (!w) return false;
    const v = JSON.stringify(list.map((e) => ({ name: e.name, on: e.on, sm: +e.sm.toFixed(3), sc: e.link ? +e.sm.toFixed(3) : +e.sc.toFixed(3), link: e.link, words: e.words })));
    w.value = v;
    try { w.callback?.(v, null, node); } catch {}
    try {
        const t = app.extensionManager?.workflow?.activeWorkflow?.changeTracker;
        if (t?.captureCanvasState) t.captureCanvasState(); else t?.checkState?.();
    } catch {}
    try { node.graph?.setDirtyCanvas?.(true, false); } catch {}
    return true;
}

/* ------------------------------------------------------------------ the strength: ◀ 0.80 ▶ */

// holds an arrow: one step at once, then (after 400 ms) one every 80 ms. Shift (held now) makes the step bigger.
function arrow(dir, step) {
    const b = el("button", "nd-lr-arr"); b.type = "button"; b.append(icon(dir < 0 ? "chevL" : "chevR", 12));
    let t1 = null, t2 = null, shift = false;
    const stop = () => { clearTimeout(t1); clearInterval(t2); t1 = t2 = null; window.removeEventListener("keydown", key, true); window.removeEventListener("keyup", key, true); };
    const key = (e) => { if (e.key === "Shift") shift = e.type === "keydown"; };
    const go = () => step(dir * (shift ? STEP_BIG : STEP));
    b.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        shift = e.shiftKey; stop();
        go();
        t1 = setTimeout(() => { t2 = setInterval(go, 80); }, 400);
        window.addEventListener("keydown", key, true); window.addEventListener("keyup", key, true);
        try { b.setPointerCapture(e.pointerId); } catch {}
    });
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) b.addEventListener(t, stop);
    // the keyboard: Enter / Space on the focused arrow
    b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); shift = e.shiftKey; go(); } e.stopPropagation(); });
    return b;
}

// opts: {off}; onChange(value) is called with every new value
export function strengthBox(value, onChange, { off = false } = {}) {
    const box = el("div", `nd-lr-str${off ? " off" : ""}`);
    const num = el("input", "nd-lr-num"); num.type = "text"; num.inputMode = "decimal"; num.spellcheck = false; num.value = fmt(value); num.title = tr("Strength"); num.disabled = off;
    let cur = value;
    const set = (v) => { cur = v; num.value = fmt(v); onChange(v); };
    const step = (d) => set(onGrid(cur + d));
    const less = arrow(-1, step), more = arrow(1, step);
    less.title = tr("Weaker (Shift: bigger step)"); more.title = tr("Stronger (Shift: bigger step)");
    less.disabled = more.disabled = off;
    // a number typed by hand is taken as it is
    num.addEventListener("change", () => {
        const n = Number(num.value.replace(",", "."));
        if (!Number.isFinite(n)) { num.value = fmt(cur); return; }
        set(n);
    });
    num.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") num.blur(); });
    box.append(less, num, more);
    return box;
}

/* ------------------------------------------------------------------ the view */

function stackView(node) {
    const root = el("div", "nd-lr-root");
    const listEl = el("div", "nd-lr-list"); listEl.dataset.ndScroll = "1";
    const bar = el("div", "nd-lr-bar");
    root.append(listEl, bar);
    let info = new Map(), seen = null, list = [], loaded = false;

    const commit = (redraw = true) => { writeStack(node, list); seen = stackText(node); if (redraw) draw(); };
    const move = (from, to) => { if (from === to || from < 0 || to < 0) return; const [x] = list.splice(from, 1); list.splice(to, 0, x); commit(); };

    const row = (e, i) => {
        const m = info.get(e.name);
        const c = el("div", `nd-lr-row${e.on ? "" : " off"}`); c.dataset.i = String(i);
        const grip = el("span", "nd-lr-grip"); grip.title = tr("Drag to change the order"); grip.append(icon("grip", 13));
        const sw = el("button", `nd-lr-sw${e.on ? " on" : ""}`); sw.type = "button"; sw.setAttribute("role", "switch"); sw.setAttribute("aria-checked", String(e.on)); sw.title = tr("On / off"); sw.append(el("i"));
        sw.addEventListener("click", () => { e.on = !e.on; commit(); });
        const pic = el("div", "nd-lr-pic");
        pic.append(m ? mediaThumb(m, { play: "hover", hover: c }) : (() => { const x = el("div", "nd-lr-media empty"); x.append(icon("cube", 16)); return x; })());
        const nm = el("div", "nd-lr-name"); nm.title = e.name;
        nm.append(el("b", "", m?.title || stemName(e.name)));
        const d = dirName(e.name); if (d) nm.append(el("small", "", d));
        if (loaded && !m) { c.classList.add("miss"); nm.append(el("small", "warn", tr("File not found"))); }
        const del = el("button", "nd-lr-del"); del.type = "button"; del.title = tr("Remove from the stack"); del.append(icon("x", 13));
        del.addEventListener("click", () => { list.splice(i, 1); commit(); });
        const st = strengthBox(e.sm, (v) => { e.sm = v; if (e.link) e.sc = v; commit(false); }, { off: !e.on });
        c.append(grip, sw, pic, nm, st, del);
        // the order: drag by the grip
        grip.draggable = true;
        grip.addEventListener("dragstart", (ev) => { ev.dataTransfer.setData("application/x-nd-lora", String(i)); ev.dataTransfer.effectAllowed = "move"; setTimeout(() => c.classList.add("drag"), 0); });
        grip.addEventListener("dragend", () => { c.classList.remove("drag"); for (const x of listEl.children) x.classList.remove("over-t", "over-b"); });
        c.addEventListener("dragover", (ev) => {
            if (![...ev.dataTransfer.types].includes("application/x-nd-lora")) return;
            ev.preventDefault();
            const r = c.getBoundingClientRect(), top = ev.clientY < r.top + r.height / 2;
            c.classList.toggle("over-t", top); c.classList.toggle("over-b", !top);
        });
        c.addEventListener("dragleave", () => c.classList.remove("over-t", "over-b"));
        c.addEventListener("drop", (ev) => {
            const from = parseInt(ev.dataTransfer.getData("application/x-nd-lora"), 10);
            if (!Number.isFinite(from)) return;
            ev.preventDefault();
            const r = c.getBoundingClientRect(), after = ev.clientY >= r.top + r.height / 2;
            let to = i + (after ? 1 : 0); if (from < to) to--;
            c.classList.remove("over-t", "over-b");
            move(from, to);
        });
        return c;
    };

    function draw() {
        list = readStack(node); seen = stackText(node);
        listEl.textContent = "";
        if (!list.length) listEl.append(el("div", "nd-lr-empty", tr("No LoRAs yet. Press + LoRA.")));
        list.forEach((e, i) => listEl.append(row(e, i)));
        bar.textContent = "";
        const add = el("button", "nd-lr-btn nd-lr-add"); add.type = "button"; add.append(icon("plus", 14), el("span", "", tr("LoRA")));
        add.addEventListener("click", () => openGallery({ title: tr("Add a LoRA"), onPick: (name, m) => { list.push({ name, on: true, sm: 1, sc: 1, link: true, words: [...(m?.words || [])] }); commit(); } }));
        const on = list.filter((e) => e.on).length;
        bar.append(add, nsfwButton("nd-lr-btn icon"), el("span", "nd-lr-count", list.length ? tr("{on} of {all} on", { on, all: list.length }) : ""));
    }
    // a mark made in the gallery: the rows follow it (the entries are shared); the listener goes away with the node
    const onMark = () => { if (!root.isConnected && root.__seen) { window.removeEventListener(MARK_EVENT, onMark); return; } if (root.isConnected) root.__seen = true; draw(); };
    window.addEventListener(MARK_EVENT, onMark);
    catalog().then((m) => { info = m; loaded = true; draw(); });
    draw();
    return {
        el: root,
        // called by a timer: the list is redrawn only when somebody else changed it (another widget, loading a workflow, undo)
        update() { if (stackText(node) !== seen) draw(); },
        redraw: draw,
        refresh() { catalog(true).then((m) => { info = m; loaded = true; draw(); }); },
    };
}

/* ------------------------------------------------------------------ the node */

const STYLE = `
${GALLERY_CSS}
.nd-lr-root{--nd-accent:#2f7de1;display:flex;flex-direction:column;gap:6px;box-sizing:border-box;width:100%;height:100%;padding:2px;font-family:Inter,Arial,sans-serif;font-size:12px;color:var(--input-text,#ddd)}
.nd-lr-list{display:flex;flex-direction:column;gap:5px;flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain}
.nd-lr-bar{display:flex;align-items:center;gap:6px;flex:0 0 auto}
.nd-lr-bar .nd-lr-btn{height:26px}
.nd-lr-bar .nd-lr-btn.icon{width:26px}
.nd-lr-count{margin-left:auto;opacity:.55;font-size:11px}
.nd-lr-row{position:relative;display:flex;align-items:center;gap:6px;flex:0 0 auto;padding:4px 6px 4px 2px;border:1px solid var(--border-color,#444);border-radius:8px;background:rgba(0,0,0,.18);transition:opacity .12s,border-color .12s}
.nd-lr-row:hover{border-color:rgba(255,255,255,.28)}
.nd-lr-row.off{opacity:.55}
.nd-lr-row.miss{border-color:#c0392b}
.nd-lr-row.drag{opacity:.35}
.nd-lr-row.over-t::before,.nd-lr-row.over-b::after{content:"";position:absolute;left:6px;right:6px;height:2px;border-radius:2px;background:var(--nd-accent);box-shadow:0 0 6px var(--nd-accent)}
.nd-lr-row.over-t::before{top:-4px}.nd-lr-row.over-b::after{bottom:-4px}
.nd-lr-grip{display:flex;align-items:center;flex:0 0 auto;opacity:.45;cursor:grab;padding:2px 0}
.nd-lr-grip:hover{opacity:.9}
.nd-lr-grip:active{cursor:grabbing}
.nd-lr-sw{position:relative;flex:0 0 auto;width:30px;height:18px;padding:0;border:1px solid var(--border-color,#444);border-radius:999px;background:var(--comfy-input-bg,#222);cursor:pointer;transition:background .12s,border-color .12s}
.nd-lr-sw i{position:absolute;left:2px;top:2px;width:12px;height:12px;border-radius:50%;background:#9aa0a8;transition:transform .14s,background .12s}
.nd-lr-sw.on{background:var(--nd-accent);border-color:transparent}
.nd-lr-sw.on i{transform:translateX(12px);background:#fff}
.nd-lr-pic{flex:0 0 auto;width:36px;height:36px;border-radius:6px;overflow:hidden}
.nd-lr-name{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;line-height:1.25}
.nd-lr-name b{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nd-lr-name small{opacity:.55;font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nd-lr-name small.warn{color:#ff7a6b;opacity:1}
.nd-lr-str{display:flex;align-items:center;gap:2px;flex:0 0 auto}
.nd-lr-str.off{opacity:.5}
.nd-lr-num{width:42px;height:24px;box-sizing:border-box;padding:0 2px;text-align:center;border:1px solid var(--border-color,#444);border-radius:5px;background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);font:inherit;font-size:12px;font-weight:500;outline:0}
.nd-lr-num:focus{border-color:var(--nd-accent)}
.nd-lr-arr{display:inline-flex;align-items:center;justify-content:center;width:18px;height:24px;padding:0;border:1px solid transparent;border-radius:5px;background:transparent;color:var(--input-text,#ddd);cursor:pointer;opacity:.75;touch-action:none}
.nd-lr-arr:hover:not(:disabled){opacity:1;border-color:var(--border-color,#444);color:var(--nd-accent)}
.nd-lr-arr:active:not(:disabled){background:var(--nd-accent);color:#fff}
.nd-lr-arr:disabled{opacity:.3;cursor:default}
.nd-lr-del{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:22px;height:22px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--input-text,#ddd);opacity:.55;cursor:pointer}
.nd-lr-del:hover{opacity:1;background:#c0392b;color:#fff}
.nd-lr-root .nd-lr-empty{grid-column:auto;padding:14px 8px}
`;

function setupNode(node) {
    injectStyleOnce("nd-lora-stack-style", STYLE);
    hideWidget(node, "stack");
    const root = el("div", "nd-lr-node");
    const view = stackView(node);
    root.append(view.el);
    bindCanvasNavigation(root, node);
    const dom = node.addDOMWidget("nd_lora_stack", "ND_LORA_STACK", root, { serialize: false, hideOnZoom: false, getMinHeight: () => 90 });
    // the list follows changes made elsewhere (another widget, loading a workflow, undo)
    let shownLang = LANG();
    const timer = setInterval(() => { if (!node.graph) return; if (LANG() !== shownLang) { shownLang = LANG(); ensureLang().then(() => view.redraw()); } view.update(); }, 400);
    const onLang = () => ensureLang().then(() => view.redraw());
    window.addEventListener(LANG_EVENT, onLang);
    ensureLang().then(() => view.redraw());
    node.__ndLoraDispose = () => { clearInterval(timer); window.removeEventListener(LANG_EVENT, onLang); };
    node.ndLoraApi = { view, dom, root, text: () => stackText(node) };
    if (!node.size || node.size[0] < 330) node.setSize([360, 210]);
}

app.registerExtension({
    name: "NeuralDreamer.Nodes.LoraStack",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== CLASS) return;
        const proto = nodeType.prototype;
        chain(proto, "onNodeCreated", function () { setupNode(this); });
        chain(proto, "onConfigure", function () { setTimeout(() => { hideWidget(this, "stack"); dropHiddenSockets(this); this.ndLoraApi?.view.update(); }, 0); });
        chain(proto, "onRemoved", function () { this.__ndLoraDispose?.(); });
    },
});
