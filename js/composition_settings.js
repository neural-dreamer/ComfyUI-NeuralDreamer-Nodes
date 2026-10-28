// Neural Dreamer Nodes — ND Composition Settings
// The camera of the picture on the same builder engine as the Character, Outfit and Pose Builders: height, the view around
// the subject, tilt, framing, lens and where the subject sits in the frame; data in js/composition_settings.json.
// Two modes: a single shot, or a collage (a character sheet): up to 8 panels on one canvas, each with its own camera and pose.
// The state is one JSON in the hidden "state" widget (see nd_nodes/composition_settings.py):
//   single shot: values / levels / pools are the camera;
//   collage: panels[i].values / levels / pools are the cameras, the sheet (style, background, borders) is in values.
// While a collage is open, values / levels / pools hold the camera of the active panel (sync() writes it back to the panel).

import { defineBuilder } from "./character_builder.js";
import { ZONE_ICONS, OPTION_ICONS } from "./composition_icons.js";
import { el, toast, injectStyleOnce } from "./nd_common.js";
import { inputSource, packFieldSource, packOf } from "./params.js";

const MAX_PANELS = 8;
const GRIDS = [2, 3, 4, 6, 8, 12];
const ASPECTS = ["1:1", "4:3", "3:2", "16:9", "21:9", "3:4", "2:3", "9:16"];
const LONG_SIDE = 1536;
const POSE_FIELDS = Array.from({ length: MAX_PANELS }, (_, i) => (i ? `pose_${i + 1}` : "pose"));
const ORBIT = "camera.orbit";

const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const clone = (x) => JSON.parse(JSON.stringify(x ?? null));
const isSheet = (k) => k.startsWith("sheet.");
const pick = (obj, keep) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => keep(k)));
const sheetOf = (obj) => pick(obj, isSheet);
const cameraOf = (obj) => pick(obj, (k) => !isSheet(k));
const num = (v, lo, hi, d) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
const r4 = (v) => Math.round(v * 10000) / 10000;

/* -------------------------------------------------------------------- sizes */

export function sizeOfAspect(aspect) {
    const m = /^(\d+(?:\.\d+)?)\s*[:/x]\s*(\d+(?:\.\d+)?)$/.exec(String(aspect || "").trim());
    const a = m ? Number(m[1]) : 3, b = m ? Number(m[2]) : 2;
    const q = (v) => Math.max(16, Math.round(v / 16) * 16);
    return a >= b ? [LONG_SIDE, q((LONG_SIDE * b) / a)] : [q((LONG_SIDE * a) / b), LONG_SIDE];
}

/* ---------------------------------------------------------------- templates */

// rects are [x, y, w, h] in fractions of the canvas; values set the view of the panel
const row = (n, vals) => Array.from({ length: n }, (_, i) => ({ rect: [i / n, 0, 1 / n, 1], values: vals[i] || {} }));
export const TEMPLATES = [
    { id: "turn3", label: "3 in a row: front, side, back", panels: row(3, [{ [ORBIT]: "front" }, { [ORBIT]: "side_l" }, { [ORBIT]: "back" }]) },
    { id: "turn5", label: "5 turnaround views", panels: row(5, [{ [ORBIT]: "front" }, { [ORBIT]: "front34_l" }, { [ORBIT]: "side_l" }, { [ORBIT]: "back34_l" }, { [ORBIT]: "back" }]) },
    { id: "grid4", label: "2 × 2 grid", panels: [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]].map(([x, y]) => ({ rect: [x, y, 0.5, 0.5], values: {} })) },
    { id: "big4", label: "1 large + 4 small", panels: [{ rect: [0, 0, 0.5, 1], values: { [ORBIT]: "front" } }, ...[[0.5, 0], [0.75, 0], [0.5, 0.5], [0.75, 0.5]].map(([x, y]) => ({ rect: [x, y, 0.25, 0.5], values: {} }))] },
    { id: "face", label: "Full body + face close-up", panels: [{ rect: [0, 0, 0.6, 1], values: { "framing.shot": "full" } }, { rect: [0.6, 0, 0.4, 0.5], values: { "framing.shot": "portrait" } }, { rect: [0.6, 0.5, 0.4, 0.5], values: { "framing.shot": "face" } }] },
    { id: "inset", label: "Large + inset", panels: [{ rect: [0, 0, 1, 1], values: {} }, { rect: [0.68, 0.62, 0.3, 0.34], values: { "framing.shot": "face" } }] },
    { id: "pair", label: "Front and back", panels: row(2, [{ [ORBIT]: "front" }, { [ORBIT]: "back" }]) },
];

/* -------------------------------------------------------------------- state */

