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

const NODE = "NDCharacterBuilder";
const RANDOM = "*";
const SEX = "general.sex";
const DEFAULT_ZONE = "general";
const GENITALS = "genitals";
const MIN_W = 480;
const MIN_H = 560;

/* ------------------------------------------------------------------- schema */

let SCHEMA = null;

function buildSchema(raw) {
    const sets = raw.option_sets || {};
    const params = new Map();
    const parts = [];
    for (const part of raw.parts || []) {
        const pids = [];
        for (const p of part.params || []) {
            const pid = `${part.id}.${p.id}`;
            const q = { ...p, pid, part: part.id };
            if (q.type !== "number") {
                q.options = q.options || sets[q.set] || [];
                q.opt = new Map(q.options.map((o) => [o.id, o]));
                // the middle of a scale: its "medium"/"average" step, or the centre
                const mid = q.options.findIndex((o) => o.id === "medium" || o.id === "average" || o.id === "athletic");
                q.mid = mid >= 0 ? mid : (q.options.length - 1) / 2;
            }
            params.set(pid, q);
            pids.push(pid);
        }
        parts.push({ ...part, pids });
    }
    const zones = (raw.zones || []).map((z) => ({ ...z, params: (z.params || []).filter((pid) => params.has(pid)) }));
    return { params, parts, zones, zoneById: new Map(zones.map((z) => [z.id, z])), outputs: raw.outputs || [] };
}

