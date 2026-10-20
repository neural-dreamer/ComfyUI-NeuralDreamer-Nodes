// Neural Dreamer Nodes — Show Any As Text
import { app } from "../../scripts/app.js";
import { el, dirty, chain, bindCanvasNavigation, injectStyleOnce } from "./nd_common.js";

const NODE = "NDShowAnyAsText";

const nextNoteTitle = (notes) => {
    let n = 0;
    for (const t of notes) {
        const m = /^Note (\d+)$/.exec(t.title || "");
        if (m) n = Math.max(n, Number(m[1]));
    }
    return `Note ${Math.max(n, notes.length) + 1}`;
};

function setupShowAny(node) {
    // state: notes live in node.properties, so they are saved with the workflow,
    // copied with the node and survive reloads of the workflow and of ComfyUI
    const st = { notes: [], active: -1, previewText: "" }; // active: -1 = Preview, i = notes[i]

    const root = el("div", "nd-st-root");
    const bar = el("div", "nd-st-bar");
    const tabs = el("div", "nd-st-tabs");
    const addBtn = el("button", "nd-st-add");
    addBtn.type = "button";
    addBtn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
    addBtn.title = "Add a note tab";
    bar.append(tabs, addBtn);

    const body = el("div", "nd-st-body");
    const preview = el("textarea", "nd-st-text nd-st-preview");
    preview.readOnly = true;
    preview.spellcheck = false;
    preview.placeholder = "Run the workflow to see the value";
    preview.dataset.ndScroll = "";
    body.append(preview);
    root.append(bar, body);

    const editors = []; // one textarea per note, so each keeps its own undo history

    // Notes and the last preview text are saved in node.properties (i.e. in the
    // workflow), so both survive reloads; the preview changes only on new input data.
    const persist = () => {
        node.properties ||= {};
        node.properties.nd_notes = st.notes.map((n) => ({ title: n.title, text: n.text }));
        app.graph?.change?.();
    };

    function makeEditor(i) {
        const ta = el("textarea", "nd-st-text nd-st-note");
        ta.spellcheck = false;
        ta.placeholder = "Write a note…";
        ta.dataset.ndScroll = "";
        ta.value = st.notes[i].text || "";
        ta.addEventListener("input", () => {
            const idx = editors.indexOf(ta);
            if (idx >= 0) { st.notes[idx].text = ta.value; persist(); }
        });
        return ta;
    }

    function rebuildEditors() {
        for (const ta of editors) ta.remove();
        editors.length = 0;
        st.notes.forEach((_, i) => { const ta = makeEditor(i); editors.push(ta); body.append(ta); });
    }

    function startRename(i, label) {
        const input = el("input", "nd-st-rename");
        input.type = "text";
        input.value = st.notes[i].title;
        input.spellcheck = false;
        label.replaceWith(input);
        input.focus();
        input.select();
        let done = false;
        const finish = (save) => {
            if (done) return;
            done = true;
            const v = input.value.trim();
            if (save && v) { st.notes[i].title = v; persist(); }
            renderTabs();
        };
        input.addEventListener("keydown", (e) => {
            e.stopPropagation();
            if (e.key === "Enter") finish(true);
            else if (e.key === "Escape") finish(false);
        });
        input.addEventListener("blur", () => finish(true));
    }

    function deleteNote(i) {
        st.notes.splice(i, 1);
        editors.splice(i, 1)[0]?.remove();
        if (st.active === i) st.active = -1;
        else if (st.active > i) st.active -= 1;
        persist();
        renderTabs();
        renderBody();
    }

    function renderTabs() {
        // the panel's top-left corner is square only under the leftmost (Preview) tab
        root.classList.toggle("nd-st-first-active", st.active === -1);
        tabs.replaceChildren();
        const pv = el("div", "nd-st-tab nd-st-tab-preview" + (st.active === -1 ? " active" : ""));
        pv.append(el("span", "nd-st-label", "Preview"));
        pv.addEventListener("click", () => activate(-1));
        tabs.append(pv);

        st.notes.forEach((note, i) => {
            const t = el("div", "nd-st-tab" + (st.active === i ? " active" : ""));
            const label = el("span", "nd-st-label", note.title);
            label.title = "Double-click to rename";
            const close = el("button", "nd-st-close", "×");
            close.type = "button";
            close.title = "Delete tab";
            let armTimer = null;
            close.addEventListener("click", (e) => {
                e.stopPropagation();
                // a tab with text needs a second click to be deleted
                if (!(note.text || "").trim() || close.classList.contains("armed")) { deleteNote(i); return; }
                close.classList.add("armed");
                close.textContent = "Delete?";
                clearTimeout(armTimer);
                armTimer = setTimeout(() => { close.classList.remove("armed"); close.textContent = "×"; }, 2500);
            });
            t.append(label, close);
            t.addEventListener("click", () => activate(i));
            label.addEventListener("dblclick", (e) => { e.stopPropagation(); startRename(i, label); });
            tabs.append(t);
        });
        const act = tabs.querySelector(".nd-st-tab.active");
        act?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }

    function renderBody() {
        preview.style.display = st.active === -1 ? "" : "none";
        editors.forEach((ta, i) => { ta.style.display = st.active === i ? "" : "none"; });
    }

    function activate(i) {
        if (st.active === i) return;
        st.active = i;
        renderTabs();
        renderBody();
        dirty();
    }

    addBtn.addEventListener("click", () => {
        st.notes.push({ title: nextNoteTitle(st.notes), text: "" });
        const ta = makeEditor(st.notes.length - 1);
        editors.push(ta);
        body.append(ta);
        persist();
        st.active = st.notes.length - 1;
        renderTabs();
        renderBody();
        ta.focus();
    });

    // tab strip: a horizontal swipe or Shift+wheel scrolls it, a plain wheel zooms the canvas
    tabs.addEventListener("wheel", (e) => {
        const horizontal = e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY);
        if (!horizontal || e.ctrlKey || tabs.scrollWidth <= tabs.clientWidth) return;
        tabs.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        e.preventDefault();
        e.stopPropagation();
    }, { passive: false });

    bindCanvasNavigation(root, node);

    node.addDOMWidget("nd_show_any", "ND_SHOW_ANY", root, {
        serialize: false,
        hideOnZoom: false,
        getMinHeight: () => 120,
    });
    node.setSize([Math.max(node.size[0], 400), Math.max(node.size[1], 260)]);

    node.ndApi = {
        setText(text) {
            const t = String(text ?? "");
            if (t === st.previewText && node.properties?.nd_preview_text === t) return;
            st.previewText = t;
            preview.value = t;
            node.properties ||= {};
            node.properties.nd_preview_text = t;
            dirty();
        },
        restore() {
            const saved = node.properties?.nd_notes;
            st.notes = Array.isArray(saved)
                ? saved.filter((n) => n && typeof n === "object").map((n) => ({ title: String(n.title || "Note"), text: String(n.text ?? "") }))
                : [];
            st.previewText = String(node.properties?.nd_preview_text ?? "");
            preview.value = st.previewText;
            st.active = -1; // the Preview tab is always open after loading
            rebuildEditors();
            renderTabs();
            renderBody();
        },
    };
    node.ndApi.restore();
}