function cleanRect(r) {
    if (!Array.isArray(r) || r.length !== 4) return [0, 0, 1, 1];
    let [x, y, w, h] = r.map((v) => num(v, 0, 1, 0));
    w = Math.max(w, 0.05);
    h = Math.max(h, 0.05);
    x = Math.min(x, 1 - w);
    y = Math.min(y, 1 - h);
    return [r4(x), r4(y), r4(w), r4(h)];
}
const newId = (panels) => {
    let i = panels.length + 1;
    while (panels.some((p) => p.id === `p${i}`)) i++;
    return `p${i}`;
};
const panelOf = (st, id) => (st.panels || []).find((p) => p.id === id) || null;

function normalize(st) {
    st.kind = st.kind === "collage" ? "collage" : "single";
    st.use_pose_camera = st.use_pose_camera !== false;
    const L = isObj(st.layout) ? st.layout : {};
    st.layout = {
        aspect: typeof L.aspect === "string" ? L.aspect : "3:2",
        width: Math.round(num(L.width, 0, 16384, 0)),
        height: Math.round(num(L.height, 0, 16384, 0)),
        grid: GRIDS.includes(Number(L.grid)) ? Number(L.grid) : 6,
        snap: L.snap !== false,
        captions: L.captions !== false,
        percent: !!L.percent,
    };
    if (!(st.layout.width && st.layout.height)) [st.layout.width, st.layout.height] = sizeOfAspect(st.layout.aspect);
    const panels = [];
    (Array.isArray(st.panels) ? st.panels : []).slice(0, MAX_PANELS).forEach((p, i) => {
        if (!isObj(p)) return;
        let id = String(p.id || `p${i + 1}`).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 12) || `p${i + 1}`;
        if (panels.some((x) => x.id === id)) id = newId(panels);
        panels.push({
            id,
            rect: cleanRect(p.rect),
            pose: Math.round(num(p.pose, 1, MAX_PANELS, 1)),
            caption: String(p.caption || "").replace(/\s+/g, " ").trim().slice(0, 40),
            z: Math.round(num(p.z, -100, 100, i)),
            values: isObj(p.values) ? p.values : {},
            pools: isObj(p.pools) ? p.pools : {},
            levels: isObj(p.levels) ? p.levels : {},
        });
    });
    st.panels = panels;
    if (st.kind === "collage" && !panels.length) st.kind = "single";
    st.active = panels.some((p) => p.id === st.active) ? st.active : panels[0]?.id || "";
    if (!isObj(st.single)) st.single = {};
    for (const k of ["values", "pools", "levels"]) if (!isObj(st.single[k])) st.single[k] = {};
    if (st.kind === "collage" && st.mode === "edit") st.mode = "create"; // Edit is for a single shot
}

// writes the camera of the active panel back to the panel
function sync(st) {
    if (st.kind !== "collage") return;
    const p = panelOf(st, st.active);
    if (!p) return;
    p.values = clone(cameraOf(st.values));
    p.pools = clone(cameraOf(st.pools));
    p.levels = clone(st.levels);
}
// puts the camera of the active panel in values / levels / pools (the sheet stays)
function load(st) {
    const p = panelOf(st, st.active);
    st.values = { ...sheetOf(st.values), ...clone(p?.values || {}) };
    st.pools = { ...sheetOf(st.pools), ...clone(p?.pools || {}) };
    st.levels = clone(p?.levels || {});
}
function switchPanel(st, id) {
    if (!panelOf(st, id) || st.active === id) return;
    sync(st);
    st.active = id;
    load(st);
}
function applyTemplate(st, t) {
    st.panels = t.panels.slice(0, MAX_PANELS).map((p, i) => ({
        id: `p${i + 1}`, rect: cleanRect(p.rect), pose: 1, caption: "", z: i,
        values: clone(p.values), pools: {}, levels: {},
    }));
    st.active = st.panels[0].id;
    load(st);
}
function setKind(st, kind) {
    if (kind === st.kind) return;
    sync(st);
    if (kind === "collage") {
        st.single = { values: clone(cameraOf(st.values)), pools: clone(cameraOf(st.pools)), levels: clone(st.levels) };
        st.kind = "collage";
        if (!st.panels.length) applyTemplate(st, TEMPLATES[0]);
        if (!panelOf(st, st.active)) st.active = st.panels[0].id;
        if (st.mode === "edit") st.mode = "create";
        load(st);
    } else {
        st.kind = "single";
        st.values = { ...sheetOf(st.values), ...clone(st.single.values) };
        st.pools = { ...sheetOf(st.pools), ...clone(st.single.pools) };
        st.levels = clone(st.single.levels);
    }
}

/* ------------------------------------------------- Pose Builders on the input */

