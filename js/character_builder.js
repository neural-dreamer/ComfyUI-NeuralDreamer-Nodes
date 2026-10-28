// Neural Dreamer Nodes — ND Character Builder
// A column of section buttons with icons (drawn from the traced reference figures,
// see character_icons.js) on the left; the chosen section's parameters on the right.
// Parameters marked "only" apply to one sex and are hidden for the other.
// Each parameter is either not set, set to a value, or random (picked on the
// server with the seed). Everything lives in the hidden "state" widget (JSON);
// the last random picks are kept in node.properties so they survive a reload.
// Parts, options and wording come from character_builder.json next to this file.

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { el, dirty, hideWidget, chain, bindCanvasNavigation, injectStyleOnce, blankSlots, ND_REG, nativeTrackCss, setRangeFill } from "./nd_common.js";
import { ZONE_ICONS, OPTION_ICONS } from "./character_icons.js";
import { T, LANGS, LANG_EVENT, commonLang, setCommonLang, resolveLang, validOwnLang, loadLang, localizeRaw } from "./nd_i18n.js";

const RANDOM = "*";
const MIN_W = 480;
const MIN_H = 560;

/* ------------------------------------------------------------------- schema */

function buildSchema(raw, lang = "en") {
    const sets = raw.option_sets || {};
    const params = new Map();
    const parts = [];
    for (const part of raw.parts || []) {
        const pids = [];
        for (const p of part.params || []) {
            const pid = `${part.id}.${p.id}`;
            const q = { ...p, pid, part: part.id };
            if (q.type === "list") {
                // tattoos: entries picked from places, designs, styles, sizes and colors
                for (const key of ["places", "designs", "styles", "sizes", "colors"]) q[key] = q[key] || [];
                q.placeBy = new Map(q.places.map((o) => [o.id, o]));
                q.designBy = new Map(q.designs.map((o) => [o.id, o]));
                q.styleBy = new Map(q.styles.map((o) => [o.id, o]));
                q.sizeBy = new Map(q.sizes.map((o) => [o.id, o]));
                q.colorBy = new Map(q.colors.map((o) => [o.id, o]));
            } else if (q.type !== "number") {
                q.options = q.options || sets[q.set] || [];
                q.opt = new Map(q.options.map((o) => [o.id, o]));
                // "Custom": a color typed by the user. It is in opt but not in options, so random never picks it.
                if (q.type === "color" || q.custom) q.opt.set("custom", { id: "custom", label: T(lang, "Custom"), labelEn: "Custom", custom: true });
                // the middle of a scale: its "medium"/"average" step, or the centre
                const mid = q.options.findIndex((o) => o.id === "medium" || o.id === "average" || o.id === "athletic");
                q.mid = mid >= 0 ? mid : (q.options.length - 1) / 2;
            }
            params.set(pid, q);
            pids.push(pid);
        }
        parts.push({ ...part, pids });
    }
    // a zone lists "pid" or "pid@category": the parameter shown with the options of that category only (pose presets)
    const zones = (raw.zones || []).map((z) => {
        const ids = [], cats = {};
        for (const x of z.params || []) {
            const [pid, cat] = String(x).split("@");
            if (!params.has(pid)) continue;
            if (!ids.includes(pid)) ids.push(pid);
            if (cat) cats[pid] = cat;
        }
        return { ...z, params: ids, cats };
    });
    return { params, parts, zones, zoneById: new Map(zones.map((z) => [z.id, z])), outputs: raw.outputs || [], sexParam: raw.sex_param || "general.sex" };
}

const getJson = (name) => fetch(new URL(`./${name}`, import.meta.url)).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${name}: HTTP ${r.status}`))));
// Loaded when the first node of a kind is created (the node may be hidden from the pack).
// The English schema is the base; a language is the same schema with its words put in (see nd_i18n.js).
const rawPromises = new Map();
const rawReady = (file) => {
    if (!rawPromises.has(file)) {
        rawPromises.set(file, getJson(file).catch((e) => {
            console.warn(`[Neural Dreamer] cannot load ${file}`, e);
            return null;
        }));
    }
    return rawPromises.get(file);
};
const schemaCache = new Map(); // "file|lang" -> schema
const schemaNow = (file, lang) => schemaCache.get(`${file}|${lang}`) || null;
async function schemaFor(file, lang, section) {
    const key = `${file}|${lang}`;
    if (!schemaCache.has(key)) {
        const raw = await rawReady(file);
        if (!raw) return null;
        await loadLang(lang);
        if (!schemaCache.has(key)) {
            schemaCache.set(key, buildSchema(localizeRaw(raw, lang, section), lang));
            ND_REG.refresh?.();
        }
    }
    return schemaCache.get(key);
}

/* ------------------------------------------------------------------ presets */

// Presets live in the ComfyUI user folder (user/<user>/neural_dreamer/<file>.json),
// so they are shared by every workflow and survive updates of the node pack.
const presetCaches = new Map();
async function loadPresetsFile(file, force = false) {
    if (presetCaches.has(file) && !force) return presetCaches.get(file);
    const r = await api.getUserData(file);
    if (r.status === 404) { presetCaches.set(file, {}); return {}; }
    if (!r.ok) throw new Error(`cannot read the presets (HTTP ${r.status})`);
    const data = await r.json();
    const presets = isObj(data?.presets) ? data.presets : {};
    presetCaches.set(file, presets);
    return presets;
}
async function writePresetsFile(file, presets) {
    const r = await api.storeUserData(file, { version: 1, presets }, { overwrite: true, stringify: true, throwOnError: false });
    if (!r?.ok) throw new Error(`cannot save the presets (HTTP ${r?.status ?? "?"})`);
    presetCaches.set(file, presets);
}

/* -------------------------------------------------------------------- state */

const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);

// Same rules as parse_state() in nd_nodes/character_builder.py.
// Penis shape was one parameter; now curve, girth and veins are set apart (same as the server).
const SPLIT_PARAMS = {
    "genitals.penis_shape": {
        straight: "genitals.penis_curve", curved_up: "genitals.penis_curve", curved_down: "genitals.penis_curve",
        tapered: "genitals.penis_girth", thick: "genitals.penis_girth", veiny: "genitals.penis_veins",
    },
};
// the dark versions of the colored skin tones are now the plain color with the Darker shade
const DARK_SKIN = { dark_green: "green", dark_grey: "grey", dark_blue: "blue", dark_red: "red", dark_purple: "purple" };
function migrateValues(values, pools) {
    const tone = "general.skin_tone";
    if (DARK_SKIN[values[tone]]) {
        values[tone] = DARK_SKIN[values[tone]];
        values["general.skin_shade"] ??= "dark";
    }
    if (Array.isArray(pools[tone])) pools[tone] = [...new Set(pools[tone].map((x) => DARK_SKIN[x] ?? x))];
    for (const [old, where] of Object.entries(SPLIT_PARAMS)) {
        if (!(old in values) && !(old in pools)) continue;
        const v = values[old];
        delete values[old];
        delete pools[old];
        if (where[v]) values[where[v]] ??= v;
        else if (v === RANDOM) for (const n of new Set(Object.values(where))) values[n] ??= RANDOM;
    }
}

function normalizeState(raw) {
    let s;
    try { s = typeof raw === "string" ? JSON.parse(raw) : raw; } catch { s = null; }
    s = isObj(s) ? s : {};
    const f = isObj(s.formats) ? s.formats : {};
    let natural = f.natural === undefined ? true : !!f.natural;
    const tags = !!f.tags;
    if (!natural && !tags) natural = true;
    const out = {
        enabled: s.enabled !== false, // the node can be switched off: it keeps its settings but adds nothing to the prompt
        formats: { natural, tags },
        avoid_conflicts: s.avoid_conflicts === undefined ? true : !!s.avoid_conflicts,
        all_random: !!s.all_random,
        genitals: false,
        explicit: !!s.explicit,
        edit_style: s.edit_style === "simple" ? "simple" : "full",
        extra: typeof s.extra === "string" ? s.extra : "",
        mode: s.mode === "edit" ? "edit" : "create",
        ops: isObj(s.ops) ? Object.fromEntries(Object.entries(s.ops).filter(([, v]) => ["add", "replace", "remove"].includes(v))) : {},
        edit_keep: s.edit_keep === undefined ? true : !!s.edit_keep,
        edit_subject: typeof s.edit_subject === "string" ? s.edit_subject.replace(/\s+/g, " ").trim().slice(0, 80) : "",
        custom: isObj(s.custom) ? Object.fromEntries(Object.entries(s.custom).filter(([, v]) => typeof v === "string" && v.trim()).map(([k, v]) => [k, v.replace(/\s+/g, " ").trim().slice(0, 60)])) : {},
        levels: isObj(s.levels) ? Object.fromEntries(Object.entries(s.levels).filter(([, v]) => isObj(v)).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "string" || (Array.isArray(x) && x.some((y) => typeof y === "string"))).map(([a, x]) => [a, typeof x === "string" ? x : x.filter((y) => typeof y === "string")]))])) : {},
        attrs_off: Array.isArray(s.attrs_off) ? [...new Set(s.attrs_off.filter((x) => typeof x === "string"))] : [],
        values: isObj(s.values) ? { ...s.values } : {},
        pools: isObj(s.pools) ? { ...s.pools } : {},
    };
    // the state of ND Composition Settings carries more (kind, layout, panels...): the node itself cleans these up
    for (const k of ["kind", "layout", "panels", "single", "active", "use_pose_camera"]) if (k in s) out[k] = s[k];
    migrateValues(out.values, out.pools);
    // The Genitals section is off by default. A workflow or preset saved before the switch
    // existed keeps the section on when it already has values there.
    out.genitals = s.genitals === undefined
        ? Object.keys(out.values).some((k) => k.startsWith("genitals."))
        : !!s.genitals;
    return out;
}

function clampNum(p, v) {
    const n = Math.round(Number(v));
    if (v === "" || v == null || !Number.isFinite(n)) return null;
    return Math.min(p.max, Math.max(p.min, n));
}

const stageOf = (p, n) => (p.stages || []).find((s) => n >= s.from && n <= s.to)?.label || "";

/* ------------------------------------------------------------- look & feel */

// Accent: hover, focus, sliders; Set: chosen values and their dots; Random: random values and dots.
export const THEMES = [
    { id: "classic", label: "Classic", accent: "#2f7de1", set: "#d6a64f", rnd: "#a184e6" },
    { id: "ocean", label: "Ocean", accent: "#1fb5c9", set: "#4fd1a5", rnd: "#6c8cff" },
    { id: "sakura", label: "Sakura", accent: "#e66aa8", set: "#f2a65a", rnd: "#a77df0" },
    { id: "emerald", label: "Emerald", accent: "#2fbf71", set: "#e3c25b", rnd: "#4aa8ff" },
    { id: "inferno", label: "Inferno", accent: "#ff6a3d", set: "#ffc247", rnd: "#e0559b" },
    { id: "mono", label: "Mono", accent: "#9aa4b2", set: "#e8e8e8", rnd: "#8f8fb8" },
];
const COLOR_ROLES = [
    ["accent", "Accent", "Hover and focus borders, sliders, the selected section."],
    ["set", "Set values", "Chosen values and the dot of a section with set values."],
    ["rnd", "Random", "Random values, the dice and the dot of a section with random values."],
];
const SCALE_RANGE = [70, 150];
// Interface words that are picked in code from a variable (the check of the translations needs the whole list)
export const UI_EXTRA = [
    "add", "replace", "remove", "off",
    "Place", "Design", "Style", "Size", "Color", "No place", "Just a tattoo", "Not set", "Random", "Left", "Right", "Both", "Custom text…",
    "Add it to the picture.", "Replace", "Remove what is there now and put this instead.", "Take it off the picture.",
];
const UI_DEFAULT = { theme: "classic", custom: { accent: "#2f7de1", set: "#d6a64f", rnd: "#a184e6" }, scale: 100, level: "simple", lang: "auto" };
const UI_KEY = "nd-character-builder-ui"; // the last settings, used for new nodes
const isHex = (x) => typeof x === "string" && /^#[0-9a-f]{6}$/i.test(x);
function normalizeUi(raw) {
    const r = isObj(raw) ? raw : {};
    const c = isObj(r.custom) ? r.custom : {};
    const theme = r.theme === "custom" || THEMES.some((t) => t.id === r.theme) ? r.theme : UI_DEFAULT.theme;
    const custom = {};
    for (const [k] of COLOR_ROLES) custom[k] = isHex(c[k]) ? c[k].toLowerCase() : UI_DEFAULT.custom[k];
    const sc = Math.round(Number(r.scale));
    const scale = Number.isFinite(sc) ? Math.min(SCALE_RANGE[1], Math.max(SCALE_RANGE[0], sc)) : 100;
    return { theme, custom, scale, level: r.level === "advanced" ? "advanced" : "simple", lang: validOwnLang(r.lang) };
}
function storedUi() {
    // a new node follows the common language, whatever the last one had chosen for itself
    try { return { ...normalizeUi(JSON.parse(localStorage.getItem(UI_KEY) || "null")), lang: "auto" }; } catch { return normalizeUi(null); }
}
function rememberUi(ui) {
    try { localStorage.setItem(UI_KEY, JSON.stringify({ ...ui, lang: "auto" })); } catch {}
}
const colorsOf = (ui) => (ui.theme === "custom" ? ui.custom : THEMES.find((t) => t.id === ui.theme) || THEMES[0]);

// colour helpers for the custom theme
function hexToHsl(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    let h = 0, sat = 0;
    if (mx !== mn) {
        const d = mx - mn;
        sat = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
        h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        h *= 60;
    }
    return [Math.round(h), Math.round(sat * 100), Math.round(l * 100)];
}
function hslToHex(h, sat, l) {
    sat /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12;
    const a = sat * Math.min(l, 1 - l);
    const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
    return "#" + [f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// A colour picker: hue / saturation / lightness sliders, a hex field, the system picker and,
// where the browser has one, an eyedropper for any colour on the screen.
function colorPicker(value, onChange) {
    let hex = isHex(value) ? value.toLowerCase() : "#888888";
    let [h, sa, li] = hexToHsl(hex);
    const wrap = el("div", "nd-cbs-picker");
    const top = el("div", "nd-cbs-ptop");
    const sw = el("label", "nd-cbs-pswatch");
    const native = el("input");
    native.type = "color";
    tipEn(sw, "Open the system colour picker", "");
    sw.append(native);
    const hexIn = el("input", "nd-cbs-hex");
    hexIn.type = "text";
    hexIn.maxLength = 7;
    hexIn.spellcheck = false;
    const drop = btn("nd-cbs-drop", null, "Pick a colour from the screen");
    drop.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></svg>';
    drop.style.display = typeof window.EyeDropper === "function" ? "" : "none";
    top.append(sw, hexIn, drop);
    const slider = (cls, max, title) => {
        const r = el("input", `nd-cbs-hsl ${cls}`);
        r.type = "range";
        r.min = 0;
        r.max = max;
        tipEn(r, title, "");
        return r;
    };
    const rh = slider("h", 359, "Hue"), rs = slider("s", 100, "Saturation"), rl = slider("l", 100, "Lightness");
    wrap.append(top, rh, rs, rl);
    const paint = () => {
        rh.value = h; rs.value = sa; rl.value = li;
        rs.style.setProperty("--a", hslToHex(h, 0, li));
        rs.style.setProperty("--b", hslToHex(h, 100, li));
        rl.style.setProperty("--m", hslToHex(h, sa, 50));
        sw.style.background = hex;
        native.value = hex;
        if (document.activeElement !== hexIn) hexIn.value = hex;
    };
    const fromHsl = () => { hex = hslToHex(h, sa, li); paint(); onChange(hex); };
    const fromHex = (x) => {
        if (!isHex(x)) return false;
        hex = x.toLowerCase();
        [h, sa, li] = hexToHsl(hex);
        paint();
        onChange(hex);
        return true;
    };
    rh.oninput = () => { h = Number(rh.value); fromHsl(); };
    rs.oninput = () => { sa = Number(rs.value); fromHsl(); };
    rl.oninput = () => { li = Number(rl.value); fromHsl(); };
    native.oninput = () => fromHex(native.value);
    hexIn.oninput = () => { const v = hexIn.value.trim(); fromHex(v.startsWith("#") ? v : `#${v}`); };
    hexIn.onblur = () => { hexIn.value = hex; };
    drop.onclick = async () => {
        try { const r = await new window.EyeDropper().open(); if (r?.sRGBHex) fromHex(r.sRGBHex.length === 7 ? r.sRGBHex : hexFromRgb(r.sRGBHex)); } catch {}
    };
    paint();
    return wrap;
}
const hexFromRgb = (txt) => {
    const m = /(\d+)\D+(\d+)\D+(\d+)/.exec(txt || "");
    return m ? "#" + [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, "0")).join("") : "#888888";
};