const getJson = (name) => fetch(new URL(`./${name}`, import.meta.url)).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${name}: HTTP ${r.status}`))));
// Loaded when the first Character Builder node is created (the node may be hidden from the pack).
let schemaPromise = null;
const schemaReady = () => (schemaPromise ||= getJson("character_builder.json")
    .then((raw) => {
        SCHEMA = buildSchema(raw);
        ND_REG.refresh?.();
        return SCHEMA;
    })
    .catch((e) => {
        console.warn("[Neural Dreamer] Character Builder: cannot load character_builder.json", e);
        return null;
    }));

// Pack Parameters asks this what the input wire may carry: the seed.
ND_REG.consumers.set(NODE, () => [{ name: "seed", type: "INT" }]);

/* ------------------------------------------------------------------ presets */

// Presets live in the ComfyUI user folder (user/<user>/neural_dreamer/character_presets.json),
// so they are shared by every workflow and survive updates of the node pack.
const PRESET_FILE = "neural_dreamer/character_presets.json";
let presetCache = null;
async function loadPresets(force = false) {
    if (presetCache && !force) return presetCache;
    const r = await api.getUserData(PRESET_FILE);
    if (r.status === 404) return (presetCache = {});
    if (!r.ok) throw new Error(`cannot read the presets (HTTP ${r.status})`);
    const data = await r.json();
    presetCache = isObj(data?.presets) ? data.presets : {};
    return presetCache;
}
async function writePresets(presets) {
    const r = await api.storeUserData(PRESET_FILE, { version: 1, presets }, { overwrite: true, stringify: true, throwOnError: false });
    if (!r?.ok) throw new Error(`cannot save the presets (HTTP ${r?.status ?? "?"})`);
    presetCache = presets;
}

// Unpack Parameters asks this what the output wire contains.
ND_REG.providers.set(NODE, (node, slot) => (slot === 0 && SCHEMA ? SCHEMA.outputs.map((o) => ({ name: o.key, type: "STRING" })) : null));

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
function migrateValues(values, pools) {
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
        formats: { natural, tags },
        avoid_conflicts: s.avoid_conflicts === undefined ? true : !!s.avoid_conflicts,
        all_random: !!s.all_random,
        genitals: false,
        values: isObj(s.values) ? { ...s.values } : {},
        pools: isObj(s.pools) ? { ...s.pools } : {},
    };
    migrateValues(out.values, out.pools);
    // The Genitals section is off by default. A workflow or preset saved before the switch
    // existed keeps the section on when it already has values there.
    out.genitals = s.genitals === undefined
        ? Object.keys(out.values).some((k) => k.startsWith(`${GENITALS}.`))
        : !!s.genitals;
    return out;
}

function clampNum(p, v) {
    const n = Math.round(Number(v));
    if (v === "" || v == null || !Number.isFinite(n)) return null;
    return Math.min(p.max, Math.max(p.min, n));
}

const stageOf = (p, n) => (p.stages || []).find((s) => n >= s.from && n <= s.to)?.label || "";

/* ---------------------------------------------------------------- helpers */

const btn = (cls, text, title) => {
    const b = el("button", cls, text);
    b.type = "button";
    if (title) b.title = title;
    return b;
};

const DICE_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.5" cy="8.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="8.5" cy="15.5" r="1.3" fill="currentColor" stroke="none"/></svg>';

/* ------------------------------------------------------------------ tooltip */

// One quick tooltip for every builder on the page: a bold title and a longer hint.
// It lives in <body>, so its text stays readable at any canvas zoom.
let tipEl = null;
let tipTimer = null;
const tip = (e, title, text) => {
    e.dataset.tipTitle = title || "";
    if (text) e.dataset.tip = text;
};
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

function setupBuilder(node) {
    const wState = hideWidget(node, "state");
    let st = normalizeState(wState?.value);
    node.properties ||= {};

    const root = el("div", "nd-cb");
    if (!SCHEMA) {
        root.append(el("div", "nd-cb-error", "character_builder.json could not be loaded. Reinstall the node pack."));
        node.addDOMWidget("nd_character", "ND_CHARACTER", root, { serialize: false, hideOnZoom: false, getMinHeight: () => 60 });
        return;
    }

    // toolbar
    const bar = el("div", "nd-cb-bar");
    const check = (label, title) => {
        const l = el("label", "nd-cb-check");
        const i = el("input");
        i.type = "checkbox";
        l.title = title;
        l.append(i, el("span", null, label));
        return { l, i };
    };
    const cNat = check("Natural", "Natural-language sentences (best for Flux 2, Krea 2). At least one format stays on.");
    const cTag = check("Tags", "Comma-separated tags. At least one format stays on.");
    const cAll = check("All random", "Every parameter of every section is random, picked with the seed. Click values to narrow what random may pick. The values you set by hand come back when this is turned off.");
    cAll.l.classList.add("nd-cb-allrnd");
    const cAvoid = check("Avoid conflicts", "Random picks skip values that clash with the others (e.g. a pixie cut with waist-length hair).");
    const cGen = check("Genitals", "Show the Genitals section. While it is off, the section is hidden and none of its values are used.");
    const bFix = btn("nd-cb-btn", "Fix random", "Turn the last random picks into fixed values");
    const bReset = btn("nd-cb-btn", "Reset", "Clear every parameter");
    const bPresets = btn("nd-cb-btn", "Presets", "Save the settings of this node as a preset, load or delete presets");
    const fmt = el("div", "nd-cb-fmt");
    fmt.append(el("span", "nd-cb-lab", "Format"), cNat.l, cTag.l);
    const status = el("span", "nd-cb-status");
    bar.append(fmt, el("span", "nd-cb-sep"), cAll.l, cAvoid.l, cGen.l, el("span", "nd-cb-grow"), status, bPresets, bFix, bReset);

    // presets popover
    const pop = el("div", "nd-cb-pop");
    pop.style.display = "none";
    const pSave = el("div", "nd-cb-psave");
    const pName = el("input");
    pName.type = "text";
    pName.placeholder = "Preset name";
    pName.spellcheck = false;
    pName.maxLength = 80;
    const pSaveBtn = btn("nd-cb-btn", "Save", "Save every setting of this node under this name");
    pSave.append(pName, pSaveBtn);
    const pList = el("div", "nd-cb-plist");
    pList.dataset.ndScroll = "1";
    const pMsg = el("div", "nd-cb-pmsg");
    pop.append(el("div", "nd-cb-phint", "Saved: every parameter, random choices and formats."), pSave, pList, pMsg);

    // a short disclaimer shown when the Genitals section is switched on
    const gNote = el("div", "nd-cb-pop nd-cb-gnote");
    gNote.style.display = "none";
    const gOk = btn("nd-cb-btn small", "OK");
    const gFoot = el("div", "nd-cb-gfoot");
    gFoot.append(gOk);
    gNote.append(
        el("b", null, "Adult content"),
        el("div", "nd-cb-gtext", "For fictional adult characters (18+) only. Do not use it to depict real people."),
        gFoot,
    );

    // section buttons (icons) on the left
    const rail = el("div", "nd-cb-rail");
    rail.dataset.ndScroll = "1";
    const zoneBtns = SCHEMA.zones.map((z) => {
        const b = btn("nd-cb-zbtn");
        b.dataset.zone = z.id;
        b.dataset.tipSide = "right";
        b.innerHTML = ZONE_ICONS[z.id] || `<span class="nd-cb-zlabel">${z.label.slice(0, 2)}</span>`;
        rail.append(b);
        return b;
    });

    // panel
    const panel = el("div", "nd-cb-panel");
    const head = el("div", "nd-cb-phead");
    const title = el("div", "nd-cb-ptitle");
    const count = el("span", "nd-cb-pcount");
    const zRand = btn("nd-cb-btn small", null, "Set every parameter of this zone to random");
    zRand.innerHTML = `${DICE_SVG}<span>All random</span>`;
    const zClear = btn("nd-cb-btn small", "Clear", "Clear every parameter of this zone");
    const zCopy = btn("nd-cb-btn small");
    head.append(title, count, el("span", "nd-cb-grow"), zCopy, zRand, zClear);
    const body = el("div", "nd-cb-pbody");
    body.dataset.ndScroll = "1";
    panel.append(head, body);

    const main = el("div", "nd-cb-main");
    main.append(rail, panel);
    root.append(pop, gNote);
    root.append(bar, main);

    /* ----------------------------------------------------------- state io */

    const picks = () => (isObj(node.properties.nd_picked?.picked) ? node.properties.nd_picked.picked : {});
    const P = (pid) => SCHEMA.params.get(pid);
    // "All random" makes every parameter random; the values set by hand are kept for when it is off
    const isRandom = (pid) => !!st.all_random || st.values[pid] === RANDOM;
    const has = (pid) => (!!st.all_random || st.values[pid] != null) && applies(pid);
    const valOf = (pid) => (isRandom(pid) ? RANDOM : st.values[pid]);
    function rawEff(pid) {
        if (isRandom(pid)) return picks()[pid] ?? null;
        return st.values[pid] ?? null;
    }
    // a parameter marked "only" (e.g. breast size: female) is hidden for the other sex
    const suitsSex = (pid) => {
        const only = P(pid)?.only, sex = rawEff(SEX);
        return !only || !sex || only.includes(sex);
    };
    // "requires": e.g. penis size is shown only when the parts include a penis
    const required = (pid) => {
        const need = P(pid)?.requires;
        if (!need) return true;
        const v = rawEff(need.p);
        return (Array.isArray(v) ? v : v != null ? [v] : []).some((x) => (need.in || []).includes(x));
    };
    // the Genitals section is switched on with a checkbox of the toolbar; while off, none of it is used
    const sectionOn = (pid) => P(pid)?.part !== GENITALS || !!st.genitals;
    const zoneOn = (id) => id !== GENITALS || !!st.genitals;
    const suits = (pid) => sectionOn(pid) && suitsSex(pid) && required(pid);
    // parameters switched off by a chosen option ("mutes"), e.g. nail color under a French manicure
    let mutedBy = new Map();
    function computeMuted() {
        mutedBy = new Map();
        for (const [pid, p] of SCHEMA.params) {
            const v = rawEff(pid);
            const o = p.opt && v != null ? p.opt.get(v) : null;
            if (!o?.mutes || !suits(pid)) continue;
            for (const x of o.mutes) mutedBy.set(`${p.part}.${x}`, o.label);
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
        if (wState) wState.value = JSON.stringify(st);
        app.graph?.change?.();
        dirty();
    }
    const commit = () => { save(); render(); };

    const zoneId = () => {
        const id = node.properties.nd_zone;
        return SCHEMA.zoneById.has(id) && zoneOn(id) ? id : DEFAULT_ZONE;
    };
    function zoneCls(id) {
        const z = SCHEMA.zoneById.get(id);
        if (!z) return "";
        const c = [];
        const ps = z.params.filter(suits);
        if (ps.some((pid) => has(pid) && !isRandom(pid))) c.push("has");
        if (ps.some((pid) => isRandom(pid) && applies(pid))) c.push("rnd");
        if (id === zoneId()) c.push("sel");
        return c.join(" ");
    }
    // "Set: Hair color, Length · Random: Style" for the tooltip of a section button
    function zoneSummary(z) {
        const ps = z.params.filter(suits);
        const set = ps.filter((pid) => has(pid) && !isRandom(pid)).map((pid) => {
            const p = P(pid), v = st.values[pid];
            return `${p.label}: ${p.type === "number" ? v : labelOf(p, v)}`;
        });
        const rnd = ps.filter((pid) => isRandom(pid) && applies(pid)).map((pid) => P(pid).label);
        const parts = [];
        if (set.length) parts.push(set.join(", "));
        if (rnd.length) parts.push(`Random: ${rnd.join(", ")}`);
        return parts.join(". ") || `${ps.length} parameters, none set`;
    }
    function selectZone(id) {
        if (!SCHEMA.zoneById.has(id) || !zoneOn(id)) return;
        node.properties.nd_zone = id;
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
    function clickOption(p, id) {
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
            const all = p.options.map((o) => o.id);
            const pool = poolOf(p);
            if (pool.has(id)) {
                if (pool.size === 1) return; // a random pool keeps at least one value
                pool.delete(id);
            } else pool.add(id);
            const list = all.filter((x) => pool.has(x));
            if (list.length === all.length) delete st.pools[p.pid];
            else st.pools[p.pid] = list;
        } else if (st.values[p.pid] === id) {
            delete st.values[p.pid]; // clicking the chosen value again clears it
        } else {
            st.values[p.pid] = id;
        }
        commit();
    }
    function toggleRandom(p) {
        if (st.all_random) return;
        if (isRandom(p.pid)) delete st.values[p.pid];
        else st.values[p.pid] = RANDOM;
        commit();
    }
    function clearParam(p) {
        if (st.all_random) return;
        delete st.values[p.pid];
        delete st.pools[p.pid];
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
        r.append(el("span", "nd-cb-lab", "Quick set"));
        for (const pr of z.presets) {
            const b = btn("nd-cb-btn small", pr.label);
            if (pr.hint) tip(b, pr.label, pr.hint);
            const on = Object.entries(pr.set).every(([pid, v]) => JSON.stringify(st.values[pid]) === JSON.stringify(v));
            b.classList.toggle("on", on && !st.all_random);
            b.disabled = !!st.all_random;
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
    const labelOf = (p, v) => (Array.isArray(v) ? v.map((x) => p.opt?.get(x)?.label ?? x).join(" + ") : p.opt?.get(v)?.label ?? String(v));

    function valueText(p) {
        const v = valOf(p.pid);
        if (v == null) return { text: "not set", cls: "unset" };
        if (v === RANDOM) {
            const pk = picks()[p.pid];
            let text = "random";
            if (p.type === "number") {
                const [lo, hi] = numPool(p);
                if (lo !== p.min || hi !== p.max) text += ` ${lo}–${hi}`;
                if (pk != null) text += ` → ${pk}`;
            } else {
                const pool = poolOf(p);
                if (pool.size < p.options.length) text += ` (${pool.size} of ${p.options.length})`;
                if (Array.isArray(pk)) text += ` → ${labelOf(p, pk)}`;
                else if (pk != null && p.opt.has(pk)) text += ` → ${p.opt.get(pk).label}`;
            }
            return { text, cls: "rnd" };
        }
        if (p.type === "number") return { text: `${v} · ${stageOf(p, v)}`, cls: "set" };
        return { text: labelOf(p, v), cls: "set" };
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
            vt.text = `not used with ${mutedBy.get(p.pid)}`;
            vt.cls = "unset";
        }
        const val = el("span", `nd-cb-val ${vt.cls}`, vt.text);
        const dice = btn(`nd-cb-dice${rnd ? " on" : ""}`, null, st.all_random ? "All random is on (toolbar). Click the values to choose what random may pick." : rnd ? "Random: on (click to turn off). Click the values to choose what random may pick." : "Make this parameter random");
        dice.innerHTML = DICE_SVG;
        dice.disabled = !!st.all_random;
        dice.onclick = () => toggleRandom(p);
        const x = btn("nd-cb-x", "×", "Clear");
        x.style.visibility = st.values[p.pid] != null && !st.all_random ? "visible" : "hidden";
        x.onclick = () => clearParam(p);
        const name = el("span", "nd-cb-name", p.label);
        if (p.hint) {
            name.classList.add("has-tip");
            tip(name, p.label, p.hint);
        }
        h.append(name, val, el("span", "nd-cb-grow"), dice, x);
        r.append(h, control(p, val));
        return r;
    }

    function control(p, valEl) {
        const v = valOf(p.pid);
        const rnd = v === RANDOM;
        const pk = rnd ? picks()[p.pid] : null;
        if (p.type === "number") return numberCtl(p, valEl);
        const pool = rnd ? poolOf(p) : null;
        if (p.type === "scale" && !OPTION_ICONS[p.pid]) { // a scale with pictures (penis size) shows them as tiles
            const wrap = el("div", "nd-cb-scale");
            const steps = el("div", "nd-cb-steps");
            const idx = p.options.findIndex((o) => o.id === v);
            p.options.forEach((o, i) => {
                const b = btn("nd-cb-step");
                tip(b, o.label, o.hint);
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
        for (const o of p.options) {
            const b = btn(p.type === "color" ? "nd-cb-sw" : "nd-cb-chip", p.type === "color" || icons?.[o.id] ? null : o.label);
            if (p.type === "color") b.style.setProperty("--sw", o.swatch || "#888");
            if (icons?.[o.id]) {
                b.classList.add("icon");
                b.innerHTML = `${icons[o.id]}<span></span>`;
                b.lastChild.textContent = o.label;
            }
            let hint = o.hint || "";
            if (!rnd && (Array.isArray(v) ? v.includes(o.id) : v === o.id)) b.classList.add("on");
            if (rnd && pool.has(o.id)) b.classList.add("pool");
            if (rnd && o.id === pk) b.classList.add("picked");
            if (o.only && eff(SEX) && !o.only.includes(eff(SEX))) {
                b.classList.add("odd");
                hint = `${hint ? hint + " " : ""}Usually for ${o.only.map((x) => (x === "female" ? "women" : x === "male" ? "men" : x)).join(" and ")}; random skips it.`;
            }
            if (hint || p.type === "color") tip(b, o.label, hint);
            b.onclick = () => clickOption(p, o.id);
            wrap.append(b);
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
            i.title = title;
            return i;
        };
        if (v === RANDOM) {
            const [lo, hi] = numPool(p);
            const a = numBox(lo, "Random from"), b = numBox(hi, "Random to");
            a.onchange = b.onchange = () => setNumPool(p, a.value, b.value);
            wrap.append(el("span", "nd-cb-lab", "Random from"), a, el("span", "nd-cb-lab", "to"), b);
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

    /* ------------------------------------------------------------ render */

    function render() {
        // toolbar
        cNat.i.checked = st.formats.natural;
        cTag.i.checked = st.formats.tags;
        cAvoid.i.checked = st.avoid_conflicts;
        cAll.i.checked = !!st.all_random;
        cGen.i.checked = !!st.genitals;
        root.classList.toggle("all-random", !!st.all_random);
        zRand.disabled = zClear.disabled = !!st.all_random;
        const pk = picks();
        const randoms = st.all_random
            ? [...SCHEMA.params.keys()].filter(applies)
            : Object.keys(st.values).filter((pid) => st.values[pid] === RANDOM && SCHEMA.params.has(pid) && sectionOn(pid));
        const fixable = randoms.filter((pid) => pk[pid] != null);
        bFix.disabled = !fixable.length;
        if (!randoms.length) status.textContent = "";
        else if (node.properties.nd_picked) status.textContent = `${randoms.length} random · seed ${node.properties.nd_picked.seed}`;
        else status.textContent = `${randoms.length} random · run to pick`;

        hideTip();
        computeMuted();
        // section buttons: state dots and a tooltip with what is set
        for (const b of zoneBtns) {
            const z = SCHEMA.zoneById.get(b.dataset.zone);
            b.style.display = zoneOn(z.id) ? "" : "none";
            b.className = `nd-cb-zbtn ${zoneCls(z.id)}`;
            tip(b, z.label, zoneSummary(z));
        }

        // panel: the parameters of the zone that apply to the chosen sex
        const z = SCHEMA.zoneById.get(zoneId());
        title.textContent = z.label;
        const shown = z.params.filter(suits);
        const hidden = z.params.filter((pid) => !suitsSex(pid)).length;
        const waiting = z.params.filter((pid) => suitsSex(pid) && !required(pid)).length;
        count.textContent = `${shown.filter(has).length} of ${shown.length} set`;
        zCopy.style.display = z.copy ? "" : "none";
        if (z.copy) {
            zCopy.textContent = z.copy.label || "Copy";
            tip(zCopy, z.copy.label, z.copy.hint);
        }
        const keep = body.scrollTop;
        const rows = shown.map((pid) => row(P(pid)));
        if (z.presets?.length) rows.unshift(presetRow(z));
        if (waiting) {
            // parameters that wait for another one (e.g. penis size for the parts)
            const by = [...new Set(z.params.filter((pid) => suitsSex(pid) && !required(pid)).map((pid) => P(pid).requires.p))];
            const pending = by.some((pid) => isRandom(pid) && picks()[pid] == null);
            rows.push(el("div", "nd-cb-note", pending
                ? `${waiting} more parameters appear once a run picks ${by.map((pid) => P(pid)?.label ?? pid).join(", ")}.`
                : `${waiting} more parameters appear for what you choose in ${by.map((pid) => P(pid)?.label ?? pid).join(", ")}.`));
        }
        if (hidden) {
            const sex = rawEff(SEX);
            const who = sex === "male" ? "women" : sex === "female" ? "men" : "the other sex";
            rows.push(el("div", "nd-cb-note", `${hidden} parameter${hidden > 1 ? "s" : ""} for ${who} hidden (Sex: ${P(SEX)?.opt.get(sex)?.label ?? sex}).`));
        }
        body.replaceChildren(...rows);
        body.scrollTop = keep;
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
    const closeNote = () => { gNote.style.display = "none"; };
    cGen.i.addEventListener("change", () => {
        st.genitals = cGen.i.checked;
        if (st.genitals) {
            // the disclaimer opens under the checkbox
            gNote.style.left = `${Math.max(4, Math.min(cGen.l.offsetLeft, root.clientWidth - 264))}px`;
            gNote.style.top = `${cGen.l.offsetTop + cGen.l.offsetHeight + 8}px`;
            gNote.style.display = "";
        } else closeNote();
        commit();
    });
    gOk.onclick = closeNote;

    bFix.onclick = () => {
        const pk = picks();
        let n = 0;
        if (st.all_random) {
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
            bReset.textContent = "Click to confirm";
            clearTimeout(resetTimer);
            resetTimer = setTimeout(() => { bReset.classList.remove("confirm"); bReset.textContent = "Reset"; }, 2500);
            return;
        }
        clearTimeout(resetTimer);
        bReset.classList.remove("confirm");
        bReset.textContent = "Reset";
        st.values = {};
        st.pools = {};
        delete node.properties.nd_picked;
        commit();
    };
    zRand.onclick = () => {
        for (const pid of SCHEMA.zoneById.get(zoneId()).params.filter(suits)) st.values[pid] = RANDOM;
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
        for (const pid of SCHEMA.zoneById.get(zoneId()).params) { delete st.values[pid]; delete st.pools[pid]; }
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
        if (!names.length) pList.append(el("div", "nd-cb-pempty", "No presets yet."));
        for (const name of names) {
            const rowEl = el("div", "nd-cb-prow");
            const load = btn("nd-cb-pload", name, "Load this preset: it replaces every setting of the node");
            const del = btn("nd-cb-pdel", "×", "Delete this preset");
            load.onclick = () => {
                const pr = presets[name];
                st = normalizeState(JSON.stringify(pr.state || {}));
                delete node.properties.nd_picked;
                pName.value = name;
                save(); render();
                say(`Loaded "${name}".`);
                syncSaveBtn();
            };
            del.onclick = async () => {
                if (!del.classList.contains("confirm")) {
                    for (const d of pList.querySelectorAll(".nd-cb-pdel.confirm")) { d.classList.remove("confirm"); d.textContent = "×"; }
                    del.classList.add("confirm");
                    del.textContent = "Delete?";
                    return;
                }
                try {
                    const next = { ...(await loadPresets(true)) };
                    delete next[name];
                    await writePresets(next);
                    presets = next;
                    listPresets();
                    say(`Deleted "${name}".`);
                } catch (e) { say(`Could not delete: ${e.message}`, true); }
            };
            rowEl.append(load, del);
            pList.append(rowEl);
        }
        syncSaveBtn();
    }
    const syncSaveBtn = () => {
        const name = pName.value.trim();
        pSaveBtn.disabled = !name;
        pSaveBtn.textContent = name && presets[name] ? "Overwrite" : "Save";
    };
    pName.addEventListener("input", syncSaveBtn);
    pName.addEventListener("keydown", (e) => { if (e.key === "Enter") pSaveBtn.click(); });
    pSaveBtn.onclick = async () => {
        const name = pName.value.trim();
        if (!name) return;
        try {
            const next = { ...(await loadPresets(true)), [name]: { state: JSON.parse(JSON.stringify(st)), saved: new Date().toISOString() } };
            await writePresets(next);
            presets = next;
            listPresets();
            say(`Saved "${name}".`);
        } catch (e) { say(`Could not save: ${e.message}`, true); }
    };
    const closePop = () => { pop.style.display = "none"; bPresets.classList.remove("on"); };
    bPresets.onclick = async () => {
        if (pop.style.display !== "none") return closePop();
        pop.style.display = "";
        bPresets.classList.add("on");
        say("");
        pList.replaceChildren(el("div", "nd-cb-pempty", "Loading…"));
        try { presets = await loadPresets(true); listPresets(); } catch (e) { pList.replaceChildren(); say(`Presets are not available: ${e.message}`, true); }
        pName.focus();
    };
    const onDocDown = (e) => {
        if (pop.style.display !== "none" && !pop.contains(e.target) && !bPresets.contains(e.target)) closePop();
        if (gNote.style.display !== "none" && !gNote.contains(e.target) && !cGen.l.contains(e.target)) closeNote();
    };
    document.addEventListener("pointerdown", onDocDown, true);
    // typing in the panel must not trigger ComfyUI shortcuts
    for (const ev of ["keydown", "keyup", "keypress"]) {
        root.addEventListener(ev, (e) => { if (e.target?.tagName === "INPUT") e.stopPropagation(); });
    }

    bindTips(root);
    bindCanvasNavigation(root, node);
    node.addDOMWidget("nd_character", "ND_CHARACTER", root, {
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => MIN_H - 80,
    });

    node.ndCB = {
        restore() {
            st = normalizeState(wState?.value);
            // settings of the old figure preview, no longer used
            delete node.properties.nd_split;
            delete node.properties.nd_view;
            render();
        },
        refresh: render,
        dispose() { document.removeEventListener("pointerdown", onDocDown, true); },
        // Workflows saved when the node had a seed widget: [seed, control, state].
        // The seed now comes only on the input wire; the state is moved into place.
        migrate(info) {
            const v = info?.widgets_values;
            if (Array.isArray(v) && v.length >= 3 && typeof v[0] === "number" && typeof v[2] === "string" && wState) wState.value = v[2];
        },
    };
    render();
}

const STYLE = `
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
.nd-cb-row.full .nd-cb-chips{animation:nd-cb-shake .35s}
.nd-cb-presets{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:6px 0 8px;border-bottom:1px solid var(--nd-line)}
.nd-cb-presets .nd-cb-lab{margin-right:4px;font-size:11px}
.nd-cb.all-random .nd-cb-allrnd{color:var(--nd-rnd)}
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
.nd-cb-main{flex:1;display:grid;grid-template-columns:52px minmax(0,1fr);gap:6px;min-height:0}
.nd-cb-note{padding:8px 0 2px;font-size:11px;opacity:.5}
.nd-cb-row.muted{opacity:.45}
.nd-cb-rail{display:flex;flex-direction:column;gap:4px;min-height:0;overflow-y:auto;scrollbar-width:none}
.nd-cb-rail::-webkit-scrollbar{display:none}
.nd-cb-zbtn{--bg:var(--comfy-input-bg,#222);position:relative;flex:0 0 auto;width:52px;height:44px;padding:3px;box-sizing:border-box;border:1px solid var(--nd-line);border-radius:7px;background:var(--bg);color:var(--input-text,#ddd);cursor:pointer;display:flex;align-items:center;justify-content:center;opacity:.8;transition:opacity .12s,border-color .12s}
.nd-cb-zbtn:hover{opacity:1;border-color:var(--nd-accent)}
.nd-cb-zbtn.sel{--bg:#26446c;border-color:var(--nd-accent);opacity:1}
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
.nd-cb-val{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.nd-cb-val.unset{opacity:.4}
.nd-cb-val.set{color:var(--nd-set)}
.nd-cb-val.rnd{color:var(--nd-rnd)}
.nd-cb-dice,.nd-cb-x{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;padding:0;border:1px solid var(--nd-line);border-radius:4px;background:transparent;cursor:pointer;flex:none;line-height:1}
.nd-cb-dice:hover,.nd-cb-x:hover{border-color:var(--nd-accent)}
.nd-cb-dice.on{background:var(--nd-rnd);border-color:var(--nd-rnd);color:#fff}
.nd-cb-x{font-size:14px;opacity:.7}
.nd-cb-dice svg{pointer-events:none}
.nd-cb-steps{display:flex;gap:3px}
.nd-cb-step{flex:1;height:14px;padding:0;border:1px solid var(--nd-line);border-radius:3px;background:var(--comfy-menu-bg,#2a2a2a);cursor:pointer}
.nd-cb-step:hover{border-color:var(--nd-accent)}
.nd-cb-step.fill{background:rgba(214,166,79,.45);border-color:rgba(214,166,79,.6)}
.nd-cb-step.cur{background:var(--nd-set);border-color:var(--nd-set)}
.nd-cb-step.pool{background:rgba(161,132,230,.35);border-color:rgba(161,132,230,.6)}
.nd-cb-step.picked,.nd-cb-chip.picked,.nd-cb-sw.picked{box-shadow:0 0 0 2px var(--nd-rnd)}
.nd-cb-ends{display:flex;justify-content:space-between;margin-top:2px;font-size:10px;opacity:.45}
.nd-cb-chips{display:flex;flex-wrap:wrap;gap:4px}
.nd-cb-chip{height:22px;padding:0 8px;border:1px solid var(--nd-line);border-radius:11px;background:var(--comfy-menu-bg,#2a2a2a);cursor:pointer;white-space:nowrap}
.nd-cb-chip:hover{border-color:var(--nd-accent)}
.nd-cb-chip.on{background:var(--nd-set);border-color:var(--nd-set);color:#1b1b1b}
.nd-cb-chip.pool{background:rgba(161,132,230,.3);border-color:rgba(161,132,230,.7)}
.nd-cb-chip.odd,.nd-cb-sw.odd{opacity:.45}
.nd-cb-chips.icons{gap:5px}
.nd-cb-chip.icon{--bg:var(--comfy-menu-bg,#2a2a2a);height:auto;width:68px;padding:4px 2px 3px;border-radius:7px;display:flex;flex-direction:column;align-items:center;gap:1px;white-space:normal;background:var(--bg)}
.nd-cb-chip.icon svg{width:44px;height:44px;display:block;overflow:hidden;pointer-events:none}
.nd-cb-chip.icon span{font-size:10.5px;line-height:12px;text-align:center}
.nd-cb-chip.icon.on{--bg:var(--nd-set)}
.nd-cb-chip.icon.pool{--bg:#4a3f66}
.nd-cb-swatches{display:flex;flex-wrap:wrap;gap:5px}
.nd-cb-sw{width:20px;height:20px;padding:0;border-radius:50%;border:1px solid rgba(0,0,0,.5);background:var(--sw);cursor:pointer;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}
.nd-cb-sw:hover{transform:scale(1.12)}
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
`;

app.registerExtension({
    name: "NeuralDreamer.Nodes.CharacterBuilder",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE) return;
        await schemaReady();
        const proto = nodeType.prototype;
        chain(proto, "onNodeCreated", function () {
            injectStyleOnce("nd-cb-style", STYLE);
            setupBuilder(this);
            blankSlots(this, ["params"], [0]);
            const sz = this.computeSize?.() || [0, 0];
            this.setSize([Math.max(this.size?.[0] ?? 0, sz[0], 560), Math.max(this.size?.[1] ?? 0, sz[1], 640)]);
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
            this.properties.nd_picked = { seed: d.seed, picked: isObj(d.picked) ? d.picked : {} };
            this.ndCB?.refresh?.();
        });
        chain(proto, "onResize", function (size) {
            if (size && (size[0] < MIN_W || size[1] < MIN_H)) {
                size[0] = Math.max(size[0], MIN_W);
                size[1] = Math.max(size[1], MIN_H);
            }
        });
    },
});
