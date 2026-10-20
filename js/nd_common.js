// Neural Dreamer Nodes — shared helpers for node UIs (DOM widgets).
// Imported by the node scripts in this folder; it registers nothing by itself.
import { app } from "../../scripts/app.js";

export const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
};

export const dirty = () => app.graph?.setDirtyCanvas?.(true, true);

export function toast(severity, summary, detail) {
    try {
        if (app.extensionManager?.toast?.add) {
            app.extensionManager.toast.add({ severity, summary, detail, life: 4500 });
            return;
        }
    } catch {}
    if (severity === "error") alert(`${summary}\n${detail || ""}`);
    else console.log(`[ND] ${summary}: ${detail || ""}`);
}

export function hideWidget(node, name) {
    const w = node.widgets?.find((x) => x.name === name);
    if (!w) return null;
    w.hidden = true;
    w.options = w.options || {};
    w.options.hidden = true;
    w.computeSize = () => [0, -4];
    w.draw = () => {};
    w.nd_hidden = true;
    dropHiddenSockets(node);
    return w;
}

// ComfyUI gives every widget an input socket. For a hidden widget that socket
// sits on top of the node's real input, lights up while a wire is dragged and
// can catch the wire, so it is removed. The widget value is still sent.
// Called again after a workflow is loaded, since the saved slot list brings it back.
export function dropHiddenSockets(node) {
    const inputs = node.inputs || [];
    for (let i = inputs.length - 1; i >= 0; i--) {
        const name = inputs[i].widget?.name;
        if (!name || inputs[i].link != null) continue;
        const w = node.widgets?.find((x) => x.name === name);
        if (w?.nd_hidden) node.removeInput(i);
    }
}

export function isSelected(node) {
    const c = app.canvas;
    if (!c) return false;
    if (c.selectedItems instanceof Set) return c.selectedItems.size === 1 && c.selectedItems.has(node);
    if (c.selected_nodes) {
        const keys = Object.keys(c.selected_nodes);
        return keys.length === 1 && c.selected_nodes[node.id] === node;
    }
    return !!node.selected;
}

export function chain(proto, name, fn) {
    const orig = proto[name];
    proto[name] = function (...args) {
        const r = orig?.apply(this, args);
        fn.apply(this, args);
        return r;
    };
}

// The node UI is an HTML overlay above the ComfyUI canvas, so wheel events over it
// never reach the canvas. Re-dispatch them to the canvas element: zoom keeps working
// (including trackpad pinch, which arrives as wheel + ctrlKey).
export function getCanvasEl() {
    return app.canvas?.canvas ?? document.getElementById("graph-canvas") ?? document.querySelector("canvas.graph-canvas-container, canvas#graph-canvas");
}

export function forwardWheelToCanvas(root) {
    root.addEventListener("wheel", (e) => {
        if (e.__ndForwarded) return;
        // elements marked data-nd-scroll keep native scrolling while they overflow
        const sc = e.target?.closest?.("[data-nd-scroll]");
        if (sc && !e.ctrlKey && (sc.scrollHeight > sc.clientHeight + 1 || sc.scrollWidth > sc.clientWidth + 1)) return;
        const target = getCanvasEl();
        if (!target || target.contains(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
        const copy = new WheelEvent("wheel", {
            bubbles: true, cancelable: true, composed: true, view: window,
            clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY,
            deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ, deltaMode: e.deltaMode,
            ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, metaKey: e.metaKey,
            buttons: e.buttons,
        });
        copy.__ndForwarded = true;
        target.dispatchEvent(copy);
    }, { passive: false });
}

export function selectOnPointer(root, node) {
    root.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        try { if (!isSelected(node)) app.canvas?.selectNode?.(node, false); } catch {}
    });
}

// Middle-button drag over the node UI pans the canvas, like over an empty area.
// The canvas offset is moved directly (screen delta / zoom), the same way LiteGraph
// pans, so it does not depend on how a given frontend version handles pointer events.
export function panCanvasWithMiddleButton(root) {
    let pan = null;
    const redraw = () => {
        const c = app.canvas;
        if (c?.setDirty) c.setDirty(true, true);
        else app.graph?.setDirtyCanvas?.(true, true);
    };
    root.addEventListener("pointerdown", (e) => {
        if (e.button !== 1 || !app.canvas?.ds?.offset) return;
        e.preventDefault();
        e.stopPropagation();
        pan = { id: e.pointerId, x: e.clientX, y: e.clientY };
        try { root.setPointerCapture(e.pointerId); } catch {}
        root.classList.add("nd-panning");
    }, true);
    root.addEventListener("pointermove", (e) => {
        if (!pan || e.pointerId !== pan.id) return;
        const ds = app.canvas?.ds;
        if (!ds?.offset) return;
        const scale = ds.scale || 1;
        ds.offset[0] += (e.clientX - pan.x) / scale;
        ds.offset[1] += (e.clientY - pan.y) / scale;
        pan.x = e.clientX;
        pan.y = e.clientY;
        redraw();
        e.preventDefault();
        e.stopPropagation();
    }, true);
    const end = (e) => {
        if (!pan || (e.pointerId != null && e.pointerId !== pan.id)) return;
        pan = null;
        try { root.releasePointerCapture(e.pointerId); } catch {}
        root.classList.remove("nd-panning");
    };
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) root.addEventListener(t, end, true);
    // no browser auto-scroll / middle-click paste over the node
    root.addEventListener("mousedown", (e) => { if (e.button === 1) e.preventDefault(); }, true);
    root.addEventListener("auxclick", (e) => { if (e.button === 1) e.preventDefault(); }, true);
}

