// Neural Dreamer Nodes — ND LoRA Stack H3 Temporal: the list inside the node, with the time settings on every row.
//
// The list and the rows are those of ND LoRA Stack (lora_stack.js).  Every row gets two buttons:
//   the clock   opens the panel with the timeline: when the LoRA works (several ranges, fades, audio switch, shared layers)
//   the info    opens a window with the file, the trigger words and what the LoRA changes in MiniMax H3
// The settings are the field `t` of the entry in the hidden text widget `stack` (see lora_temporal.js).  Whether the time panel is open
// is kept in node.properties.nd_open ({"<LoRA name>": "time"}), not in the stack, so it does not change what is run.
import { api } from "../../scripts/api.js";
import { injectStyleOnce } from "./nd_common.js";
import { registerStack } from "./lora_stack.js";
import { tr } from "./lora_gallery.js";
import { temporalEditor, infoPanel, normalizeTemporal, isTimed, durationOf } from "./lora_temporal.js";

const CLASS = "NDLoraStackH3Temporal";
const CLOCK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
const INFO = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>';

const STYLE = `
.nd-lt-tb{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;min-width:22px;height:22px;padding:0 3px;gap:2px;border:1px solid transparent;border-radius:5px;background:transparent;color:var(--input-text,#ddd);opacity:.6;cursor:pointer;font:inherit;font-size:10px;font-weight:600}
.nd-lt-tb:hover{opacity:1;border-color:var(--border-color,#444)}
.nd-lt-tb.on{opacity:1;color:var(--nd-accent,#2f7de1)}
.nd-lt-tb.open{opacity:1;background:rgba(47,125,225,.2)}
.nd-lt-back{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55)}
.nd-lt-win{display:flex;flex-direction:column;width:min(560px,94vw);max-height:min(640px,90vh);border:1px solid var(--border-color,#444);border-radius:10px;background:var(--comfy-menu-bg,#1e1e1e);color:var(--input-text,#ddd);box-shadow:0 18px 50px rgba(0,0,0,.6);overflow:hidden}
.nd-lt-wh{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid var(--border-color,#444)}
.nd-lt-wt{flex:1 1 auto;min-width:0;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nd-lt-wb{flex:1 1 auto;min-height:0;overflow:auto;padding:10px 12px 12px}
.nd-lt-wb .nd-li{border-top:0;padding:0;gap:10px;font-size:13px}
.nd-lt-wb .nd-li-kv{font-size:12.5px;gap:4px 16px}
.nd-lt-wb .nd-li-chip{font-size:11.5px}
.nd-lr-row.has-panel .nd-lr-name{flex:1 1 0}
.nd-lr-row.has-panel>.nd-lt,.nd-lr-row.has-panel>.nd-li{flex:0 0 100%}
`;

const lengthWidget = (node) => node?.widgets?.find((w) => w.name === "length") || null;
const lengthOf = (node) => { const v = Number(lengthWidget(node)?.value); return Number.isFinite(v) && v > 0 ? v : 124; };
const openMap = (node) => { const p = (node.properties ||= {}); if (!p.nd_open || typeof p.nd_open !== "object") p.nd_open = {}; return p.nd_open; };

const buttons = new WeakMap(); // entry -> its clock button (the panel updates it while the settings change)

function paintClock(btn, e) {
    const t = normalizeTemporal(e.t);
    const timed = isTimed(t);
    btn.classList.toggle("on", timed);
    btn.replaceChildren();
    btn.insertAdjacentHTML("beforeend", CLOCK);
    if (timed) { const n = document.createElement("span"); n.textContent = String(t.ranges.length); btn.append(n); }
    btn.title = timed ? tr("Works only in the chosen seconds. Click to change.") : tr("Time settings: the LoRA works on the whole video. Click to set the seconds.");
}

function rowTools(e, i, ctx) {
    const open = openMap(ctx.node)[e.name]; // "time" or nothing
    const clock = document.createElement("button"); clock.type = "button"; clock.className = `nd-lt-tb${open === "time" ? " open" : ""}`;
    paintClock(clock, e); buttons.set(e, clock);
    const info = document.createElement("button"); info.type = "button"; info.className = "nd-lt-tb";
    info.insertAdjacentHTML("beforeend", INFO); info.title = tr("Information about this LoRA");
    clock.addEventListener("click", () => { const m = openMap(ctx.node); if (m[e.name] === "time") delete m[e.name]; else m[e.name] = "time"; ctx.draw(); });
    info.addEventListener("click", () => showInfo(e, ctx));
    return [clock, info];
}

// the information about the file in a window of its own (a panel inside the node has no room for it and its text overlapped)
function showInfo(e, ctx) {
    document.querySelectorAll(".nd-lt-back").forEach((n) => n.remove());
    const back = document.createElement("div"); back.className = "nd-lt-back";
    const win = document.createElement("div"); win.className = "nd-lt-win"; win.setAttribute("role", "dialog");
    const head = document.createElement("div"); head.className = "nd-lt-wh";
    const title = document.createElement("div"); title.className = "nd-lt-wt";
    title.textContent = ctx.info?.title || String(e.name).split(/[\\/]/).pop();
    const x = document.createElement("button"); x.type = "button"; x.className = "nd-lt-tb"; x.textContent = "✕"; x.title = tr("Close");
    head.append(title, x);
    const body = document.createElement("div"); body.className = "nd-lt-wb";
    body.append(infoPanel({
        name: e.name, meta: ctx.info, words: e.words, tr, fetchApi: api.fetchApi.bind(api),
        onWords: (list) => { e.words = list; ctx.save(); },
    }).el);
    win.append(head, body); back.append(win);
    const close = () => { document.removeEventListener("keydown", key, true); back.remove(); };
    const key = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopImmediatePropagation(); close(); } };
    document.addEventListener("keydown", key, true);
    x.addEventListener("click", close);
    back.addEventListener("pointerdown", (ev) => { if (ev.target === back) close(); });
    back.addEventListener("wheel", (ev) => ev.stopPropagation(), { passive: true });
    document.body.append(back);
}

function rowPanel(e, i, ctx) {
    const kind = openMap(ctx.node)[e.name];
    if (kind === "time") {
        const ed = temporalEditor({
            entry: e, length: lengthOf(ctx.node), tr,
            onChange: (t, final) => { e.t = t; if (final) ctx.save(); const b = buttons.get(e); if (b) paintClock(b, e); },
        });
        return ed.el;
    }
    return null;
}

function onSetup(node, view) {
    injectStyleOnce("nd-lora-stack-h3t-style", STYLE);
    const lw = lengthWidget(node);
    if (lw && !lw.__ndWrapped) { // the time scale follows the length of the video
        lw.__ndWrapped = true;
        const cb = lw.callback;
        lw.callback = function (...a) { const r = cb?.apply(this, a); view.redraw(); return r; };
    }
    Object.assign(node.ndLoraApi, {
        temporal: true,
        length: () => lengthOf(node),
        duration: () => durationOf(lengthOf(node)),
        setLength(n) { const w = lengthWidget(node); if (!w) return false; w.value = Number(n); w.callback?.(w.value); return true; },
        openPanel(name, kind) { const m = openMap(node); if (kind === "time") m[name] = kind; else delete m[name]; view.redraw(); },
    });
}

registerStack(CLASS, "NeuralDreamer.Nodes.LoraStackH3Temporal", { rowTools, rowPanel, onSetup, size: [450, 300], minWidth: 400 });
