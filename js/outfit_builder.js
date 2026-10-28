// Neural Dreamer Nodes — ND Outfit Builder
// The same builder as the Character Builder (sections, random with a seed, presets, themes, Create / Edit),
// with its own data: js/outfit_builder.json. One input and one output of type ND_PARAMS.

import { defineBuilder } from "./character_builder.js";
import { ZONE_ICONS, OPTION_ICONS } from "./outfit_icons.js";

defineBuilder({
    node: "NDOutfitBuilder",
    title: "Outfit Builder",
    i18n: "outfit",
    extension: "NeuralDreamer.Nodes.OutfitBuilder",
    schemaFile: "outfit_builder.json",
    presetFile: "neural_dreamer/outfit_presets.json",
    defaultZone: "style",
    raceParam: null,
    contentPart: null,
    zoneIcons: ZONE_ICONS,
    optionIcons: OPTION_ICONS,
    editStyle: true,
    editSubject: false,
    editNote: "Full: one instruction per slot (Add, Replace, Remove). Simple: one sentence that changes the whole outfit. The Character Builder takes these when it is in Edit mode too.",
    toggle: {
        key: "explicit",
        label: "Explicit",
        title: "Shows the explicit items, states and the Exposure parameter. While it is off they are hidden and not used, and random never picks them.",
        note: "Shows the explicit items (lingerie, fetish wear), the see-through / pulled aside states and Exposure; while it is off none of them are used. For fictional adult (18+) characters only. Do not use it to depict real people.",
    },
    consumers: [{ name: "seed", type: "INT" }],
    provider: () => [
        { name: "Outfit", label: "Outfit Description", type: "STRING" },
        {
            name: "outfit",
            label: "Outfit Builder Out",
            type: "OUTFIT_PARAMS",
            sub: () => [
                { name: "text", type: "STRING" }, { name: "tags", type: "STRING" }, { name: "template", type: "STRING" },
                { name: "edit", type: "STRING" }, { name: "edit_simple", type: "STRING" }, { name: "covers", type: "*" },
                { name: "mode", type: "STRING" }, { name: "touched", type: "*" },
            ],
        },
    ],
});