// Canvas navigation over a node UI: wheel zoom, middle-button pan, select on click.
export function bindCanvasNavigation(root, node) {
    injectStyleOnce("nd-common-style", ".nd-panning,.nd-panning *{cursor:grabbing!important}");
    selectOnPointer(root, node);
    forwardWheelToCanvas(root);
    panCanvasWithMiddleButton(root);
}

// Injects a <style> block once.
export function injectStyleOnce(id, css) {
    if (document.getElementById(id)) return;
    const s = document.createElement("style");
    s.id = id;
    s.textContent = css;
    document.head.appendChild(s);
}

// ND_PARAMS "plug" pins (the single input / output of a node) carry no visible name.
export const BLANK = " ";
export function blankSlots(node, inputNames = [], outputIndexes = []) {
    dropHiddenSockets(node);
    for (const inp of node.inputs || []) {
        if (inputNames.includes(inp.name)) { inp.label = BLANK; inp.localized_name = BLANK; }
    }
    for (const i of outputIndexes) {
        const o = node.outputs?.[i];
        if (o) { o.label = BLANK; o.localized_name = BLANK; }
    }
}

// Shared registry of what my nodes put on / expect from a parameters wire.
//   providers: comfyClass -> (node, outputSlot) => [{name, type, sub?}]   (read by Unpack)
//   consumers: comfyClass -> (node, inputSlot)  => [{name, type, optional?}] (read by Pack)
export const ND_REG = (window.__ndParams ||= { providers: new Map(), consumers: new Map(), refresh: () => {} });
ND_REG.consumers ||= new Map();

// One slider handle for every node of the pack. A styled handle needs
// appearance:none, which also drops the browser's track, so the track is drawn
// with CSS too; --p (the filled part) is kept up to date by setRangeFill().
const THUMB = "width:16px;height:16px;border-radius:50%;background:#e8e8e8;border:3px solid var(--nd-accent,#2f7de1);box-sizing:border-box;cursor:pointer";
export function rangeThumbCss(sel, trackInner) {
    const top = (trackInner - 16) / 2;
    return `
${sel}{-webkit-appearance:none;appearance:none;background:transparent;--p:0%}
${sel}:focus{outline:none}
${sel}::-webkit-slider-thumb{-webkit-appearance:none;margin-top:${top}px;${THUMB}}
${sel}::-moz-range-thumb{${THUMB}}
${sel}::-webkit-slider-thumb:hover{box-shadow:0 0 0 3px rgba(47,125,225,.25)}
${sel}::-moz-range-thumb:hover{box-shadow:0 0 0 3px rgba(47,125,225,.25)}`;
}
// The browser's own track (accent colour filled, light grey rest, 8px, thin border).
export function nativeTrackCss(sel) {
    const fill = "linear-gradient(to right,var(--nd-accent,#2f7de1) 0 var(--p),#efefef var(--p) 100%) padding-box";
    const edge = "linear-gradient(to right,#5279ab 0 var(--p),#b2b2b2 var(--p) 100%) border-box";
    return `
${sel}::-webkit-slider-runnable-track{height:8px;box-sizing:border-box;border:1px solid transparent;border-radius:4px;background:${fill},${edge}}
${sel}::-moz-range-track{height:8px;box-sizing:border-box;border:1px solid #b2b2b2;border-radius:4px;background:#efefef}
${sel}::-moz-range-progress{height:8px;border-radius:4px;background:var(--nd-accent,#2f7de1)}` + rangeThumbCss(sel, 6) + `
${sel}{height:16px}`;
}
export function setRangeFill(range) {
    const min = Number(range.min) || 0, max = Number(range.max), v = Number(range.value);
    const p = max > min ? Math.min(1, Math.max(0, (v - min) / (max - min))) : 0;
    range.style.setProperty("--p", `${(p * 100).toFixed(3)}%`);
}
