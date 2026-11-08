// Neural Dreamer Nodes — the time settings of a LoRA for MiniMax H3 (the browser side of nd_nodes/lora_temporal_core.py).
//
// The field `t` of a stack entry (version 1):
//   {"v":1,"on":true,"audio":false,"shared":true,"base":0,"ranges":[{"s":1,"e":3.5,"fi":0.25,"fo":0.25,"w":1}]}
// (seconds; e = null: to the end of the video).  This file has the same maths as the Python core (tools/tests/temporal_vectors.json
// checks both), the panel with the timeline, and the panel with the information about a LoRA.  It has no dependency on a node, so
// other interfaces (ND UI Builder) use it through `window.ndLoraTemporal` (see the end of the file).
//
// MiniMax H3 time grid: 24 fps; a video latent frame holds 1, 4, 4, 4, 4 pixel frames in turn (17 frames per 5 latent frames).

export const VERSION = 1;
export const FPS = 24;
const PREFIX = [0, 1, 5, 9, 13];
const W_MAX = 2;

const h = (tag, cls = "", text = "") => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
const num = (v, d) => { const n = typeof v === "string" && v.trim() === "" ? NaN : Number(v); return Number.isFinite(n) ? n : d; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round3 = (v) => +Number(v).toFixed(3);
const fmt = (v) => String(round3(v));

/* ------------------------------------------------------------------ the grid and the curve (same as the Python core) */

export const alignFrames = (n) => { n = Math.max(5, Math.floor(n) || 5); while (n % 17 !== 5) n++; return n; };
export const durationOf = (length) => alignFrames(length) / FPS;
export const latentCount = (frames) => (frames <= 5 ? 2 : Math.floor((frames - 5) / 17) * 5 + 2);
export const latentStart = (k) => Math.floor(k / 5) * 17 + PREFIX[k % 5];
export const latentCenter = (k) => (latentStart(k) + latentStart(k + 1)) / 2 / FPS;
const smooth = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

export function newRange(s = 0, e = 1) { return { s, e, fi: 0.25, fo: 0.25, w: 1 }; }
export function defaultTemporal() { return { v: VERSION, on: true, audio: false, shared: true, base: 0, ranges: [] }; }

// the normal form of `t` (never throws: wrong numbers become the nearest right ones); null when there is no `t`
export function normalizeTemporal(t) {
    if (!t || typeof t !== "object") return null;
    const ranges = (Array.isArray(t.ranges) ? t.ranges : []).filter((r) => r && typeof r === "object").map((r) => {
        const s = Math.max(0, num(r.s, 0));
        let e = r.e === null || r.e === undefined || r.e === "" ? null : Math.max(0, num(r.e, NaN));
        if (e !== null && !Number.isFinite(e)) e = null;
        if (e !== null && e <= s) e = s + 0.05;
        return { s, e, fi: Math.max(0, num(r.fi, 0)), fo: Math.max(0, num(r.fo, 0)), w: clamp(num(r.w, 1), 0, W_MAX) };
    });
    return { v: VERSION, on: !!t.on, audio: !!t.audio, shared: t.shared !== false, base: clamp(num(t.base, 0), 0, 1), ranges };
}
export const isTimed = (t) => !!t && !!t.on && t.ranges.length > 0;

export function ramp(sec, r) {
    const { s, e } = r;
    if (sec < s || (e !== null && sec > e)) return 0;
    let fi = r.fi, fo = e !== null ? r.fo : 0;
    if (e !== null && fi + fo > e - s) { const k = (e - s) / (fi + fo); fi *= k; fo *= k; }
    const up = fi <= 0 ? 1 : smooth((sec - s) / fi);
    const down = fo <= 0 ? 1 : smooth((e - sec) / fo);
    return Math.min(up, down);
}

// the strength of the LoRA at `sec` seconds
export function value(sec, t, strength = 1) {
    if (!isTimed(t)) return strength;
    let v = t.base;
    for (const r of t.ranges) v = Math.max(v, r.w * ramp(sec, r));
    return strength * v;
}

// `t` as it is stored: what the panel changed on top of the fields this file does not know
export const mergeT = (raw, norm) => ({ ...(raw && typeof raw === "object" ? raw : {}), ...norm });

/* ------------------------------------------------------------------ small controls */

const CSS = `
.nd-lt{--nd-accent:var(--nd-accent,#2f7de1);display:flex;flex-direction:column;gap:7px;box-sizing:border-box;width:100%;padding:6px 4px 2px;border-top:1px solid var(--border-color,#444);font-size:12px;color:var(--input-text,#ddd)}
.nd-lt.off .nd-lt-tl,.nd-lt.off .nd-lt-ranges{opacity:.45}
.nd-lt-top{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px}
.nd-lt-tg{display:inline-flex;align-items:center;gap:5px;cursor:pointer;user-select:none}
.nd-lt-sw{position:relative;flex:0 0 auto;width:28px;height:16px;padding:0;border:1px solid var(--border-color,#444);border-radius:999px;background:var(--comfy-input-bg,#222);cursor:pointer;transition:background .12s}
.nd-lt-sw i{position:absolute;left:2px;top:2px;width:10px;height:10px;border-radius:50%;background:#9aa0a8;transition:transform .14s,background .12s}
.nd-lt-sw.on{background:var(--nd-accent,#2f7de1);border-color:transparent}
.nd-lt-sw.on i{transform:translateX(12px);background:#fff}
.nd-lt-lab{opacity:.8;font-size:11px}
.nd-lt-fld{display:inline-flex;align-items:center;gap:3px}
.nd-lt-fld>span.nd-lt-lab{margin-right:1px}
.nd-lt-st{display:inline-flex;align-items:center;gap:1px}
.nd-lt-num{width:44px;height:22px;box-sizing:border-box;padding:0 2px;text-align:center;border:1px solid var(--border-color,#444);border-radius:5px;background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);font:inherit;font-size:11.5px;outline:0}
.nd-lt-num:focus{border-color:var(--nd-accent,#2f7de1)}
.nd-lt-arr{display:inline-flex;align-items:center;justify-content:center;width:15px;height:22px;padding:0;border:1px solid transparent;border-radius:5px;background:transparent;color:var(--input-text,#ddd);font-size:9px;cursor:pointer;opacity:.7;touch-action:none}
.nd-lt-arr:hover{opacity:1;border-color:var(--border-color,#444);color:var(--nd-accent,#2f7de1)}
.nd-lt-arr:active{background:var(--nd-accent,#2f7de1);color:#fff}
.nd-lt-tl{position:relative;height:56px;border:1px solid var(--border-color,#444);border-radius:7px;background:rgba(0,0,0,.22);overflow:hidden;touch-action:none;user-select:none;cursor:crosshair}
.nd-lt-tl svg{position:absolute;left:0;top:0;width:100%;height:40px;pointer-events:none}
.nd-lt-tl .curve{fill:var(--nd-accent,#2f7de1);fill-opacity:.35;stroke:var(--nd-accent,#2f7de1);stroke-width:1.5;vector-effect:non-scaling-stroke}
.nd-lt-tl .grid{stroke:#fff;stroke-opacity:.09;stroke-width:1;vector-effect:non-scaling-stroke}
.nd-lt-tick{position:absolute;bottom:0;height:14px;border-left:1px solid rgba(255,255,255,.28);pointer-events:none}
.nd-lt-tick span{position:absolute;left:3px;bottom:0;font-size:9.5px;opacity:.65;white-space:nowrap}
.nd-lt-rg{position:absolute;top:0;height:40px;box-sizing:border-box;border:1px solid var(--nd-accent,#2f7de1);border-radius:5px;background:rgba(47,125,225,.12);cursor:grab}
.nd-lt-rg:active{cursor:grabbing}
.nd-lt-rg b{position:absolute;left:5px;top:1px;font-size:10px;font-weight:600;opacity:.8;pointer-events:none}
.nd-lt-hd{position:absolute;top:0;bottom:0;width:7px;cursor:ew-resize}
.nd-lt-hd::after{content:"";position:absolute;top:8px;bottom:8px;left:2px;width:3px;border-radius:2px;background:var(--nd-accent,#2f7de1)}
.nd-lt-hd.l{left:-1px}.nd-lt-hd.r{right:-1px}
.nd-lt-ranges{display:flex;flex-direction:column;gap:6px}
.nd-lt-rrow{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;padding:5px 6px;border:1px solid var(--border-color,#444);border-radius:7px;background:rgba(0,0,0,.14)}
.nd-lt-rrow>b{width:14px;opacity:.7;font-size:11px}
.nd-lt-del{margin-left:auto;display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:0;border-radius:5px;background:transparent;color:var(--input-text,#ddd);opacity:.55;cursor:pointer;font-size:12px}
.nd-lt-del:hover{opacity:1;background:#c0392b;color:#fff}
.nd-lt-add{align-self:flex-start;height:24px;padding:0 10px;border:1px solid var(--border-color,#444);border-radius:6px;background:transparent;color:var(--input-text,#ddd);font:inherit;font-size:11.5px;cursor:pointer}
.nd-lt-add:hover{border-color:var(--nd-accent,#2f7de1);color:var(--nd-accent,#2f7de1)}
.nd-lt-hint{opacity:.55;font-size:10.5px}
.nd-li{display:flex;flex-direction:column;gap:6px;box-sizing:border-box;width:100%;padding:6px 4px 2px;border-top:1px solid var(--border-color,#444);font-size:12px;color:var(--input-text,#ddd)}
.nd-li-box{display:flex;flex-direction:column;gap:8px}
.nd-li-kv{display:flex;flex-wrap:wrap;gap:2px 14px;font-size:11.5px}
.nd-li-kv span{opacity:.6}
.nd-li-warn{padding:4px 7px;border-radius:6px;background:rgba(255,160,40,.14);border:1px solid rgba(255,160,40,.5);font-size:11.5px}
.nd-li-chips{display:flex;flex-wrap:wrap;gap:4px}
.nd-li-chip{padding:1px 7px;border:1px solid var(--border-color,#444);border-radius:999px;font-size:10.5px;opacity:.85}
.nd-li-chip.whole{border-style:dashed;opacity:.6}
.nd-li-words{width:100%;box-sizing:border-box;height:24px;padding:0 6px;border:1px solid var(--border-color,#444);border-radius:6px;background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);font:inherit;font-size:11.5px;outline:0}
.nd-li-words:focus{border-color:var(--nd-accent,#2f7de1)}
`;

function injectCss() {
    if (document.getElementById("nd-lora-temporal-style")) return;
    const st = h("style"); st.id = "nd-lora-temporal-style"; st.textContent = CSS; document.head.appendChild(st);
}

function toggle(label, title, on, onChange) {
    const w = h("span", "nd-lt-tg"); w.title = title;
    const b = h("button", `nd-lt-sw${on ? " on" : ""}`); b.type = "button"; b.setAttribute("role", "switch"); b.setAttribute("aria-checked", String(on)); b.append(h("i"));
    const set = (v) => { b.classList.toggle("on", v); b.setAttribute("aria-checked", String(v)); };
    b.addEventListener("click", (e) => { e.preventDefault(); const v = !b.classList.contains("on"); set(v); onChange(v); });
    w.append(b, h("span", "nd-lt-lab", label));
    w.addEventListener("click", (e) => { if (e.target === w || e.target.classList?.contains("nd-lt-lab")) b.click(); });
    return { el: w, set };
}

// ◀ [value] ▶ : steps 0.05 (Shift: 0.25), hold to repeat, a number can be typed; `nullable`: an empty field means null (shown as `nullText`)
function stepper({ value: v0, min = 0, max = Infinity, step = 0.05, big = 0.25, nullable = false, nullText = "end", title = "", onChange }) {
    const box = h("span", "nd-lt-st"); if (title) box.title = title;
    const inp = h("input", "nd-lt-num"); inp.type = "text"; inp.inputMode = "decimal"; inp.spellcheck = false;
    const left = h("button", "nd-lt-arr", "◀"), right = h("button", "nd-lt-arr", "▶");
    left.type = right.type = "button";
    let cur = v0;
    const show = () => { inp.value = cur === null ? nullText : fmt(cur); };
    const norm = (v) => (v === null ? null : round3(clamp(Math.round(v / step) * step, min, max)));
    const set = (v, fire = true) => { cur = v; show(); if (fire) onChange(cur); };
    const bump = (d, shift) => { const base = cur === null ? (Number.isFinite(max) ? max : 0) : cur; set(norm(base + d * (shift ? big : step))); };
    const hold = (btn, dir) => {
        let t1 = null, t2 = null, shift = false;
        const stop = () => { clearTimeout(t1); clearInterval(t2); t1 = t2 = null; window.removeEventListener("pointerup", stop, true); };
        btn.addEventListener("pointerdown", (e) => {
            e.preventDefault(); e.stopPropagation(); shift = e.shiftKey; bump(dir, shift);
            t1 = setTimeout(() => { t2 = setInterval(() => bump(dir, shift), 70); }, 400);
            window.addEventListener("pointerup", stop, true);
        });
    };
    hold(left, -1); hold(right, 1);
    inp.addEventListener("change", () => {
        const raw = inp.value.trim().toLowerCase();
        if (nullable && (raw === "" || raw === "end" || raw === "∞" || raw === nullText.toLowerCase())) return set(null);
        const n = Number(raw.replace(",", "."));
        if (!Number.isFinite(n)) return show();
        set(round3(clamp(n, min, max)));
    });
    inp.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); bump(e.key === "ArrowUp" ? 1 : -1, e.shiftKey); }
        else if (e.key === "Enter") inp.blur();
    });
    inp.addEventListener("focus", () => inp.select());
    show();
    box.append(left, inp, right);
    return { el: box, set: (v) => { cur = v; show(); } };
}

