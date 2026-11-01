// Neural Dreamer Nodes — the catalog of LoRAs in the browser, and the gallery that shows it (used by ND LoRA Stack; the server side is nd_nodes/lora_catalog.py).
//
//  - the catalog: GET /nd/loras  ->  entries {name, preview: {kind: "image"|"video", v, image}|null, title, base, words, url, usage, version, notes, nsfw, nsfw_src, nsfw_level}
//  - a preview that is a video plays only while the pointer is over its tile (the first frame stands otherwise); it is always muted
//  - NSFW previews of tiles are blurred until the person turns the common switch (the eye) on. The switch is shared with other Neural Dreamer interfaces:
//      localStorage["nd-nsfw-show"] = "1" (shown), the attribute data-nd-nsfw="show|hide" on <html>, the window event "nd-nsfw-change"
//  - the person can mark a LoRA NSFW / safe (POST /nd/loras/nsfw); the mark lives next to the LoRA in name.nd.json
//  - favourites, the recently used and the filters of the gallery are kept in the browser under the keys other Neural Dreamer interfaces use too
import { api } from "../../scripts/api.js";
import { el, injectStyleOnce, toast } from "./nd_common.js";
import { T, resolveLang, loadLang, LANG_EVENT } from "./nd_i18n.js";

/* ------------------------------------------------------------------ language */

// The language of this node and its menus is English. When an interface pack with a language setting is installed (it publishes window.ndUi),
// the language chosen there (else the one of ComfyUI) applies here too.
export const LANG = () => (window.ndUi ? resolveLang("auto") : "en");
export const tr = (s, v) => T(LANG(), s, v);
export const ensureLang = () => loadLang(LANG());

/* ------------------------------------------------------------------ icons */

const svg = (body, size = 14) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICONS = {
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    x: '<path d="M18 6L6 18"/><path d="M6 6l12 12"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    star: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21.1 7 14.2 2 9.3l6.9-1z"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14L21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-6.5 0-10-7-10-7a18.4 18.4 0 0 1 5.06-5.94"/><path d="M2 2l20 20"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6z"/>',
    chevL: '<path d="M15 18l-6-6 6-6"/>',
    chevR: '<path d="M9 18l6-6-6-6"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    cube: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3.3 7.5L12 12.5l8.7-5"/><path d="M12 22V12.5"/>',
    grip: '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
};
export const icon = (name, size = 14) => { const s = document.createElement("span"); s.className = "nd-lr-ico"; s.innerHTML = svg(ICONS[name] || "", size); return s; };

/* ------------------------------------------------------------------ what the person keeps (shared keys) */

const read = (key, def) => { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? def; } catch { return def; } };
const write = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} };
export const favorites = {
    all: () => new Set(read("ndui-fav:loras", [])),
    toggle(name) { const s = favorites.all(); if (s.has(name)) s.delete(name); else s.add(name); write("ndui-fav:loras", [...s]); return s.has(name); },
};
export const recents = {
    all: () => read("ndui-recent:loras", []),
    add(name) { const l = recents.all().filter((n) => n !== name); l.unshift(name); write("ndui-recent:loras", l.slice(0, 12)); },
};
export const galleryFilter = {
    get: () => { const v = read("ndui-gallery:loras", {}); return { dir: String(v.dir || ""), base: String(v.base || ""), fav: v.fav === true }; },
    set: (v) => write("ndui-gallery:loras", { dir: v.dir || "", base: v.base || "", fav: v.fav === true }),
};

/* ------------------------------------------------------------------ the common NSFW switch */

const NSFW_KEY = "nd-nsfw-show";
export const NSFW_EVENT = "nd-nsfw-change";
let memShow = false; // when the browser keeps nothing
export function nsfwShown() {
    try { return localStorage.getItem(NSFW_KEY) === "1"; } catch { return memShow; }
}
function applyNsfw() { document.documentElement.dataset.ndNsfw = nsfwShown() ? "show" : "hide"; }
export function setNsfwShown(on) {
    memShow = !!on;
    try { if (on) localStorage.setItem(NSFW_KEY, "1"); else localStorage.removeItem(NSFW_KEY); } catch {}
    applyNsfw();
    window.dispatchEvent(new CustomEvent(NSFW_EVENT, { detail: { show: !!on } }));
}
window.addEventListener("storage", (e) => { if (e.key === NSFW_KEY || e.key === null) { applyNsfw(); window.dispatchEvent(new CustomEvent(NSFW_EVENT, { detail: { show: nsfwShown() } })); } });
applyNsfw();

