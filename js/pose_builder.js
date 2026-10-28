// Neural Dreamer Nodes — ND Pose Builder
// The same builder as the Character Builder (sections, random with a seed, presets, themes, Create / Edit),
// with its own data: js/pose_builder.json. Simple mode: ready-made poses by category; Advanced: every parameter.
// One input and one output of type ND_PARAMS (the input carries the seed and the Character Builder Out).

import { defineBuilder } from "./character_builder.js";
import { ZONE_ICONS, OPTION_ICONS } from "./pose_icons.js";

defineBuilder({
    node: "NDPoseBuilder",
    title: "Pose Builder",
    i18n: "pose",
    extension: "NeuralDreamer.Nodes.PoseBuilder",
    schemaFile: "pose_builder.json",
    presetFile: "neural_dreamer/pose_presets.json",
    defaultZone: "photo",
    raceParam: null,
    contentPart: null,
    zoneIcons: ZONE_ICONS,
    optionIcons: OPTION_ICONS,
    levels: true,
    extraZones: ["quick"],
    // choosing a ready-made pose clears the parameters of these parts first (the subject stays)
    macroResets: ["posture", "torso", "head", "arms", "legs", "pleasure", "toys", "fluids"],
    editStyle: true,
    editSubject: false,
    editSync: true,
    editNote: "Full: one instruction per parameter you set, or one sentence for a ready-made pose. Simple: one sentence that changes the whole pose. With a Character Builder connected, its Full Description joins the instructions and ends with one 'keep the rest' sentence.",
    toggle: {
        key: "explicit",
        label: "Explicit",
        title: "Shows the explicit poses, acts, toys and fluids. While it is off they are hidden and not used, and random never picks them.",
        note: "Shows the Explicit and Masturbation poses, the Pleasure and Toys sections and the explicit fluids; while it is off none of them are used. For fictional adult (18+) characters only, one character alone. Do not use it to depict real people.",
    },
    consumers: [{ name: "seed", type: "INT" }, { name: "character", label: "Character Builder", type: "CHARACTER_PARAMS", optional: true }],
    provider: () => [
        { name: "Pose", label: "Pose Description", type: "STRING" },
        { name: "Full", label: "Full Description", type: "STRING" },
        {
            name: "pose",
            label: "Pose Builder Out",
            type: "POSE_PARAMS",
            sub: () => [
                { name: "text", type: "STRING" }, { name: "tags", type: "STRING" }, { name: "template", type: "STRING" },
                { name: "edit", type: "STRING" }, { name: "edit_simple", type: "STRING" },
                { name: "mode", type: "STRING" }, { name: "touched", type: "*" },
                { name: "text_free", type: "STRING" }, { name: "tags_free", type: "STRING" }, { name: "template_free", type: "STRING" },
                { name: "facing", type: "STRING" }, { name: "camera_hint", type: "*" }, { name: "pron", type: "STRING" },
                { name: "sex", type: "STRING" }, { name: "anatomy", type: "*" }, { name: "full", type: "STRING" },
                { name: "pose_text", type: "STRING" }, { name: "char", type: "*" }, { name: "extra", type: "STRING" },
                { name: "edit_keep", type: "*" }, { name: "edit_style", type: "STRING" },
            ],
        },
    ],
});