const classOf = (n) => n?.comfyClass || n?.type;
function builderOf(src, depth = 0) {
    if (!src || depth > 8) return null;
    if (src.node?.ndCB) return src.node;
    if (classOf(src.node) === "NDUnpack") return builderOf(inputSource(src.node, "params"), depth + 1);
    return null;
}
// [Pose Builder or null] for pose, pose_2 ... up to the last one connected
function posesOf(node) {
    const pack = packOf(node);
    const out = [];
    if (pack) for (const name of POSE_FIELDS) {
        const b = builderOf(packFieldSource(pack, name));
        out.push(b?.ndCB?.isPose ? b : null);
    }
    while (out.length && !out[out.length - 1]) out.pop();
    return out;
}
const poseTitle = (b, i) => `${b?.title || b?.type || "Pose Builder"}${b?.ndCB?.presetLabel?.() ? ` · ${b.ndCB.presetLabel()}` : ""}${i != null ? "" : ""}`;

// the width and height of the ND Resolution (or any node with width / height widgets) wired to the resolution pin
function resolutionOf(node) {
    const pack = packOf(node);
    const src = pack ? packFieldSource(pack, "resolution") : null;
    const n = src?.node;
    if (!n) return { wired: false, size: null };
    let size = n.ndRes?.size?.() || null;
    if (!size) {
        const w = n.widgets?.find((x) => x.name === "width")?.value, h = n.widgets?.find((x) => x.name === "height")?.value;
        if (Number(w) > 0 && Number(h) > 0) size = [Number(w), Number(h)];
    }
    return { wired: true, size };
}

/* ------------------------------------------------------- lock by the pose */

// Which way the main pose faces the camera decides the views: the camera cannot be behind a pose that looks at it.
const EDIT_NOTE = "Edit is for a single shot only.";
const FACING_NOTE = {
    camera: "The pose faces the camera: only the front view fits.",
    three_q: "The pose is turned three-quarters to the camera: only 3/4 views fit.",
    profile: "The pose is in profile: only side views fit.",
    back: "The pose faces away from the camera: only back views fit.",
};
let lockCache = { t: 0, node: null, key: "", val: null };
function lockFor(ctx, pid) {
    if (pid !== ORBIT) return null;
    const st = ctx.st;
    // only the main panel is locked: panels[0] of a collage, or the single shot
    if (st.kind === "collage" && st.active !== st.panels[0]?.id) return null;
    const now = performance.now();
    const key = `${st.kind}|${st.kind === "collage" ? st.panels[0]?.pose : 1}`;
    if (lockCache.node === ctx.node && lockCache.key === key && now - lockCache.t < 60) return lockCache.val;
    const poses = posesOf(ctx.node);
    const idx = st.kind === "collage" ? st.panels[0]?.pose || 1 : 1;
    const b = poses[idx - 1] || poses[0] || null;
    const facing = b?.ndCB?.facing?.() || null;
    let val = null;
    const p = ctx.param(ORBIT);
    if (facing && p) {
        const allowed = new Set(p.options.filter((o) => (o.facing_fits || []).includes(facing)).map((o) => o.id));
        if (allowed.size) {
            const only = allowed.size === 1 ? [...allowed][0] : null;
            const degOf = (id) => p.opt.get(id)?.deg ?? 0;
            const near = (v) => {
                const d0 = degOf(v);
                const dist = (id) => { const d = Math.abs(degOf(id) - d0) % 360; return Math.min(d, 360 - d); };
                return [...allowed].sort((a, c) => dist(a) - dist(c))[0];
            };
            val = {
                allowed,
                auto: only,
                reason: ctx.tr(FACING_NOTE[facing] || ""),
                fix: (v) => (v == null ? only : allowed.has(v) || v === "*" ? v : p.opt.has(v) ? near(v) : v),
            };
        }
    }
    lockCache = { t: now, node: ctx.node, key, val };
    return val;
}

/* -------------------------------------------------------- the auto caption */

function autoCaption(ctx, values) {
    const cap = (pid) => { const v = values?.[pid]; const o = typeof v === "string" ? ctx.param(pid)?.opt.get(v) : null; return o?.cap || ""; };
    const first = cap(ORBIT) || cap("viewpoint.special") || cap("camera.height");
    const shot = cap("framing.shot");
    const parts = first ? [first] : [];
    if (shot && (!first || values["framing.shot"] !== "full")) parts.push(shot);
    return parts.join(" / ");
}

/* ------------------------------------------------------------------ toolbar */

