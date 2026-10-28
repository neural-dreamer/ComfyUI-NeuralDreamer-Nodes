// Prints, as JSON, every piece of the interface that the person reads and that is written in the code of the builders:
//   { "ui": [English strings...], "data": [{ "section": "character", "key": "o:hair.style:bob", "fields": { "l": "Bob", "h": "..." } }, ...] }
// Used by tools/i18n_tool.py (check, stub). Needs `acorn` (a dev tool only, it is not shipped with the pack).
"use strict";
const fs = require("fs");
const path = require("path");

function loadAcorn() {
    for (const p of [process.env.ACORN, "acorn", "/opt/node-tools/node_modules/acorn", "/opt/npm-tools/node_modules/acorn"]) {
        if (!p) continue;
        try { return require(p); } catch {}
    }
    throw new Error("acorn is not installed (npm i acorn, or set ACORN to its folder)");
}
const acorn = loadAcorn();
const JS = path.resolve(__dirname, "..", "js");
const letters = /\p{L}/u;
// callee -> indexes of the arguments that hold English words
const CALLS = { tool: [0, 1], tr: [0], T: [1], txt: [2], tipEn: [1, 2], check: [0, 1], section: [0], note: [0], themeBtn: [1], slider: [2] };
const CFG_PROPS = ["title", "note", "editNote", "label"];

function strings(node, out) {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "Literal" && typeof node.value === "string") { if (letters.test(node.value)) out.add(node.value); return; }
    if (node.type === "TemplateLiteral") {
        if (!node.expressions.length) { const v = node.quasis[0].value.cooked; if (letters.test(v)) out.add(v); }
        return;
    }
    for (const k of Object.keys(node)) {
        const v = node[k];
        if (Array.isArray(v)) v.forEach((x) => x && typeof x.type === "string" && strings(x, out));
        else if (v && typeof v.type === "string") strings(v, out);
    }
}
function walk(node, fn) {
    fn(node);
    for (const k of Object.keys(node)) {
        const v = node[k];
        if (Array.isArray(v)) v.forEach((x) => x && typeof x.type === "string" && walk(x, fn));
        else if (v && typeof v.type === "string") walk(v, fn);
    }
}
const parse = (file) => acorn.parse(fs.readFileSync(path.join(JS, file), "utf8"), { ecmaVersion: "latest", sourceType: "module" });

// the name of a called function: tr(...) or ctx.tr(...) (the nodes written for the engine get the same helpers as ctx.*)
const calleeName = (c) => (c.type === "Identifier" ? c.name
    : c.type === "MemberExpression" && !c.computed && c.object.type === "Identifier" && c.object.name === "ctx" ? c.property.name : null);

function scan(file, ui) {
    walk(parse(file), (n) => {
        if (n.type === "CallExpression") {
            const name = calleeName(n.callee);
            if (name === "btn") {
                const raw = n.arguments[3]?.type === "Literal" && n.arguments[3].value === true;
                if (!raw) strings(n.arguments[1], ui);
                strings(n.arguments[2], ui);
            } else if (name && CALLS[name]) for (const i of CALLS[name]) strings(n.arguments[i], ui);
        }
        // lists of [id, "Label", "hint"] (the Create / Edit buttons, the choices of an import, Single shot / Collage...)
        if (n.type === "ArrayExpression" && n.elements.length && n.elements.every((e) => e && e.type === "ArrayExpression")) {
            for (const row of n.elements) {
                const [id, label, hint] = row.elements;
                if (id?.type === "Literal" && /^[a-z_]+$/.test(id.value) && label?.type === "Literal" && /^[A-Z]/.test(label.value)) { strings(label, ui); strings(hint, ui); }
            }
        }
        if (n.type === "VariableDeclarator" && n.id?.name === "THEMES") walk(n.init, (m) => { if (m.type === "Property" && m.key.name === "label") strings(m.value, ui); });
        if (n.type === "VariableDeclarator" && n.id?.name === "COLOR_ROLES") for (const row of n.init.elements) for (const e of row.elements.slice(1)) strings(e, ui);
        if (n.type === "VariableDeclarator" && n.id?.name === "UI_EXTRA") strings(n.init, ui);
        // ND Composition Settings: the layouts of the collage and the notes about the way the pose faces the camera
        if (n.type === "VariableDeclarator" && (n.id?.name === "FACING_NOTE" || n.id?.name === "EDIT_NOTE")) strings(n.init, ui);
        if (n.type === "VariableDeclarator" && n.id?.name === "TEMPLATES") walk(n.init, (m) => { if (m.type === "Property" && m.key.name === "label") strings(m.value, ui); });
    });
}

function main() {
    const ui = new Set();
    scan("character_builder.js", ui);
    scan("composition_settings.js", ui);
    // the configuration of each builder: toggle texts, notes, titles, pin labels
    for (const f of ["character_builder.js", "outfit_builder.js", "pose_builder.js", "composition_settings.js"]) {
        walk(parse(f), (n) => {
            if (n.type === "CallExpression" && n.callee.name === "defineBuilder" && n.arguments[0]?.type === "ObjectExpression") {
                walk(n.arguments[0], (m) => { if (m.type === "Property" && CFG_PROPS.includes(m.key.name || m.key.value)) strings(m.value, ui); });
            }
        });
    }
    // the words of the data: the same walker the node uses (js/nd_i18n_walk.js)
    const src = fs.readFileSync(path.join(JS, "nd_i18n_walk.js"), "utf8").replace(/^export /gm, "");
    const { keysOf } = new Function(`${src}; return { keysOf };`)();
    const data = [];
    for (const [section, file] of [["character", "character_builder.json"], ["outfit", "outfit_builder.json"], ["pose", "pose_builder.json"], ["composition", "composition_settings.json"]]) {
        const raw = JSON.parse(fs.readFileSync(path.join(JS, file), "utf8"));
        for (const e of keysOf(raw)) data.push({ section, key: e.key, swatch: e.swatch, fields: Object.fromEntries(e.fields.map((f) => [f.short, f.en])) });
        for (const o of raw.outputs || []) ui.add(o.key);
    }
    process.stdout.write(JSON.stringify({ ui: [...ui].sort(), data }));
}
main();