// the eye: shows / hides the NSFW previews everywhere. Follows the switch by itself and lets go of the listener when it leaves the page.
export function nsfwButton(cls = "nd-lr-btn icon") {
    const b = el("button", `${cls} nd-lr-eye`); b.type = "button";
    const paint = () => {
        const on = nsfwShown();
        b.classList.toggle("on", on);
        b.replaceChildren(icon(on ? "eye" : "eyeOff", 15));
        b.title = on ? tr("NSFW previews are shown. Click to blur them.") : tr("NSFW previews are blurred. Click to show them.");
        b.setAttribute("aria-pressed", String(on));
    };
    const on = () => { if (!b.isConnected && b.__seen) { window.removeEventListener(NSFW_EVENT, on); window.removeEventListener(LANG_EVENT, on); return; } if (b.isConnected) b.__seen = true; paint(); };
    window.addEventListener(NSFW_EVENT, on); window.addEventListener(LANG_EVENT, on);
    b.addEventListener("click", (e) => { e.stopPropagation(); setNsfwShown(!nsfwShown()); });
    paint();
    return b;
}

/* ------------------------------------------------------------------ the catalog */

let catalogP = null;
export const enc = encodeURIComponent;
export const baseName = (n) => String(n).split(/[\\/]/).pop();
export const dirName = (n) => { const p = String(n).split(/[\\/]/); p.pop(); return p.join("/"); };
export const stemName = (n) => baseName(n).replace(/\.(safetensors|ckpt|pt|pth|bin|gguf)$/i, "");
export const previewUrl = (m, big = false) => api.apiURL(`/nd/loras/preview?name=${enc(m.name)}${big ? "&big=1" : ""}&v=${m.preview?.v || 0}`);
export const videoUrl = (m) => api.apiURL(`/nd/loras/video?name=${enc(m.name)}&v=${m.preview?.v || 0}`);

// Promise<Map name -> entry>; an empty map when the server has nothing.
// It is ONE map for the page and its entries are updated in place: the list of the node, the gallery and every tile see the same data
// (a mark made in the gallery reaches the rows of the node).
const entries = new Map();
export function catalog(fresh = false) {
    if (!fresh && catalogP) return catalogP;
    catalogP = (async () => {
        try {
            const r = await api.fetchApi("/nd/loras");
            if (!r.ok) return entries;
            const list = await r.json(), names = new Set();
            for (const m of list) {
                names.add(m.name);
                const old = entries.get(m.name);
                if (old) { for (const k of Object.keys(old)) delete old[k]; Object.assign(old, m); } else entries.set(m.name, m);
            }
            for (const k of [...entries.keys()]) if (!names.has(k)) entries.delete(k);
            if (fresh) window.dispatchEvent(new CustomEvent(MARK_EVENT, { detail: { name: null } }));
            return entries;
        } catch { return entries; }
    })();
    return catalogP;
}

export const MARK_EVENT = "nd-lora-mark";

// the person's mark: true / false / null (automatic). The entry of the catalog is updated in place, so every tile that holds it can be repainted.
export async function markNsfw(m, value) {
    try {
        const r = await api.fetchApi("/nd/loras/nsfw", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: m.name, nsfw: value }) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        Object.assign(m, await r.json());
        window.dispatchEvent(new CustomEvent(MARK_EVENT, { detail: { name: m.name } }));
        return true;
    } catch (e) {
        toast("error", tr("Cannot save the mark"), String(e?.message || e));
        return false;
    }
}

/* ------------------------------------------------------------------ the picture or the video of a LoRA */

const io = typeof IntersectionObserver === "function" ? new IntersectionObserver((list) => { for (const en of list) en.target.__ndVis?.(en.isIntersecting); }, { rootMargin: "160px" }) : null;
const safePlay = (v) => { try { const p = v.play(); if (p && p.catch) p.catch(() => {}); } catch {} };

