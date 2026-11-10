// Neural Dreamer Nodes — language of the builders' interface (English, Russian, Chinese).
// Only what the person reads in the node changes; the prompt text is always English.
//
// Strings of the interface use the English text itself as the key: T(lang, "Fix random").
// Words of the data (parts, options, hints…) have stable keys made from ids, see walkRaw().
// The files js/i18n/<lang>.json hold the translations; a missing one shows the English text.

import { app } from "../../scripts/app.js";
import { walkRaw } from "./nd_i18n_walk.js";

export const LANGS = [
    { id: "en", label: "English" },
    { id: "ru", label: "Русский" },
    { id: "zh", label: "中文" },
];
export const LANG_IDS = LANGS.map((l) => l.id);
const COMMON_KEY = "nd-builder-lang";
export const LANG_EVENT = "nd-lang-change";

/* ------------------------------------------------------------------ choice */

// The language of ComfyUI itself ("ru", "zh", "zh-TW"…), used until the person chooses one.
export function localeLang() {
    let loc = "";
    try { loc = String(app.extensionManager?.setting?.get?.("Comfy.Locale") ?? app.ui?.settings?.getSettingValue?.("Comfy.Locale") ?? ""); } catch {}
    loc = loc.toLowerCase();
    if (loc.startsWith("ru")) return "ru";
    if (loc.startsWith("zh")) return "zh";
    return "en";
}

// The language shared by every node: the ComfyUI setting "Neural Dreamer > Language" (Auto = the language of ComfyUI).
// Older versions kept the choice in the browser storage (the key is shared with ND UI Builder); it is moved into the setting once.
export const SETTING_ID = "NeuralDreamer.Language";
const settingValue = () => {
    try { return String(app.extensionManager?.setting?.get?.(SETTING_ID) ?? app.ui?.settings?.getSettingValue?.(SETTING_ID) ?? "auto"); } catch { return "auto"; }
};
export function commonLang() {
    const v = settingValue();
    return LANG_IDS.includes(v) ? v : localeLang();
}
export function setCommonLang(id) {
    if (!LANG_IDS.includes(id)) return;
    try { localStorage.setItem(COMMON_KEY, id); } catch {} // the interface builder pack reads the same key
    try { app.extensionManager?.setting?.set?.(SETTING_ID, id); } catch {}
    window.dispatchEvent(new CustomEvent(LANG_EVENT, { detail: { lang: commonLang() } }));
}
// a node keeps "auto" (the common language) or its own choice
export const resolveLang = (own) => (LANG_IDS.includes(own) ? own : commonLang());
export const validOwnLang = (v) => (v === "auto" || LANG_IDS.includes(v) ? v : "auto");

/* ------------------------------------------------------------------ files */

const dicts = new Map(); // id -> dictionary (an object) once loaded
const loading = new Map();
export function loadLang(id) {
    if (id === "en" || !LANG_IDS.includes(id)) return Promise.resolve({});
    if (dicts.has(id)) return Promise.resolve(dicts.get(id));
    if (!loading.has(id)) {
        loading.set(id, fetch(new URL(`./i18n/${id}.json`, import.meta.url))
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`i18n/${id}.json: HTTP ${r.status}`))))
            .catch((e) => {
                console.warn(`[Neural Dreamer] cannot load the ${id} translation`, e);
                return {};
            })
            .then((d) => { dicts.set(id, d); return d; }));
    }
    return loading.get(id);
}
export const dictOf = (id) => dicts.get(id) || null;

/* ---------------------------------------------------------------- interface */

const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

// An interface string: the translation when there is one, else the English text itself.
export function T(lang, en, vars) {
    const d = lang === "en" ? null : dicts.get(lang);
    return fill(d?.ui?.[en] ?? en, vars);
}

/* --------------------------------------------------------------------- data */

// A copy of the schema with the words of a language put in (the English words stay in labelEn).
export function localizeRaw(raw, lang, section) {
    if (lang === "en") return raw;
    const dict = dicts.get(lang)?.[section];
    if (!dict) return raw;
    const out = JSON.parse(JSON.stringify(raw));
    walkRaw(out, (key, obj, fields) => {
        const tr = dict[key];
        if (!tr) return;
        for (const [short, name] of fields) {
            if (typeof tr[short] !== "string" || !tr[short]) continue;
            if (name === "label") obj.labelEn = obj.label;
            obj[name] = tr[short];
        }
    });
    return out;
}


/* ------------------------------------------------------------ the ComfyUI setting */

app.registerExtension({
    name: "NeuralDreamer.Language",
    settings: [{
        id: SETTING_ID,
        name: "Language of Neural Dreamer nodes",
        tooltip: "The language of the messages and the interface of the Neural Dreamer nodes. Auto follows the language of ComfyUI. A builder node can also be switched on its own.",
        category: ["Neural Dreamer", "Language"],
        type: "combo",
        defaultValue: "auto",
        options: [{ text: "Auto (language of ComfyUI)", value: "auto" }, ...LANGS.map((l) => ({ text: l.label, value: l.id }))],
        onChange: () => {
            loadLang(commonLang()).then(() => window.dispatchEvent(new CustomEvent(LANG_EVENT, { detail: { lang: commonLang() } })));
        },
    }],
    async setup() {
        // the choice made in an older version (browser storage) goes into the setting, once
        try {
            const old = localStorage.getItem(COMMON_KEY);
            if (LANG_IDS.includes(old) && !localStorage.getItem("nd-lang-migrated") && !LANG_IDS.includes(settingValue())) app.extensionManager?.setting?.set?.(SETTING_ID, old);
            localStorage.setItem("nd-lang-migrated", "1");
        } catch {}
        await loadLang(commonLang());
        window.dispatchEvent(new CustomEvent(LANG_EVENT, { detail: { lang: commonLang() } }));
    },
});