function makeToolbar(ctx) {
    const { tr } = ctx;
    const box = el("div", "nd-cs-bar");
    const seg = el("div", "nd-cb-seg nd-cs-kind");
    const kinds = [["single", "Single shot", "One picture with one camera. Edit mode works here."], ["collage", "Collage", "Several panels on one picture, each with its own camera and pose (a character sheet, a collage)."]].map(([id, label, hint]) => {
        const b = ctx.btn("nd-cb-segbtn", label, hint);
        b.dataset.kind = id;
        b.onclick = () => { setKind(ctx.st, id); ctx.commit(); };
        seg.append(b);
        return b;
    });
    const hintLab = el("label", "nd-cb-check");
    const hintBox = el("input");
    hintBox.type = "checkbox";
    ctx.tipEn(hintLab, "Camera from pose", "A ready-made pose of the Pose Builder suggests a camera (height, view, framing). It fills what you left unset; what you set stays. Turn it off to use only your own settings.");
    hintLab.append(hintBox, ctx.txt("span", null, "Camera from pose"));
    hintBox.onchange = () => { ctx.st.use_pose_camera = hintBox.checked; ctx.save(); };
    const strip = el("div", "nd-cs-strip");
    const resBtn = ctx.btn("nd-cb-btn small", "Update resolution", "Takes the size of the picture from the Resolution input: the width and height of the ND Resolution node. If it is not known yet, run the workflow once.");
    resBtn.onclick = () => updateResolution(ctx, true);
    box.append(seg, hintLab, strip, resBtn);
    return {
        el: box,
        update() {
            const st = ctx.st;
            for (const b of kinds) b.classList.toggle("on", b.dataset.kind === st.kind);
            hintBox.checked = !!st.use_pose_camera;
            strip.replaceChildren();
            strip.style.display = st.kind === "collage" ? "" : "none";
            if (st.kind === "collage") {
                const poses = posesOf(ctx.node);
                st.panels.forEach((p, i) => {
                    const b = ctx.btn(`nd-cb-chip small${p.id === st.active ? " on" : ""}`, String(i + 1), null, true);
                    const cap = p.caption || autoCaption(ctx, p.id === st.active ? st.values : p.values) || tr("Panel");
                    ctx.tip(b, `${tr("Panel")} ${i + 1}`, `${cap}${poses.length > 1 ? ` · ${tr("Pose")} ${p.pose}` : ""}`);
                    b.onclick = () => { switchPanel(st, p.id); ctx.commit(); };
                    strip.append(b);
                });
            }
            const { wired } = resolutionOf(ctx.node);
            resBtn.style.display = wired ? "" : "none";
        },
    };
}

// the size of the picture: from the Resolution input when it is known, otherwise from the aspect ratio
function updateResolution(ctx, say = false) {
    const st = ctx.st;
    const { wired, size } = resolutionOf(ctx.node);
    if (!wired) { if (say) toast("info", "ND Composition Settings", ctx.tr("Connect an ND Resolution to the Resolution input.")); return false; }
    if (!size) { if (say) toast("info", "ND Composition Settings", ctx.tr("Run the workflow once: the resolution arrives by itself.")); return false; }
    st.layout.width = size[0];
    st.layout.height = size[1];
    ctx.commit();
    return true;
}

/* ------------------------------------------------------------- the Layout zone */

const CSS = `
.nd-cs-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.nd-cs-strip{display:flex;gap:3px}
.nd-cs-strip .nd-cb-chip{min-width:22px;padding:0 6px;justify-content:center}
.nd-cl{display:flex;flex-direction:column;gap:8px}
.nd-cl-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.nd-cl-size{opacity:.75;font-variant-numeric:tabular-nums}
.nd-cl-select{height:22px;border:1px solid var(--nd-line);border-radius:4px;background:var(--comfy-input-bg,#222);color:inherit;font:inherit;padding:0 4px}
.nd-cl-canvas{position:relative;width:100%;max-width:520px;margin:0 auto;border:1px solid var(--nd-line);border-radius:4px;background:var(--comfy-input-bg,#1b1b1b);overflow:hidden;touch-action:none}
.nd-cl-grid{position:absolute;inset:0;pointer-events:none}
.nd-cl-panel{position:absolute;box-sizing:border-box;border:1.5px solid var(--nd-line);background:rgba(120,140,170,.14);border-radius:2px;cursor:grab;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:11px;text-align:center;padding:2px}
.nd-cl-panel.sel{border-color:var(--nd-accent);background:rgba(47,125,225,.2);cursor:grab}
.nd-cl-panel .num{font-weight:700;font-size:15px;line-height:1}
.nd-cl-panel .cap{opacity:.85;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nd-cl-panel .pose{position:absolute;right:3px;top:2px;font-size:10px;opacity:.8;border:1px solid var(--nd-line);border-radius:3px;padding:0 3px}
.nd-cl-h{position:absolute;width:9px;height:9px;background:var(--nd-accent);border-radius:2px;display:none;z-index:2}
.nd-cl-panel.sel .nd-cl-h{display:block}
.nd-cl-tools{display:flex;gap:4px;flex-wrap:wrap}
.nd-cl-edit{display:flex;flex-direction:column;gap:6px;padding:6px;border:1px solid var(--nd-line);border-radius:5px}
.nd-cl-edit input[type=text]{height:22px;border:1px solid var(--nd-line);border-radius:4px;background:var(--comfy-input-bg,#222);color:inherit;font:inherit;padding:0 6px}
.nd-cl-menu{display:flex;flex-direction:column;gap:2px;padding:4px;border:1px solid var(--nd-line);border-radius:5px;background:var(--comfy-menu-bg,#2a2a2a)}
`;