// opts: {play: "hover" | "always", hover: the element whose pointer-over starts the video (default: the thumb itself)}
// The result has .setNsfw(bool) to repaint after a mark.
export function mediaThumb(m, { play = "hover", hover = null } = {}) {
    const box = el("div", "nd-lr-media");
    const p = m?.preview;
    box.setNsfw = (on) => box.classList.toggle("nsfw", !!on && !!p);
    if (!p) { box.classList.add("empty"); box.append(icon("cube", 18)); return box; }
    box.append(el("span", "nd-lr-nsfwtag", "NSFW"));
    box.setNsfw(m.nsfw);
    const fail = () => { box.classList.add("empty"); box.replaceChildren(icon("cube", 18)); };
    if (p.kind === "video") {
        const v = document.createElement("video");
        v.className = "nd-lr-mv"; v.muted = true; v.defaultMuted = true; v.loop = true; v.playsInline = true; v.preload = "metadata"; v.disablePictureInPicture = true; v.controls = false;
        v.setAttribute("muted", ""); v.setAttribute("playsinline", "");
        if (p.image) v.poster = previewUrl(m);
        let loaded = false, vis = !io;
        const load = () => { if (loaded) return; loaded = true; v.src = `${videoUrl(m)}#t=0.001`; };
        const stop = () => { try { v.pause(); if (v.readyState > 0) v.currentTime = 0; } catch {} };
        box.__ndVis = (on) => {
            vis = on;
            if (on) { load(); if (play === "always") safePlay(v); } else { try { v.pause(); } catch {} }
        };
        if (io) io.observe(box); else load();
        const target = hover || box;
        target.addEventListener("pointerenter", () => { if (play === "hover") { load(); safePlay(v); } });
        target.addEventListener("pointerleave", () => { if (play === "hover") stop(); });
        v.addEventListener("error", () => { if (loaded && v.src) fail(); });
        // a tile that was off the screen when «always» was chosen starts when it appears
        v.addEventListener("loadeddata", () => { if (play === "always" && vis) safePlay(v); });
        box.prepend(v);
        box.video = v;
    } else {
        const im = el("img", "nd-lr-mi"); im.loading = "lazy"; im.decoding = "async"; im.alt = ""; im.draggable = false;
        im.addEventListener("error", fail);
        im.src = previewUrl(m);
        box.prepend(im);
    }
    return box;
}

/* ------------------------------------------------------------------ info of a LoRA */

export const hasInfo = (m) => !!(m && ((m.words && m.words.length) || m.usage || m.notes || m.base || m.version));

export async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    try {
        const t = document.createElement("textarea"); t.value = text; t.style.cssText = "position:fixed;left:-999px;top:0;opacity:0";
        document.body.appendChild(t); t.select(); const ok = document.execCommand("copy"); t.remove(); return ok;
    } catch { return false; }
}

// the buttons «page of the LoRA» and «info»; both are dimmed and do nothing when there is nothing behind them
export function infoButtons(m, onInfo) {
    const box = el("span", "nd-lr-ib");
    const page = el("button", "nd-lr-round nd-lr-pg"); page.type = "button"; page.append(icon("external", 13));
    page.title = m?.url ? tr("Open the page of this LoRA") : tr("No page is known for this LoRA");
    page.disabled = !m?.url;
    page.addEventListener("click", (e) => { e.stopPropagation(); if (m?.url) window.open(m.url, "_blank", "noopener,noreferrer"); });
    const inf = el("button", "nd-lr-round nd-lr-inf"); inf.type = "button"; inf.append(icon("info", 13));
    inf.title = hasInfo(m) ? tr("Trigger words and notes of this LoRA") : tr("Nothing is known about this LoRA");
    inf.disabled = !hasInfo(m);
    inf.addEventListener("click", (e) => { e.stopPropagation(); if (hasInfo(m)) onInfo(); });
    box.append(page, inf);
    return box;
}

// the picture or the video large, over everything; a click or Esc closes only it (the video is muted)
function showLarge(m, host) {
    const ov = el("div", "nd-lr-big"); ov.title = tr("Click to close");
    let node;
    if (m.preview.kind === "video") {
        node = document.createElement("video"); node.src = videoUrl(m); node.muted = true; node.defaultMuted = true; node.loop = true; node.autoplay = true; node.playsInline = true; node.controls = false;
        node.setAttribute("muted", "");
        if (m.preview.image) node.poster = previewUrl(m, true);
    } else { node = el("img"); node.alt = ""; node.src = previewUrl(m, true); }
    ov.append(node);
    const off = () => { ov.remove(); window.removeEventListener("keydown", key, true); };
    const key = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); off(); } };
    ov.addEventListener("click", (e) => { e.stopPropagation(); off(); });
    window.addEventListener("keydown", key, true);
    host.appendChild(ov);
    if (node.tagName === "VIDEO") safePlay(node);
}