/* ------------------------------------------------------------------ the panel with the timeline */

// opts: {entry, length, onChange(t, final), tr}   ->  {el, update(entry, length), dispose()}
// `onChange` gets the whole `t` (the fields this file does not know are kept); `final` is false while a bar is being dragged.
export function temporalEditor({ entry, length = 124, onChange, tr = (s) => s }) {
    injectCss();
    let t = normalizeTemporal(entry?.t) || { ...defaultTemporal(), on: false };
    let raw = entry?.t || null;
    let dur = durationOf(length);
    const root = h("div", "nd-lt");
    const top = h("div", "nd-lt-top");
    const tl = h("div", "nd-lt-tl");
    const list = h("div", "nd-lt-ranges");
    const add = h("button", "nd-lt-add", `+ ${tr("Range")}`); add.type = "button";
    const hint = h("div", "nd-lt-hint", tr("Drag a bar or its edges. Double-click an empty place to add a range. Shift: snap to the frames of the model."));
    let rows = [];

    const emit = (final = true) => { raw = mergeT(raw, t); onChange(raw, final); };

    // --- top row
    const tgOn = toggle(tr("Timed"), tr("Off: the LoRA works on the whole video, as in the plain stack"), t.on, (v) => {
        t.on = v;
        if (v && !t.ranges.length) t.ranges.push(newRange(0, Math.min(2, dur)));
        emit(); renderAll();
    });
    const tgAudio = toggle(tr("Audio"), tr("The same curve is applied to the sound of the video. Off: the LoRA does not touch the audio"), t.audio, (v) => { t.audio = v; emit(); });
    const tgShared = toggle(tr("Shared layers"), tr("Text, reference images and the modulation layers cannot be placed in time. On: they keep the full strength (the LoRA understands its trigger words, but leaks a little). Off: they stay without the LoRA (stricter, weaker)"), t.shared, (v) => { t.shared = v; emit(); });
    const outside = stepper({ value: t.base, min: 0, max: 1, title: tr("Share of the strength outside of the ranges (0 to 1)"), onChange: (v) => { t.base = v; emit(); paintTl(); } });
    const fld = h("span", "nd-lt-fld"); fld.append(h("span", "nd-lt-lab", tr("Outside")), outside.el);
    top.append(tgOn.el, tgAudio.el, tgShared.el, fld);

    // --- the timeline
    const pct = (sec) => `${clamp(sec / dur, 0, 1) * 100}%`;
    const secAt = (clientX) => { const r = tl.getBoundingClientRect(); return clamp((clientX - r.left) / (r.width || 1), 0, 1) * dur; };
    const snap = (sec, shift) => {
        if (!shift) return round3(Math.round(sec / 0.05) * 0.05);
        let best = 0, bd = Infinity;
        for (let k = 0; latentStart(k) / FPS <= dur + 0.2; k++) { const d = Math.abs(latentStart(k) / FPS - sec); if (d < bd) { bd = d; best = k; } }
        return round3(latentStart(best) / FPS);
    };
    function paintTl() {
        tl.textContent = "";
        const N = 200, pts = [];
        let top1 = 1;
        for (let i = 0; i <= N; i++) { const v = value(dur * i / N, t, 1); pts.push(v); if (v > top1) top1 = v; }
        const NS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", "0 0 1000 40"); svg.setAttribute("preserveAspectRatio", "none");
        const g = document.createElementNS(NS, "path"); g.setAttribute("class", "grid");
        let gd = "";
        for (let k = 0; latentStart(k) / FPS < dur; k++) { const x = (latentStart(k) / FPS / dur) * 1000; gd += `M${x.toFixed(1)} 30V40`; }
        g.setAttribute("d", gd);
        const c = document.createElementNS(NS, "path"); c.setAttribute("class", "curve");
        let d = "M0 40";
        pts.forEach((v, i) => { d += `L${(i / N * 1000).toFixed(1)} ${(38 - (v / top1) * 34).toFixed(1)}`; });
        d += "L1000 40Z";
        c.setAttribute("d", d);
        svg.append(g, c); tl.append(svg);
        const step = dur > 12 ? 2 : dur > 6 ? 1 : 0.5;
        for (let s = 0; s <= dur + 1e-6; s += step) {
            const tk = h("div", "nd-lt-tick"); tk.style.left = pct(s); tk.append(h("span", "", `${fmt(s)}${s === 0 ? " s" : ""}`)); tl.append(tk);
        }
        t.ranges.forEach((r, i) => {
            const end = r.e === null ? dur : Math.min(r.e, dur);
            const b = h("div", "nd-lt-rg"); b.dataset.i = String(i);
            b.style.left = pct(r.s); b.style.width = `${Math.max(0, clamp(end / dur, 0, 1) - clamp(r.s / dur, 0, 1)) * 100}%`;
            b.append(h("b", "", String(i + 1)));
            const l = h("div", "nd-lt-hd l"), rr = h("div", "nd-lt-hd r"); l.dataset.h = "l"; rr.dataset.h = "r";
            b.append(l, rr); tl.append(b);
        });
    }
    let drag = null;
    tl.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        const box = e.target.closest?.(".nd-lt-rg");
        if (!box) return;
        const i = +box.dataset.i, r = t.ranges[i];
        if (!r) return;
        drag = { i, mode: e.target.dataset?.h || "move", s: r.s, e: r.e, at: secAt(e.clientX), pid: e.pointerId };
        try { tl.setPointerCapture(e.pointerId); } catch {}
        e.preventDefault();
    });
    tl.addEventListener("pointermove", (e) => {
        if (!drag || e.pointerId !== drag.pid) return;
        const r = t.ranges[drag.i]; if (!r) return;
        const dx = secAt(e.clientX) - drag.at, minLen = 0.05;
        if (drag.mode === "l") {
            r.s = clamp(snap(drag.s + dx, e.shiftKey), 0, (drag.e === null ? dur : drag.e) - minLen);
        } else if (drag.mode === "r") {
            const e2 = snap((drag.e === null ? dur : drag.e) + dx, e.shiftKey);
            r.e = e2 >= dur - 0.025 ? null : clamp(e2, drag.s + minLen, dur);
        } else {
            const len = (drag.e === null ? dur : drag.e) - drag.s;
            const s2 = clamp(snap(drag.s + dx, e.shiftKey), 0, Math.max(0, dur - len));
            r.s = s2; r.e = drag.e === null ? null : round3(s2 + len);
            if (drag.e === null && s2 > drag.s) r.e = null;
        }
        paintTl(); paintRows(); emit(false);
    });
    const end = (e) => {
        if (!drag || (e && e.pointerId !== drag.pid)) return;
        try { tl.releasePointerCapture(drag.pid); } catch {}
        drag = null; emit(true); paintTl();
    };
    tl.addEventListener("pointerup", end); tl.addEventListener("pointercancel", end);
    tl.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        if (e.target.closest?.(".nd-lt-rg")) return;
        const s = clamp(snap(secAt(e.clientX), e.shiftKey), 0, Math.max(0, dur - 0.05));
        t.ranges.push(newRange(s, s + 1 >= dur ? null : round3(s + 1)));
        if (!t.on) { t.on = true; tgOn.set(true); }
        emit(); renderAll();
    });

    // --- the list of ranges
    function paintRows() {
        rows.forEach((row, i) => { const r = t.ranges[i]; if (!r) return; row.s.set(r.s); row.e.set(r.e); row.fi.set(r.fi); row.fo.set(r.fo); row.w.set(r.w); });
    }
    function buildRows() {
        list.textContent = ""; rows = [];
        t.ranges.forEach((r, i) => {
            const rowEl = h("div", "nd-lt-rrow");
            const fld = (label, title, opts) => {
                const f = h("span", "nd-lt-fld"); f.append(h("span", "nd-lt-lab", label));
                const s = stepper({ ...opts, title }); f.append(s.el); return { f, s };
            };
            const change = () => { emit(); paintTl(); };
            const a = fld(tr("Start"), tr("Seconds from the start of the video"), { value: r.s, min: 0, onChange: (v) => { const len = r.e === null ? null : Math.max(0.05, r.e - r.s); r.s = v; if (r.e !== null && r.e <= v) r.e = round3(v + len); paintRows(); change(); } });
            const b = fld(tr("End"), tr("Seconds from the start of the video; empty: to the end"), { value: r.e, min: 0, nullable: true, nullText: tr("end"), onChange: (v) => { r.e = v === null ? null : Math.max(v, r.s + 0.05); paintRows(); change(); } });
            const c = fld(tr("Fade in"), tr("Seconds the LoRA needs to reach its full strength; 0: a hard edge"), { value: r.fi, min: 0, onChange: (v) => { r.fi = v; change(); } });
            const d = fld(tr("Fade out"), tr("Seconds the LoRA needs to fade away; 0: a hard edge"), { value: r.fo, min: 0, onChange: (v) => { r.fo = v; change(); } });
            const w = fld(tr("Weight"), tr("Strength of this range as a multiplier (0 to 2)"), { value: r.w, min: 0, max: W_MAX, onChange: (v) => { r.w = v; change(); } });
            const del = h("button", "nd-lt-del", "✕"); del.type = "button"; del.title = tr("Remove the range");
            del.addEventListener("click", () => { t.ranges.splice(i, 1); emit(); renderAll(); });
            rowEl.append(h("b", "", String(i + 1)), a.f, b.f, c.f, d.f, w.f, del);
            list.append(rowEl);
            rows.push({ s: a.s, e: b.s, fi: c.s, fo: d.s, w: w.s });
        });
    }
    add.addEventListener("click", () => {
        const last = t.ranges[t.ranges.length - 1];
        let s = last ? (last.e === null ? Math.max(0, dur - 1) : last.e) : 0;
        if (s >= dur - 0.05) s = Math.max(0, dur - 1);
        t.ranges.push(newRange(round3(s), s + 1 >= dur ? null : round3(s + 1)));
        if (!t.on) { t.on = true; tgOn.set(true); }
        emit(); renderAll();
    });

    function renderAll() {
        root.classList.toggle("off", !t.on);
        buildRows(); paintTl();
    }
    root.append(top, tl, list, add, hint);
    renderAll();
    return {
        el: root,
        // the entry changed elsewhere (undo, another widget) or the length of the video did
        update(entry2, length2) {
            raw = entry2?.t || null;
            t = normalizeTemporal(raw) || { ...defaultTemporal(), on: false };
            dur = durationOf(length2 ?? length);
            tgOn.set(t.on); tgAudio.set(t.audio); tgShared.set(t.shared); outside.set(t.base);
            renderAll();
        },
        dispose() { drag = null; },
    };
}