const HANDLES = [["nw", 0, 0], ["n", 0.5, 0], ["ne", 1, 0], ["e", 1, 0.5], ["se", 1, 1], ["s", 0.5, 1], ["sw", 0, 1], ["w", 0, 0.5]];

function layoutZone(ctx) {
    const st = ctx.st;
    const { tr } = ctx;
    const L = st.layout;
    const root = el("div", "nd-cl");
    const poses = posesOf(ctx.node);

    // size, grid, switches
    const top = el("div", "nd-cl-row");
    const aspect = el("select", "nd-cl-select");
    for (const a of ASPECTS) aspect.append(new Option(a, a));
    aspect.value = ASPECTS.includes(L.aspect) ? L.aspect : "3:2";
    ctx.tipEn(aspect, "Aspect ratio", "The shape of the picture. Used when no Resolution is wired in.");
    aspect.onchange = () => { L.aspect = aspect.value; [L.width, L.height] = sizeOfAspect(L.aspect); ctx.commit(); };
    const { wired } = resolutionOf(ctx.node);
    aspect.disabled = wired;
    const size = el("span", "nd-cl-size", `${L.width} × ${L.height}`);
    const upd = ctx.btn("nd-cb-btn small", "Update resolution", "Takes the size of the picture from the Resolution input: the width and height of the ND Resolution node. If it is not known yet, run the workflow once.");
    upd.style.display = wired ? "" : "none";
    upd.onclick = () => updateResolution(ctx, true);
    const grid = el("select", "nd-cl-select");
    for (const g of GRIDS) grid.append(new Option(`${g} × ${g}`, String(g)));
    grid.value = String(L.grid);
    ctx.tipEn(grid, "Grid", "The grid the panels snap to when you move or resize them. Hold Alt to move without snapping.");
    grid.onchange = () => { L.grid = Number(grid.value); ctx.commit(); };
    const check = (label, hint, key) => {
        const l = el("label", "nd-cb-check");
        const i = el("input");
        i.type = "checkbox";
        i.checked = !!L[key];
        i.onchange = () => { L[key] = i.checked; ctx.commit(); };
        ctx.tipEn(l, label, hint);
        l.append(i, ctx.txt("span", null, label));
        return l;
    };
    top.append(aspect, size, upd, el("span", "nd-cb-grow"), grid,
        check("Snap", "Panels snap to the grid.", "snap"),
        check("Captions", "Every panel in the picture carries a small caption that names its view (FRONT VIEW, SIDE VIEW...). Models draw text best on short captions.", "captions"),
        check("Percent", "Adds the position in percent to every panel (x 0-50 %, y 0-100 %). Strong models follow it; weak ones ignore it.", "percent"));

    // the canvas
    const cv = el("div", "nd-cl-canvas");
    cv.style.aspectRatio = `${L.width} / ${L.height}`;
    const gridEl = el("div", "nd-cl-grid");
    const lines = [];
    for (let i = 1; i < L.grid; i++) {
        const p = `${(i / L.grid) * 100}%`;
        lines.push(`<line x1="${p}" y1="0" x2="${p}" y2="100%"/>`, `<line x1="0" y1="${p}" x2="100%" y2="${p}"/>`);
    }
    gridEl.innerHTML = `<svg width="100%" height="100%" stroke="currentColor" stroke-opacity=".12" stroke-width="1">${lines.join("")}</svg>`;
    cv.append(gridEl);

    const place = (node, rect) => {
        node.style.left = `${rect[0] * 100}%`;
        node.style.top = `${rect[1] * 100}%`;
        node.style.width = `${rect[2] * 100}%`;
        node.style.height = `${rect[3] * 100}%`;
    };
    const order = [...st.panels].sort((a, b) => a.z - b.z);
    const nodes = new Map();
    order.forEach((p) => {
        const i = st.panels.indexOf(p);
        const d = el("div", `nd-cl-panel${p.id === st.active ? " sel" : ""}`);
        d.dataset.id = p.id;
        d.style.zIndex = String(p.id === st.active ? 1000 : 10 + p.z + 100); // the selected panel is on top while it is edited
        place(d, p.rect);
        const vals = p.id === st.active ? st.values : p.values;
        const cap = p.caption || autoCaption(ctx, vals) || "";
        d.append(el("span", "num", String(i + 1)), el("span", "cap", cap));
        ctx.tip(d, `${tr("Panel")} ${i + 1}${cap ? ` · ${cap}` : ""}`, tr("Click to select, drag to move, drag the corners to resize. Double-click the name to type your own caption."));
        if (poses.length > 1) d.append(el("span", "pose", `P${p.pose}`));
        for (const [h, hx, hy] of HANDLES) {
            const hd = el("div", "nd-cl-h");
            hd.dataset.h = h;
            hd.style.left = `calc(${hx * 100}% - ${hx * 9}px)`; // inside the panel: its edge clips what sticks out
            hd.style.top = `calc(${hy * 100}% - ${hy * 9}px)`;
            hd.style.cursor = `${h}-resize`;
            d.append(hd);
        }
        cv.append(d);
        nodes.set(p.id, d);
    });

    // move and resize with the grid
    const stepOf = () => 1 / L.grid;
    const snap = (v, on) => (on ? Math.round(v / stepOf()) * stepOf() : Math.round(v * 200) / 200);
    let drag = null;
    cv.addEventListener("pointerdown", (e) => {
        const d = e.target.closest?.(".nd-cl-panel");
        if (!d || e.button !== 0) return;
        const p = panelOf(st, d.dataset.id);
        if (!p) return;
        if (e.target.closest(".nd-cap-edit")) return;
        if (p.id !== st.active) {
            switchPanel(st, p.id);
            ctx.commit();
            return; // the canvas is redrawn; the next press drags
        }
        e.preventDefault();
        const h = e.target.dataset?.h || "";
        drag = { id: p.id, h, x: e.clientX, y: e.clientY, rect: [...p.rect], box: cv.getBoundingClientRect(), moved: false };
        d.setPointerCapture?.(e.pointerId);
    });
    cv.addEventListener("pointermove", (e) => {
        if (!drag) return;
        const p = panelOf(st, drag.id);
        const dx = (e.clientX - drag.x) / drag.box.width, dy = (e.clientY - drag.y) / drag.box.height;
        if (Math.abs(dx) + Math.abs(dy) > 0.002) drag.moved = true;
        const on = L.snap && !e.altKey;
        let [x, y, w, h] = drag.rect;
        const min = on ? stepOf() : 0.05;
        if (!drag.h) {
            x = snap(x + dx, on);
            y = snap(y + dy, on);
            x = Math.min(Math.max(0, x), 1 - w);
            y = Math.min(Math.max(0, y), 1 - h);
        } else {
            let x0 = x, y0 = y, x1 = x + w, y1 = y + h;
            if (drag.h.includes("w")) x0 = snap(x + dx, on);
            if (drag.h.includes("e")) x1 = snap(x + w + dx, on);
            if (drag.h.includes("n")) y0 = snap(y + dy, on);
            if (drag.h.includes("s")) y1 = snap(y + h + dy, on);
            x0 = Math.max(0, Math.min(x0, x1 - min)); y0 = Math.max(0, Math.min(y0, y1 - min));
            x1 = Math.min(1, Math.max(x1, x0 + min)); y1 = Math.min(1, Math.max(y1, y0 + min));
            x = x0; y = y0; w = x1 - x0; h = y1 - y0;
        }
        p.rect = cleanRect([x, y, w, h]);
        place(nodes.get(p.id), p.rect);
    });
    const endDrag = () => {
        if (!drag) return;
        const moved = drag.moved;
        drag = null;
        if (moved) ctx.commit();
    };
    cv.addEventListener("pointerup", endDrag);
    cv.addEventListener("pointercancel", endDrag);

    // keyboard: arrows move the selected panel by one grid step
    cv.tabIndex = 0;
    cv.addEventListener("keydown", (e) => {
        const p = panelOf(st, st.active);
        const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (!p || !dir) return;
        e.preventDefault();
        e.stopPropagation();
        const s = stepOf();
        p.rect = cleanRect([p.rect[0] + dir[0] * s, p.rect[1] + dir[1] * s, p.rect[2], p.rect[3]]);
        ctx.commit();
    });

    // double click on a panel: its own caption
    cv.addEventListener("dblclick", (e) => {
        const d = e.target.closest?.(".nd-cl-panel");
        const p = d && panelOf(st, d.dataset.id);
        if (!p) return;
        const inp = el("input");
        inp.type = "text";
        inp.className = "nd-cap-edit";
        inp.maxLength = 40;
        inp.value = p.caption || autoCaption(ctx, p.id === st.active ? st.values : p.values);
        const capEl = d.querySelector(".cap");
        capEl.replaceWith(inp);
        inp.focus();
        inp.select();
        const done = (ok) => { if (ok) p.caption = inp.value.replace(/\s+/g, " ").trim().slice(0, 40); ctx.commit(); };
        inp.onkeydown = (ev) => { ev.stopPropagation(); if (ev.key === "Enter") done(true); else if (ev.key === "Escape") done(false); };
        inp.onblur = () => done(true);
    });

    // tools
    const tools = el("div", "nd-cl-tools");
    const tool = (label, hint, fn, disabled) => {
        const b = ctx.btn("nd-cb-btn small", label, hint);
        b.disabled = !!disabled;
        b.onclick = fn;
        tools.append(b);
        return b;
    };
    const cur = panelOf(st, st.active);
    tool("+ Panel", "Add a panel (up to 8) in a free place.", () => {
        sync(st);
        const rect = freeSpot(st);
        const p = { id: newId(st.panels), rect, pose: 1, caption: "", z: Math.max(-1, ...st.panels.map((q) => q.z)) + 1, values: {}, pools: {}, levels: {} };
        st.panels.push(p);
        st.active = p.id;
        load(st);
        ctx.commit();
    }, st.panels.length >= MAX_PANELS);
    tool("Duplicate", "Copy the selected panel with its camera.", () => {
        if (!cur) return;
        sync(st);
        const p = clone(cur);
        p.id = newId(st.panels);
        p.rect = cleanRect([cur.rect[0] + stepOf(), cur.rect[1] + stepOf(), cur.rect[2], cur.rect[3]]);
        p.z = Math.max(...st.panels.map((q) => q.z)) + 1;
        st.panels.push(p);
        st.active = p.id;
        load(st);
        ctx.commit();
    }, !cur || st.panels.length >= MAX_PANELS);
    tool("Delete", "Remove the selected panel.", () => {
        if (!cur || st.panels.length <= 1) return;
        st.panels = st.panels.filter((q) => q.id !== cur.id);
        st.active = st.panels[0].id;
        load(st);
        ctx.commit();
    }, !cur || st.panels.length <= 1);
    tool("Forward", "Bring the selected panel in front of the others (for panels that overlap).", () => { if (cur) { cur.z = Math.max(...st.panels.map((q) => q.z)) + 1; ctx.commit(); } }, !cur);
    tool("Back", "Send the selected panel behind the others.", () => { if (cur) { cur.z = Math.min(...st.panels.map((q) => q.z)) - 1; ctx.commit(); } }, !cur);
    const tpl = tool("Templates", "Start from a ready-made layout. It replaces the panels (their cameras too).", () => { menu.style.display = menu.style.display === "none" ? "" : "none"; });
    tool("Clear", "Keep one panel only.", () => {
        if (!cur) return;
        st.panels = [cur];
        cur.rect = [0, 0, 1, 1];
        ctx.commit();
    }, st.panels.length <= 1);
    const menu = el("div", "nd-cl-menu");
    menu.style.display = "none";
    for (const t of TEMPLATES) {
        const b = ctx.btn("nd-cb-btn small", t.label, "Use this layout.");
        b.onclick = () => { applyTemplate(st, t); ctx.commit(); };
        menu.append(b);
    }

    // the selected panel: caption and pose
    const edit = el("div", "nd-cl-edit");
    if (cur) {
        const line = el("div", "nd-cl-row");
        const idx = st.panels.indexOf(cur) + 1;
        line.append(ctx.txt("span", "nd-cb-lab", "Caption"));
        const capIn = el("input");
        capIn.type = "text";
        capIn.maxLength = 40;
        capIn.dataset.i18nPh = "auto";
        capIn.placeholder = autoCaption(ctx, st.values) || tr("auto");
        capIn.value = cur.caption || "";
        capIn.oninput = () => { cur.caption = capIn.value.replace(/\s+/g, " ").trim().slice(0, 40); ctx.save(); const c = nodes.get(cur.id)?.querySelector(".cap"); if (c) c.textContent = cur.caption || capIn.placeholder; };
        ctx.tipEn(capIn, "Caption", "The text in the picture under this panel. Empty: it names the view (FRONT VIEW, SIDE VIEW...).");
        line.append(capIn, el("span", "nd-cb-grow"), el("span", "nd-cl-size", `${tr("Panel")} ${idx}${idx === 1 ? ` · ${tr("main")}` : ""}`));
        edit.append(line);
        if (poses.length > 1) {
            const pl = el("div", "nd-cl-row");
            pl.append(ctx.txt("span", "nd-cb-lab", "Pose from"));
            poses.forEach((b, i) => {
                const c = ctx.btn(`nd-cb-chip small${cur.pose === i + 1 ? " on" : ""}`, `${i + 1}`, null, true);
                ctx.tip(c, `${tr("Pose")} ${i + 1}`, b ? poseTitle(b) : tr("Not connected."));
                c.onclick = () => { cur.pose = i + 1; ctx.commit(); };
                pl.append(c);
            });
            edit.append(pl);
        } else if (poses.length === 0) {
            edit.append(ctx.txt("div", "nd-cb-tnote", "No Pose Builder is connected: the panels describe the camera only."));
        }
        if (idx === 1) edit.append(ctx.txt("div", "nd-cb-tnote", "Panel 1 is the main panel: the way its pose faces the camera limits its views."));
    }
    root.append(top, cv, tools, menu, edit);
    return root;
}