// fills `box` with the info of one LoRA (trigger words that can be copied, usage tips, notes)
export function fillInfo(box, m) {
    box.classList.add("nd-lr-li");
    const head = el("div", "nd-lr-li-head");
    if (m.preview) {
        const th = el("button", "nd-lr-li-pic"); th.type = "button"; th.title = tr("Show the picture large");
        const t = mediaThumb(m, { play: "always" }); t.classList.add("plain"); th.append(t);
        th.addEventListener("click", () => showLarge(m, box.closest(".nd-lr-modal") || document.body));
        head.classList.add("has-pic"); head.append(th);
    }
    const txt = el("div", "nd-lr-li-txt");
    txt.append(el("b", "", m.title || stemName(m.name)));
    const sub = [m.base, m.version].filter(Boolean).join(" · ");
    if (sub) txt.append(el("small", "", tr("Made for: {base}", { base: sub })));
    head.append(txt);
    box.append(head);
    const body = el("div", "nd-lr-li-body"); box.append(body);
    const sec = (label) => { const s = el("div", "nd-lr-li-sec"); s.append(el("div", "nd-lr-li-lab", label)); body.append(s); return s; };
    const words = m.words || [];
    if (words.length) {
        const s = sec(tr("Trigger words"));
        for (const [i, w] of words.entries()) {
            const r = el("div", `nd-lr-li-word${i % 2 ? " alt" : ""}`);
            r.append(el("span", "nd-lr-li-w", w));
            const cp = el("button", "nd-lr-round"); cp.type = "button"; cp.title = tr("Copy"); cp.append(icon("copy", 13));
            cp.addEventListener("click", async () => { const ok = await copyText(w); cp.classList.toggle("done", ok); cp.replaceChildren(icon(ok ? "check" : "copy", 13)); setTimeout(() => { cp.classList.remove("done"); cp.replaceChildren(icon("copy", 13)); }, 1100); });
            r.append(cp); s.append(r);
        }
    }
    if (m.usage) sec(tr("Usage tips")).append(el("div", "nd-lr-li-text", m.usage));
    if (m.notes) sec(tr("Notes")).append(el("div", "nd-lr-li-text", m.notes));
    if (!words.length && !m.usage && !m.notes) body.append(el("div", "nd-lr-empty", tr("No trigger words or tips are known for this LoRA.")));
}

/* ------------------------------------------------------------------ the gallery */

// the menu stands above its tile (below it when there is no room), inside `host`, so the tile (overflow:hidden) cannot cut it
function placeMenu(menu, tile, host) {
    const hr = host.getBoundingClientRect(), sc = hr.width / (host.offsetWidth || hr.width) || 1;
    const t = tile.getBoundingClientRect(), mw = menu.offsetWidth, mh = menu.offsetHeight, W = host.clientWidth, H = host.clientHeight;
    const x = Math.max(6, Math.min((t.right - hr.left) / sc - mw, W - mw - 6));
    let y = (t.top - hr.top) / sc - mh - 4;
    if (y < 6) y = Math.max(6, Math.min((t.bottom - hr.top) / sc + 4, H - mh - 6));
    menu.style.left = `${x}px`; menu.style.top = `${y}px`; menu.style.right = "auto";
}

// the menu of the shield: mark as NSFW / as safe / back to automatic
function markMenu(anchor, m, repaint) {
    document.querySelectorAll(".nd-lr-menu").forEach((x) => x.remove());
    const menu = el("div", "nd-lr-menu");
    const item = (label, value, on, disabled = false) => {
        const b = el("button", `nd-lr-menu-it${on ? " on" : ""}`); b.type = "button"; b.disabled = disabled;
        b.append(icon(on ? "check" : "shield", 12), el("span", "", label));
        b.addEventListener("click", async (e) => { e.stopPropagation(); off(); if (await markNsfw(m, value)) repaint(); });
        return b;
    };
    const user = m.nsfw_src === "user";
    menu.append(
        item(tr("Mark as NSFW"), true, user && m.nsfw === true),
        item(tr("Mark as safe"), false, user && m.nsfw === false),
        item(tr("Back to automatic"), null, !user, !user),
    );
    const tile = anchor.closest(".nd-lr-card") || anchor.parentElement, host = anchor.closest(".nd-lr-modal") || tile;
    host.appendChild(menu);
    if (host !== tile) placeMenu(menu, tile, host);
    const off = () => { menu.remove(); document.removeEventListener("pointerdown", away, true); window.removeEventListener("keydown", key, true); window.removeEventListener("scroll", off, true); };
    const away = (e) => { if (!menu.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) off(); };
    const key = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); off(); } };
    setTimeout(() => { document.addEventListener("pointerdown", away, true); window.addEventListener("keydown", key, true); window.addEventListener("scroll", off, true); }, 0);
}