const STYLE = `
.nd-st-root{--nd-accent:#2f7de1;display:flex;flex-direction:column;gap:0;width:100%;height:100%;box-sizing:border-box;padding:4px 2px;font-family:Inter,Arial,sans-serif;font-size:12px;color:var(--input-text,#ddd)}
.nd-st-bar{position:relative;z-index:2;display:flex;align-items:flex-end;gap:4px;flex:0 0 auto;margin-bottom:-1px}
.nd-st-tabs{display:flex;align-items:flex-end;gap:2px;overflow-x:auto;overflow-y:hidden;min-width:0;flex:0 1 auto;scrollbar-width:none}
.nd-st-tabs::-webkit-scrollbar{display:none}
.nd-st-tab{display:flex;align-items:center;gap:4px;flex:0 0 auto;box-sizing:border-box;height:26px;padding:0 10px 1px;border:1px solid transparent;border-bottom:none;border-radius:6px 6px 0 0;cursor:pointer;opacity:.65;user-select:none;white-space:nowrap}
.nd-st-tab:hover{opacity:.9}
.nd-st-tab:not(.active):hover{background:#ffffff0d}
.nd-st-tab.active{opacity:1;background:var(--comfy-input-bg,#222);border-color:var(--border-color,#444);box-shadow:inset 0 2px 0 var(--nd-accent);cursor:default}
.nd-st-tab-preview .nd-st-label{font-weight:600}
.nd-st-label{max-width:160px;overflow:hidden;text-overflow:ellipsis}
.nd-st-close{display:inline-flex;align-items:center;justify-content:center;height:16px;min-width:16px;padding:0 3px;border:none;border-radius:3px;background:transparent;color:inherit;font-size:13px;line-height:1;cursor:pointer;opacity:.7}
.nd-st-close:hover{opacity:1;background:#fff2}
.nd-st-close.armed{display:inline-flex;opacity:1;background:#c0392b;color:#fff;font-size:10px;padding:0 5px}
.nd-st-add{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:24px;height:22px;margin-bottom:3px;padding:0;border:1px solid var(--border-color,#444);border-radius:4px;background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);line-height:0;cursor:pointer}
.nd-st-add svg{display:block;pointer-events:none}
.nd-st-add:hover{border-color:var(--nd-accent);color:var(--nd-accent)}
.nd-st-rename{width:110px;height:18px;box-sizing:border-box;border:1px solid var(--nd-accent);border-radius:3px;background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);font-size:12px;padding:0 4px}
.nd-st-body{position:relative;z-index:1;flex:1 1 auto;min-height:60px;display:flex}
.nd-st-text{flex:1 1 auto;width:100%;height:100%;box-sizing:border-box;resize:none;margin:0;padding:7px 8px;border:1px solid var(--border-color,#444);border-radius:6px;background:var(--comfy-input-bg,#222);color:var(--input-text,#ddd);font-size:12px;line-height:1.45;outline:none}
/* Preview: lighter background, muted text. Notes: darker background, brighter text. */
.nd-st-text{background:#2b2b30;color:#dddcec}
.nd-st-tab.active{background:#2b2b30}
.nd-st-preview{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;cursor:text;background:#2c2e3a;color:#9d9eb1}
.nd-st-tab-preview.active{background:#2c2e3a}
.nd-st-note{font-family:inherit}
.nd-st-text::-webkit-scrollbar{width:10px;height:10px}
.nd-st-text::-webkit-scrollbar-track{background:transparent;margin:6px 0}
.nd-st-text::-webkit-scrollbar-thumb{background:rgba(255,255,255,.22);border:3px solid transparent;border-radius:6px;background-clip:padding-box}
.nd-st-text::-webkit-scrollbar-thumb:hover{background-color:rgba(255,255,255,.38)}
.nd-st-text::-webkit-scrollbar-button,.nd-st-text::-webkit-scrollbar-corner{display:none;background:transparent}
@supports not selector(::-webkit-scrollbar){.nd-st-text{scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.25) transparent}}
.nd-st-root.nd-st-first-active .nd-st-text{border-top-left-radius:0}
`;

app.registerExtension({
    name: "NeuralDreamer.Nodes.ShowAnyAsText",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE) return;
        const proto = nodeType.prototype;
        chain(proto, "onNodeCreated", function () {
            injectStyleOnce("nd-st-style", STYLE);
            setupShowAny(this);
        });
        chain(proto, "onConfigure", function () {
            // properties are already restored from the workflow at this point
            setTimeout(() => this.ndApi?.restore?.(), 0);
        });
        chain(proto, "onExecuted", function (msg) {
            if (msg?.nd_text) this.ndApi?.setText?.(msg.nd_text[0]);
        });
    },
});