// a free place for a new panel: the first grid cell block that nothing covers
function freeSpot(st) {
    const g = st.layout.grid, s = 1 / g;
    const free = (r) => st.panels.every((p) => r[0] + r[2] <= p.rect[0] + 1e-6 || r[0] >= p.rect[0] + p.rect[2] - 1e-6 || r[1] + r[3] <= p.rect[1] + 1e-6 || r[1] >= p.rect[1] + p.rect[3] - 1e-6);
    for (const [cw, ch] of [[Math.max(2, Math.round(g / 3)), Math.max(2, Math.round(g / 2))], [2, 2], [1, 2], [1, 1]]) {
        for (let cy = 0; cy + ch <= g; cy++) for (let cx = 0; cx + cw <= g; cx++) {
            const r = [cx * s, cy * s, cw * s, ch * s];
            if (free(r)) return cleanRect(r);
        }
    }
    return cleanRect([0.66, 0.62, 0.3, 0.34]); // nothing is free: an inset over the others
}

/* ------------------------------------------------------------------ the node */

defineBuilder({
    node: "NDCompositionSettings",
    title: "Composition Settings",
    i18n: "composition",
    extension: "NeuralDreamer.Nodes.CompositionSettings",
    schemaFile: "composition_settings.json",
    presetFile: "neural_dreamer/composition_presets.json",
    defaultZone: "quick",
    raceParam: null,
    contentPart: null,
    zoneIcons: ZONE_ICONS,
    optionIcons: OPTION_ICONS,
    levels: true,
    extraZones: ["quick"],
    // choosing a camera preset clears the parameters of these parts first
    macroResets: ["camera", "viewpoint", "framing", "placement", "lens"],
    editStyle: false,
    editSubject: false,
    editSync: false,
    editNote: "Edit gives instructions for an image-editing model: only the camera you set is changed (height, view, framing...). With a Pose Builder in Edit mode connected, its pose instruction joins the text and one 'keep the rest' sentence closes it.",
    toggle: {
        key: "explicit",
        label: "Explicit",
        title: "Shows the explicit framings (breasts, crotch) and viewpoints. While it is off they are hidden and not used, and random never picks them.",
        note: "Shows the explicit framings and viewpoints; while it is off none of them are used. For fictional adult (18+) characters only. Do not use it to depict real people.",
    },
    stateHooks: { normalize, sync },
    picksOf: (d, st) => (st.kind === "collage" ? d?.panels?.[st.active] : d?.picked),
    editLocked: (st) => (st.kind === "collage" ? EDIT_NOTE : ""),
    zoneVisible: (z, st) => !z.collage_only || st.kind === "collage",
    lockOptions: (pid, ctx) => lockFor(ctx, pid),
    toolbarExtra: (ctx) => makeToolbar(ctx),
    customZones: { layout: (ctx) => layoutZone(ctx) },
    // what changes outside the node and needs a redraw: the poses wired in, their turn to the camera, the resolution
    signature: (ctx) => {
        const poses = posesOf(ctx.node);
        return [poses.map((b) => (b ? [b.id, b.ndCB.facing?.() ?? null, b.ndCB.presetLabel?.() ?? ""] : null)), resolutionOf(ctx.node).size];
    },
    // after a run: the size the server used (from the Resolution input)
    onExecuted: (d, ctx) => {
        if (!resolutionOf(ctx.node).wired || !(d.width > 0 && d.height > 0)) return;
        const L = ctx.st.layout;
        if (L.width === d.width && L.height === d.height) return;
        L.width = d.width;
        L.height = d.height;
        ctx.commit();
    },
    consumers: [
        { name: "seed", type: "INT" },
        { name: "pose", label: "Pose Builder", type: "POSE_PARAMS", optional: true, grow: { max: MAX_PANELS } },
        { name: "resolution", label: "Resolution", type: "ND_PARAMS", optional: true },
    ],
    provider: () => [
        { name: "Camera", label: "Camera Description", type: "STRING" },
        { name: "Full", label: "Full Description", type: "STRING" },
        {
            name: "composition",
            label: "Composition Settings Out",
            type: "COMPOSITION_PARAMS",
            sub: () => [
                { name: "version", type: "*" }, { name: "kind", type: "STRING" }, { name: "mode", type: "STRING" },
                { name: "width", type: "INT" }, { name: "height", type: "INT" }, { name: "panels", type: "*" },
                { name: "text", type: "STRING" }, { name: "tags", type: "STRING" }, { name: "edit", type: "STRING" },
            ],
        },
    ],
});

// styles of the Layout zone and the toolbar (the engine puts its own in once)
injectStyleOnce("nd-cs-style", CSS);
