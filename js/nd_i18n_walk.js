// Neural Dreamer Nodes — which words of a builder's data the person reads (no imports: the tools read this file too).

// Calls visit(key, object, fields) for every piece of the schema that has words the person reads.
// fields is a list of [short, name]: short "l" = label, "h" = hint, "ph" = placeholder, "ch" = custom hint, "g" = group.
// The keys are the same in every language file: "p:<part>.<param>", "o:<part>.<param>:<option>"…
export function walkRaw(raw, visit) {
    const one = (key, obj, ...pairs) => {
        if (!obj) return;
        const fields = pairs.filter(([, name]) => typeof obj[name] === "string" && obj[name]);
        if (fields.length) visit(key, obj, fields);
    };
    const LH = [["l", "label"], ["h", "hint"]];
    const option = (prefix, o, withLevels = true) => {
        one(`${prefix}:${o.id}`, o, ...LH);
        if (typeof o.group === "string" && o.group) visit(`g:${o.group}`, o, [["l", "group"]]);
        for (const a of o.attrs || []) one(`at:${prefix.slice(2)}:${o.id}:${a.id}`, a, ...LH);
        if (withLevels) for (const lv of o.levels || []) one(`v:${prefix.slice(2)}:${o.id}:${lv.id}`, lv, ...LH);
    };
    const sets = raw.option_sets || {};
    for (const [name, list] of Object.entries(sets)) for (const o of list || []) option(`s:${name}`, o);
    for (const part of raw.parts || []) {
        one(`t:${part.id}`, part, ...LH);
        for (const p of part.params || []) {
            const pid = `${part.id}.${p.id}`;
            one(`p:${pid}`, p, ...LH, ["ph", "custom_placeholder"], ["ch", "custom_hint"]);
            for (const s of p.stages || []) one(`sg:${pid}:${s.from}`, s, ["l", "label"]);
            for (const o of p.options || []) option(`o:${pid}`, o);
            if (p.type === "list") {
                for (const table of ["places", "designs", "styles", "sizes", "colors"]) {
                    for (const o of p[table] || []) {
                        one(`lp:${pid}:${table}:${o.id}`, o, ...LH);
                        if (typeof o.group === "string" && o.group) visit(`g:${o.group}`, o, [["l", "group"]]);
                    }
                }
            }
        }
    }
    for (const z of raw.zones || []) {
        one(`z:${z.id}`, z, ...LH);
        if (z.copy) one(`zc:${z.id}`, z.copy, ...LH);
        (z.presets || []).forEach((pr, i) => one(`zq:${z.id}:${i}`, pr, ...LH));
    }
}


// every key of a schema, for the checks (tools/i18n_tool.py)
export function keysOf(raw) {
    const out = [];
    walkRaw(raw, (key, obj, fields) => out.push({ key, swatch: !!obj.swatch, fields: fields.map(([short, name]) => ({ short, en: obj[name] })) }));
    return out;
}
