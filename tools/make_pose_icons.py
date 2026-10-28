#!/usr/bin/env python3
"""Generates js/pose_icons.js: mannequin icons of the postures (40x40 tiles), the icons of the sections (24x24) and the
preset -> posture table.  Run:  python tools/make_pose_icons.py"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pose_presets as PR  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "js", "pose_icons.js")


def f(n):
    return ("%.1f" % n).rstrip("0").rstrip(".")


def pts(*p):
    return " ".join(f"{f(x)},{f(y)}" for x, y in p)


def man(H, N, P, arms=(), legs=(), extra="", head_r=3.1):
    """A mannequin: head circle, thick torso line, thin limbs (each limb is a list of points)."""
    s = extra
    for limb in legs:
        s += f'<polyline points="{pts(P, *limb)}" stroke-width="2.4"/>'
    s += f'<line x1="{f(N[0])}" y1="{f(N[1])}" x2="{f(P[0])}" y2="{f(P[1])}" stroke-width="4.6"/>'
    for limb in arms:
        s += f'<polyline points="{pts(N, *limb)}" stroke-width="2.1"/>'
    s += f'<circle cx="{f(H[0])}" cy="{f(H[1])}" r="{head_r}" stroke-width="1.7"/>'
    return s


def thin(d, w=1.1):
    return f'<path d="{d}" stroke-width="{w}" opacity=".5"/>'


FLOOR = thin("M3 36.5H37")
POSTURES = {
    "standing": man((20, 6.5), (20, 12), (20, 22), arms=[[(15, 17), (14, 24)], [(25, 17), (26, 24)]], legs=[[(18, 29), (17, 36)], [(22, 29), (23, 36)]], extra=FLOOR),
    "walking": man((20, 6.5), (20, 12), (20, 22), arms=[[(16, 17), (13, 22)], [(24, 17), (27, 21)]], legs=[[(25, 28), (28, 35.5)], [(16, 29), (12, 35.5)]], extra=FLOOR),
    "running": man((24.5, 8), (22, 13), (17, 22), arms=[[(27, 17), (31, 13)], [(16, 15), (13, 20)]], legs=[[(25, 25), (23, 31)], [(12, 27), (6, 29)]], extra=thin("M2 36.5H38")),
    "jumping": man((20, 7), (20, 12), (20, 21.500), arms=[[(15, 9), (12, 3)], [(25, 9), (28, 3)]], legs=[[(15, 27), (18, 32)], [(25, 27), (22, 32)]], extra=thin("M12 36H28") + thin("M9 36H10") + thin("M30 36H31")),
    "sitting": man((16, 8), (16, 13.500), (16, 24), arms=[[(21, 19), (26, 23)]], legs=[[(26, 24), (26, 34)]], extra=thin("M11 25H31") + thin("M11 10V25") + thin("M12 25V36.5") + thin("M30 25V36.5")),
    "sitting_cross": man((20, 9), (20, 14), (20, 26), arms=[[(15, 21), (12, 27)], [(25, 21), (28, 27)]], legs=[[(11, 29.500), (22, 32)], [(29, 29.500), (18, 32)]], extra=thin("M3 35H37")),
    "sitting_heels": man((18, 9), (18, 14), (17, 25.500), arms=[[(22, 21), (27, 26)]], legs=[[(27, 28), (14, 32)]], extra=thin("M3 34H37")),
    "sitting_side": man((17, 8.500), (17, 14), (17, 25), arms=[[(12, 21), (10, 31)], [(22, 20), (27, 24)]], legs=[[(28, 26.500), (23, 32)], [(30, 30), (22, 33.500)]], extra=thin("M3 35H37")),
    "kneeling": man((19, 6.500), (19, 12), (19, 22), arms=[[(23, 17), (25, 23)]], legs=[[(22, 30), (11, 31)]], extra=thin("M3 33.500H37")),
    "kneeling_one": man((18, 6.500), (18, 12), (18, 22), arms=[[(22, 17), (27, 22)]], legs=[[(27, 26), (27, 34.500)], [(17, 31), (9, 33.500)]], extra=FLOOR),
    "squatting": man((21, 10), (19.500, 15.500), (16, 27), arms=[[(25, 21), (29, 21.500)]], legs=[[(26, 25), (24, 35)]], extra=FLOOR),
    "crouching": man((25.500, 13), (21, 17.500), (14, 26.500), arms=[[(27, 24), (28.500, 34)], [(18, 24), (21, 33)]], legs=[[(23, 29), (19, 35)]], extra=FLOOR),
    "all_fours": man((29.500, 14), (25, 17.500), (11, 19.500), arms=[[(26, 26), (27, 34.500)]], legs=[[(11, 29), (10, 33)], [(10, 33), (3, 33.500)]], extra=FLOOR),
    "bending": man((32, 19.500), (26.500, 17), (15, 22), arms=[[(28, 24), (28.500, 31)]], legs=[[(15, 29), (15, 36)]], extra=FLOOR),
    "lying_back": man((5.500, 29), (10.500, 30), (23, 30), arms=[[(14, 34), (20, 34)]], legs=[[(29, 20.500), (33, 30)], [(31, 30.500), (37.500, 30.500)]], extra=thin("M2 35.5H38")),
    "lying_stomach": man((7, 25), (11.500, 29), (25, 31), arms=[[(11, 34), (17, 34.500)]], legs=[[(31, 30), (35, 24)]], extra=thin("M2 36H38")),
    "lying_side": man((6, 26), (11, 28.500), (23, 30), arms=[[(9, 33), (5.500, 30.500)]], legs=[[(31, 24), (28, 33)], [(30, 30), (36, 33)]], extra=thin("M2 35.5H38")),
    "reclining": man((10, 19.500), (14, 24), (27, 31), arms=[[(13, 32), (20, 33)]], legs=[[(33, 31), (38, 33)]], extra=thin("M2 35.5H38")),
    "hips_up": man((3.500, 29.500), (8.500, 30.500), (22, 21.500), arms=[[(12, 34), (17, 34)]], legs=[[(29, 23), (30, 33)]], extra=thin("M2 36H38")),
    "straddle_chair": man((16, 8), (16, 13.500), (16, 24), arms=[[(22, 16), (27, 18)]], legs=[[(25, 24.500), (25, 34)]], extra=thin("M11 25.500H29") + thin("M28 13V25.500") + thin("M12 25.500V36.500") + thin("M28 25.500V36.500")),
    "bridge": man((32, 33), (26.500, 28), (18, 17), arms=[[(29, 32), (29, 35.500)]], legs=[[(11, 24), (10, 35.500)]], extra=thin("M3 36.500H37")),
    "downdog": man((8.500, 26), (14, 23), (25, 13), arms=[[(10, 30), (7, 35.500)]], legs=[[(29, 24), (33, 35.500)]], extra=thin("M2 36.500H38")),
    "stretching": man((20, 8), (20, 13.500), (20, 23.500), arms=[[(16, 8), (15, 2.500)], [(24, 8), (25, 2.500)]], legs=[[(18, 30), (16, 36)], [(22, 30), (24, 36)]], extra=FLOOR),
}


# ---------------------------------------------------------------- variants of the standing mannequin
# arm styles: (elbow, hand) offsets from the shoulder (20, 12); dx grows outward from the body
ARM_STYLES = {
    "down": ((5, 5), (6, 12)), "hips": ((6, 5), (3, 9)), "up": ((4, -4), (5, -10)), "behind_head": ((6, -2), (2, -7)),
    "stretched": ((10, 1), (16, 1)), "forward": ((4, 3), (11, 4)), "face": ((4, 4), (1, -2)), "chest": ((4, 5), (1, 5)),
    "wave": ((7, -1), (10, -6)), "pocket": ((5, 6), (3, 11)), "behind": ((3, 6), (1, 12)),
}
HAND_STYLE = {"hip": "hips", "hair": "behind_head", "face": "face", "lips": "face", "chin": "face", "neck": "face", "chest": "chest",
              "thigh": "down", "knee": "down", "surface": "down", "hem": "hips", "mouth": "face", "wave": "wave", "peace": "wave",
              "point": "forward", "kiss": "face", "reach": "forward", "pocket": "pocket", "fist": "down", "ground": "down", "up": "up",
              "forward": "forward", "cast": "forward", "hilt": "hips", "sheets": "down"}
BOTH_STYLE = {"crossed": "crossed", "hips": "hips", "behind_head": "behind_head", "raised": "up", "stretched": "stretched",
              "clasped": "chest", "behind_back": "behind", "hug_self": "chest", "in_hair": "behind_head", "on_knees": "down",
              "on_thighs": "down", "planted": "down", "cover_breasts": "chest", "cover_crotch": "chest", "hold_breasts": "chest",
              "spread_legs": "down", "spread_butt": "behind"}
LEG_STYLES = {
    "stand": [[(18, 29), (17, 36)], [(22, 29), (23, 36)]],
    "apart": [[(16, 29), (14, 36)], [(24, 29), (26, 36)]],
    "wide": [[(14, 28), (10, 36)], [(26, 28), (30, 36)]],
    "crossed": [[(19, 29), (23, 36)], [(21, 29), (17, 36)]],
    "knee_fwd": [[(18, 29), (17, 36)], [(27, 26), (25, 33)]],
    "lunge": [[(12, 28), (7, 36)], [(27, 27), (30, 36)]],
    "tree": [[(18, 29), (18, 36)], [(26, 24), (21, 27)]],
    "kick": [[(18, 29), (17, 36)], [(29, 23), (37, 21)]],
}
LEG_MAP = {"crossed": "crossed", "apart": "apart", "wide": "wide", "knee_fwd": "knee_fwd", "one_up": "knee_fwd", "lunge": "lunge",
           "warrior": "lunge", "tree": "tree", "arabesque": "kick", "high_kick": "kick", "spread": "wide", "tiptoe": "stand"}
PROPS = {
    "sword": '<path d="M27 25L33 8M30 14l-3 1.500" stroke-width="1.700"/>',
    "staff": '<path d="M28 4V36" stroke-width="1.700"/>',
    "gun": '<path d="M26 14H34M30 14V17" stroke-width="2"/>',
    "bow": '<path d="M30 6Q38 20 30 34M30 6L30 34" stroke-width="1.300"/>',
    "umbrella": '<path d="M24 12Q30 3 36 12M30 12V22" stroke-width="1.400"/>',
}


def standing_variant(sets):
    """(signature, svg) of a standing mannequin that follows what the pose sets; None when nothing changes."""
    base = sets.get("posture.base")
    if base != "standing":
        return None
    both, h1, h2 = sets.get("arms.both"), sets.get("arms.hand1"), sets.get("arms.hand2")
    left, right = "down", "down"
    if both:
        left = right = BOTH_STYLE.get(both, "down")
    else:
        left = HAND_STYLE.get(h1, "down") if h1 else "down"
        right = HAND_STYLE.get(h2, "down") if h2 else "down"
    leg = LEG_MAP.get(sets.get("legs.pose"), "stand") if sets.get("legs.pose") else "stand"
    torso = sets.get("torso.shape") or []
    shape = "lean_fwd" if "lean_fwd" in torso else "lean_back" if "lean_back" in torso else "s" if ({"hip_cock", "arched", "butt_out"} & set(torso)) else ""
    prop = sets.get("arms.prop") if sets.get("arms.prop") in PROPS else ""
    sig = f"{left}.{right}.{leg}.{shape}.{prop}"
    if sig == "down.down.stand..":
        return None
    N, P_, H = (20, 12), (20, 22), (20, 6.5)
    if shape == "lean_fwd":
        N, H = (22, 12), (23.5, 7)
    elif shape == "lean_back":
        N, H = (18, 12), (16.5, 7)
    elif shape == "s":
        N, P_, H = (18.5, 12), (21.5, 22), (18.5, 6.5)
    def arm(style, side):
        if style == "crossed":
            return [(16, 17), (24, 18)] if side < 0 else [(24, 17), (16, 19)]
        (ex, ey), (hx, hy) = ARM_STYLES[style]
        return [(N[0] + side * ex, N[1] + ey), (N[0] + side * hx, N[1] + hy)]
    arms = [arm(left, -1), arm(right, 1)]
    legs = [[(p[0] + (P_[0] - 20), p[1]) for p in limb] for limb in LEG_STYLES[leg]]
    return sig, man(H, N, P_, arms=arms, legs=legs, extra=FLOOR + PROPS.get(prop, ""))


def tile(body):
    return f'<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{body}</svg>'


def ico(body):
    return f'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{body}</svg>'


def mini(P_):
    """a small mannequin for the section icons (24x24)"""
    return P_


def small(H, N, P, arms=(), legs=(), extra=""):
    s = extra
    for limb in legs:
        s += f'<polyline points="{pts(P, *limb)}"/>'
    s += f'<line x1="{f(N[0])}" y1="{f(N[1])}" x2="{f(P[0])}" y2="{f(P[1])}" stroke-width="2.4"/>'
    for limb in arms:
        s += f'<polyline points="{pts(N, *limb)}"/>'
    s += f'<circle cx="{f(H[0])}" cy="{f(H[1])}" r="2"/>'
    return s


ZONES = {
    "general": ico(small((8, 5), (8, 8.500), (8, 14.500), arms=[[(5, 11.500), (4.500, 15.500)], [(11, 11.500), (11.500, 15.500)]], legs=[[(6.500, 19), (6, 22)], [(9.500, 19), (10, 22)]]) + '<circle cx="17.500" cy="7" r="1.600"/><path d="M17.500 9v6M14.500 11.500l3-1 3 1M16 21l1.500-6 1.500 6"/>'),
    "photo": ico('<path d="M3.500 8h3.200L8.300 5.500h7.400L17.300 8h3.200v11.500H3.500z"/><circle cx="12" cy="13.500" r="3.500"/>'),
    "natural": ico(small((12, 4.500), (12, 8), (12, 14), arms=[[(9, 11), (7.500, 14.500)], [(15, 11), (17, 13.500)]], legs=[[(15.500, 18), (17, 22)], [(9, 18), (7, 22)]])),
    "sitting": ico(small((9, 5), (9, 8.500), (9, 15), arms=[[(12.500, 12), (15, 14.500)]], legs=[[(15.500, 15), (15.500, 21)]], extra='<path d="M5 16.500h13M5 8v8.500M6 16.500V22M17 16.500V22"/>')),
    "lying": ico(small((4, 15), (7.500, 16), (15, 16), arms=[[(9, 19), (12, 19)]], legs=[[(19, 12.500), (21, 16)], [(19.500, 16), (22, 16)]], extra='<path d="M2 19.500h20" opacity=".6"/>')),
    "action": ico(small((10, 6), (10, 9.500), (10, 15.500), arms=[[(6.500, 12), (5, 16)], [(13.500, 11), (17, 8.500)]], legs=[[(7.500, 19), (6, 22)], [(12.500, 19), (14, 22)]]) + '<path d="M17 8.500L21 2.500M16 5.500l3 3"/>'),
    "dance": ico(small((9, 5), (9, 8.500), (9, 14), arms=[[(5.500, 7.500), (3, 6)], [(12.500, 7.500), (15, 6)]], legs=[[(9, 18), (9, 22)], [(14.500, 14), (21, 11.500)]])),
    "sensual": ico('<path d="M12 20.500S3.500 15 3.500 9.200C3.500 6.200 5.800 4.200 8.300 4.200c1.600 0 2.900.8 3.700 2.100.8-1.300 2.100-2.100 3.700-2.100 2.500 0 4.800 2 4.800 5C20.500 15 12 20.500 12 20.500z"/>'),
    "explicit": ico('<path d="M12 21.500S3 15.500 3 9.500C3 6.500 5.300 4.500 8 4.500c1.600 0 3 .8 4 2.200 1-1.400 2.400-2.200 4-2.200 2.700 0 5 2 5 5 0 6-9 12-9 12z"/><path d="M12 9.500v5M9.500 12h5"/>'),
    "masturbation": ico('<path d="M7 21v-4.500l-2.500-3.500c-.8-1.200.4-2.600 1.700-1.800L8 12V5.500c0-1.200 1.800-1.200 1.800 0V11V4.800c0-1.200 1.800-1.200 1.800 0V11V5.600c0-1.200 1.800-1.200 1.800 0v6V8c0-1.200 1.800-1.200 1.800 0v6.500c0 3-1.500 4.500-1.500 6.500z"/><path d="M19.500 3.500c1.200 1.800 1.800 2.800 1.800 3.800a1.800 1.800 0 0 1-3.600 0c0-1 .6-2 1.800-3.800z"/>'),
    "quick": ico('<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="currentColor"/><circle cx="15.500" cy="12" r="2" fill="currentColor"/><circle cx="8" cy="17" r="2" fill="currentColor"/>'),
    "presets": ico('<rect x="3.500" y="3.500" width="7" height="7" rx="1.500"/><rect x="13.500" y="3.500" width="7" height="7" rx="1.500"/><rect x="3.500" y="13.500" width="7" height="7" rx="1.500"/><rect x="13.500" y="13.500" width="7" height="7" rx="1.500"/>'),
    "posture": ico(small((12, 4.500), (12, 8), (12, 14.500), arms=[[(8.500, 11), (7, 15)], [(15.500, 11), (17, 15)]], legs=[[(10.500, 18.500), (10, 22)], [(13.500, 18.500), (14, 22)]])),
    "torso": ico('<path d="M8 3.500c-1.500 3-1.500 6-.5 8.500s.5 5 .5 8.500h8c0-3.500 0-6 .5-8.500s1-5.500-.5-8.500"/><path d="M8 3.500c2.500 1.300 5.500 1.300 8 0"/>'),
    "head": ico('<path d="M12 3.500c-3.800 0-6.500 3-6.500 7 0 3.800 2 6.500 4.500 7.800V21h4v-2.700c2.500-1.300 4.500-4 4.500-7.800 0-4-2.700-7-6.500-7z"/><circle cx="9.500" cy="10.500" r=".6" fill="currentColor"/><circle cx="14.500" cy="10.500" r=".6" fill="currentColor"/><path d="M9.800 15c1.400 1 3 1 4.400 0"/>'),
    "arms": ico('<path d="M7 21v-4.500l-2.500-3.500c-.8-1.200.4-2.600 1.700-1.800L8 12V5.500c0-1.200 1.800-1.200 1.800 0V11V4.800c0-1.200 1.800-1.200 1.800 0V11V5.600c0-1.200 1.800-1.200 1.800 0v6V8c0-1.200 1.800-1.200 1.800 0v6.500c0 3-1.500 4.500-1.500 6.500z"/>'),
    "legs": ico('<path d="M8.500 3h7l.5 8-1.500 9.500H12l-.5-9.500-.5 9.500H8L7.500 11z"/><path d="M8 6.500h8"/>'),
    "pleasure": ico('<path d="M7 21v-4.500l-2.500-3.500c-.8-1.200.4-2.600 1.700-1.800L8 12V5.500c0-1.200 1.800-1.200 1.800 0V11V4.800c0-1.200 1.800-1.200 1.800 0V11V5.600c0-1.200 1.800-1.200 1.800 0v6V8c0-1.200 1.800-1.200 1.800 0v6.500c0 3-1.500 4.500-1.500 6.500z"/><path d="M18.500 4v4M16.500 6h4"/>'),
    "toys": ico('<rect x="9" y="3" width="6" height="18" rx="3" transform="rotate(35 12 12)"/><path d="M8.500 15.500l7-7" transform="rotate(0)"/>'),
    "fluids": ico('<path d="M9 3c2.500 3.500 4 5.500 4 7.700a4 4 0 0 1-8 0C5 8.500 6.500 6.500 9 3z" transform="translate(1 1)"/><path d="M17.500 12c1.500 2 2.300 3.200 2.300 4.500a2.300 2.300 0 0 1-4.600 0c0-1.300.8-2.500 2.300-4.500z"/>'),
    "view": ico('<path d="M3.500 8h3.200L8.300 5.500h7.400L17.300 8h3.200v11.500H3.500z"/><circle cx="12" cy="13.500" r="3.500"/>'),
}


def main():
    lines = ["// Neural Dreamer Nodes — ND Pose Builder icons (generated by tools/make_pose_icons.py).",
             "// Mannequins of the postures (the tiles of the poses) and one line drawing per section. They use the text color.", ""]
    lines.append("export const ZONE_ICONS = {")
    for k, v in ZONES.items():
        lines.append(f"    {k}: {v!r},".replace("'", '`') if False else f'    {k}: "{v.replace(chr(34), chr(92) + chr(34))}",')
    lines.append("};")
    lines.append("export const POSTURE_ICONS = {")
    for k, v in POSTURES.items():
        lines.append(f'    {k}: "{tile(v).replace(chr(34), chr(92) + chr(34))}",')
    lines.append("};")
    lines.append("// the posture a pose is drawn with")
    lines.append("export const PRESET_BASE = {")
    for p in PR.PRESETS:
        lines.append(f'    {p["id"]}: "{p["icon"]}",')
    lines.append("};")
    variants, sigs = {}, {}
    for p in PR.PRESETS:
        v = standing_variant(p["sets"])
        if v:
            sig, svg = v
            variants[sig] = svg
            sigs[p["id"]] = sig
    lines.append("// the standing mannequin drawn after what a pose sets (arms, legs, torso, the thing held)")
    lines.append("const VARIANTS = {")
    for k, v in variants.items():
        lines.append(f'    "{k}": "{tile(v).replace(chr(34), chr(92) + chr(34))}",')
    lines.append("};")
    lines.append("const PRESET_VARIANT = {")
    for k, v in sigs.items():
        lines.append(f'    {k}: "{v}",')
    lines.append("};")
    lines.append("const presets = {};")
    lines.append("for (const [id, base] of Object.entries(PRESET_BASE)) presets[id] = VARIANTS[PRESET_VARIANT[id]] || POSTURE_ICONS[base];")
    lines.append('export const OPTION_ICONS = { "posture.base": POSTURE_ICONS, "pose.preset": presets };')
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    print("wrote", OUT, len(POSTURES), "postures,", len(ZONES), "section icons")


if __name__ == "__main__":
    main()