// opts: {title, current, onPick(name, entry)}  ->  close()
export function openGallery({ title = "", current = null, onPick } = {}) {
    document.querySelectorAll(".nd-lr-back").forEach((x) => x.remove());
    const back = el("div", "nd-lr-back"), modal = el("div", "nd-lr-modal");
    back.append(modal);
    const close = () => { back.remove(); window.removeEventListener("keydown", key, true); window.removeEventListener(NSFW_EVENT, repaintAll); window.removeEventListener(LANG_EVENT, relang); };
    const key = (e) => { if (e.key === "Escape" && !modal.querySelector(".nd-lr-big") && !document.querySelector(".nd-lr-menu")) { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
    const head = el("div", "nd-lr-head");
    const search = el("div", "nd-lr-search"); search.append(icon("search", 15));
    const input = el("input"); input.placeholder = tr("Search by name, trigger word or base model"); input.spellcheck = false;
    search.append(input);
    const star = el("button", "nd-lr-btn icon nd-lr-favbtn"); star.type = "button"; star.title = tr("Only the favourites"); star.append(icon("star", 15));
    const refresh = el("button", "nd-lr-btn icon"); refresh.type = "button"; refresh.title = tr("Reload the list and the pictures"); refresh.append(icon("refresh", 15));
    const eye = nsfwButton();
    const shut = el("button", "nd-lr-btn icon"); shut.type = "button"; shut.title = tr("Close"); shut.append(icon("x", 15));
    shut.addEventListener("click", close);
    head.append(search, star, eye, refresh, shut);
    const filters = el("div", "nd-lr-filters");
    const selDir = el("select", "nd-lr-sel"), selBase = el("select", "nd-lr-sel");
    const clear = el("button", "nd-lr-btn nd-lr-clear"); clear.type = "button"; clear.title = tr("Reset the filters"); clear.append(icon("x", 12), el("span", "", tr("Clear")));
    filters.append(selDir, selBase, clear);
    const grid = el("div", "nd-lr-grid"); grid.dataset.ndScroll = "1";
    if (title) modal.append(el("div", "nd-lr-mtitle", title));
    modal.append(head, filters, grid);

    const saved = galleryFilter.get();
    let info = new Map(), onlyFav = saved.fav, favs = favorites.all(), first = true;
    const list = () => [...info.keys()];
    const fillFilters = () => {
        const dirs = [...new Set(list().map(dirName))].sort();
        const bases = [...new Set(list().map((n) => info.get(n)?.base).filter(Boolean))].sort();
        const keep = first ? [saved.dir, saved.base] : [selDir.value, selBase.value]; first = false;
        selDir.textContent = ""; selBase.textContent = "";
        selDir.append(new Option(tr("All folders"), ""), ...dirs.map((d) => new Option(d || tr("(no folder)"), d || "\u0000")));
        selBase.append(new Option(tr("All base models"), ""), ...bases.map((b) => new Option(b, b)));
        selDir.value = [...selDir.options].some((o) => o.value === keep[0]) ? keep[0] : "";
        selBase.value = [...selBase.options].some((o) => o.value === keep[1]) ? keep[1] : "";
        selDir.style.display = dirs.length > 1 ? "" : "none";
        selBase.style.display = bases.length > 1 ? "" : "none";
        filters.style.display = dirs.length > 1 || bases.length > 1 ? "" : "none";
    };
    const remember = () => galleryFilter.set({ dir: selDir.value, base: selBase.value, fav: onlyFav });
    const dirty = () => !!(selDir.value || selBase.value || onlyFav || input.value.trim());
    const match = (n) => {
        const m = info.get(n) || {}, q = input.value.trim().toLowerCase();
        if (onlyFav && !favs.has(n)) return false;
        if (selDir.value && (selDir.value === "\u0000" ? dirName(n) : dirName(n) !== selDir.value)) return false;
        if (selBase.value && m.base !== selBase.value) return false;
        if (!q) return true;
        return [n, m.title, m.base, ...(m.words || [])].some((x) => x && String(x).toLowerCase().includes(q));
    };
    // the info of a LoRA lies over the gallery; «back» returns to the tiles
    const showInfo = (m) => {
        const ov = el("div", "nd-lr-info"), bar = el("div", "nd-lr-info-bar");
        const bk = el("button", "nd-lr-btn"); bk.type = "button"; bk.append(icon("chevL", 14), el("span", "", tr("Back")));
        bk.addEventListener("click", () => ov.remove());
        bar.append(bk); ov.append(bar);
        const content = el("div", "nd-lr-info-content"); ov.append(content);
        fillInfo(content, m);
        modal.append(ov);
    };
    const card = (n) => {
        const m = info.get(n), c = el("div", `nd-lr-card${n === current ? " on" : ""}`); c.tabIndex = 0; c.setAttribute("role", "button"); c.title = n;
        const pic = el("div", "nd-lr-cpic");
        const media = mediaThumb(m, { play: "hover", hover: c }); pic.append(media);
        if (m.base) pic.append(el("span", "nd-lr-base", m.base));
        const fav = el("button", `nd-lr-fav${favs.has(n) ? " on" : ""}`); fav.type = "button"; fav.title = tr("Favourite"); fav.append(icon("star", 14));
        fav.addEventListener("click", (e) => { e.stopPropagation(); favorites.toggle(n); favs = favorites.all(); fav.classList.toggle("on", favs.has(n)); if (onlyFav) draw(); });
        pic.append(fav);
        const shield = el("button", `nd-lr-shield${m.nsfw ? " on" : ""}${m.nsfw_src === "user" ? " user" : ""}`); shield.type = "button";
        shield.title = m.nsfw ? tr("NSFW. Change the mark") : tr("Mark as NSFW or as safe");
        shield.append(icon("shield", 13));
        const repaint = () => { media.setNsfw(m.nsfw); shield.classList.toggle("on", !!m.nsfw); shield.classList.toggle("user", m.nsfw_src === "user"); shield.title = m.nsfw ? tr("NSFW. Change the mark") : tr("Mark as NSFW or as safe"); };
        shield.addEventListener("click", (e) => { e.stopPropagation(); markMenu(shield, m, repaint); });
        pic.append(shield);
        const ib = infoButtons(m, () => showInfo(m)); pic.append(ib);
        const nm = el("div", "nd-lr-cname"); nm.append(el("span", "t", m.title || stemName(n)));
        const d = dirName(n); if (d) nm.append(el("small", "", d)); else if (m.title) nm.append(el("small", "", stemName(n)));
        c.append(pic, nm);
        const choose = () => { recents.add(n); close(); onPick?.(n, m); };
        c.addEventListener("click", choose);
        c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(); } e.stopPropagation(); });
        return c;
    };
    function draw() {
        star.classList.toggle("on", onlyFav); clear.disabled = !dirty();
        grid.textContent = "";
        const all = list().filter(match);
        if (!all.length) { grid.append(el("div", "nd-lr-empty", info.size ? tr("Nothing found") : tr("There are no models in this folder"))); return; }
        const plain = !input.value.trim() && !onlyFav && !selDir.value && !selBase.value;
        const sec = (t) => grid.append(el("div", "nd-lr-sec", t));
        const recent = plain ? recents.all().filter((n) => info.has(n)).slice(0, 6) : [];
        if (recent.length) { sec(tr("Recent")); for (const n of recent) grid.append(card(n)); sec(tr("All")); }
        else if (plain && all.some((n) => favs.has(n))) { sec(tr("Favourites")); for (const n of all.filter((x) => favs.has(x))) grid.append(card(n)); sec(tr("All")); }
        for (const n of all.slice(0, 600)) grid.append(card(n));
        if (all.length > 600) grid.append(el("div", "nd-lr-empty", tr("Showing the first 600. Narrow the search.")));
    }
    const repaintAll = () => {};   // the blur follows the attribute on <html> by itself (CSS); nothing to redraw
    const relang = () => { ensureLang().then(() => { input.placeholder = tr("Search by name, trigger word or base model"); fillFilters(); draw(); }); };
    const load = (fresh) => catalog(fresh).then((m) => { info = m; fillFilters(); draw(); });
    input.addEventListener("input", draw);
    const changed = () => { remember(); draw(); };
    selDir.addEventListener("change", changed); selBase.addEventListener("change", changed);
    star.addEventListener("click", () => { onlyFav = !onlyFav; changed(); });
    clear.addEventListener("click", () => { selDir.value = ""; selBase.value = ""; onlyFav = false; input.value = ""; changed(); input.focus(); });
    refresh.addEventListener("click", () => load(true));
    input.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") grid.querySelector(".nd-lr-card")?.click(); });
    back.addEventListener("pointerdown", (e) => { if (e.target === back) close(); });
    modal.addEventListener("keydown", (e) => e.stopPropagation());
    window.addEventListener("keydown", key, true);
    window.addEventListener(LANG_EVENT, relang);
    document.body.appendChild(back);
    draw();
    load(true);
    setTimeout(() => input.focus(), 0);
    return close;
}