/* ------------------------------------------------------------------ the panel with the information */

const GROUP_NAMES = { attn: "Attention", mlp: "Feed-forward", patch_proj: "Input projection", final: "Output", adaln: "Time modulation", refiner: "Text refiner", other: "Other" };
const FIXED_GROUPS = new Set(["adaln", "refiner"]);
const bytes = (n) => (n >= 1073741824 ? `${(n / 1073741824).toFixed(2)} GB` : `${(n / 1048576).toFixed(n >= 104857600 ? 0 : 1)} MB`);

// opts: {name, meta (the catalog entry), words, onWords(list), fetchApi, tr}   ->  {el}
export function infoPanel({ name, meta = null, words = [], onWords, fetchApi = null, tr = (s) => s }) {
    injectCss();
    const root = h("div", "nd-li");
    const kv = h("div", "nd-li-kv");
    const item = (k, v) => { const s = h("div"); s.append(h("span", "", `${k}: `), document.createTextNode(v)); kv.append(s); };
    const parts = String(name).split(/[\\/]/);
    item(tr("File"), parts.pop()); if (parts.length) item(tr("Folder"), parts.join("/"));
    if (meta?.size) item(tr("Size"), bytes(meta.size));
    if (meta?.base) item(tr("Made for"), [meta.base, meta.version].filter(Boolean).join(" · "));
    root.append(kv);
    const wl = h("div", "nd-lt-lab", tr("Trigger words (separated by commas)"));
    const inp = h("input", "nd-li-words"); inp.type = "text"; inp.value = (words || []).join(", "); inp.spellcheck = false;
    inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") inp.blur(); });
    inp.addEventListener("change", () => onWords?.(inp.value.split(",").map((x) => x.trim()).filter(Boolean)));
    root.append(wl, inp);
    const box = h("div", "nd-li-box"); root.append(box);
    if (fetchApi) {
        box.append(h("div", "nd-lt-hint", tr("Reading the file…")));
        fetchApi(`/nd/loras/h3info?name=${encodeURIComponent(name)}`).then((r) => (r.ok ? r.json() : null)).then((i) => {
            box.textContent = "";
            if (!i || i.format !== "safetensors") { box.append(h("div", "nd-lt-hint", tr("The details of this file cannot be read (only .safetensors files are inspected)."))); return; }
            const k = h("div", "nd-li-kv");
            const kvi = (a, b) => { const s = h("div"); s.append(h("span", "", `${a}: `), document.createTextNode(b)); k.append(s); };
            kvi(tr("Layers changed"), String(i.modules));
            if (i.rank) kvi(tr("Rank"), i.rank[0] === i.rank[1] ? String(i.rank[0]) : `${i.rank[0]}–${i.rank[1]}`);
            kvi(tr("Can work in time"), String(i.timeable));
            kvi(tr("Always on the whole video"), String(i.fixed));
            box.append(k);
            const chips = h("div", "nd-li-chips");
            Object.entries(i.groups || {}).forEach(([g, n]) => { const c = h("span", `nd-li-chip${FIXED_GROUPS.has(g) ? " whole" : ""}`, `${tr(GROUP_NAMES[g] || g)} · ${n}`); chips.append(c); });
            box.append(chips);
            if (i.match < 50) box.append(h("div", "nd-li-warn", tr("This LoRA does not look like a MiniMax H3 LoRA: most of its layers are not in the model.")));
            else if (i.fixed && i.fixed >= i.modules / 2) box.append(h("div", "nd-li-warn", tr("Most layers of this LoRA cannot be placed in time, so ranges will change it only a little.")));
            if (i.clip) box.append(h("div", "nd-lt-hint", tr("It also has parts for the text encoder; they work on the whole video.")));
        }).catch(() => { box.textContent = ""; });
    }
    return { el: root };
}

/* ------------------------------------------------------------------ for other interfaces */

const api = { version: VERSION, FPS, alignFrames, durationOf, latentCount, latentStart, latentCenter, normalizeTemporal, isTimed, ramp, value, mergeT, defaultTemporal, newRange, temporalEditor, infoPanel };
if (typeof window !== "undefined" && !(window.ndLoraTemporal && window.ndLoraTemporal.version >= VERSION)) window.ndLoraTemporal = api;
