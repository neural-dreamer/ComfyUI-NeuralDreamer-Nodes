// Neural Dreamer Nodes — ND Composition Settings icons: one line drawing per section and small pictures for the options
// (camera height, the view around the subject, the framing, where the subject sits in the frame and how big).
// They use the text color.

const ico = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const n = (v) => Math.round(v * 100) / 100;

export const ZONE_ICONS = {
    layout: ico('<rect x="3" y="4" width="18" height="16" rx="1.500"/><path d="M12 4v16M12 12h9"/>'),
    presets: ico('<path d="M3 8h3.200L8 5.500h8L17.800 8H21v11H3z"/><circle cx="12" cy="13" r="3.200"/>'),
    quick: ico('<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="8" cy="17" r="2" fill="currentColor"/>'),
    camera: ico('<path d="M3 8h3.200L8 5.500h8L17.800 8H21v11H3z"/><circle cx="12" cy="13.500" r="3.300"/>'),
    viewpoint: ico('<path d="M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12z"/><circle cx="12" cy="12" r="3"/>'),
    framing: ico('<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><circle cx="12" cy="9.500" r="2"/><path d="M8.500 17c.4-2.500 1.800-4 3.500-4s3.100 1.500 3.500 4"/>'),
    placement: ico('<rect x="3.500" y="3.500" width="17" height="17" rx="1.500"/><path d="M9.200 3.500v17M14.800 3.500v17M3.500 9.200h17M3.500 14.800h17"/><circle cx="14.800" cy="9.200" r="1.900" fill="currentColor"/>'),
    lens: ico('<circle cx="12" cy="12" r="8.500"/><circle cx="12" cy="12" r="4.800"/><circle cx="12" cy="12" r="1.600" fill="currentColor"/>'),
    sheet: ico('<rect x="3" y="3.500" width="14" height="14" rx="1.500"/><path d="M7 20.500h14v-14"/><path d="M10 3.500v14M3 10.500h14"/>'),
};

/* ----- camera height: the person from the side, the camera at 7 levels */
const HEIGHTS = { ground: 20, low: 16, eye: 9, chest: 12, waist: 14.500, high: 5, overhead: 2.500 };
const heightIcon = (y) => {
    const tilt = y < 8 ? 1 : y > 14 ? -1 : 0; // the camera looks down / up at the person
    const cx = 17.500;
    const dy = tilt * 2.200;
    return ico(
        `<circle cx="6" cy="6" r="2"/><path d="M6 8.200v7.300M6 15.500l-2 5.500M6 15.500l2 5.500M6 10.500l-2.200 3M6 10.500l2.200 3"/>`
        + `<rect x="${n(cx - 2.500)}" y="${n(y - 1.700)}" width="5" height="3.400" rx=".8"/><path d="M${n(cx - 2.500)} ${n(y)}L${n(cx - 6 - 0)} ${n(y + dy)}" stroke-dasharray="1.500 1.500"/>`,
    );
};

/* ----- the view around the subject, from above: the subject looks "down" (at the viewer), the camera sits on a circle */
const ORBITS = { front: [0, 1], front34_l: [-0.707, 0.707], side_l: [-1, 0], back34_l: [-0.707, -0.707], back: [0, -1], back34_r: [0.707, -0.707], side_r: [1, 0], front34_r: [0.707, 0.707] };
const orbitIcon = ([dx, dy]) => {
    const cx = 12 + dx * 8.200, cy = 12 + dy * 8.200;
    return ico(
        `<circle cx="12" cy="12" r="8.800" opacity=".35" stroke-dasharray="1.500 2"/>`
        + `<circle cx="12" cy="11.300" r="3.200"/><path d="M12 14.500v2.300" stroke-width="2.200"/>`
        + `<circle cx="${n(cx)}" cy="${n(cy)}" r="2.200" fill="currentColor"/>`,
    );
};

/* ----- framing: a figure and the frame that cuts it */
const SHOTS = { full: [1, 22.500], cowboy: [1, 14.500], waist: [1, 12.500], portrait: [1, 9.500], face: [1.500, 7], feet: [16.500, 23], breasts: [7.500, 12.500], crotch: [12.500, 17.500] };
const shotIcon = ([y1, y2]) => ico(
    `<circle cx="12" cy="4.600" r="2"/><path d="M12 6.800v8M12 15l-2.200 6.500M12 15l2.200 6.500M12 8.800l-3 3.600M12 8.800l3 3.600"/>`
    + `<rect x="4.500" y="${n(y1)}" width="15" height="${n(y2 - y1)}" rx="1" stroke-dasharray="2.200 1.500" opacity=".9"/>`,
);

/* ----- where the subject sits: a 3x3 grid with a dot */
const dotIcon = (c, r) => ico(
    `<rect x="3.500" y="3.500" width="17" height="17" rx="1.500" opacity=".6"/><path d="M9.200 3.500v17M14.800 3.500v17M3.500 9.200h17M3.500 14.800h17" opacity=".35"/>`
    + `<circle cx="${n(6.350 + c * 5.650)}" cy="${n(6.350 + r * 5.650)}" r="2.100" fill="currentColor"/>`,
);
const POS = { center: [1, 1], left: [0, 1], right: [2, 1], top: [1, 0], bottom: [1, 2], top_left: [0, 0], top_right: [2, 0], bottom_left: [0, 2], bottom_right: [2, 2] };
// how big: a figure inside the frame
const SIZES = { fill: 1, large: 0.78, medium: 0.56, small: 0.38, tiny: 0.22 };
const sizeIcon = (k) => ico(
    `<rect x="3.500" y="3.500" width="17" height="17" rx="1.500" opacity=".6"/>`
    + `<rect x="${n(12 - 4.500 * k)}" y="${n(20.500 - 17 * k)}" width="${n(9 * k)}" height="${n(17 * k)}" rx="1.500" fill="currentColor" fill-opacity=".25"/>`,
);

const fromMap = (map, fn) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, fn(v)]));

export const OPTION_ICONS = {
    "camera.height": fromMap(HEIGHTS, heightIcon),
    "camera.orbit": fromMap(ORBITS, orbitIcon),
    "framing.shot": fromMap(SHOTS, shotIcon),
    "placement.pos": fromMap(POS, ([c, r]) => dotIcon(c, r)),
    "placement.size": fromMap(SIZES, sizeIcon),
};
