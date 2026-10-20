"""
Builds js/character_icons.js: the section icons of ND Character Builder (cut from the
traced reference figures in tools/character_figures.json) and the option icons
(hairstyles, bangs, nail shapes). Run: python tools/make_character_icons.py
All icons are monochrome: they take the text color of the button (currentColor).
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
FIG = json.load(open(os.path.join(HERE, "character_figures.json"), encoding="utf-8"))
OUT = os.path.join(HERE, "..", "js", "character_icons.js")


def f(v):
    s = f"{v:.1f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def smooth(pts, closed=True):
    """Catmull-Rom spline through the points as an SVG path."""
    n = len(pts)
    if n < 2:
        return ""
    d = f"M{f(pts[0][0])} {f(pts[0][1])}"
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        if closed:
            p0, p1, p2, p3 = pts[(i - 1) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        else:
            p0, p1, p2, p3 = pts[max(0, i - 1)], pts[i], pts[i + 1], pts[min(n - 1, i + 2)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f"C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}"
    return d + ("Z" if closed else "")


def mirror(right, cx=20.0):
    """Right half (from the top centre down and back) mirrored into a closed outline."""
    left = [(2 * cx - x, y) for x, y in reversed(right[1:-1])]
    return right + left


def tube(center, w0, w1):
    """A strand of hair: a closed outline around a centre line, width w0 -> w1."""
    n = len(center)
    left, right = [], []
    for i, (x, y) in enumerate(center):
        a = center[max(0, i - 1)]
        b = center[min(n - 1, i + 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(dx, dy) or 1
        nx, ny = -dy / ln, dx / ln
        w = (w0 + (w1 - w0) * i / max(1, n - 1)) / 2
        left.append((x + nx * w, y + ny * w))
        right.append((x - nx * w, y - ny * w))
    tip = center[-1]
    return smooth(left + [(tip[0] + (tip[0] - center[-2][0]) * 0.15, tip[1] + (tip[1] - center[-2][1]) * 0.15)] + list(reversed(right)))


# ---------------------------------------------------------------- styles

LINE = 'fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"'
SKIN = 'class="nd-ico-skin" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"'
DETAIL = 'fill="none" stroke="currentColor" stroke-opacity=".55" stroke-width="1" stroke-linecap="round" vector-effect="non-scaling-stroke"'
HAIR = 'class="nd-ico-hair" stroke="currentColor" stroke-width="1.1" stroke-linejoin="round" vector-effect="non-scaling-stroke"'
FILL = 'fill="currentColor" fill-opacity=".5"'


def svg(view, body):
    return f'<svg viewBox="{view}" aria-hidden="true">{body}</svg>'


# ---------------------------------------------------------- section icons

def contour(tpl):
    return smooth([(p[0], p[1]) for p in tpl["pts"]])


def run_of(tpl, codes):
    pts = tpl["pts"]
    n = len(pts)
    idx = [i for i in range(n) if pts[i][2] in codes]
    start = next(i for i in idx if pts[(i - 1) % n][2] not in codes)
    out = []
    i = start
    while pts[i][2] in codes and len(out) < n:
        out.append((pts[i][0], pts[i][1]))
        i = (i + 1) % n
    return out


def lines(tpl, keep=lambda line: True, genitals=False):
    out = ""
    for line in tpl["lines"]:
        if (line[0][2] == "g" and not genitals) or not keep(line):
            continue
        out += f'<path d="{smooth([(p[0], p[1]) for p in line], False)}" {DETAIL}/>'
    return out


def areolae(tpl, r=2.2):
    return "".join(f'<circle cx="{f(a["x"])}" cy="{f(a["y"])}" r="{r}" {FILL}/>' for a in tpl.get("areolae") or [])


def simplify(pts, eps):
    """Ramer-Douglas-Peucker on an open polyline: drops points the icon size cannot show."""
    if len(pts) < 3:
        return pts
    (ax, ay), (bx, by) = pts[0], pts[-1]
    dx, dy = bx - ax, by - ay
    ln = math.hypot(dx, dy)
    dist = [abs(dx * (ay - y) - dy * (ax - x)) / ln if ln else math.hypot(x - ax, y - ay) for x, y in pts]
    i = max(range(1, len(pts) - 1), key=lambda k: dist[k])
    if dist[i] <= eps:
        return [pts[0], pts[-1]]
    return simplify(pts[: i + 1], eps)[:-1] + simplify(pts[i:], eps)


def clamp_pts(pts, box):
    """Points outside the (enlarged) view are pressed onto its border: what is visible
    stays the same and the icon stays small."""
    x0, y0, x1, y1 = box
    out = []
    for x, y in pts:
        q = (min(x1, max(x0, x)), min(y1, max(y0, y)))
        if not out or (abs(out[-1][0] - q[0]) > 0.05 or abs(out[-1][1] - q[1]) > 0.05):
            out.append(q)
    return out


def crop(tpl, box, extra="", details=True, genitals=False):
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    s = max(w, h)
    vx, vy = x0 - (s - w) / 2, y0 - (s - h) / 2
    vb = f"{f(vx)} {f(vy)} {f(s)} {f(s)}"
    m = s * 0.25
    big = (vx - m, vy - m, vx + s + m, vy + s + m)
    inside = lambda line: any(big[0] < p[0] < big[2] and big[1] < p[1] < big[3] for p in line)
    pts = clamp_pts([(p[0], p[1]) for p in tpl["pts"]], big)
    pts = simplify(pts + [pts[0]], s / 260)[:-1]
    body = f'<path d="{smooth(pts)}" {SKIN}/>' + (lines(tpl, inside, genitals) if details else "") + extra
    return svg(vb, body)


fem, male = FIG["female"], FIG["male"]
ff, fs, fb = fem["front"], fem["side"], fem["back"]


def face_icon():
    head = run_of(ff, "h")
    # schematic features, in the head's own coordinates
    feats = (
        f'<path d="M-10.5 46.5Q-7.5 44.6-4.5 46.5M10.5 46.5Q7.5 44.6 4.5 46.5" {LINE}/>'
        f'<path d="M0.4 49.5L-1.2 55.6Q0 56.6 1.4 56" {DETAIL}/>'
        f'<path d="M-4.8 61.2Q0 63.4 4.8 61.2" {LINE}/>'
    )
    return svg("-26 22 52 52", f'<path d="{smooth(head)}" {SKIN}/>' + feats)


def two_figures():
    # woman and man side by side: sex, age, look
    def place(tpl, dx, k):
        pts = simplify([((p[0]) * k + dx, p[1] * k) for p in tpl["pts"]], 0.6)
        return f'<path d="{smooth(pts)}" {SKIN}/>'
    return svg("-120 0 240 240", place(ff, -52, 0.55) + place(male["front"], 52, 0.55))


# ------------------------------------------------------------- head + hair

FACE = (20, 19.5, 6.8, 8.6)  # cx, cy, rx, ry of the face in the 40x40 head icons


def head_base():
    cx, cy, rx, ry = FACE
    shoulders = mirror([(20, 30.2), (23.4, 30.4), (27.5, 31.6), (32.5, 33.6), (35.5, 37), (36.5, 41), (20, 41)])
    neck = mirror([(20, 25), (23.1, 25.4), (23.2, 29.4), (23.4, 31.2), (20, 31.5)])
    return (
        f'<path d="{smooth(shoulders)}" {SKIN}/>'
        f'<path d="{smooth(neck)}" class="nd-ico-skin" stroke="none"/>'
        f'<path d="M16.8 26.5L16.6 30.8M23.2 26.5L23.4 30.8" {LINE}/>'
        f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" {SKIN}/>'
    )


def cap(bangs="part", tight=False):
    """Hair over the top of the head down to the hairline given by the bangs."""
    top = 9.2 if tight else 8.4
    sx = 27.6 if tight else 28.2
    outer = f"M{f(40 - sx)} 20.5C{f(40 - sx - 1)} 10.5 15 {f(top)} 20 {f(top)}S{f(sx + 1)} 10.5 {f(sx)} 20.5"
    edges = {
        "part": "C26.8 15.6 24.5 13.2 21.5 12.6C18 13.6 14.6 15.4 12.4 20.5",
        "none": "C26.4 15 24 11.6 20 11.6S13.6 15 12.4 20.5",
        "blunt": "L26.8 16.4L13.2 16.4L12.4 20.5",
        "side": "C26.2 15.2 23.6 13.4 21 13.6C17.6 15 15.2 17.2 13.6 18.6L12.4 20.5",
        "curtain": "C26.4 17 24.6 16.6 22.6 15C21.6 14.2 20.6 13.2 20 12.6C19.4 13.2 18.4 14.2 17.4 15C15.4 16.6 13.6 17 12.4 20.5",
        "wispy": "L26.8 16.6L25.5 15.3L24.4 17.2L22.8 15.2L21.5 17.4L20 15.3L18.5 17.4L17.2 15.2L15.6 17.2L14.5 15.3L13.2 16.6L12.4 20.5",
        "high": "C26 13.6 23.4 12 20 12S14 13.6 12.4 20.5",
    }
    return f'<path d="{outer}{edges[bangs]}Z" {HAIR}/>'


def long_back(length=36.5, width=29.6):
    return f'<path d="{smooth(mirror([(20, 8.2), (25.8, 9.2), (28.6, 13.5), (29.2, 21), (width, 29), (width + 0.8, length), (24, length + 0.4), (20, length)]))}" {HAIR}/>'


def locks(length=38, bulge=0.0):
    out = ""
    for s in (1, -1):
        pts = [(27.4, 17), (28.6 + bulge, 23), (29.4 + bulge, 30), (30.4, length), (27.2, length + 0.4), (26.2, 31), (25.8, 25), (25.6, 20.5)]
        pts = [(20 + s * (x - 20), y) for x, y in pts]
        out += f'<path d="{smooth(pts)}" {HAIR}/>'
    return out


def braid_marks(center):
    out = ""
    for i in range(1, len(center) - 1):
        (x, y) = center[i]
        out += f"M{f(x - 1.3)} {f(y - 0.7)}L{f(x)} {f(y + 0.5)}L{f(x + 1.3)} {f(y - 0.7)}"
    return f'<path d="{out}" {DETAIL}/>'


def hair_icon(style, bangs=None):
    b = bangs or "part"
    parts = {"back": "", "front": "", "top": ""}
    if style == "loose":
        parts["back"] = long_back()
        parts["front"] = locks()
    elif style == "bob":
        parts["back"] = f'<path d="{smooth(mirror([(20, 8.2), (26, 9.2), (28.8, 14), (29.4, 22), (29, 27.2), (26.8, 28.4), (20, 27.6)]))}" {HAIR}/>'
        b = bangs or "blunt"
    elif style == "pixie":
        parts["top"] = f'<path d="M12.6 20.2L12.2 22.8M27.4 20.2L27.8 22.8" {LINE}/>'
        b = bangs or "side"
    elif style == "undercut":
        b = "high"
        parts["top"] = '<path d="M13 19.5L13 21.5M14 17.6L14 19.6M26 17.6L26 19.6M27 19.5L27 21.5" fill="none" stroke="currentColor" stroke-opacity=".5" stroke-width="1" stroke-dasharray="1 1.2" vector-effect="non-scaling-stroke"/>'
    elif style == "ponytail":
        c = [(23.5, 9), (29.5, 9.5), (32.4, 15), (32.2, 23), (31, 31)]
        parts["back"] = f'<path d="{tube(c, 4.4, 2)}" {HAIR}/>'
        parts["top"] = '<rect x="22.2" y="7.2" width="2.2" height="3" rx=".6" fill="currentColor"/>'
        b = bangs or "none"
    elif style == "low_ponytail":
        c = [(25.5, 24.5), (28.2, 28), (29, 33), (28.5, 38.5)]
        parts["front"] = f'<path d="{tube(c, 3.8, 2)}" {HAIR}/>'
        b = bangs or "none"
    elif style == "twintails":
        for s in (1, -1):
            c = [(20 + s * 6.8, 12.5), (20 + s * 11.6, 15), (20 + s * 12.6, 22), (20 + s * 12, 30), (20 + s * 10.8, 36.5)]
            parts["back"] += f'<path d="{tube(c, 4.4, 1.8)}" {HAIR}/>'
            parts["top"] += f'<rect x="{f(20 + s * 7.6 - 1.1)}" y="11.8" width="2.2" height="2.8" rx=".6" fill="currentColor" transform="rotate({s * 30} {f(20 + s * 7.6)} 13.2)"/>'
        b = bangs or "part"
    elif style == "braid":
        c = [(25.2, 22), (27, 26.5), (28, 31), (28.2, 35.5), (27.8, 39)]
        parts["front"] = f'<path d="{tube(c, 3.8, 2.4)}" {HAIR}/>' + braid_marks(c)
        b = bangs or "none"
    elif style == "twin_braids":
        for s in (1, -1):
            c = [(20 + s * 6.4, 22), (20 + s * 7.6, 26.5), (20 + s * 8.4, 31), (20 + s * 8.6, 35.5), (20 + s * 8.4, 39)]
            parts["front"] += f'<path d="{tube(c, 3.4, 2.2)}" {HAIR}/>' + braid_marks(c)
        b = bangs or "part"
    elif style == "bun":
        parts["back"] = '<circle cx="20" cy="6.6" r="3.6" class="nd-ico-hair" stroke="currentColor" stroke-width="1.1" vector-effect="non-scaling-stroke"/>'
        b = bangs or "none"
    elif style == "messy_bun":
        parts["back"] = f'<path d="{smooth([(20, 2.4), (22.6, 3), (24.2, 5.4), (23.8, 8.6), (21.4, 10.2), (18.2, 10), (16, 8), (16.2, 4.6), (18, 3.2)])}" {HAIR}/>'
        parts["top"] = f'<path d="M23.4 3.2Q25.8 1.6 26.4 3.4M16.4 4Q14.4 2.6 13.8 4.6M27 16Q28.6 20 27.8 24" {DETAIL}/>'
        b = bangs or "none"
    elif style == "half_up":
        parts["back"] = '<circle cx="20" cy="7.4" r="2.6" class="nd-ico-hair" stroke="currentColor" stroke-width="1.1" vector-effect="non-scaling-stroke"/>' + long_back()
        parts["front"] = locks()
        b = bangs or "part"
    else:
        raise ValueError(style)
    tight = style in ("pixie", "undercut")
    return svg("0 0 40 40", parts["back"] + head_base() + cap(b, tight) + parts["front"] + parts["top"])


def bangs_icon(bangs):
    return svg("4 2 32 32", head_base() + cap(bangs))


# ------------------------------------------------------------------ nails

def nail_icon(shape):
    finger = f'<path d="M14 40L14 16.5C14 12.8 16.6 10.6 20 10.6S26 12.8 26 16.5L26 40" {SKIN}/>'
    w0, w1 = 15.6, 24.4  # nail sides at the cuticle
    tops = {
        "square": "L24.4 7.2L15.6 7.2Z",
        "squoval": "L24.4 9.2Q24.4 7.2 22.4 7.2L17.6 7.2Q15.6 7.2 15.6 9.2Z",
        "round": "L24.4 10.4A4.4 4.4 0 0 0 15.6 10.4Z",
        "oval": "L24.4 9.6C24.4 4.2 15.6 4.2 15.6 9.6Z",
        "almond": "L24.4 10.6C24.4 6.6 21.8 3.4 20 2.8C18.2 3.4 15.6 6.6 15.6 10.6Z",
        "coffin": "L24.4 10.4L22.4 3.6L17.6 3.6L15.6 10.4Z",
        "stiletto": "L24.4 10.6C24.2 7 21.6 3.6 20 0.8C18.4 3.6 15.8 7 15.6 10.6Z",
    }
    nail = f'<path d="M{w0} 21.6Q20 23.8 {w1} 21.6{tops[shape]}" {HAIR}/>'
    return svg("2 0 36 36", finger + nail)


# ------------------------------------------------------------------ penis

def penis_icon(length=22, width=7, bend=0.0, taper=1.0, veins=False, balls=True):
    """Side view of a penis: shaft from the base on the left, a domed glans with its rim at
    the end, the scrotum below the base. bend > 0 curves it up, taper < 1 narrows the tip."""
    bx, by = 7.0, 20.0
    L = float(length)
    g = width * 1.0  # glans length

    def center(x):
        return bx + x, by - bend * x * x / L

    def normal(x):
        dx, dy = 1.0, -2 * bend * x / L
        ln = math.hypot(dx, dy)
        return -dy / ln, dx / ln  # points "down" in screen space for y > 0

    def put(x, y):
        cx, cy = center(x)
        nx, ny = normal(x)
        return (cx + nx * y, cy + ny * y)

    def half(x):  # half width of the shaft at x
        return width / 2 * (1 + (taper - 1) * (x / L))

    gw = half(L - g) * 1.14  # the glans is a little wider than the shaft under it
    top, bottom = [], []
    steps = 8
    for i in range(steps + 1):
        x = (L - g) * i / steps
        top.append(put(x, -half(x)))
        bottom.append(put(x, half(x)))
    # glans: a small rim, then a dome to the tip
    dome = []
    for k in range(0, 13):
        a = math.pi * k / 12  # from the top over the tip to the bottom
        x = L - g + g * 0.92 * math.sin(a) + g * 0.08
        y = -gw * math.cos(a)
        dome.append(put(x, y * (1 - 0.18 * math.sin(a) ** 4)))
    outline = top + [put(L - g + 0.4, -gw)] + dome[1:-1] + [put(L - g + 0.4, gw)] + list(reversed(bottom))
    d = "M" + " ".join(f"{f(x)} {f(y)}" for x, y in [outline[0]])
    d = smooth(outline[: len(top)], False) + "L" + smooth(outline[len(top) - 1: len(top) + len(dome)], False)[1:] + "L" + smooth(outline[len(top) + len(dome) - 1:], False)[1:] + "Z"
    out = ""
    # the body the penis grows from: the line of the groin on the left
    out += f'<path d="M{f(bx - 1.2)} 4Q{f(bx + 1.6)} 14 {f(bx - 0.4)} 22T{f(bx - 1.6)} 37" {LINE}/>'
    if balls:
        sw = min(6.2, max(4.6, width * 0.66))
        out += f'<ellipse cx="{f(bx + sw * 0.55)}" cy="{f(by + width / 2 + sw * 0.6)}" rx="{f(sw)}" ry="{f(sw * 1.02)}" {SKIN}/>'
    out += f'<path d="{d}" {SKIN}/>'
    # the rim of the glans and the opening at the tip
    rim = [put(L - g + 0.4, -gw * 0.96), put(L - g - 0.3, 0), put(L - g + 0.4, gw * 0.96)]
    out += f'<path d="{smooth(rim, False)}" {DETAIL}/>'
    t0, t1 = put(L - 0.15, -gw * 0.2), put(L - g * 0.35, -gw * 0.05)
    out += f'<path d="M{f(t0[0])} {f(t0[1])}L{f(t1[0])} {f(t1[1])}" {DETAIL}/>'
    if veins:
        # 1: visible, 2: thick, 3: very thick (wider strokes, more and wavier veins)
        lv = int(veins)
        amp = 0.22 + 0.08 * lv
        v1 = [put(L * t, -half(L * t) * 0.15 + half(L * t) * amp * math.sin(t * 13)) for t in [0.08 + 0.09 * k for k in range(7)]]
        v2 = [put(L * t, half(L * t) * 0.35 + half(L * t) * (amp - 0.05) * math.sin(t * 11 + 2)) for t in [0.15 + 0.1 * k for k in range(5)]]
        d = smooth(v1, False) + smooth(v2, False)
        if lv >= 3:
            v3 = [put(L * t, -half(L * t) * 0.55 + half(L * t) * 0.18 * math.sin(t * 17 + 1)) for t in [0.12 + 0.1 * k for k in range(6)]]
            d += smooth(v3, False)
        sw = {1: 1.0, 2: 1.7, 3: 2.4}[lv]
        out += f'<path d="{d}" fill="none" stroke="currentColor" stroke-opacity="{0.55 + 0.12 * lv:.2f}" stroke-width="{sw}" stroke-linecap="round" vector-effect="non-scaling-stroke"/>'
    return svg("0 0 40 40", out)


def penis_size_icons():
    sizes = {"tiny": (9, 4.2), "small": (13, 5), "average": (17, 6), "large": (21, 7), "huge": (25.5, 8.2), "gigantic": (30, 9.6)}
    return {k: penis_icon(l, w) for k, (l, w) in sizes.items()}


def penis_shape_icons():
    return {
        "straight": penis_icon(22, 7),
        "curved_up": penis_icon(22, 7, bend=0.38),
        "curved_down": penis_icon(22, 7, bend=-0.28),
        "tapered": penis_icon(22, 8, taper=0.62),
        "thick": penis_icon(19, 10.5),
        "veiny": penis_icon(22, 7.5, veins=1),
        "bulging": penis_icon(22, 7.5, veins=2),
        "massive": penis_icon(22, 7.5, veins=3),
    }


# ------------------------------------------------------------------ write

zones = {
    "general": two_figures(),
    "build": crop(ff, (-110, 22, 110, 422)),
    "hair": hair_icon("loose"),
    "face": face_icon(),
    "neck": crop(ff, (-34, 52, 34, 112)),
    "shoulders": crop(fb, (-48, 88, 48, 150)),
    "chest": crop(ff, (-40, 96, 40, 148), areolae(ff)),
    "arms": crop(ff, (18, 92, 112, 236)),
    "hands": crop(ff, (68, 182, 110, 230)),
    "waist": crop(ff, (-42, 130, 42, 196)),
    "hips": crop(fb, (-50, 178, 50, 246)),
    "legs": crop(ff, (-48, 206, 48, 400)),
    "feet": crop(fs, (-30, 382, 36, 424)),
    "genitals": crop(ff, (-40, 168, 40, 244), genitals=True),
}
hair_styles = ["loose", "ponytail", "low_ponytail", "twintails", "braid", "twin_braids", "bun", "messy_bun", "half_up", "bob", "pixie", "undercut"]
options = {
    "hair.hair_style": {s: hair_icon(s) for s in hair_styles},
    "hair.bangs": {b: bangs_icon(b) for b in ["none", "blunt", "side", "curtain", "wispy"]},
    "hands_nails.nail_shape": {s: nail_icon(s) for s in ["square", "squoval", "round", "oval", "almond", "coffin", "stiletto"]},
    "genitals.penis_size": penis_size_icons(),
    "genitals.penis_curve": {k: v for k, v in penis_shape_icons().items() if k in ("straight", "curved_up", "curved_down")},
    "genitals.penis_girth": {k: v for k, v in penis_shape_icons().items() if k in ("tapered", "thick")},
    "genitals.penis_veins": {k: v for k, v in penis_shape_icons().items() if k in ("veiny", "bulging", "massive")},
}

with open(OUT, "w", encoding="utf-8") as fh:
    fh.write("// Neural Dreamer Nodes — ND Character Builder icons.\n")
    fh.write("// Generated by tools/make_character_icons.py from the traced reference figures; do not edit by hand.\n")
    fh.write("// Monochrome: they use the button's text color; .nd-ico-skin and .nd-ico-hair get their fill from CSS.\n\n")
    fh.write("export const ZONE_ICONS = " + json.dumps(zones, indent=0, ensure_ascii=False) + ";\n\n")
    fh.write("export const OPTION_ICONS = " + json.dumps(options, indent=0, ensure_ascii=False) + ";\n")
print("wrote", OUT, os.path.getsize(OUT), "bytes")