// presets as a file
function downloadJson(name, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const safeFile = (name) => String(name).replace(/[\\/:*?"<>|]+/g, "_").slice(0, 80) || "preset";
// {name: {state, saved}} from a file: an export of this node (one or many presets) or a bare state
function presetsFromFile(data, fileName) {
    if (isObj(data?.presets)) {
        const out = {};
        for (const [k, v] of Object.entries(data.presets)) if (isObj(v) && isObj(v.state)) out[k] = { state: v.state, saved: v.saved || new Date().toISOString() };
        return out;
    }
    const base = String(fileName || "Imported").replace(/\.json$/i, "");
    if (isObj(data?.state)) return { [data.name || base]: { state: data.state, saved: data.saved || new Date().toISOString() } };
    if (isObj(data?.values)) return { [base]: { state: data, saved: new Date().toISOString() } };
    return {};
}
function freeName(name, taken) {
    if (!taken[name]) return name;
    for (let i = 2; ; i++) if (!taken[`${name} (${i})`]) return `${name} (${i})`;
}

/* ---------------------------------------------------------------- helpers */

// Text and tooltips written in the code are English; relabel() puts the language of the node in.
// raw: the text is not a word of the interface (a preset name) and stays as it is.
const btn = (cls, text, title, raw = false) => {
    const b = el("button", cls, text);
    b.type = "button";
    if (text && !raw) b.dataset.i18n = text;
    // a symbol ("×") or a name of the person has no tooltip title of its own: the hint is the title
    const named = text && !raw && /\p{L}/u.test(text);
    if (title) tipEn(b, named ? text : title, named ? title : "");
    return b;
};
// an element with a fixed English text
const txt = (tag, cls, en) => {
    const e = el(tag, cls, en);
    e.dataset.i18n = en;
    return e;
};

const GEAR_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';
const DICE_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="8.5" cy="15.5" r="1.3" fill="currentColor" stroke="none"/></svg>';

/* ------------------------------------------------------------------ tooltip */

// One quick tooltip for every builder on the page: a bold title and a longer hint.
// It lives in <body>, so its text stays readable at any canvas zoom.
let tipEl = null;
let tipTimer = null;
// en: the English name, shown under the translated one so the person sees what goes into the prompt
const tip = (e, title, text, en) => {
    e.dataset.tipTitle = title || "";
    if (text) e.dataset.tip = text; else delete e.dataset.tip;
    if (en && en !== title) e.dataset.tipEn = en; else delete e.dataset.tipEn;
    delete e.dataset.tipSrc;
};
// a tooltip written in English in the code; relabel() translates it
const tipEn = (e, title, text) => {
    tip(e, title, text);
    e.dataset.tipSrc = JSON.stringify([title || "", text || ""]);
};
// translate what is marked in a piece of the UI (text, placeholders, tooltips)
function relabel(host, lang) {
    for (const e of host.querySelectorAll("[data-i18n]")) e.textContent = T(lang, e.dataset.i18n);
    for (const e of host.querySelectorAll("[data-i18n-ph]")) e.placeholder = T(lang, e.dataset.i18nPh);
    for (const e of host.querySelectorAll("[data-tip-src]")) {
        let a = "", b = "";
        try { [a, b] = JSON.parse(e.dataset.tipSrc); } catch {}
        e.dataset.tipTitle = a ? T(lang, a) : "";
        if (b) e.dataset.tip = T(lang, b); else delete e.dataset.tip;
    }
}
function showTip(target) {
    const title = target.dataset.tipTitle || "", text = target.dataset.tip || "";
    if (!title && !text) return;
    if (!tipEl) {
        tipEl = el("div", "nd-cb-tip");
        document.body.append(tipEl);
    }
    tipEl.replaceChildren();
    if (title) tipEl.append(el("b", null, title));
    if (text) tipEl.append(el("div", null, text));
    if (target.dataset.tipEn) tipEl.append(el("small", "nd-cb-tipen", `EN: ${target.dataset.tipEn}`));
    tipEl.style.display = "block";
    const r = target.getBoundingClientRect();
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    let x = Math.min(Math.max(6, r.left + r.width / 2 - w / 2), window.innerWidth - w - 6);
    let y = r.bottom + 8;
    if (target.dataset.tipSide === "right") {
        // section buttons: beside the button
        x = Math.min(r.right + 8, window.innerWidth - w - 6);
        y = Math.min(Math.max(6, r.top + r.height / 2 - h / 2), window.innerHeight - h - 6);
    } else if (y + h > window.innerHeight - 6) y = r.top - h - 8;
    tipEl.style.left = `${Math.round(x)}px`;
    tipEl.style.top = `${Math.round(Math.max(6, y))}px`;
}
function hideTip() {
    clearTimeout(tipTimer);
    if (tipEl) tipEl.style.display = "none";
}
function bindTips(root) {
    root.addEventListener("pointerover", (e) => {
        const t = e.target?.closest?.("[data-tip-title]");
        if (!t || !root.contains(t)) return;
        if (e.relatedTarget && t.contains(e.relatedTarget)) return;
        clearTimeout(tipTimer);
        tipTimer = setTimeout(() => { if (t.isConnected) showTip(t); }, 250);
    });
    root.addEventListener("pointerout", (e) => {
        const t = e.target?.closest?.("[data-tip-title]");
        if (t && e.relatedTarget && t.contains(e.relatedTarget)) return;
        hideTip();
    });
    root.addEventListener("pointerdown", hideTip, true);
    root.addEventListener("wheel", hideTip, { passive: true, capture: true });
}

/* --------------------------------------------------------------------- node */

function setupBuilder(node, cfg) {
    // what differs between the Character Builder and the Outfit Builder comes from cfg
    let SCHEMA = cfg.schema; // the English one; the language of the node is put in below
    const SEX = SCHEMA?.sexParam || "general.sex";
    const RACE = cfg.raceParam || null;
    const GENITALS = cfg.contentPart || null;
    const DEFAULT_ZONE = cfg.defaultZone;
    const ZONE_ICONS = cfg.zoneIcons || {};
    const OPTION_ICONS = cfg.optionIcons || {};
    const TOGGLE = cfg.toggle;
    const loadPresets = (force) => loadPresetsFile(cfg.presetFile, force);
    const writePresets = (presets) => writePresetsFile(cfg.presetFile, presets);
    const wState = hideWidget(node, "state");
    // state hooks of a node that keeps more than one set of values (ND Composition Settings: one per panel):
    // normalize(st) after the state is read, sync(st) before it is written
    const H = cfg.stateHooks || {};
    const norm = (raw) => { const s0 = normalizeState(raw); H.normalize?.(s0); return s0; };
    let st = norm(wState?.value);
    node.properties ||= {};
    // colours and UI scale: kept with the node (node.properties.nd_ui); a new node starts with the last ones used
    let ui = normalizeUi(node.properties.nd_ui ?? storedUi());
    node.properties.nd_ui = ui;
    // the language of the interface: its own, or the common one (nd_i18n.js); the prompt text is always English
    const LANG = () => resolveLang(ui.lang);
    const tr = (en, vars) => T(LANG(), en, vars);
    SCHEMA = schemaNow(cfg.schemaFile, LANG()) || SCHEMA;
    const scaleOf = () => ui.scale / 100;
    node.__ndScale = scaleOf;
    // what the hooks of cfg (customZones, lockOptions, toolbarExtra...) get to work with
    const ctx = {
        node,
        schema: () => SCHEMA,
        param: (pid) => P(pid),
        get st() { return st; },
        get lang() { return LANG(); },
        tr, el, btn, txt, tip, tipEn, relabel,
        save: () => save(),
        commit: () => commit(),
        render: () => render(),
        picks: () => picks(),
        toast: (m) => app.extensionManager?.toast?.add?.({ severity: "info", summary: "Neural Dreamer", detail: m, life: 4000 }),
    };
    node.__ndCtx = ctx;

    // host: the widget element, sized by ComfyUI; root: the UI inside it, drawn at the UI scale
    const host = el("div", "nd-cb-host");
    const root = el("div", "nd-cb");
    host.append(root);
    if (!SCHEMA) {
        root.append(el("div", "nd-cb-error", T(LANG(), "{file} could not be loaded. Reinstall the node pack.", { file: cfg.schemaFile })));
        node.addDOMWidget("nd_character", "ND_CHARACTER", host, { serialize: false, hideOnZoom: false, getMinHeight: () => 60 });
        return;
    }

    // toolbar
    const bar = el("div", "nd-cb-bar");
    const check = (label, title) => {
        const l = el("label", "nd-cb-check");
        const i = el("input");
        i.type = "checkbox";
        tipEn(l, label, title);
        l.append(i, txt("span", null, label));
        return { l, i };
    };
    const ALL_RANDOM_HINT = "Every parameter of every section is random, picked with the seed. Click values to narrow what random may pick. The values you set by hand come back when this is turned off.";
    const cNat = check("Natural", "Natural-language sentences (best for Flux 2, Krea 2). At least one format stays on.");
    const cTag = check("Tags", "Comma-separated tags. At least one format stays on.");
    const cAll = check("All random", ALL_RANDOM_HINT);
    cAll.l.classList.add("nd-cb-allrnd");
    const cAvoid = check("Avoid conflicts", "Random picks skip values that clash with the others (e.g. a pixie cut with waist-length hair).");
    const cGen = check(TOGGLE.label, TOGGLE.title);
    const bFix = btn("nd-cb-btn", "Fix random", "Turn the last random picks into fixed values");
    const bReset = btn("nd-cb-btn", "Reset", "Clear every parameter");
    const bPresets = btn("nd-cb-btn", "Presets", "Save the settings of this node as a preset, load, delete, export or import presets");
    // On / Off: an off node keeps all its settings but adds nothing to the prompt
    const bPower = btn("nd-cb-btn nd-cb-power", "On", "Switch the node off to keep its settings but add nothing to the prompt. What other nodes give it still passes through.");
    bPower.onclick = () => { st.enabled = !st.enabled; commit(); };
    const bGear = btn("nd-cb-btn nd-cb-gear", null, "Settings: language, prompt format, random, content, colours, UI scale");
    bGear.innerHTML = GEAR_SVG;
    const fmt = el("div", "nd-cb-fmt");
    fmt.append(cNat.l, cTag.l);
    const status = el("span", "nd-cb-status");
    const setMode = (id) => { st.mode = id; commit(); };
    // the Character Builder switches the Outfit Builders that feed it (straight or through Pack Parameters) to the same mode
    function syncUpstream(id) {
        if (!cfg.editSync) return;
        for (const o of upstreamBuilders(node)) if (typeof o.ndCB?.setMode === "function") o.ndCB.setMode(id);
    }
    // Create / Edit: Edit turns the text into instructions for image-editing models
    const modeSeg = el("div", "nd-cb-seg nd-cb-mode");
    const modeBtns = [["create", "Create", "Describe a character (prompt for image models)."], ["edit", "Edit", "Instructions for image-editing models (Qwen Image Edit, Flux 2 Klein, Krea 2 Edit…): only what you set is changed."]].map(([id, label, hint]) => {
        const b = btn("nd-cb-segbtn", label, hint);
        b.dataset.mode = id;
        b.onclick = () => { if (b.disabled) return; if (st.mode !== id) { setMode(id); syncUpstream(id); } };
        modeSeg.append(b);
        return b;
    });
    // Simple / Advanced (Pose Builder): ready-made poses by category, or every parameter
    const levelSeg = el("div", "nd-cb-seg nd-cb-level");
    if (cfg.levels) {
        for (const [id, label, hint] of [["simple", "Simple", "Ready-made poses by category, with a few quick settings."], ["advanced", "Advanced", "Every parameter, part of the body by part. What a pose sets stays in use, even when it is hidden in Simple."]]) {
            const b = btn("nd-cb-segbtn", label, hint);
            b.dataset.level = id;
            b.onclick = () => { if (ui.level !== id) { setUi({ level: id }); render(); } };
            levelSeg.append(b);
        }
    }
    const extraBar = cfg.toolbarExtra ? cfg.toolbarExtra(ctx) : null;
    bar.append(bPower, ...(extraBar ? [extraBar.el] : []), modeSeg, ...(cfg.levels ? [levelSeg] : []), cAll.l, el("span", "nd-cb-grow"), status, bPresets, bFix, bReset, bGear);

    // presets popover
    const pop = el("div", "nd-cb-pop");
    pop.style.display = "none";
    const pSave = el("div", "nd-cb-psave");
    const pName = el("input");
    pName.type = "text";
    pName.dataset.i18nPh = "Preset name";
    pName.placeholder = "Preset name";
    pName.spellcheck = false;
    pName.maxLength = 80;
    const pSaveBtn = btn("nd-cb-btn", "Save", "Save every setting of this node under this name");
    pSave.append(pName, pSaveBtn);
    const pList = el("div", "nd-cb-plist");
    pList.dataset.ndScroll = "1";
    const pMsg = el("div", "nd-cb-pmsg");
    const pFile = el("div", "nd-cb-pfile");
    const pExport = btn("nd-cb-btn small", "Export all", "Save every preset to a .json file");
    const pImport = btn("nd-cb-btn small", "Import…", "Add presets from a .json file (an export of this node)");
    const pInput = el("input");
    pInput.type = "file";
    pInput.accept = ".json,application/json";
    pInput.style.display = "none";
    pFile.append(pExport, pImport, pInput);
    const pAsk = el("div", "nd-cb-pask");
    pAsk.style.display = "none";
    pop.append(txt("div", "nd-cb-phint", "Saved: every parameter, random choices and formats."), pSave, pList, pFile, pAsk, pMsg);


    // section buttons (icons) on the left
    const rail = el("div", "nd-cb-rail");
    rail.dataset.ndScroll = "1";
    const zoneBtns = SCHEMA.zones.map((z) => {
        const b = btn("nd-cb-zbtn");
        b.dataset.zone = z.id;
        b.dataset.tipSide = "right";
        b.innerHTML = ZONE_ICONS[z.id] || `<span class="nd-cb-zlabel"></span>`;
        if (!ZONE_ICONS[z.id]) b.firstChild.textContent = z.label.slice(0, 2);
        rail.append(b);
        return b;
    });

    // panel
    const panel = el("div", "nd-cb-panel");
    const head = el("div", "nd-cb-phead");
    const title = el("div", "nd-cb-ptitle");
    const count = el("span", "nd-cb-pcount");
    const zRand = btn("nd-cb-btn small", null, "Set every parameter of this zone to random");
    zRand.innerHTML = `${DICE_SVG}<span data-i18n="All random">All random</span>`;
    const zClear = btn("nd-cb-btn small", "Clear", "Clear every parameter of this zone");
    const zCopy = btn("nd-cb-btn small");
    head.append(title, count, el("span", "nd-cb-grow"), zCopy, zRand, zClear);
    const body = el("div", "nd-cb-pbody");
    body.dataset.ndScroll = "1";
    panel.append(head, body);

    const main = el("div", "nd-cb-main");
    main.append(rail, panel);
    root.append(pop);
    root.append(bar, main);

    /* ----------------------------------------------------------- state io */

    // All random is not available in Edit mode (it would rewrite the whole character)
    const isEdit = () => st.mode === "edit";
    const AR = () => !!st.all_random && !isEdit();
    const picks = () => {
        const d = node.properties.nd_picked;
        const raw = cfg.picksOf ? cfg.picksOf(d, st) : d?.picked;
        return isObj(raw) ? raw : {};
    };
    const P = (pid) => SCHEMA.params.get(pid);
    // Simple / Advanced (Pose Builder): zones of a level, ready-made poses (a "macro" parameter), what the character has
    const LEVELS = !!cfg.levels;
    const MACRO = [...SCHEMA.params.values()].find((q) => q.macro)?.pid || null;
    let viewCat = null; // the category of the preset list being drawn (a category zone shows only its own poses)
    // lockOptions(pid, ctx) -> {allowed: Set, auto: id | null, reason, fix(value)} or null: the options another node rules out are not offered
    const lockOf = (pid) => cfg.lockOptions?.(pid, ctx) || null;
    const visibleOptions = (p) => {
        const list = viewCat && p.macro ? p.options.filter((o) => o.cat === viewCat) : p.options;
        const lk = p.options && lockOf(p.pid);
        return lk ? list.filter((o) => lk.allowed.has(o.id)) : list;
    };
    const linkedCharacter = () => (LEVELS ? upstreamBuilders(node).find((o) => o.ndCB?.isCharacter) || null : null);
    // the body parts the character has (a list), or null when that is not known (random sex, not run yet)
    function anatomyNow() {
        if (!LEVELS) return null;
        const cb = linkedCharacter();
        if (cb) return cb.ndCB.anatomy();
        const v = st.values[SEX];
        if (AR() || v === RANDOM) return null;
        const o = P(SEX)?.opt.get(v ?? "female");
        return o?.have ? [...o.have] : [];
    }
    const needWord = (x) => ({ vulva: tr("a vulva"), penis: tr("a penis"), testicles: tr("testicles"), breasts: tr("breasts"), anus: tr("an anus") }[x] || x);
    const needOf = (o) => [...(o.anatomy || []), ...(o.anatomy_any?.length ? [o.anatomy_any.map(needWord).join(` ${tr("or")} `)] : [])].map(needWord).join(` ${tr("and")} `);
    const fits = (o, have) => !have || ((o.anatomy || []).every((x) => have.includes(x)) && (!o.anatomy_any?.length || o.anatomy_any.some((x) => have.includes(x))));
    const sameVal = (a, b) => { const n = (v) => JSON.stringify(Array.isArray(v) ? [...v].sort() : v ?? null); return n(a) === n(b); };
    const presetOn = () => { const v = MACRO ? st.values[MACRO] : null; return typeof v === "string" && v !== RANDOM ? P(MACRO).opt.get(v) || null : null; };
    const presetModified = (o) => !(o.core || []).every((pid) => sameVal(st.values[pid], o.sets?.[pid]));
    // "All random" makes every parameter random; the values set by hand are kept for when it is off
    const isRandom = (pid) => !!AR() || st.values[pid] === RANDOM;
    const opOf = (pid) => (isEdit() && P(pid)?.edit?.ops ? st.ops[pid] || "add" : "add");
    const has = (pid) => (!!AR() || st.values[pid] != null || (isEdit() && st.ops[pid] === "remove" && !!P(pid)?.edit?.ops)) && applies(pid);
    const valOf = (pid) => (isRandom(pid) ? RANDOM : st.values[pid]);
    function rawEff(pid) {
        const v = isRandom(pid) ? picks()[pid] ?? null : st.values[pid] ?? null;
        const lk = typeof v === "string" || v == null ? lockOf(pid) : null;
        return lk ? lk.fix(v) : v;
    }
    // a parameter marked "only" (e.g. breast size: female) is hidden for the other sex
    const suitsSex = (pid) => {
        const only = P(pid)?.only, sex = rawEff(SEX);
        return !only || !sex || only.includes(sex);
    };
    // "requires": e.g. penis size is shown only when the parts include a penis
    const asList = (v) => (Array.isArray(v) ? v : v != null ? [v] : []);
    const required = (pid) => {
        const q = P(pid), need = q?.requires;
        // shade and undertone do nothing for a custom color (it is used as typed)
        const owner = q?.parent && P(q.parent);
        if (owner?.shade && [owner.shade.level, owner.shade.tint].includes(q.id) && rawEff(owner.pid) === "custom") return false;
        if (!need) return true;
        const have = asList(rawEff(need.p));
        // "set": the other parameter has any value; "in": one of these values
        return need.set ? have.length > 0 : have.some((x) => (need.in || []).includes(x));
    };
    // the Genitals section is switched on with a checkbox of the toolbar; while off, none of it is used
    const sectionOn = (pid) => (!GENITALS || P(pid)?.part !== GENITALS || !!st.genitals) && !(P(pid)?.explicit && !st.explicit);
    // a section without any parameter for the chosen sex (facial hair for a woman) is hidden
    const zoneOn = (id) => {
        if (GENITALS && id === GENITALS && !st.genitals) return false;
        const zz = SCHEMA.zoneById.get(id);
        if (zz?.explicit && !st.explicit) return false;
        if (cfg.zoneVisible && zz && !cfg.zoneVisible(zz, st)) return false;
        if (LEVELS && zz?.level && zz.level !== "both" && zz.level !== ui.level) return false;
        if (zz?.hide_if_linked && linkedCharacter()) return false;
        const ps = SCHEMA.zoneById.get(id)?.params || [];
        return !ps.length || ps.some((pid) => suitsSex(pid) && sectionOn(pid));
    };
    const suits = (pid) => sectionOn(pid) && suitsSex(pid) && required(pid);
    // parameters switched off by a chosen option ("mutes"), e.g. nail color under a French manicure
    let mutedBy = new Map();
    function computeMuted() {
        mutedBy = new Map();
        for (const [pid, p] of SCHEMA.params) {
            if (!p.opt || !suits(pid)) continue;
            for (const v of asList(rawEff(pid))) {
                const o = p.opt.get(v);
                // an id of the same part ("leg_length") or a full one ("body.leg_length")
                for (const x of o?.mutes || []) {
                    if (x.endsWith(".*")) {
                        // a whole part ("top.*": a one-piece switches Top off)
                        for (const [qid, q] of SCHEMA.params) if (q.part === x.slice(0, -2)) mutedBy.set(qid, o.label);
                    } else mutedBy.set(x.includes(".") ? x : `${p.part}.${x}`, o.label);
                }
            }
        }
    }
    const applies = (pid) => suits(pid) && !mutedBy.has(pid);
    const eff = (pid) => (applies(pid) ? rawEff(pid) : null);
    const opt = (pid) => {
        const p = P(pid), v = eff(pid);
        return p?.opt && v != null ? p.opt.get(v) ?? null : null;
    };
    const level = (pid) => {
        const p = P(pid), v = eff(pid);
        return p?.options && v != null ? p.options.findIndex((o) => o.id === v) : -1;
    };
    // -1 .. 1 along a scale, 0 at its middle step (and when not set)
    const t = (pid) => {
        const p = P(pid), i = level(pid);
        if (!p || i < 0) return 0;
        const span = Math.max(p.mid, p.options.length - 1 - p.mid) || 1;
        return Math.max(-1, Math.min(1, (i - p.mid) / span));
    };

    function save() {
        H.sync?.(st);
        if (wState) wState.value = JSON.stringify(st);
        app.graph?.change?.();
        dirty();
    }
    const commit = () => { save(); render(); };

    const zoneKey = () => (LEVELS ? `nd_zone_${ui.level}` : "nd_zone");
    const zoneId = () => {
        const id = node.properties[zoneKey()];
        if (SCHEMA.zoneById.has(id) && zoneOn(id)) return id;
        return LEVELS ? SCHEMA.zones.find((z) => zoneOn(z.id))?.id || DEFAULT_ZONE : DEFAULT_ZONE;
    };
    // a category zone lights up for its own poses only (the quick settings under them are shared with the other zones)
    const dotParams = (z) => (z.cats && Object.keys(z.cats).length ? z.params.filter((pid) => z.cats[pid]) : z.params);
    // in a category zone a pose counts only when it belongs to that category
    const zHas = (z, pid) => has(pid) && !isRandom(pid) && (!z.cats?.[pid] || P(pid).opt.get(st.values[pid])?.cat === z.cats[pid]);
    const zRnd = (z, pid) => {
        if (!isRandom(pid) || !applies(pid)) return false;
        const cat = z.cats?.[pid];
        if (!cat) return true;
        const pool = Array.isArray(st.pools[pid]) ? st.pools[pid] : null;
        return !AR() && !!pool && pool.length > 0 && pool.every((id) => P(pid).opt.get(id)?.cat === cat);
    };
    function zoneCls(id) {
        const z = SCHEMA.zoneById.get(id);
        if (!z) return "";
        const c = [];
        const ps = dotParams(z).filter(suits);
        if (ps.some((pid) => zHas(z, pid))) c.push("has");
        if (ps.some((pid) => zRnd(z, pid))) c.push("rnd");
        if (id === zoneId()) c.push("sel");
        return c.join(" ");
    }
    // "Set: Hair color, Length · Random: Style" for the tooltip of a section button
    function zoneSummary(z) {
        const ps = dotParams(z).filter(suits);
        const set = ps.filter((pid) => zHas(z, pid)).map((pid) => {
            const p = P(pid), v = st.values[pid];
            if (v == null) return tr("{label}: remove", { label: p.label });
            return `${p.label}: ${opOf(pid) !== "add" ? tr(opOf(pid)) + " " : ""}${p.type === "number" ? v : labelOf(p, v)}`;
        });
        const rnd = ps.filter((pid) => zRnd(z, pid)).map((pid) => P(pid).label);
        const parts = [];
        if (set.length) parts.push(set.join(", "));
        if (rnd.length) parts.push(tr("Random: {list}", { list: rnd.join(", ") }));
        return parts.join(". ") || tr("{n} parameters, none set", { n: ps.length });
    }
    function selectZone(id) {
        if (!SCHEMA.zoneById.has(id) || !zoneOn(id)) return;
        node.properties[zoneKey()] = id;
        body.scrollTop = 0;
        render();
    }

    /* ------------------------------------------------------------ actions */

    function poolOf(p) {
        const all = p.options.map((o) => o.id);
        const raw = Array.isArray(st.pools[p.pid]) ? st.pools[p.pid].filter((x) => all.includes(x)) : [];
        return new Set(raw.length ? raw : all);
    }
    function numPool(p) {
        const raw = st.pools[p.pid];
        if (Array.isArray(raw) && raw.length === 2) {
            const a = clampNum(p, raw[0]), b = clampNum(p, raw[1]);
            if (a != null && b != null) return [Math.min(a, b), Math.max(a, b)];
        }
        return [p.min, p.max];
    }
    // a ready-made pose: clearing it takes away the values it set (the ones still as it set them)
    function clearPresetEffects(p) {
        const o = typeof st.values[p.pid] === "string" ? p.opt.get(st.values[p.pid]) : null;
        if (o) {
            for (const [pid, v] of Object.entries(o.sets || {})) if (sameVal(st.values[pid], v)) { delete st.values[pid]; delete st.pools[pid]; }
            for (const [pid, d] of Object.entries(o.sets_levels || {})) {
                for (const [k, x] of Object.entries(d)) if (st.levels[pid]?.[k] === x) delete st.levels[pid][k];
                if (st.levels[pid] && !Object.keys(st.levels[pid]).length) delete st.levels[pid];
            }
        }
        delete st.values[p.pid];
        delete st.pools[p.pid];
    }
    function pickPreset(p, id) {
        if (st.values[p.pid] === id) { clearPresetEffects(p); commit(); return; }
        const o = p.opt.get(id);
        if (!o) return;
        // a new pose replaces the old one: the parameters of the pose go, the rest (the view) stays unless the pose sets it
        for (const part of cfg.macroResets || []) {
            for (const pid of SCHEMA.parts.find((x) => x.id === part)?.pids || []) {
                delete st.values[pid]; delete st.pools[pid]; delete st.levels[pid]; delete st.ops[pid]; delete st.custom[pid];
            }
        }
        for (const [pid, v] of Object.entries(o.sets || {})) {
            if (!SCHEMA.params.has(pid)) continue;
            st.values[pid] = Array.isArray(v) ? [...v] : v;
            delete st.pools[pid];
        }
        for (const [pid, d] of Object.entries(o.sets_levels || {})) st.levels[pid] = { ...d };
        st.values[p.pid] = id;
        delete st.pools[p.pid];
        commit();
    }
    function clickOption(p, id) {
        if (p.macro && !isRandom(p.pid)) { pickPreset(p, id); return; }
        if (p.multi && !isRandom(p.pid)) {
            // several options at once (mixed races): a click adds or removes one
            const cur = Array.isArray(st.values[p.pid]) ? [...st.values[p.pid]] : st.values[p.pid] != null ? [st.values[p.pid]] : [];
            const i = cur.indexOf(id);
            const excl = (x) => !!p.opt.get(x)?.exclusive;
            if (i >= 0) cur.splice(i, 1);
            else if (excl(id)) cur.splice(0, cur.length, id); // e.g. Smooth: the other parts go
            else if (cur.some(excl)) cur.splice(0, cur.length, id);
            else if (cur.length >= p.multi) {
                const r = body.querySelector(`.nd-cb-row[data-pid="${p.pid}"]`);
                r?.classList.remove("full");
                void r?.offsetWidth;
                r?.classList.add("full"); // at most `multi` options: the row shakes
                return;
            } else cur.push(id);
            if (cur.length) st.values[p.pid] = cur;
            else delete st.values[p.pid];
            commit();
            return;
        }
        if (isRandom(p.pid)) {
            const all = visibleOptions(p).map((o) => o.id);
            const pool = poolOf(p);
            if (pool.has(id)) {
                if (pool.size === 1) return; // a random pool keeps at least one value
                pool.delete(id);
            } else pool.add(id);
            const list = all.filter((x) => pool.has(x));
            if (list.length === all.length && !viewCat) delete st.pools[p.pid];
            else st.pools[p.pid] = list;
        } else if (st.values[p.pid] === id) {
            delete st.values[p.pid]; // clicking the chosen value again clears it
        } else {
            st.values[p.pid] = id;
        }
        commit();
    }
    // the category of the zone that is open, for a parameter drawn with one category only
    const zoneCat = (p) => SCHEMA.zoneById.get(zoneId())?.cats?.[p.pid] || null;
    const catPool = (p, cat) => p.options.filter((o) => o.cat === cat && (!o.explicit || st.explicit)).map((o) => o.id);
    function toggleRandom(p) {
        if (AR()) return;
        if (isRandom(p.pid)) delete st.values[p.pid];
        else {
            if (p.macro && !isRandom(p.pid)) clearPresetEffects(p);
            st.values[p.pid] = RANDOM;
            const cat = zoneCat(p);
            if (cat) st.pools[p.pid] = catPool(p, cat); // random inside the category
        }
        commit();
    }
    function clearParam(p) {
        if (AR()) return;
        if (p.macro) clearPresetEffects(p);
        delete st.values[p.pid];
        delete st.pools[p.pid];
        delete st.custom[p.pid];
        delete st.ops[p.pid];
        delete st.levels[p.pid];
        commit();
    }
    function setOp(p, v) {
        if (v === "add") delete st.ops[p.pid]; else st.ops[p.pid] = v;
        commit();
    }
    function setNumber(p, v) {
        const n = clampNum(p, v);
        if (n == null) { render(); return; }
        st.values[p.pid] = n;
        commit();
    }
    function setNumPool(p, a, b) {
        let lo = clampNum(p, a) ?? p.min, hi = clampNum(p, b) ?? p.max;
        if (lo > hi) [lo, hi] = [hi, lo];
        if (lo === p.min && hi === p.max) delete st.pools[p.pid];
        else st.pools[p.pid] = [lo, hi];
        commit();
    }

    /* ------------------------------------------------------------ panel */

    // quick buttons of a section (e.g. Female, Futanari): they set several values at once
    function presetRow(z) {
        const r = el("div", "nd-cb-presets");
        r.append(txt("span", "nd-cb-lab", "Quick set"));
        for (const pr of z.presets) {
            const b = btn("nd-cb-btn small", pr.label, null, true);
            tip(b, pr.label, pr.hint || "", pr.labelEn);
            const on = Object.entries(pr.set).every(([pid, v]) => JSON.stringify(st.values[pid]) === JSON.stringify(v));
            b.classList.toggle("on", on && !AR());
            b.disabled = !!AR();
            b.onclick = () => {
                for (const [pid, v] of Object.entries(pr.set)) {
                    if (!SCHEMA.params.has(pid)) continue;
                    st.values[pid] = Array.isArray(v) ? [...v] : v;
                    delete st.pools[pid];
                }
                commit();
            };
            r.append(b);
        }
        return r;
    }

    // "Elf + Fox-folk" for several options, the label for one
    const entryLabel = (p, e) => {
        const pl = e.place === "custom" || (!e.place && e.place_text) ? e.place_text : e.place === RANDOM ? tr("random place") : p.placeBy.get(e.place)?.label;
        const de = e.design === "custom" || (!e.design && e.design_text) ? e.design_text : e.design === RANDOM ? tr("random design") : p.designBy.get(e.design)?.label;
        if (de && pl) return tr("{design} on {place}", { design: de, place: pl.toLowerCase() });
        if (pl) return tr("tattoo on {place}", { place: pl.toLowerCase() });
        return de || tr("tattoo");
    };
    const listLabel = (p, v) => {
        const a = asList(v).filter(isObj);
        return a.length ? a.map((e) => entryLabel(p, e)).join("; ") : tr("none");
    };
    const labelOf = (p, v) => p.type === "list" ? listLabel(p, v) : v === "custom" ? st.custom[p.pid] || tr("Custom") : (Array.isArray(v) ? v.map((x) => p.opt?.get(x)?.label ?? x).join(" + ") : p.opt?.get(v)?.label ?? String(v));

    function valueText(p) {
        const v = valOf(p.pid);
        if (v == null) return opOf(p.pid) === "remove" ? { text: p.edit?.structural ? tr("remove: pick what") : tr("remove"), cls: p.edit?.structural ? "unset" : "set" } : { text: tr("not set"), cls: "unset" };
        if (v === RANDOM) {
            const pk = picks()[p.pid];
            let text = tr("random");
            if (p.type === "number") {
                const [lo, hi] = numPool(p);
                if (lo !== p.min || hi !== p.max) text += ` ${lo}–${hi}`;
                if (pk != null) text += ` → ${pk}`;
            } else if (p.type === "list") {
                if (Array.isArray(pk)) text += ` → ${listLabel(p, pk)}`;
            } else {
                const pool = poolOf(p);
                if (pool.size < p.options.length) text += ` ${tr("({n} of {total})", { n: pool.size, total: p.options.length })}`;
                if (Array.isArray(pk)) text += ` → ${labelOf(p, pk)}`;
                else if (pk != null && p.opt.has(pk)) text += ` → ${p.opt.get(pk).label}`;
            }
            return { text, cls: "rnd" };
        }
        if (p.macro && typeof v === "string" && p.opt.has(v)) {
            const o = p.opt.get(v);
            return { text: `${o.label}${presetModified(o) ? ` · ${tr("modified")}` : ""}`, cls: "set" };
        }
        const opw = opOf(p.pid) === "add" ? "" : tr(opOf(p.pid)) + ": ";
        if (p.type === "number") return { text: `${opw}${v} · ${stageOf(p, v)}`, cls: "set" };
        return { text: opw + labelOf(p, v), cls: "set" };
    }

    function row(p) {
        const r = el("div", "nd-cb-row");
        r.dataset.pid = p.pid;
        const rnd = isRandom(p.pid);
        r.classList.toggle("random", rnd);
        const h = el("div", "nd-cb-rhead");
        const vt = valueText(p);
        if (mutedBy.has(p.pid)) {
            r.classList.add("muted");
            vt.text = tr("not used with {label}", { label: mutedBy.get(p.pid) });
            vt.cls = "unset";
        }
        const val = el("span", `nd-cb-val ${vt.cls}`, vt.text);
        const dice = btn(`nd-cb-dice${rnd ? " on" : ""}`, null, AR() ? "All random is on (toolbar). Click the values to choose what random may pick." : rnd ? "Random: on (click to turn off). Click the values to choose what random may pick." : "Make this parameter random");
        dice.innerHTML = DICE_SVG;
        dice.disabled = !!AR();
        dice.onclick = () => toggleRandom(p);
        const x = btn("nd-cb-x", "×", "Clear");
        x.style.visibility = (st.values[p.pid] != null || (isEdit() && st.ops[p.pid])) && !AR() ? "visible" : "hidden";
        x.onclick = () => clearParam(p);
        const name = el("span", "nd-cb-name", p.label);
        name.classList.add("has-tip");
        tip(name, p.label, p.hint || "", p.labelEn);
        h.append(name, val, el("span", "nd-cb-grow"), dice, x);
        r.append(h);
        if (isEdit() && p.edit?.ops) {
            // what to do with this feature on the picture
            const seg = el("div", "nd-cb-seg nd-cb-ops");
            const cur = opOf(p.pid);
            const hints = { add: "Add it to the picture.", replace: "Remove what is there now and put this instead.", remove: "Take it off the picture." };
            for (const o of p.edit.ops) {
                const b = btn(`nd-cb-segbtn${cur === o ? " on" : ""}`, { add: "Add", replace: "Replace", remove: "Remove" }[o], hints[o]);
                b.dataset.op = o;
                b.onclick = () => setOp(p, o);
                seg.append(b);
            }
            r.append(seg);
        }
        r.append(control(p, val));
        const lkr = p.options ? lockOf(p.pid) : null;
        if (lkr?.reason) r.append(el("div", "nd-cb-tnote", lkr.reason));
        if (isEdit() && opOf(p.pid) === "remove" && st.values[p.pid] == null && !p.edit?.structural && p.type !== "list") r.classList.add("op-remove");
        const feats = p.pid === RACE ? featuresBlock(p) : null;
        if (feats) r.append(feats);
        return r;
    }

    // a parameter with the parameters that hang on it (second hair color under the coloring)
    function rowTree(p, shown) {
        const r = row(p);
        const kids = shown.filter((pid) => P(pid).parent === p.pid);
        if (kids.length) {
            const box = el("div", "nd-cb-kids");
            for (const k of kids) box.append(rowTree(P(k), shown));
            r.append(box);
        }
        return r;
    }

    // features of the chosen race(s) (horns, wings, a tail…): all on, unticked ones are left out of the text
    function featuresBlock(p) {
        const sex = rawEff(SEX);
        const groups = [];
        for (const id of asList(rawEff(p.pid))) {
            const o = p.opt.get(id);
            const attrs = (o?.attrs || []).filter((a) => !a.only || !sex || a.only.includes(sex));
            if (attrs.length) groups.push({ o, attrs });
        }
        if (!groups.length) return null;
        const box = el("div", "nd-cb-feats");
        const lab = txt("div", "nd-cb-featlab has-tip", "Race features");
        tipEn(lab, "Race features", "Everything the race has is on by default. Untick a feature to leave it out of the description (no horns, no tail…).");
        box.append(lab);
        for (const { o, attrs } of groups) {
            const line = el("div", "nd-cb-feat");
            if (groups.length > 1) line.append(el("span", "nd-cb-featrace", o.label));
            for (const a of attrs) {
                const key = `${o.id}.${a.id}`;
                const b = btn("nd-cb-chip", a.label, null, true);
                b.classList.toggle("on", !st.attrs_off.includes(key));
                const off = st.attrs_off.includes(key) ? `(${tr("off")})` : "";
                tip(b, a.label, [a.hint || a.text, off].filter(Boolean).join(" "), a.labelEn);
                b.onclick = () => {
                    const i = st.attrs_off.indexOf(key);
                    if (i >= 0) st.attrs_off.splice(i, 1);
                    else st.attrs_off.push(key);
                    commit();
                };
                line.append(b);
            }
            box.append(line);
        }
        return box;
    }

    function control(p, valEl) {
        let v = valOf(p.pid);
        const rnd = v === RANDOM;
        const lk = !rnd && p.options ? lockOf(p.pid) : null;
        if (lk && (typeof v === "string" || v == null)) v = lk.fix(v) ?? v;
        const pk = rnd ? picks()[p.pid] : null;
        if (p.type === "number") return numberCtl(p, valEl);
        if (p.type === "list") return listCtl(p);
        const pool = rnd ? poolOf(p) : null;
        if (p.type === "scale" && !OPTION_ICONS[p.pid]) { // a scale with pictures (penis size) shows them as tiles
            const wrap = el("div", "nd-cb-scale");
            const steps = el("div", "nd-cb-steps");
            const idx = p.options.findIndex((o) => o.id === v);
            p.options.forEach((o, i) => {
                if (o.explicit && !st.explicit) return;
                const b = btn("nd-cb-step");
                tip(b, o.label, o.hint || "", o.labelEn);
                if (!rnd && idx >= 0 && i <= idx) b.classList.add("fill");
                if (!rnd && i === idx) b.classList.add("cur");
                if (rnd && pool.has(o.id)) b.classList.add("pool");
                if (rnd && o.id === pk) b.classList.add("picked");
                b.onclick = () => clickOption(p, o.id);
                steps.append(b);
            });
            const ends = el("div", "nd-cb-ends");
            ends.append(el("span", null, p.options[0]?.label ?? ""), el("span", null, p.options[p.options.length - 1]?.label ?? ""));
            wrap.append(steps, ends);
            return wrap;
        }
        const icons = OPTION_ICONS[p.pid];
        const wrap = el("div", p.type === "color" ? "nd-cb-swatches" : icons ? "nd-cb-chips icons" : "nd-cb-chips");
        const have = LEVELS ? anatomyNow() : null;
        let lastGroup = null;
        for (const o of visibleOptions(p)) {
            if (o.explicit && !st.explicit) continue;
            const fit = fits(o, have);
            // Simple: poses and acts the character cannot do are not offered; Advanced shows them dimmed
            if (!fit && LEVELS && ui.level === "simple") continue;
            if (o.group) {
                const key = `${o.cat || ""}/${o.group}`;
                if (key !== lastGroup) {
                    lastGroup = key;
                    wrap.append(el("div", "nd-cb-ghead", o.cat && !viewCat ? `${SCHEMA.zoneById.get(o.cat)?.label || o.cat} · ${o.group}` : o.group));
                }
            }
            const b = btn(p.type === "color" ? "nd-cb-sw" : "nd-cb-chip", p.type === "color" || icons?.[o.id] ? null : o.label, null, true);
            if (p.type === "color") b.style.setProperty("--sw", o.swatch || "#888");
            if (icons?.[o.id]) {
                b.classList.add("icon");
                if (p.macro) b.classList.add("wide");
                b.innerHTML = `${icons[o.id]}<span></span>`;
                b.lastChild.textContent = o.label;
            }
            let hint = o.hint || "";
            if (!rnd && (Array.isArray(v) ? v.includes(o.id) : v === o.id)) b.classList.add("on");
            if (lk && lk.auto === o.id && st.values[p.pid] == null) {
                b.classList.add("auto");
                hint = `${hint ? hint + " " : ""}${lk.reason || ""}`.trim();
            }
            if (rnd && pool.has(o.id)) b.classList.add("pool");
            if (rnd && o.id === pk) b.classList.add("picked");
            if (o.only && eff(SEX) && !o.only.includes(eff(SEX))) {
                b.classList.add("odd");
                hint = `${hint ? hint + " " : ""}${tr("Usually for {who}; random skips it.", { who: o.only.map((x) => (x === "female" ? tr("women") : x === "male" ? tr("men") : x)).join(` ${tr("and")} `) })}`;
            }
            const fb = typeof p.filter_by === "string" ? { p: p.filter_by, field: "styles" } : p.filter_by;
            if (fb && o[fb.field] && asList(eff(fb.p)).length && !o[fb.field].some((x) => asList(eff(fb.p)).includes(x))) {
                b.classList.add("odd");
                hint = `${hint ? hint + " " : ""}${fb.field === "styles" ? tr("Not typical for the chosen styles; random skips it.") : tr("Not typical for the chosen posture; random skips it.")}`;
            }
            if (!fit) {
                b.classList.add("odd");
                hint = `${hint ? hint + " " : ""}${tr("Needs {what}; this character has none. Random skips it.", { what: needOf(o) })}`;
            }
            tip(b, o.label, hint, o.labelEn);
            b.onclick = () => clickOption(p, o.id);
            wrap.append(b);
        }
        if (p.type === "color" || p.custom) {
            // a value of your own, typed in words; random never picks it
            const isColor = p.type === "color";
            const b = isColor ? btn("nd-cb-sw custom") : btn("nd-cb-chip custom", "Custom");
            if (isColor) b.innerHTML = '<span class="nd-cb-swin">Aa</span>';
            tip(b, tr("Custom"), rnd ? tr("Random never picks a custom value. Turn random off to type one.") : (isColor ? tr("Type a color of your own, e.g. neon teal.") : p.custom_hint || tr("Type your own, in words.")));
            if (!rnd && v === "custom") b.classList.add("on");
            b.disabled = rnd;
            b.onclick = () => clickOption(p, "custom");
            wrap.append(b);
            if (!rnd && v === "custom") {
                const box = el("div", "nd-cb-customrow");
                const inp = el("input", "nd-cb-tinput");
                inp.type = "text";
                inp.maxLength = 60;
                inp.spellcheck = false;
                inp.placeholder = isColor ? tr("Custom color in words, e.g. neon teal") : p.custom_placeholder || tr("Describe it in a few words");
                inp.value = st.custom[p.pid] || "";
                inp.addEventListener("input", () => {
                    const t = inp.value.replace(/\s+/g, " ").trim();
                    if (t) st.custom[p.pid] = t.slice(0, 60); else delete st.custom[p.pid];
                    valEl.textContent = st.custom[p.pid] || tr("Custom");
                    save();
                });
                box.append(inp);
                const holder = el("div", "nd-cb-colorctl");
                holder.append(wrap, box);
                return holder;
            }
        }
        // options with degrees (how much is exposed): a selector under the chips for each chosen one
        const withLevels = rnd ? [] : p.options.filter((o) => o.levels && (Array.isArray(v) ? v.includes(o.id) : v === o.id) && (!o.explicit || st.explicit));
        if (withLevels.length) {
            const holder = el("div", "nd-cb-colorctl");
            holder.append(wrap);
            for (const o of withLevels) {
                const row = el("div", "nd-cb-levels");
                row.append(el("span", "nd-cb-lab", o.label));
                const ok = o.levels.filter((lv) => fits(lv, have));
                const shownLevels = ok.length ? ok : o.levels;
                const stored = st.levels?.[p.pid]?.[o.id];
                const dflt = shownLevels.some((lv) => lv.id === o.default_level) ? o.default_level : shownLevels[0].id;
                const MULTI = !!p.multi_levels;
                // several degrees can be on at once (the fluids); the others pick exactly one
                const curs = MULTI ? (Array.isArray(stored) ? stored : [stored ?? dflt]).filter((x) => shownLevels.some((lv) => lv.id === x)) : [stored ?? dflt];
                if (MULTI && !curs.length) curs.push(dflt);
                for (const lv of shownLevels) {
                    const b = btn("nd-cb-chip small", lv.label, null, true);
                    tip(b, lv.label, lv.hint || "", lv.labelEn);
                    if (curs.includes(lv.id)) b.classList.add("on");
                    b.onclick = () => {
                        const cell = (st.levels[p.pid] ||= {});
                        if (!MULTI) { cell[o.id] = lv.id; commit(); return; }
                        const set = curs.includes(lv.id) ? curs.filter((x) => x !== lv.id) : [...curs, lv.id];
                        if (!set.length) return; // at least one stays on
                        cell[o.id] = shownLevels.filter((x) => set.includes(x.id)).map((x) => x.id);
                        commit();
                    };
                    row.append(b);
                }
                if (MULTI && shownLevels.length > 1) {
                    const all = curs.length === shownLevels.length;
                    const b = btn("nd-cb-chip small", "All", "Turn on every option of this list");
                    if (all) b.classList.add("on");
                    b.onclick = () => {
                        (st.levels[p.pid] ||= {})[o.id] = all ? [curs[0]] : shownLevels.map((x) => x.id);
                        commit();
                    };
                    row.append(b);
                }
                holder.append(row);
            }
            return holder;
        }
        return wrap;
    }

    function numberCtl(p, valEl) {
        const v = valOf(p.pid);
        const wrap = el("div", "nd-cb-num");
        const numBox = (value, title) => {
            const i = el("input", "nd-cb-numbox");
            i.type = "number";
            i.min = p.min;
            i.max = p.max;
            i.step = 1;
            i.value = value;
            tip(i, title, "");
            return i;
        };
        if (v === RANDOM) {
            const [lo, hi] = numPool(p);
            const a = numBox(lo, tr("Random from")), b = numBox(hi, tr("Random to"));
            a.onchange = b.onchange = () => setNumPool(p, a.value, b.value);
            wrap.append(el("span", "nd-cb-lab", tr("Random from")), a, el("span", "nd-cb-lab", tr("to")), b);
            wrap.classList.add("range-pool");
            return wrap;
        }
        const range = el("input", "nd-cb-range");
        range.type = "range";
        range.min = p.min;
        range.max = p.max;
        range.step = 1;
        range.value = v ?? p.default ?? p.min;
        range.classList.toggle("unset", v == null);
        setRangeFill(range);
        const box = numBox(range.value, `${p.min}–${p.max}`);
        range.addEventListener("input", () => {
            box.value = range.value;
            setRangeFill(range);
            range.classList.remove("unset");
            valEl.textContent = `${range.value} · ${stageOf(p, Number(range.value))}`;
            valEl.className = "nd-cb-val set";
        });
        range.addEventListener("change", () => setNumber(p, range.value));
        box.addEventListener("change", () => setNumber(p, box.value));
        const marks = el("div", "nd-cb-stages");
        for (const s of p.stages || []) {
            const m = el("span", null, s.label);
            m.style.flex = String(s.to - s.from + 1);
            marks.append(m);
        }
        const line = el("div", "nd-cb-numline");
        line.append(range, box);
        wrap.append(line, marks);
        return wrap;
    }

    // tattoos: a card per tattoo with place, side, design, style, size and color
    function listCtl(p) {
        const v = valOf(p.pid);
        const wrap = el("div", "nd-cb-tats");
        if (v === RANDOM) {
            wrap.append(el("div", "nd-cb-tnote", AR()
                ? tr("All random: about a third of the characters get 1–3 tattoos.")
                : tr("Random: the seed gives 1–3 tattoos, each with a random place, design, style, size and color.")));
            return wrap;
        }
        const items = Array.isArray(v) ? v.filter(isObj) : [];
        const max = p.max || 8;
        const setItems = (arr) => {
            if (arr.length) st.values[p.pid] = arr.slice(0, max);
            else delete st.values[p.pid];
            commit();
        };
        items.forEach((e, i) => wrap.append(tattooCard(p, items, e, i, setItems)));
        const bar2 = el("div", "nd-cb-tbar");
        const add = btn("nd-cb-btn small", "+ Add tattoo", "Add a tattoo: choose its place and design");
        const addR = btn("nd-cb-btn small", "+ Random tattoo", "Add a tattoo where everything is picked by the seed");
        add.disabled = addR.disabled = items.length >= max || !!AR();
        add.onclick = () => setItems([...items, { place: RANDOM, design: RANDOM }]);
        addR.onclick = () => setItems([...items, Object.fromEntries(["place", "side", "design", "style", "size", "color"].map((k) => [k, RANDOM]))]);
        bar2.append(add, addR, el("span", "nd-cb-tcount", tr("{n} of {max}", { n: items.length, max })));
        wrap.append(bar2);
        const pk = picks()[p.pid];
        if (Array.isArray(pk) && items.some((e) => Object.values(e).includes(RANDOM))) wrap.append(el("div", "nd-cb-tnote", tr("Picked: {list}", { list: listLabel(p, pk) })));
        return wrap;
    }

    function tattooCard(p, items, e, i, setItems) {
        const card = el("div", "nd-cb-tcard");
        const head2 = el("div", "nd-cb-thead");
        head2.append(el("span", "nd-cb-tname", `${i + 1}. ${entryLabel(p, e)}`), el("span", "nd-cb-grow"));
        const rm = btn("nd-cb-x", "×", "Remove this tattoo");
        rm.onclick = () => setItems(items.filter((x) => x !== e));
        head2.append(rm);
        card.append(head2);
        const adultOn = !!st.genitals;
        const field = (label, key, table, extra = {}) => {
            const f = el("label", "nd-cb-tfield");
            f.append(el("span", "nd-cb-lab", tr(label)));
            const sel = el("select", "nd-cb-sel");
            const add = (value, text, parent = sel) => {
                const o = el("option", null, text);
                o.value = value;
                parent.append(o);
            };
            add("", tr(extra.none || "Not set"));
            add(RANDOM, tr("Random"));
            if (extra.custom) add("custom", tr("Custom text…"));
            const groups = new Map();
            for (const o of table) {
                const cur = e[key] === o.id;
                if (o.adult && !adultOn && !cur) continue;
                const g = o.group || "";
                if (!groups.has(g)) groups.set(g, []);
                groups.get(g).push(o);
            }
            for (const [g, list] of groups) {
                let parent = sel;
                if (g) { parent = el("optgroup"); parent.label = g; sel.append(parent); }
                for (const o of list) add(o.id, o.label + (o.adult && !adultOn ? ` (${tr("needs Genitals")})` : ""), parent);
            }
            const textKey = key + "_text";
            sel.value = e[key] ?? (e[textKey] ? "custom" : "");
            sel.onchange = () => {
                if (sel.value === "") delete e[key]; else e[key] = sel.value;
                if (sel.value !== "custom") delete e[textKey];
                else e[textKey] ||= "";
                // a tattoo needs a place or a design
                if (!e.place && !e.design && !e.place_text && !e.design_text) e[key === "place" ? "design" : "place"] = RANDOM;
                setItems(items);
            };
            f.append(sel);
            return f;
        };
        const grid = el("div", "nd-cb-tgrid");
        grid.append(field("Place", "place", p.places, { custom: true, none: "No place" }));
        const place = p.placeBy.get(e.place);
        if (e.place === RANDOM || place?.paired) {
            const f = el("label", "nd-cb-tfield");
            f.append(el("span", "nd-cb-lab", tr("Side")));
            const sel = el("select", "nd-cb-sel");
            for (const [val, text] of [["", tr("Not set")], [RANDOM, tr("Random")], ["left", tr("Left")], ["right", tr("Right")], ["both", tr("Both")]]) {
                const o = el("option", null, text);
                o.value = val;
                sel.append(o);
            }
            sel.value = e.side ?? "";
            sel.onchange = () => { if (sel.value) e.side = sel.value; else delete e.side; setItems(items); };
            f.append(sel);
            grid.append(f);
        }
        grid.append(field("Design", "design", p.designs, { custom: true, none: "Just a tattoo" }));
        grid.append(field("Style", "style", p.styles), field("Size", "size", p.sizes), field("Color", "color", p.colors, { custom: true }));
        card.append(grid);
        for (const key of ["place_text", "design_text", "color_text"]) {
            const kind = key.replace("_text", "");
            if (e[kind] !== "custom" && !(e[key] && !e[kind])) continue;
            const inp = el("input", "nd-cb-tinput");
            inp.type = "text";
            inp.maxLength = 120;
            inp.spellcheck = false;
            inp.placeholder = tr({ place: "Place, in words (e.g. left hip bone)", design: "Design, in words (e.g. a coiled dragon)", color: "Ink color, in words (e.g. neon pink)" }[kind]);
            inp.value = e[key] || "";
            inp.addEventListener("input", () => { e[key] = inp.value; save(); });
            card.append(inp);
        }
        if (!adultOn && (place?.adult || p.designBy.get(e.design)?.adult)) card.append(el("div", "nd-cb-tnote", tr("Not used while the Genitals option is off.")));
        return card;
    }

    // free text added after the description, as its own paragraph
    function extraRow() {
        const r = el("div", "nd-cb-row nd-cb-extra");
        const h = el("div", "nd-cb-rhead");
        const name = txt("span", "nd-cb-name has-tip", "Extra prompt");
        tipEn(name, "Extra prompt", "Any text you want after the description (style, scene, quality words). It is added as a new paragraph, after the outfit when there is one. Random never changes it.");
        const x = btn("nd-cb-x", "×", "Clear");
        x.style.visibility = st.extra ? "visible" : "hidden";
        h.append(name, el("span", "nd-cb-grow"), x);
        const ta = el("textarea", "nd-cb-text");
        ta.rows = 3;
        ta.spellcheck = false;
        ta.dataset.i18nPh = "Added after the description…";
        ta.placeholder = tr("Added after the description…");
        ta.value = st.extra || "";
        ta.dataset.ndScroll = "1";
        // the height dragged with the corner handle is kept with the node, whatever tab or value changes
        const savedH = Number(node.properties.nd_extra_h);
        if (savedH > 0) ta.style.height = `${savedH}px`;
        new ResizeObserver(() => {
            const h = parseFloat(ta.style.height);
            if (ta.isConnected && h > 0 && Math.round(h) !== Math.round(Number(node.properties.nd_extra_h) || 0)) {
                node.properties.nd_extra_h = Math.round(h);
                app.graph?.change?.();
            }
        }).observe(ta);
        ta.addEventListener("input", () => { st.extra = ta.value; x.style.visibility = ta.value ? "visible" : "hidden"; save(); });
        x.onclick = () => { st.extra = ""; ta.value = ""; x.style.visibility = "hidden"; save(); };
        r.append(h, ta);
        return r;
    }

    /* ------------------------------------------------------------ render */

    function render() {
        // toolbar
        cNat.i.checked = st.formats.natural;
        cTag.i.checked = st.formats.tags;
        cAvoid.i.checked = st.avoid_conflicts;
        cAll.i.checked = !!AR();
        const ed = isEdit();
        cAll.i.disabled = cTag.i.disabled = cNat.i.disabled = ed;
        if (ed) { cNat.i.checked = true; cTag.i.checked = false; }
        tipEn(cAll.l, "All random", ed ? "Not available in Edit mode: it would rewrite the whole character." : ALL_RANDOM_HINT);
        root.classList.toggle("edit-mode", ed);
        const editLock = cfg.editLocked?.(st) || "";
        for (const b of modeSeg.children) {
            b.classList.toggle("on", b.dataset.mode === st.mode);
            if (b.dataset.mode === "edit") {
                b.disabled = !!editLock;
                b.classList.toggle("locked", !!editLock);
                tipEn(b, "Edit", editLock || "Instructions for image-editing models (Qwen Image Edit, Flux 2 Klein, Krea 2 Edit…): only what you set is changed.");
            }
        }
        extraBar?.update?.();
        cGen.i.checked = !!st[TOGGLE.key];
        root.classList.toggle("all-random", !!AR());
        zRand.disabled = zClear.disabled = !!AR();
        const pk = picks();
        const randoms = AR()
            ? [...SCHEMA.params.keys()].filter(applies)
            : Object.keys(st.values).filter((pid) => st.values[pid] === RANDOM && SCHEMA.params.has(pid) && sectionOn(pid));
        const fixable = randoms.filter((pid) => pk[pid] != null);
        bFix.disabled = !fixable.length;
        let stText = "";
        if (randoms.length) stText = node.properties.nd_picked ? tr("{n} random · seed {seed}", { n: randoms.length, seed: node.properties.nd_picked.seed }) : tr("{n} random · run to pick", { n: randoms.length });
        const pre = presetOn();
        if (pre && !AR()) stText = `${pre.label}${presetModified(pre) ? ` · ${tr("modified")}` : ""}${stText ? "  ·  " + stText : ""}`;
        if (!st.enabled) stText = tr("Off: adds nothing to the prompt");
        status.textContent = stText;
        root.classList.toggle("off", !st.enabled);
        bPower.classList.toggle("on", !!st.enabled);
        bPower.dataset.i18n = st.enabled ? "On" : "Off";
        bPower.textContent = tr(st.enabled ? "On" : "Off");
        bPower.setAttribute("aria-pressed", st.enabled ? "true" : "false");
        for (const b of levelSeg.children) b.classList.toggle("on", b.dataset.level === ui.level);

        hideTip();
        computeMuted();
        // section buttons: state dots and a tooltip with what is set
        for (const b of zoneBtns) {
            const z = SCHEMA.zoneById.get(b.dataset.zone);
            b.style.display = zoneOn(z.id) ? "" : "none";
            b.className = `nd-cb-zbtn ${zoneCls(z.id)}`;
            tip(b, z.label, zoneSummary(z), z.labelEn);
        }

        // panel: the parameters of the zone that apply to the chosen sex
        const z = SCHEMA.zoneById.get(zoneId());
        title.textContent = z.label;
        const customZone = z.custom && cfg.customZones?.[z.custom];
        zRand.style.display = zClear.style.display = customZone ? "none" : "";
        const shown = z.params.filter(suits);
        const hidden = z.params.filter((pid) => !suitsSex(pid)).length;
        const waiting = z.params.filter((pid) => suitsSex(pid) && !required(pid) && !P(pid).parent).length;
        count.textContent = tr("{n} of {total} set", { n: shown.filter((pid) => zHas(z, pid) || zRnd(z, pid)).length, total: shown.length });
        zCopy.style.display = z.copy ? "" : "none";
        if (z.copy) {
            zCopy.textContent = z.copy.label || tr("Copy");
            tip(zCopy, z.copy.label || tr("Copy"), z.copy.hint || "", z.copy.labelEn);
        }
        const keep = body.scrollTop;
        if (customZone) {
            count.textContent = "";
            zCopy.style.display = "none";
            body.replaceChildren(customZone(ctx));
            body.scrollTop = keep;
            relabel(root, LANG());
            return;
        }
        const rows = shown.filter((pid) => !P(pid).parent).map((pid) => {
            viewCat = z.cats?.[pid] || null;
            const r = rowTree(P(pid), shown);
            viewCat = null;
            return r;
        });
        if (z.presets?.length) rows.unshift(presetRow(z));
        if (waiting) {
            // parameters that wait for another one (e.g. penis size for the parts)
            const by = [...new Set(z.params.filter((pid) => suitsSex(pid) && !required(pid) && !P(pid).parent).map((pid) => P(pid).requires.p))];
            const pending = by.some((pid) => isRandom(pid) && picks()[pid] == null);
            const names = by.map((pid) => P(pid)?.label ?? pid).join(", ");
            rows.push(el("div", "nd-cb-note", pending
                ? tr("{n} more parameters appear once a run picks {list}.", { n: waiting, list: names })
                : tr("{n} more parameters appear for what you choose in {list}.", { n: waiting, list: names })));
        }
        if (hidden) {
            const sex = rawEff(SEX);
            const who = sex === "male" ? tr("women") : sex === "female" ? tr("men") : tr("the other sex");
            rows.push(el("div", "nd-cb-note", tr("{n} parameters for {who} hidden ({sex}).", { n: hidden, who, sex: `${P(SEX)?.label ?? "Sex"}: ${P(SEX)?.opt.get(sex)?.label ?? sex}` })));
        }
        if (cfg.extraZones ? cfg.extraZones.includes(z.id) : z.id === DEFAULT_ZONE) rows.push(extraRow());
        body.replaceChildren(...rows);
        body.scrollTop = keep;
        relabel(root, LANG());
    }

    /* ------------------------------------------------------------ events */

    const onFormat = (which) => () => {
        const other = which === "natural" ? "tags" : "natural";
        const box = which === "natural" ? cNat.i : cTag.i;
        if (!box.checked && !st.formats[other]) {
            box.checked = true; // one format always stays on
            fmt.classList.remove("shake");
            void fmt.offsetWidth;
            fmt.classList.add("shake");
            return;
        }
        st.formats[which] = box.checked;
        save();
    };
    cNat.i.addEventListener("change", onFormat("natural"));
    cTag.i.addEventListener("change", onFormat("tags"));
    cAvoid.i.addEventListener("change", () => { st.avoid_conflicts = cAvoid.i.checked; save(); });
    cAll.i.addEventListener("change", () => { st.all_random = cAll.i.checked; commit(); });
    cGen.i.addEventListener("change", () => { st[TOGGLE.key] = cGen.i.checked; commit(); });

    bFix.onclick = () => {
        const pk = picks();
        let n = 0;
        if (AR()) {
            // the whole picked character becomes the fixed values
            st.values = {};
            for (const [pid, v] of Object.entries(pk)) if (SCHEMA.params.has(pid)) { st.values[pid] = v; n++; }
            st.all_random = false;
            commit();
            return;
        }
        for (const pid of Object.keys(st.values)) {
            if (st.values[pid] === RANDOM && pk[pid] != null) { st.values[pid] = pk[pid]; n++; }
        }
        if (n) commit();
    };
    let resetTimer = null;
    bReset.onclick = () => {
        if (!bReset.classList.contains("confirm")) {
            bReset.classList.add("confirm");
            bReset.dataset.i18n = "Click to confirm";
            bReset.textContent = tr("Click to confirm");
            clearTimeout(resetTimer);
            resetTimer = setTimeout(() => { bReset.classList.remove("confirm"); bReset.dataset.i18n = "Reset"; bReset.textContent = tr("Reset"); }, 2500);
            return;
        }
        clearTimeout(resetTimer);
        bReset.classList.remove("confirm");
        bReset.dataset.i18n = "Reset";
        bReset.textContent = tr("Reset");
        st.values = {};
        st.ops = {};
        st.levels = {};
        st.pools = {};
        st.attrs_off = [];
        st.custom = {};
        delete node.properties.nd_picked;
        commit();
    };
    zRand.onclick = () => {
        const z = SCHEMA.zoneById.get(zoneId());
        for (const pid of z.params.filter(suits)) {
            if (P(pid).macro) clearPresetEffects(P(pid));
            st.values[pid] = RANDOM;
            if (z.cats?.[pid]) st.pools[pid] = catPool(P(pid), z.cats[pid]); // random inside the category
        }
        commit();
    };
    zCopy.onclick = () => {
        const map = SCHEMA.zoneById.get(zoneId())?.copy?.map || {};
        for (const [from, to] of Object.entries(map)) {
            if (st.values[from] == null) delete st.values[to];
            else st.values[to] = st.values[from];
            if (Array.isArray(st.pools[from])) st.pools[to] = [...st.pools[from]];
            else delete st.pools[to];
        }
        commit();
    };
    zClear.onclick = () => {
        const zz = SCHEMA.zoneById.get(zoneId());
        const zp = zz.params;
        for (const pid of zp) {
            if (zz.cats?.[pid] && !(st.values[pid] === RANDOM || P(pid).opt.get(st.values[pid])?.cat === zz.cats[pid])) continue; // a pose of another category stays
            if (P(pid).macro) clearPresetEffects(P(pid));
            delete st.values[pid]; delete st.pools[pid]; delete st.ops[pid];
        }
        if (zp.includes(RACE)) st.attrs_off = [];
        commit();
    };
    rail.addEventListener("click", (e) => {
        const z = e.target?.closest?.("[data-zone]");
        if (z) selectZone(z.dataset.zone);
    });

    /* ------------------------------------------------------------ presets */

    const say = (text, bad = false) => { pMsg.textContent = text; pMsg.classList.toggle("bad", bad); };
    let presets = {};
    function listPresets() {
        pList.replaceChildren();
        const names = Object.keys(presets).sort((a, b) => a.localeCompare(b));
        if (!names.length) pList.append(txt("div", "nd-cb-pempty", "No presets yet."));
        for (const name of names) {
            const rowEl = el("div", "nd-cb-prow");
            const load = btn("nd-cb-pload", name, "Load this preset: it replaces every setting of the node", true);
            const del = btn("nd-cb-pdel", "×", "Delete this preset");
            const exp = btn("nd-cb-pexp", null, "Export this preset to a .json file");
            exp.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 21h14"/></svg>';
            exp.onclick = () => downloadJson(`${safeFile(name)}.json`, { type: "nd_character_presets", version: 1, presets: { [name]: presets[name] } });
            load.onclick = () => {
                const pr = presets[name];
                const wasOn = st.enabled;
                st = norm(JSON.stringify(pr.state || {}));
                st.enabled = wasOn; // a preset never switches the node on or off
                delete node.properties.nd_picked;
                pName.value = name;
                save(); render();
                say(tr('Loaded "{name}".', { name }));
                syncSaveBtn();
            };
            del.onclick = async () => {
                if (!del.classList.contains("confirm")) {
                    for (const d of pList.querySelectorAll(".nd-cb-pdel.confirm")) { d.classList.remove("confirm"); d.dataset.i18n = "×"; d.textContent = "×"; }
                    del.classList.add("confirm");
                    del.dataset.i18n = "Delete?";
                    del.textContent = tr("Delete?");
                    return;
                }
                try {
                    const next = { ...(await loadPresets(true)) };
                    delete next[name];
                    await writePresets(next);
                    presets = next;
                    listPresets();
                    say(tr('Deleted "{name}".', { name }));
                } catch (e) { say(tr("Could not delete: {error}", { error: e.message }), true); }
            };
            rowEl.append(load, exp, del);
            pList.append(rowEl);
        }
        syncSaveBtn();
        relabel(pop, LANG());
    }
    const syncSaveBtn = () => {
        const name = pName.value.trim();
        pSaveBtn.disabled = !name;
        pSaveBtn.dataset.i18n = name && presets[name] ? "Overwrite" : "Save";
        pSaveBtn.textContent = tr(pSaveBtn.dataset.i18n);
    };
    pName.addEventListener("input", syncSaveBtn);
    pName.addEventListener("keydown", (e) => { if (e.key === "Enter") pSaveBtn.click(); });
    pSaveBtn.onclick = async () => {
        const name = pName.value.trim();
        if (!name) return;
        try {
            const next = { ...(await loadPresets(true)), [name]: { state: (H.sync?.(st), (({ enabled, ...rest }) => JSON.parse(JSON.stringify(rest)))(st)), saved: new Date().toISOString() } };
            await writePresets(next);
            presets = next;
            listPresets();
            say(tr('Saved "{name}".', { name }));
        } catch (e) { say(tr("Could not save: {error}", { error: e.message }), true); }
    };
    pExport.onclick = async () => {
        try {
            presets = await loadPresets(true);
            if (!Object.keys(presets).length) return say(tr("There are no presets to export."));
            downloadJson("nd_character_presets.json", { type: "nd_character_presets", version: 1, presets });
            say(tr("Exported {n} presets.", { n: Object.keys(presets).length }));
        } catch (e) { say(tr("Could not export: {error}", { error: e.message }), true); }
    };
    pImport.onclick = () => { pInput.value = ""; pInput.click(); };
    async function addPresets(incoming, how) {
        const cur = { ...(await loadPresets(true)) };
        let added = 0, over = 0, skipped = 0;
        for (const [name, pr] of Object.entries(incoming)) {
            const clean = { state: normalizeState(JSON.stringify(pr.state)), saved: pr.saved };
            if (!cur[name]) { cur[name] = clean; added++; }
            else if (how === "overwrite") { cur[name] = clean; over++; }
            else if (how === "rename") { cur[freeName(name, cur)] = clean; added++; }
            else skipped++;
        }
        await writePresets(cur);
        presets = cur;
        listPresets();
        const bits = [tr("{n} added", { n: added })];
        if (over) bits.push(tr("{n} overwritten", { n: over }));
        if (skipped) bits.push(tr("{n} skipped", { n: skipped }));
        say(tr("Imported: {list}.", { list: bits.join(", ") }));
    }
    pInput.onchange = async () => {
        const file = pInput.files?.[0];
        if (!file) return;
        pAsk.style.display = "none";
        let incoming;
        try { incoming = presetsFromFile(JSON.parse(await file.text()), file.name); } catch { return say(tr("{file} is not a presets file.", { file: file.name }), true); }
        const names = Object.keys(incoming);
        if (!names.length) return say(tr("{file} has no presets of this node.", { file: file.name }), true);
        try {
            const cur = await loadPresets(true);
            const clash = names.filter((n) => cur[n]);
            if (!clash.length) return await addPresets(incoming, "rename");
            // some names are taken: ask what to do with them
            say("");
            pAsk.replaceChildren(el("div", null, tr("{n} presets in the file; {clash} already exist: {names}", { n: names.length, clash: clash.length, names: `${clash.slice(0, 4).join(", ")}${clash.length > 4 ? "…" : ""}` })));
            const acts = el("div", "nd-cb-pacts");
            for (const [how, label, hint] of [["rename", "Keep both", "The imported ones get a number: Name (2)"], ["overwrite", "Overwrite", "The imported ones replace yours"], ["skip", "Skip", "Only the new names are added"]]) {
                const b = btn("nd-cb-btn small", label, hint);
                b.onclick = async () => { pAsk.style.display = "none"; try { await addPresets(incoming, how); } catch (e) { say(tr("Could not import: {error}", { error: e.message }), true); } };
                acts.append(b);
            }
            const cancel = btn("nd-cb-btn small", "Cancel");
            cancel.onclick = () => { pAsk.style.display = "none"; };
            acts.append(cancel);
            pAsk.append(acts);
            pAsk.style.display = "";
            relabel(pop, LANG());
        } catch (e) { say(tr("Could not import: {error}", { error: e.message }), true); }
    };
    const closePop = () => { pop.style.display = "none"; pAsk.style.display = "none"; bPresets.classList.remove("on"); };
    bPresets.onclick = async () => {
        if (pop.style.display !== "none") return closePop();
        pop.style.display = "";
        bPresets.classList.add("on");
        say("");
        pList.replaceChildren(txt("div", "nd-cb-pempty", "Loading…"));
        relabel(pop, LANG());
        try { presets = await loadPresets(true); listPresets(); } catch (e) { pList.replaceChildren(); say(tr("Presets are not available: {error}", { error: e.message }), true); }
        pName.focus();
    };
    const onDocDown = (e) => {
        if (pop.style.display !== "none" && !pop.contains(e.target) && !bPresets.contains(e.target)) closePop();
    };
    document.addEventListener("pointerdown", onDocDown, true);
    // typing in the panel must not trigger ComfyUI shortcuts
    for (const ev of ["keydown", "keyup", "keypress"]) {
        root.addEventListener(ev, (e) => { if (e.target?.tagName === "INPUT" || e.target?.tagName === "TEXTAREA") e.stopPropagation(); });
    }


    /* ----------------------------------------------------------- look */

    function applyUi() {
        const c = colorsOf(ui);
        root.style.setProperty("--nd-accent", c.accent);
        root.style.setProperty("--nd-set", c.set);
        root.style.setProperty("--nd-rnd", c.rnd);
        const k = scaleOf();
        // CSS zoom: everything grows or shrinks together; the box still fills the widget
        // (percent sizes are taken from the unzoomed parent)
        root.style.zoom = String(k);
        if (modal) for (const [v, c2] of [["--nd-accent", c.accent], ["--nd-set", c.set], ["--nd-rnd", c.rnd]]) modal.style.setProperty(v, c2);
        const w = MIN_W * k, h = MIN_H * k;
        if (node.size && (node.size[0] < w || node.size[1] < h)) node.setSize?.([Math.max(node.size[0], w), Math.max(node.size[1], h)]);
        dirty();
    }
    function setUi(next) {
        ui = normalizeUi({ ...ui, ...next });
        node.properties.nd_ui = ui;
        rememberUi(ui);
        applyUi();
    }

    // the language of the node changed (its own choice, or the common one): words of the data and of the interface
    let langSeq = 0;
    async function applyLang() {
        const lang = LANG(), seq = ++langSeq;
        const next = await schemaFor(cfg.schemaFile, lang, cfg.i18n);
        if (seq !== langSeq) return; // changed again meanwhile
        if (next) SCHEMA = next;
        root.dataset.lang = lang;
        render();
        if (modal) { closeSettings(); openSettings(); }
    }
    const onLangEvent = () => { if (ui.lang === "auto") applyLang(); };
    window.addEventListener(LANG_EVENT, onLangEvent);

    /* ----------------------------------------------------------- settings */

    let modal = null;
    function closeSettings() {
        if (!modal) return;
        modal.remove();
        modal = null;
        document.removeEventListener("keydown", onModalKey, true);
        bGear.classList.remove("on");
    }
    const onModalKey = (e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeSettings(); }
    };
    function openSettings() {
        if (modal) return closeSettings();
        const back = el("div", "nd-cbs-back");
        const box = el("div", "nd-cbs-modal");
        const head = el("div", "nd-cbs-head");
        const x = btn("nd-cbs-x", "×", "Close");
        head.append(el("span", null, tr("{name} settings", { name: tr(cfg.title) })), x);
        const content = el("div", "nd-cbs-content");
        content.dataset.ndScroll = "1";
        const section = (label, ...kids) => {
            const sec = el("div", "nd-cbs-sec");
            sec.append(txt("div", "nd-cbs-title", label), ...kids);
            content.append(sec);
            return sec;
        };
        const note = (t) => txt("div", "nd-cbs-note", t);

        // the language of the interface (the prompt text stays English)
        const own = el("div", "nd-cb-seg nd-cbs-lang");
        const common = el("div", "nd-cb-seg nd-cbs-lang");
        const langName = (id) => LANGS.find((l) => l.id === id)?.label || id;
        const paintLang = () => {
            for (const b of own.children) b.classList.toggle("on", b.dataset.lang === ui.lang);
            for (const b of common.children) b.classList.toggle("on", b.dataset.lang === commonLang());
            own.firstChild.textContent = tr("Same as all nodes ({lang})", { lang: langName(commonLang()) });
        };
        const ownBtn = (id) => {
            const b = btn("nd-cb-segbtn", id === "auto" ? "" : langName(id), null, true);
            b.dataset.lang = id;
            b.onclick = () => { setUi({ lang: id }); paintLang(); applyLang(); };
            return b;
        };
        own.append(ownBtn("auto"), ...LANGS.map((l) => ownBtn(l.id)));
        for (const l of LANGS) {
            const b = btn("nd-cb-segbtn", l.label, null, true);
            b.dataset.lang = l.id;
            b.onclick = () => setCommonLang(l.id);
            common.append(b);
        }
        paintLang();
        section("Language", note("This node"), own, note("All nodes"), common,
            note("Only the interface language changes. The prompt text stays in English: image models understand English best. The names of the pins stay in English too."));

        // the toolbar checkboxes live here now (the same elements, so their handlers stay)
        section("Prompt format", fmt, note("Natural: sentences, best for Flux 2, Krea 2, Qwen Image. Tags: comma-separated tags. At least one stays on."));
        const cKeep = check("Keep the rest unchanged", "Adds a closing line: keep her face and everything you did not touch exactly as it is.");
        cKeep.i.checked = st.edit_keep;
        cKeep.i.addEventListener("change", () => { st.edit_keep = cKeep.i.checked; save(); });
        const subj = el("input", "nd-cbs-input");
        subj.type = "text";
        subj.maxLength = 80;
        subj.placeholder = "the woman on the left"; // an example of what goes into the prompt: it stays English
        subj.value = st.edit_subject;
        subj.addEventListener("input", () => { st.edit_subject = subj.value.replace(/\s+/g, " ").trim().slice(0, 80); save(); });
        const editKids = [cKeep.l];
        if (cfg.editStyle) {
            // the Outfit Builder: instructions per slot, or one sentence that replaces the whole outfit
            const seg = el("div", "nd-cb-seg");
            for (const [id, label, hint] of [["full", "Full", "Add, Replace or Remove per slot: \"Dress her in…\", \"Remove her shoes\"."], ["simple", "Simple", "One sentence: \"Change her outfit to…\"."]]) {
                const b = btn(`nd-cb-segbtn${st.edit_style === id ? " on" : ""}`, label, hint);
                b.onclick = () => { st.edit_style = id; save(); for (const x of seg.children) x.classList.toggle("on", x === b); };
                seg.append(b);
            }
            editKids.push(note("Edit text"), seg);
        }
        if (cfg.editSubject) editKids.push(note("Subject (optional)"), subj);
        editKids.push(note(cfg.editNote));
        section("Edit mode", ...editKids);
        section("Random", cAvoid.l, note("Random picks skip values that clash with the others (e.g. a pixie cut with waist-length hair)."));
        section("Content", cGen.l, note(TOGGLE.note));

        // colours
        const themes = el("div", "nd-cbs-themes");
        const customBox = el("div", "nd-cbs-custom");
        const themeBtn = (id, label, c) => {
            const b = btn("nd-cbs-theme", null, label);
            const dots = el("span", "nd-cbs-dots");
            for (const k of ["accent", "set", "rnd"]) {
                const d = el("i");
                d.style.background = c[k];
                dots.append(d);
            }
            b.append(dots, txt("span", null, label));
            b.dataset.theme = id;
            b.onclick = () => { setUi({ theme: id }); syncThemes(); };
            return b;
        };
        for (const t of THEMES) themes.append(themeBtn(t.id, t.label, t));
        const customBtn = themeBtn("custom", "Custom", ui.custom);
        themes.append(customBtn);
        const buildCustom = () => {
            customBox.replaceChildren();
            for (const [k, label, hint] of COLOR_ROLES) {
                const rowEl = el("div", "nd-cbs-crow");
                const lab = el("div", "nd-cbs-clabel");
                lab.append(txt("b", null, label), txt("span", null, hint));
                rowEl.append(lab, colorPicker(ui.custom[k], (hex) => {
                    setUi({ theme: "custom", custom: { ...ui.custom, [k]: hex } });
                    customBtn.querySelectorAll(".nd-cbs-dots i")[["accent", "set", "rnd"].indexOf(k)].style.background = hex;
                    syncThemes(false);
                }));
                customBox.append(rowEl);
            }
            relabel(customBox, LANG());
        };
        const syncThemes = (rebuild = true) => {
            for (const b of themes.children) b.classList.toggle("on", b.dataset.theme === ui.theme);
            customBox.style.display = ui.theme === "custom" ? "" : "none";
            if (rebuild && ui.theme === "custom") buildCustom();
        };
        section("Colours", themes, customBox);
        syncThemes();

        // UI scale
        const scRow = el("div", "nd-cbs-scale");
        const sc = el("input", "nd-cbs-range");
        sc.type = "range";
        sc.min = SCALE_RANGE[0];
        sc.max = SCALE_RANGE[1];
        sc.step = 5;
        sc.value = ui.scale;
        setRangeFill(sc);
        const scVal = el("span", "nd-cbs-scval", `${ui.scale}%`);
        const scReset = btn("nd-cb-btn small", "100%", "Back to 100%");
        sc.oninput = () => { setRangeFill(sc); scVal.textContent = `${sc.value}%`; setUi({ scale: Number(sc.value) }); };
        scReset.onclick = () => { sc.value = 100; sc.oninput(); };
        scRow.append(sc, scVal, scReset);
        section("UI scale", scRow, note("The size of everything in the node. The node grows when its content no longer fits."));

        const foot = el("div", "nd-cbs-foot");
        const done = btn("nd-cb-btn primary", "Done");
        foot.append(done);
        box.append(head, content, foot);
        back.append(box);
        back.dataset.lang = LANG();
        bindTips(back);
        relabel(back, LANG());
        paintLang();
        x.onclick = done.onclick = closeSettings;
        back.addEventListener("pointerdown", (e) => { if (e.target === back) closeSettings(); });
        for (const ev of ["keydown", "keyup", "keypress"]) back.addEventListener(ev, (e) => { if (e.key !== "Escape") e.stopPropagation(); });
        document.addEventListener("keydown", onModalKey, true);
        document.body.append(back);
        modal = back;
        applyUi();
        bGear.classList.add("on");
    }
    bGear.onclick = openSettings;

    bindTips(root);
    bindCanvasNavigation(host, node);
    node.addDOMWidget("nd_character", "ND_CHARACTER", host, {
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => (MIN_H - 80) * scaleOf(),
    });

    node.ndCB = {
        restore() {
            st = norm(wState?.value);
            ui = normalizeUi(node.properties.nd_ui ?? ui);
            node.properties.nd_ui = ui;
            const want = schemaNow(cfg.schemaFile, LANG());
            if (want) SCHEMA = want; else applyLang();
            applyUi();
            // settings of the old figure preview, no longer used
            delete node.properties.nd_split;
            delete node.properties.nd_view;
            render();
        },
        refresh: render,
        executed(d) { cfg.onExecuted?.(d, ctx); },
        isCharacter: cfg.node === "NDCharacterBuilder",
        setMode(id) { if (st.mode !== id) setMode(id); },
        // what the character has (for the Pose Builder): null when it is not known yet (sex or parts are random / not set)
        anatomy() {
            const sex = st.values["general.sex"];
            if (cfg.node !== "NDCharacterBuilder" || !sex || sex === RANDOM) return null;
            let parts = st.genitals ? st.values["genitals.parts"] : null;
            if (parts === RANDOM) return null;
            parts = parts ? asList(parts) : sex === "female" ? ["vulva", "anus"] : ["penis", "testicles", "anus"];
            const out = parts.filter((x) => ["vulva", "penis", "testicles", "anus"].includes(x));
            if (sex === "female") out.push("breasts");
            return out;
        },
        // for ND Composition Settings: which way the body faces the camera (an option id; null when it is not set, or random and not run yet)
        facing() {
            if (cfg.node !== "NDPoseBuilder") return null;
            const v = rawEff("posture.facing");
            return typeof v === "string" && v !== RANDOM ? v : null;
        },
        // what the chosen ready-made pose suggests for the camera ({height, orbit, framing, special}); {} for none
        cameraHint() {
            if (!MACRO) return {};
            const v = rawEff(MACRO);
            const o = typeof v === "string" && v !== RANDOM ? P(MACRO).opt.get(v) : null;
            return o?.camera && typeof o.camera === "object" ? { ...o.camera } : {};
        },
        // the name of the chosen ready-made pose (for the pose selector of the camera node)
        presetLabel() {
            if (!MACRO) return "";
            const v = rawEff(MACRO);
            return typeof v === "string" && v !== RANDOM ? P(MACRO).opt.get(v)?.label ?? "" : "";
        },
        isPose: cfg.node === "NDPoseBuilder",
        dispose() { clearInterval(anaTimer); document.removeEventListener("pointerdown", onDocDown, true); window.removeEventListener(LANG_EVENT, onLangEvent); closeSettings(); },
        // Workflows saved when the node had a seed widget: [seed, control, state].
        // The seed now comes only on the input wire; the state is moved into place.
        migrate(info) {
            const v = info?.widgets_values;
            if (Array.isArray(v) && v.length >= 3 && typeof v[0] === "number" && typeof v[2] === "string" && wState) wState.value = v[2];
        },
    };
    applyUi();
    root.dataset.lang = LANG();
    render();
    if (!schemaNow(cfg.schemaFile, LANG())) applyLang();
    // the Pose Builder follows the character wired to it (its sex and parts decide which poses are offered)
    let anaSig = "";
    const anaTimer = LEVELS ? setInterval(() => {
        const sig = JSON.stringify([!!linkedCharacter(), anatomyNow(), cfg.signature?.(ctx) ?? null]);
        if (sig !== anaSig) { anaSig = sig; if (node.graph) render(); }
    }, 1200) : 0;
}

const STYLE = `
.nd-cb-host{position:relative;width:100%;height:100%;overflow:hidden}
.nd-cb{--nd-accent:#2f7de1;--nd-set:#d6a64f;--nd-rnd:#a184e6;--nd-line:var(--border-color,#444);display:flex;flex-direction:column;gap:6px;width:100%;height:100%;box-sizing:border-box;font:12px Inter,Arial,sans-serif;color:var(--input-text,#ddd);user-select:none;min-height:0}
.nd-cb button{font:inherit;color:inherit}
.nd-cb-error{padding:10px;color:#e88}
.nd-cb-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:4px 6px;border:1px solid var(--nd-line);border-radius:6px;background:var(--comfy-input-bg,#222)}
.nd-cb-fmt{display:flex;align-items:center;gap:8px}
.nd-cb-fmt.shake{animation:nd-cb-shake .35s}
@keyframes nd-cb-shake{20%{transform:translateX(-3px)}40%{transform:translateX(3px)}60%{transform:translateX(-2px)}80%{transform:translateX(2px)}}
.nd-cb-lab{opacity:.6}
.nd-cb-check{display:inline-flex;align-items:center;gap:4px;cursor:pointer;white-space:nowrap}
.nd-cb-check input{margin:0;accent-color:var(--nd-accent);cursor:pointer}
.nd-cb-sep{width:1px;align-self:stretch;background:var(--nd-line)}
.nd-cb-grow{flex:1}
.nd-cb-btn{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 9px;border:1px solid var(--nd-line);border-radius:4px;background:var(--comfy-menu-bg,#2a2a2a);cursor:pointer;white-space:nowrap}
.nd-cb-btn:hover:not(:disabled){border-color:var(--nd-accent)}
.nd-cb-btn:disabled{opacity:.4;cursor:default}
.nd-cb-btn.small{height:20px;padding:0 7px;font-size:11px}
.nd-cb-btn.confirm{border-color:#d55;color:#f99}
.nd-cb{position:relative}
.nd-cb-btn.on{border-color:var(--nd-accent);color:var(--nd-accent)}
.nd-cb-segbtn:disabled,.nd-cb-segbtn.locked{opacity:.4;cursor:default}
.nd-cb-chip.auto{box-shadow:inset 0 0 0 1px var(--nd-set)}
.nd-cb-row.full .nd-cb-chips{animation:nd-cb-shake .35s}
.nd-cb-presets{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:6px 0 8px;border-bottom:1px solid var(--nd-line)}
.nd-cb-presets .nd-cb-lab{margin-right:4px;font-size:11px}
.nd-cb.all-random .nd-cb-allrnd{color:var(--nd-rnd)}
.nd-cb-seg{display:inline-flex;border:1px solid var(--nd-line);border-radius:5px;overflow:hidden;flex:none}
.nd-cb-segbtn{height:22px;padding:0 10px;border:0;border-right:1px solid var(--nd-line);background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:11.5px}
.nd-cb-segbtn:last-child{border-right:0}
.nd-cb-segbtn:hover{background:#ffffff14}
.nd-cb-segbtn.on{background:var(--nd-accent);color:#fff}
.nd-cbs-input{box-sizing:border-box;width:100%;height:24px;padding:0 8px;border:1px solid var(--nd-line);border-radius:4px;background:#0003;color:inherit;font:inherit}
.nd-cb-ops{margin:2px 0 4px}
.nd-cbs-lang{flex-wrap:wrap;max-width:100%}
.nd-cb-ops .nd-cb-segbtn{height:19px;padding:0 8px;font-size:11px}
.nd-cb.edit-mode .nd-cb-mode{border-color:var(--nd-accent)}
.nd-cb.edit-mode .nd-cb-allrnd,.nd-cb.edit-mode .nd-cb-fmt label:has(input:disabled){opacity:.45}
.nd-cb-row.op-remove .nd-cb-chips{opacity:.35;pointer-events:none}
.nd-cb-allrnd input{accent-color:var(--nd-rnd)}
.nd-cb-pop{position:absolute;right:4px;top:34px;z-index:20;width:min(300px,calc(100% - 8px));box-sizing:border-box;display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--nd-line);border-radius:8px;background:var(--comfy-menu-bg,#1e1e1e);box-shadow:0 8px 22px #000a}
.nd-cb-gnote{right:auto;width:min(260px,calc(100% - 8px));gap:6px;font-size:11.5px;line-height:1.4}
.nd-cb-gtext{opacity:.8}
.nd-cb-gfoot{display:flex;justify-content:flex-end}
.nd-cb-phint{font-size:10.5px;opacity:.55;line-height:1.35}
.nd-cb-psave{display:flex;gap:6px}
.nd-cb-psave input{flex:1;min-width:0;height:24px;box-sizing:border-box;border:1px solid var(--nd-line);border-radius:4px;background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);padding:0 7px;font:inherit;user-select:text}
.nd-cb-psave input:focus{outline:none;border-color:var(--nd-accent)}
.nd-cb-psave .nd-cb-btn{height:24px}
.nd-cb-plist{display:flex;flex-direction:column;gap:3px;max-height:220px;overflow-y:auto}
.nd-cb-prow{display:flex;gap:3px}
.nd-cb-pload{flex:1;min-width:0;height:24px;padding:0 8px;text-align:left;border:1px solid transparent;border-radius:4px;background:var(--comfy-input-bg,#222);cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nd-cb-pload:hover{border-color:var(--nd-accent)}
.nd-cb-pdel{flex:0 0 auto;min-width:24px;height:24px;padding:0 6px;border:1px solid transparent;border-radius:4px;background:transparent;cursor:pointer;opacity:.6}
.nd-cb-pdel:hover{opacity:1;border-color:#d55;color:#f99}
.nd-cb-pdel.confirm{opacity:1;border-color:#d55;color:#f99;font-size:11px}
.nd-cb-pempty{font-size:11px;opacity:.5;padding:2px 0}
.nd-cb-pmsg{font-size:11px;opacity:.75;min-height:0}
.nd-cb-pmsg:empty{display:none}
.nd-cb-pmsg.bad{color:#f99;opacity:1}
.nd-cb-power{display:inline-flex;align-items:center;gap:6px;font-weight:600}
.nd-cb-power::before{content:"";width:8px;height:8px;border-radius:50%;background:#7a7a7a;box-shadow:0 0 0 2px #ffffff22}
.nd-cb-power.on::before{background:#4cc46a;box-shadow:0 0 6px #4cc46a}
.nd-cb.off .nd-cb-main{opacity:.3;pointer-events:none;filter:grayscale(.7)}
.nd-cb.off .nd-cb-bar>*:not(.nd-cb-power):not(.nd-cb-grow):not(.nd-cb-status):not(.nd-cb-gear){opacity:.35;pointer-events:none}
.nd-cb.off .nd-cb-status{color:#e0a46a;opacity:1}
.nd-cb-main{flex:1;display:grid;grid-template-columns:52px minmax(0,1fr);gap:6px;min-height:0}
.nd-cb-note{padding:8px 0 2px;font-size:11px;opacity:.5}
.nd-cb-row.muted{opacity:.45}
.nd-cb-rail{display:flex;flex-direction:column;gap:4px;min-height:0;overflow-y:auto;scrollbar-width:none}
.nd-cb-rail::-webkit-scrollbar{display:none}
.nd-cb-zbtn{--bg:var(--comfy-input-bg,#222);position:relative;flex:0 0 auto;width:52px;height:44px;padding:3px;box-sizing:border-box;border:1px solid var(--nd-line);border-radius:7px;background:var(--bg);color:var(--input-text,#ddd);cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:.8;transition:opacity .12s,border-color .12s}
.nd-cb-zbtn:hover{opacity:1;border-color:var(--nd-accent)}
.nd-cb-zbtn.sel{--bg:color-mix(in srgb,var(--nd-accent) 34%,#16181c);border-color:var(--nd-accent);opacity:1}
.nd-cb-zbtn svg{width:36px;height:36px;display:block;overflow:hidden;pointer-events:none}
.nd-cb-zbtn.has::after,.nd-cb-zbtn.rnd::before{content:"";position:absolute;top:3px;width:6px;height:6px;border-radius:50%}
.nd-cb-zbtn.has::after{right:3px;background:var(--nd-set)}
.nd-cb-zbtn.rnd::before{right:11px;background:var(--nd-rnd)}
.nd-cb-zbtn.rnd:not(.has)::before{right:3px}
.nd-cb-zlabel{font-size:11px}
.nd-ico-skin{fill:color-mix(in srgb,currentColor 10%,var(--bg))}
.nd-ico-hair{fill:color-mix(in srgb,currentColor 45%,var(--bg))}
.nd-cb-status{font-size:11px;opacity:.65;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.nd-cb-panel{display:flex;flex-direction:column;min-height:0;border:1px solid var(--nd-line);border-radius:6px;background:var(--comfy-input-bg,#222)}
.nd-cb-phead{display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid var(--nd-line)}
.nd-cb-ptitle{font-weight:600;font-size:13px}
.nd-cb-pcount{opacity:.55;font-size:11px}
.nd-cb-pbody{flex:1;min-height:0;overflow-y:auto;padding:4px 8px 8px}
.nd-cb-pbody::-webkit-scrollbar{width:10px;height:10px}
.nd-cb-pbody::-webkit-scrollbar-track{background:transparent;margin:6px 0}
.nd-cb-pbody::-webkit-scrollbar-thumb{background:rgba(255,255,255,.22);border:3px solid transparent;border-radius:6px;background-clip:padding-box}
.nd-cb-pbody::-webkit-scrollbar-thumb:hover{background-color:rgba(255,255,255,.38)}
.nd-cb-pbody::-webkit-scrollbar-button,.nd-cb-pbody::-webkit-scrollbar-corner{display:none;background:transparent}
@supports not selector(::-webkit-scrollbar){.nd-cb-pbody{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.25) transparent}}
.nd-cb-plist::-webkit-scrollbar{width:10px;height:10px}
.nd-cb-plist::-webkit-scrollbar-track{background:transparent;margin:6px 0}
.nd-cb-plist::-webkit-scrollbar-thumb{background:rgba(255,255,255,.22);border:3px solid transparent;border-radius:6px;background-clip:padding-box}
.nd-cb-plist::-webkit-scrollbar-thumb:hover{background-color:rgba(255,255,255,.38)}
.nd-cb-plist::-webkit-scrollbar-button,.nd-cb-plist::-webkit-scrollbar-corner{display:none;background:transparent}
@supports not selector(::-webkit-scrollbar){.nd-cb-plist{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.25) transparent}}
.nd-cb-row{padding:7px 0;border-bottom:1px solid rgba(127,127,127,.15)}
.nd-cb-row:last-child{border-bottom:0}
.nd-cb-rhead{display:flex;align-items:center;gap:6px;margin-bottom:5px;min-width:0}
.nd-cb-name{font-weight:600;white-space:nowrap}
.nd-cb-name.has-tip{text-decoration:underline dotted rgba(127,127,127,.7);text-underline-offset:3px;cursor:help}
.nd-cb-tip{position:fixed;z-index:10001;display:none;max-width:280px;padding:7px 9px;border:1px solid var(--border-color,#444);border-radius:6px;background:var(--comfy-menu-bg,#1f1f1f);color:var(--input-text,#ddd);box-shadow:0 6px 20px rgba(0,0,0,.45);font:12px/1.4 Inter,Arial,sans-serif;pointer-events:none}
.nd-cb-tip>b{display:block;margin-bottom:2px;font-weight:600}
.nd-cb-tip>b:only-child{margin:0}
.nd-cb-tip>small{display:block;margin-top:5px;opacity:.55;font-size:11px}
.nd-cb-val{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.nd-cb-val.unset{opacity:.4}
.nd-cb-val.set{color:var(--nd-set)}
.nd-cb-val.rnd{color:var(--nd-rnd)}
.nd-cb-dice,.nd-cb-x{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:1px solid var(--nd-line);border-radius:4px;background:transparent;cursor:pointer;flex:none;line-height:1}
.nd-cb-dice:hover,.nd-cb-x:hover{border-color:var(--nd-accent)}
.nd-cb-chip.on,.nd-cb-chip.icon.on{color:#1b1b1b}
.nd-cb-dice.on{background:var(--nd-rnd);border-color:var(--nd-rnd);color:#fff}
.nd-cb-x{font-size:14px;opacity:.7}
.nd-cb-dice svg{pointer-events:none}
.nd-cb-steps{display:flex;gap:3px}
.nd-cb-step{flex:1;height:14px;padding:0;border:1px solid var(--nd-line);border-radius:3px;background:var(--comfy-menu-bg,#2a2a2a);cursor:pointer}
.nd-cb-step:hover{border-color:var(--nd-accent)}
.nd-cb-step.fill{background:color-mix(in srgb,var(--nd-set) 45%,transparent);border-color:color-mix(in srgb,var(--nd-set) 60%,transparent)}
.nd-cb-step.cur{background:var(--nd-set);border-color:var(--nd-set)}
.nd-cb-step.pool{background:color-mix(in srgb,var(--nd-rnd) 35%,transparent);border-color:color-mix(in srgb,var(--nd-rnd) 60%,transparent)}
.nd-cb-step.picked,.nd-cb-chip.picked,.nd-cb-sw.picked{box-shadow:0 0 0 2px var(--nd-rnd)}
.nd-cb-ends{display:flex;justify-content:space-between;margin-top:2px;font-size:10px;opacity:.45}
.nd-cb-chips{display:flex;flex-wrap:wrap;gap:4px}
.nd-cb-chip{height:22px;padding:0 8px;border:1px solid var(--nd-line);border-radius:11px;background:var(--comfy-menu-bg,#2a2a2a);cursor:pointer;white-space:nowrap}
.nd-cb-chip:hover{border-color:var(--nd-accent)}
.nd-cb-chip.on{background:var(--nd-set);border-color:var(--nd-set);color:#1b1b1b}
.nd-cb-chip.pool{background:color-mix(in srgb,var(--nd-rnd) 30%,transparent);border-color:color-mix(in srgb,var(--nd-rnd) 70%,transparent)}
.nd-cb-chip.odd,.nd-cb-sw.odd{opacity:.45}
.nd-cb-chips.icons{gap:5px}
.nd-cb-ghead{flex:0 0 100%;margin:5px 0 0;font-size:10.5px;opacity:.6;text-transform:uppercase;letter-spacing:.04em}
.nd-cb-ghead:first-child{margin-top:0}
.nd-cb-chip.icon.wide{width:84px}
.nd-cb-level{margin-left:2px}
.nd-cb-chip.icon{--bg:var(--comfy-menu-bg,#2a2a2a);height:auto;width:68px;padding:4px 2px 3px;border-radius:7px;display:flex;flex-direction:column;align-items:center;gap:1px;white-space:normal;background:var(--bg)}
.nd-cb-chip.icon svg{width:44px;height:44px;display:block;overflow:hidden;pointer-events:none}
.nd-cb-chip.icon span{font-size:10.5px;line-height:12px;text-align:center}
.nd-cb-chip.icon.on{--bg:var(--nd-set)}
.nd-cb-chip.icon.pool{--bg:color-mix(in srgb,var(--nd-rnd) 38%,#222)}
.nd-cb-kids{margin:6px 0 0 8px;padding-left:8px;border-left:2px solid color-mix(in srgb,var(--nd-accent) 45%,transparent)}
.nd-cb-kids .nd-cb-row{padding:5px 0}
.nd-cb-feats{margin-top:7px;padding:6px 8px;border-radius:6px;background:rgba(127,127,127,.1)}
.nd-cb-featlab{display:inline-block;margin-bottom:4px;font-size:11px;opacity:.75}
.nd-cb-feat{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:3px}
.nd-cb-featrace{font-size:10.5px;opacity:.55;margin-right:2px}
.nd-cb-tats{display:flex;flex-direction:column;gap:6px}
.nd-cb-tcard{padding:6px 8px;border:1px solid var(--nd-line);border-radius:6px;background:rgba(127,127,127,.08)}
.nd-cb-thead{display:flex;align-items:center;gap:6px;margin-bottom:5px;min-width:0}
.nd-cb-tname{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.nd-cb-tgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:5px 8px}
.nd-cb-tfield{display:flex;flex-direction:column;gap:2px;min-width:0}
.nd-cb-tfield .nd-cb-lab{font-size:10.5px}
.nd-cb-sel,.nd-cb-tinput{height:24px;box-sizing:border-box;min-width:0;width:100%;border:1px solid var(--nd-line);border-radius:4px;background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);padding:0 5px;font:inherit}
.nd-cb-sel:focus,.nd-cb-tinput:focus{outline:none;border-color:var(--nd-accent)}
.nd-cb-tinput{margin-top:5px}
.nd-cb-tbar{display:flex;align-items:center;gap:6px}
.nd-cb-tcount{margin-left:auto;font-size:11px;opacity:.5}
.nd-cb-tnote{font-size:11px;opacity:.6;margin-top:3px}
.nd-cb-swatches{display:flex;flex-wrap:wrap;gap:5px}
.nd-cb-sw{width:20px;height:20px;padding:0;border-radius:50%;border:1px solid rgba(0,0,0,.5);background:var(--sw);cursor:pointer;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.nd-cb-sw:hover{transform:scale(1.12)}
.nd-cb-sw.custom{background:none;box-shadow:none;border:0;position:relative}
.nd-cb-swin{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border-radius:50%;background:conic-gradient(#e5484d,#f2b84b,#7ed957,#3fc1d9,#6b6ee8,#d65db1,#e5484d);box-shadow:inset 0 0 0 1px rgba(0,0,0,.45);font-size:8px;font-weight:700;line-height:1;color:#fff;text-shadow:0 1px 1px rgba(0,0,0,.7);pointer-events:none}
.nd-cb-sw.custom.on{box-shadow:0 0 0 2px var(--comfy-input-bg,#222),0 0 0 4px var(--nd-set)}
.nd-cb-sw:disabled{cursor:default}
.nd-cb-customrow{margin-top:6px}
.nd-cb-levels{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px;padding:6px 8px;border-radius:6px;background:#ffffff0a}
.nd-cb-levels .nd-cb-lab{opacity:.8;margin-right:2px}
.nd-cb-customrow .nd-cb-tinput{margin-top:0}
.nd-cb-sw.on{box-shadow:0 0 0 2px var(--comfy-input-bg,#222),0 0 0 4px var(--nd-set)}
.nd-cb-swatches.rnd .nd-cb-sw:not(.pool){opacity:.3}
.nd-cb-row.random .nd-cb-sw:not(.pool){opacity:.25}
.nd-cb-row.random .nd-cb-chip:not(.pool),.nd-cb-row.random .nd-cb-step:not(.pool){opacity:.5}
.nd-cb-num{display:flex;flex-direction:column;gap:2px}
.nd-cb-num.range-pool{flex-direction:row;align-items:center;gap:6px}
.nd-cb-numline{display:flex;align-items:center;gap:8px}
.nd-cb-range{flex:1;min-width:0;margin:0;cursor:pointer}
.nd-cb-range.unset{opacity:.45}
${nativeTrackCss(".nd-cb-range")}
.nd-cb-numbox{width:52px;height:22px;box-sizing:border-box;padding:0 4px;border:1px solid var(--nd-line);border-radius:4px;background:var(--comfy-menu-bg,#2a2a2a);color:inherit;font:inherit;text-align:right}
.nd-cb-numbox:focus{outline:none;border-color:var(--nd-accent)}
.nd-cb-stages{display:flex;margin-right:60px;font-size:10px;opacity:.45}
.nd-cb-stages>span{text-align:center;border-left:1px solid rgba(127,127,127,.35)}
.nd-cb-stages>span:first-child{border-left:0}
.nd-cb-range{accent-color:var(--nd-accent)}
.nd-cb-gear{padding:0 6px}
.nd-cb-gear svg{display:block;pointer-events:none}
.nd-cb-text{display:block;width:100%;box-sizing:border-box;min-height:54px;resize:vertical;padding:5px 7px;border:1px solid var(--nd-line);border-radius:5px;background:var(--comfy-menu-bg,#2a2a2a);color:inherit;font:inherit;line-height:1.4;user-select:text}
.nd-cb-text:focus{outline:none;border-color:var(--nd-accent)}
.nd-cb-pfile{display:flex;gap:6px;justify-content:flex-end}
.nd-cb-pexp{flex:0 0 auto;width:24px;height:24px;padding:0;display:inline-flex;align-items:center;justify-content:center;border:1px solid transparent;border-radius:4px;background:transparent;cursor:pointer;opacity:.55}
.nd-cb-pexp:hover{opacity:1;border-color:var(--nd-accent)}
.nd-cb-pexp svg{pointer-events:none}
.nd-cb-pask{display:flex;flex-direction:column;gap:6px;padding:7px;border:1px solid var(--nd-accent);border-radius:6px;font-size:11px;line-height:1.35}
.nd-cb-pacts{display:flex;flex-wrap:wrap;gap:4px}
.nd-cbs-back{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);font:12px Inter,Arial,sans-serif;color:var(--input-text,#ddd)}
.nd-cbs-modal{display:flex;flex-direction:column;width:min(460px,94vw);max-height:90vh;border:1px solid var(--border-color,#444);border-radius:10px;background:var(--comfy-menu-bg,#1e1e1e);box-shadow:0 18px 50px rgba(0,0,0,.6)}
.nd-cbs-head{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid var(--border-color,#444);font-weight:600;font-size:13px}
.nd-cbs-x{border:none;background:transparent;color:inherit;font-size:18px;line-height:1;cursor:pointer;opacity:.7}
.nd-cbs-x:hover{opacity:1}
.nd-cbs-content{display:flex;flex-direction:column;gap:14px;padding:12px 14px;overflow-y:auto;min-height:0}
.nd-cbs-sec{display:flex;flex-direction:column;gap:6px}
.nd-cbs-title{font-weight:600;font-size:12px;opacity:.9}
.nd-cbs-note{font-size:11px;line-height:1.4;opacity:.55}
.nd-cbs-sec .nd-cb-fmt{gap:14px}
.nd-cbs-sec .nd-cb-check input{accent-color:var(--nd-accent,#2f7de1)}
.nd-cbs-themes{display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:6px}
.nd-cbs-theme{display:flex;flex-direction:column;align-items:center;gap:5px;padding:7px 4px 6px;border:1px solid var(--border-color,#444);border-radius:7px;background:var(--comfy-input-bg,#222);color:inherit;font:inherit;cursor:pointer}
.nd-cbs-theme:hover{border-color:#888}
.nd-cbs-theme.on{border-color:#fff;box-shadow:0 0 0 1px #fff inset}
.nd-cbs-dots{display:flex;gap:4px}
.nd-cbs-dots i{display:block;width:13px;height:13px;border-radius:50%;box-shadow:inset 0 0 0 1px rgba(0,0,0,.35)}
.nd-cbs-custom{display:flex;flex-direction:column;gap:10px;padding:10px;border:1px solid var(--border-color,#444);border-radius:7px}
.nd-cbs-crow{display:grid;grid-template-columns:110px minmax(0,1fr);gap:10px;align-items:start}
.nd-cbs-clabel{display:flex;flex-direction:column;gap:2px}
.nd-cbs-clabel span{font-size:10.5px;line-height:1.3;opacity:.5}
.nd-cbs-picker{display:flex;flex-direction:column;gap:5px}
.nd-cbs-ptop{display:flex;align-items:center;gap:6px}
.nd-cbs-pswatch{position:relative;width:26px;height:22px;border-radius:4px;border:1px solid rgba(255,255,255,.25);cursor:pointer;flex:none;overflow:hidden}
.nd-cbs-pswatch input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;border:0;padding:0}
.nd-cbs-hex{width:78px;height:22px;box-sizing:border-box;padding:0 6px;border:1px solid var(--border-color,#444);border-radius:4px;background:var(--comfy-input-bg,#222);color:inherit;font:11.5px ui-monospace,Consolas,monospace}
.nd-cbs-hex:focus{outline:none;border-color:#888}
.nd-cbs-drop{display:inline-flex;align-items:center;justify-content:center;width:24px;height:22px;padding:0;border:1px solid var(--border-color,#444);border-radius:4px;background:var(--comfy-input-bg,#222);color:inherit;cursor:pointer}
.nd-cbs-drop:hover{border-color:#888}
.nd-cbs-drop svg{pointer-events:none}
.nd-cbs-hsl{-webkit-appearance:none;appearance:none;width:100%;height:10px;margin:0;border-radius:5px;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(0,0,0,.35)}
.nd-cbs-hsl.h{background:linear-gradient(to right,#f00,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00)}
.nd-cbs-hsl.s{background:linear-gradient(to right,var(--a),var(--b))}
.nd-cbs-hsl.l{background:linear-gradient(to right,#000,var(--m),#fff)}
.nd-cbs-hsl::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:14px;border-radius:3px;background:#fff;border:1px solid #333;box-shadow:0 1px 3px rgba(0,0,0,.5)}
.nd-cbs-hsl::-moz-range-thumb{width:12px;height:14px;border-radius:3px;background:#fff;border:1px solid #333}
.nd-cbs-hsl:focus{outline:none}
.nd-cbs-scale{display:flex;align-items:center;gap:8px}
.nd-cbs-range{flex:1;min-width:0;margin:0;cursor:pointer}
${nativeTrackCss(".nd-cbs-range")}
.nd-cbs-scval{width:40px;text-align:right;font-variant-numeric:tabular-nums}
.nd-cbs-foot{display:flex;justify-content:flex-end;gap:6px;padding:10px 12px;border-top:1px solid var(--border-color,#444)}
.nd-cbs-foot .nd-cb-btn{height:26px;padding:0 14px}
.nd-cb-btn.primary{background:#2f7de1;border-color:#2f7de1;color:#fff}
.nd-cbs-modal .nd-cb-btn{border:1px solid var(--border-color,#444);border-radius:4px;background:var(--comfy-input-bg,#222);color:inherit;font:inherit;cursor:pointer}
.nd-cbs-modal .nd-cb-btn.primary{background:#2f7de1;border-color:#2f7de1;color:#fff}
`;

/* ------------------------------------------------------------- registration */

// The Character Builder and the Outfit Builder are two schemas on one engine.
// The builders (nodes with ndCB) whose output feeds this node, through Pack / Unpack nodes, reroutes and other builders.
export function upstreamBuilders(start) {
    const found = [];
    const seen = new Set();
    const linkOf = (g, lid) => (lid == null || !g ? null : g.getLink?.(lid) ?? g.links?.get?.(lid) ?? g.links?.[lid] ?? g._links?.get?.(lid) ?? null);
    const walk = (n, depth) => {
        if (!n || seen.has(n) || depth > 16) return;
        seen.add(n);
        const g = n.graph || app.graph;
        for (const inp of n.inputs || []) {
            const l = linkOf(g, inp.link);
            const o = l ? g.getNodeById?.(l.origin_id) : null;
            if (!o) continue;
            if (o !== start && o.ndCB) found.push(o);
            walk(o, depth + 1);
        }
    };
    walk(start, 0);
    return found;
}

export function defineBuilder(cfg) {
    // Pack Parameters asks this what the input wire may carry (the seed, the outfit).
    // The names of the pins stay in English whatever the interface language is (they are the names of the parameters).
    const pinLabels = (fields) => fields;
    ND_REG.consumers.set(cfg.node, () => pinLabels(cfg.consumers));
    // Unpack Parameters asks this what the output wire contains.
    ND_REG.providers.set(cfg.node, (node, slot) => (slot !== 0 || !cfg.schema ? null : pinLabels(cfg.provider(cfg.schema))));
    window.addEventListener(LANG_EVENT, async () => { await loadLang(commonLang()); ND_REG.refresh?.(); });

    app.registerExtension({
        name: cfg.extension,

        async beforeRegisterNodeDef(nodeType, nodeData) {
            if (nodeData.name !== cfg.node) return;
            cfg.schema = await schemaFor(cfg.schemaFile, "en", cfg.i18n);
            // the common language is loaded before the first node is made, so it does not flash in English
            if (commonLang() !== "en") await schemaFor(cfg.schemaFile, commonLang(), cfg.i18n);
            const proto = nodeType.prototype;
            chain(proto, "onNodeCreated", function () {
                injectStyleOnce("nd-cb-style", STYLE);
                setupBuilder(this, cfg);
                blankSlots(this, ["params"], [0]);
                const sz = this.computeSize?.() || [0, 0];
                this.setSize([Math.max(this.size?.[0] ?? 0, sz[0], 560), Math.max(this.size?.[1] ?? 0, sz[1], 640)]);
            });
            chain(proto, "onConnectionsChange", function () {
                if (this.ndCB && cfg.levels) setTimeout(() => this.ndCB?.refresh?.(), 50);
            });
            chain(proto, "onRemoved", function () {
                this.ndCB?.dispose?.();
            });
            chain(proto, "onConfigure", function (info) {
                blankSlots(this, ["params"], [0]);
                this.ndCB?.migrate?.(info);
                this.ndCB?.restore?.();
                setTimeout(() => this.ndCB?.restore?.(), 0);
            });
            chain(proto, "onExecuted", function (message) {
                const d = message?.nd_character?.[0];
                if (!d) return;
                this.properties ||= {};
                this.properties.nd_picked = { seed: d.seed, picked: isObj(d.picked) ? d.picked : {}, ...Object.fromEntries(["panels", "facing", "width", "height", "poses"].filter((k) => k in d).map((k) => [k, d[k]])) };
                this.ndCB?.executed?.(d);
                this.ndCB?.refresh?.();
            });
            chain(proto, "onResize", function (size) {
                const k = this.__ndScale?.() ?? 1;
                if (size && (size[0] < MIN_W * k || size[1] < MIN_H * k)) {
                    size[0] = Math.max(size[0], MIN_W * k);
                    size[1] = Math.max(size[1], MIN_H * k);
                }
            });
        },
    });
}

defineBuilder({
    node: "NDCharacterBuilder",
    title: "Character Builder",
    i18n: "character",
    extension: "NeuralDreamer.Nodes.CharacterBuilder",
    schemaFile: "character_builder.json",
    presetFile: "neural_dreamer/character_presets.json",
    defaultZone: "general",
    raceParam: "general.race",
    contentPart: "genitals",
    zoneIcons: ZONE_ICONS,
    optionIcons: OPTION_ICONS,
    editSubject: true,
    editSync: true,
    editNote: "Fill the subject only when the picture has several people: the text then says whom to edit and keeps the others unchanged. Leave it empty for a single character. In Edit mode Sex only picks her / his.",
    toggle: {
        key: "genitals",
        label: "Genitals",
        title: "Show the Genitals section. While it is off, the section is hidden and none of its values are used.",
        note: "Shows the Genitals section; while it is off, none of its values are used. For fictional adult characters (18+) only. Do not use it to depict real people.",
    },
    consumers: [{ name: "seed", type: "INT" }, { name: "outfit", label: "Outfit Builder", type: "OUTFIT_PARAMS", optional: true }],
    // "appearance": the resolved character (description, sex, values, covers), for nodes that build on it
    provider: (schema) => [
        ...schema.outputs.map((o) => ({ name: o.key, label: o.key === "Description" ? "Full Description" : o.key, type: "STRING" })),
        {
            name: "appearance",
            label: "Character Builder Out",
            type: "CHARACTER_PARAMS",
            sub: () => ["description", "sex", "values", "covers", "version", "mode", "pron", "anatomy", "body", "outfit", "extra", "tail"].map((name) => ({ name, type: name === "description" || name === "sex" || name === "mode" || name === "pron" || name === "body" || name === "outfit" || name === "extra" ? "STRING" : "*" })),
        },
    ],
});