/* ------------------------------------------------------------------ styles (the gallery and the tiles; the list of the node has its own in lora_stack.js) */

export const GALLERY_CSS = `
.nd-lr-ico{display:inline-flex;align-items:center;justify-content:center;line-height:0}
.nd-lr-ico svg{display:block;pointer-events:none}
.nd-lr-media{position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:100%;overflow:hidden;background:rgba(0,0,0,.28);color:rgba(255,255,255,.4)}
.nd-lr-media.plain{background:transparent}
.nd-lr-media>img,.nd-lr-media>video{display:block;width:100%;height:100%;object-fit:cover;transition:filter .12s,transform .12s}
.nd-lr-nsfwtag{display:none;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2;padding:1px 6px;border-radius:999px;font-size:9px;line-height:14px;letter-spacing:.06em;font-weight:700;color:#fff;background:rgba(8,10,14,.6);pointer-events:none}
.nd-lr-media.nsfw>img,.nd-lr-media.nsfw>video{filter:blur(14px) brightness(.8);transform:scale(1.25)}
.nd-lr-media.nsfw .nd-lr-nsfwtag{display:block}
html[data-nd-nsfw="show"] .nd-lr-media.nsfw>img,html[data-nd-nsfw="show"] .nd-lr-media.nsfw>video{filter:none;transform:none}
html[data-nd-nsfw="show"] .nd-lr-media.nsfw .nd-lr-nsfwtag{display:none}
.nd-lr-back{--nd-accent:#2f7de1;position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);font-family:Inter,Arial,sans-serif;font-size:13px;color:var(--input-text,#ddd)}
.nd-lr-modal{position:relative;display:flex;flex-direction:column;width:min(1180px,96vw);height:min(860px,94vh);border:1px solid var(--border-color,#444);border-radius:10px;background:var(--comfy-menu-bg,#1e1e1e);box-shadow:0 18px 50px rgba(0,0,0,.6);overflow:hidden}
.nd-lr-mtitle{padding:10px 14px 0;font-weight:650}
.nd-lr-head{display:flex;align-items:center;gap:6px;padding:10px}
.nd-lr-search{flex:1 1 auto;display:flex;align-items:center;gap:8px;height:30px;box-sizing:border-box;padding:0 10px;border:1px solid var(--border-color,#444);border-radius:6px;background:var(--comfy-input-bg,#222)}
.nd-lr-search input{flex:1 1 auto;min-width:0;border:0;outline:0;background:transparent;color:var(--input-text,#ddd);font:inherit;padding:0}
.nd-lr-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;height:30px;box-sizing:border-box;padding:0 10px;border:1px solid var(--border-color,#444);border-radius:6px;background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
.nd-lr-btn:hover:not(:disabled){border-color:var(--nd-accent,#2f7de1);color:var(--nd-accent,#2f7de1)}
.nd-lr-btn:disabled{opacity:.4;cursor:default}
.nd-lr-btn.icon{width:30px;padding:0}
.nd-lr-btn.on{border-color:var(--nd-accent,#2f7de1);color:var(--nd-accent,#2f7de1)}
.nd-lr-favbtn.on svg{fill:currentColor}
.nd-lr-filters{display:flex;gap:8px;padding:0 10px 8px}
.nd-lr-sel{flex:1 1 0;min-width:0;height:28px;padding:0 8px;border:1px solid var(--border-color,#444);border-radius:6px;background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);font:inherit;font-size:12px;outline:0}
.nd-lr-clear{height:28px}
.nd-lr-grid{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:10px;align-content:start;grid-auto-rows:max-content;padding:2px 10px 12px}
.nd-lr-sec{grid-column:1/-1;margin-top:4px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;opacity:.5}
.nd-lr-empty{grid-column:1/-1;display:flex;align-items:center;justify-content:center;gap:8px;padding:18px 10px;text-align:center;opacity:.55}
.nd-lr-card{position:relative;display:flex;flex-direction:column;min-width:0;border:1px solid var(--border-color,#444);border-radius:8px;background:rgba(0,0,0,.18);cursor:pointer;outline:0;overflow:hidden;flex:none;transition:border-color .12s}
.nd-lr-card:hover,.nd-lr-card:focus-visible{border-color:var(--nd-accent,#2f7de1)}
.nd-lr-card.on{box-shadow:0 0 0 1px var(--nd-accent,#2f7de1) inset}
.nd-lr-cpic{position:relative;flex:none;aspect-ratio:4/5;overflow:hidden;background:rgba(0,0,0,.25)}
.nd-lr-cname{display:flex;flex-direction:column;gap:1px;padding:6px 8px 7px;line-height:1.25}
.nd-lr-cname .t{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-weight:600;word-break:break-word}
.nd-lr-cname small{opacity:.55;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nd-lr-base{position:absolute;left:5px;bottom:5px;z-index:3;max-width:calc(100% - 10px);padding:1px 6px;border-radius:999px;font-size:10px;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:rgba(8,10,14,.72);color:#e8edf3}
.nd-lr-round{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:50%;background:rgba(8,10,14,.55);color:rgba(255,255,255,.85);cursor:pointer}
.nd-lr-round:hover:not(:disabled){background:var(--nd-accent,#2f7de1);color:#fff}
.nd-lr-round:disabled{opacity:.3;cursor:default;pointer-events:none}
.nd-lr-round.done{color:#7bd88f}
.nd-lr-fav{position:absolute;right:4px;top:4px;z-index:3;display:flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:50%;background:rgba(8,10,14,.55);color:rgba(255,255,255,.75);cursor:pointer;opacity:0;transition:opacity .12s}
.nd-lr-card:hover .nd-lr-fav,.nd-lr-fav.on,.nd-lr-fav:focus-visible{opacity:1}
.nd-lr-fav.on{color:#ffc94d}
.nd-lr-fav.on svg{fill:currentColor}
.nd-lr-ib{position:absolute;right:4px;top:60px;z-index:3;display:flex;flex-direction:column;gap:4px;opacity:0;transition:opacity .12s}
.nd-lr-card:hover .nd-lr-ib,.nd-lr-ib:focus-within{opacity:1}
.nd-lr-shield{position:absolute;right:4px;top:32px;z-index:3;display:flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border:0;border-radius:50%;background:rgba(8,10,14,.55);color:rgba(255,255,255,.8);cursor:pointer;opacity:0;transition:opacity .12s}
.nd-lr-card:hover .nd-lr-shield,.nd-lr-shield.on,.nd-lr-shield:focus-visible{opacity:1}
.nd-lr-shield.on{color:#ff8a8a}
.nd-lr-shield.on svg,.nd-lr-shield.user svg{fill:currentColor}
.nd-lr-shield:hover{background:rgba(8,10,14,.85)}
.nd-lr-menu{position:absolute;right:32px;top:30px;z-index:8;display:flex;flex-direction:column;min-width:150px;padding:4px;border:1px solid var(--border-color,#444);border-radius:8px;background:var(--comfy-menu-bg,#1e1e1e);box-shadow:0 8px 24px rgba(0,0,0,.5)}
.nd-lr-menu-it{display:flex;align-items:center;gap:7px;height:26px;padding:0 8px;border:0;border-radius:5px;background:transparent;color:var(--input-text,#ddd);font:inherit;font-size:12px;text-align:left;cursor:pointer;white-space:nowrap}
.nd-lr-menu-it:hover:not(:disabled){background:rgba(47,125,225,.22)}
.nd-lr-menu-it.on{color:var(--nd-accent,#2f7de1)}
.nd-lr-menu-it:disabled{opacity:.4;cursor:default}
.nd-lr-info{position:absolute;inset:0;z-index:6;display:flex;flex-direction:column;background:var(--comfy-menu-bg,#1e1e1e)}
.nd-lr-info-bar{display:flex;align-items:center;gap:8px;padding:6px 8px;border-bottom:1px solid var(--border-color,#444)}
.nd-lr-info-content{display:flex;flex-direction:column;min-height:0;flex:1 1 auto}
.nd-lr-li{display:flex;flex-direction:column;min-height:0;flex:1 1 auto}
.nd-lr-li-head{display:flex;align-items:center;gap:12px;padding:10px 14px 8px;border-bottom:1px solid var(--border-color,#444)}
.nd-lr-li-txt{display:flex;flex-direction:column;gap:2px;min-width:0}
.nd-lr-li-txt b{font-size:13px;word-break:break-word}
.nd-lr-li-txt small{opacity:.55;font-size:11px}
.nd-lr-li-pic{flex:0 0 auto;width:64px;height:64px;padding:0;border:1px solid var(--border-color,#444);border-radius:6px;overflow:hidden;background:rgba(0,0,0,.25);cursor:zoom-in}
.nd-lr-li-pic:hover{border-color:var(--nd-accent,#2f7de1)}
.nd-lr-li-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:8px 14px 12px;display:flex;flex-direction:column;gap:12px}
.nd-lr-li-lab{margin-bottom:4px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;opacity:.5}
.nd-lr-li-word{display:flex;align-items:center;gap:8px;padding:4px 8px;margin:0 -8px;border-radius:6px}
.nd-lr-li-word.alt{background:rgba(255,255,255,.05)}
.nd-lr-li-word:hover{background:rgba(47,125,225,.14)}
.nd-lr-li-w{flex:1 1 auto;min-width:0;word-break:break-word;user-select:text}
.nd-lr-li-text{white-space:pre-wrap;word-break:break-word;user-select:text;line-height:1.4}
.nd-lr-big{position:absolute;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(4,6,10,.88);cursor:zoom-out}
.nd-lr-big img,.nd-lr-big video{max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.6)}
`;
injectStyleOnce("nd-lora-gallery-style", GALLERY_CSS);
