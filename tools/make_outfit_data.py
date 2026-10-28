#!/usr/bin/env python3
"""Generates js/outfit_builder.json (the data of ND Outfit Builder).

The JSON is the file the node reads; edit it directly if you only tune wording.
This script exists to rebuild it from the compact tables below:  python tools/make_outfit_data.py
"""
import json
import os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "js", "outfit_builder.json")

# ------------------------------------------------------------------ covers
TOP_SL = ["chest", "breasts", "nipples", "belly", "back", "lower_back"]
CROP = ["chest", "breasts", "nipples", "back"]
BRA = ["chest", "breasts", "nipples"]
HIP = ["hips", "butt", "pubic", "genitals"]
THONG = ["pubic", "genitals"]
SHORTS = HIP + ["thighs"]
PANTS = HIP + ["thighs", "knees", "calves", "ankles"]
ARMS = ["arms"]
LONG = ["arms", "forearms"]
ALL_BODY = ["neck", "shoulders", "arms", "forearms", "chest", "breasts", "nipples", "belly", "back", "lower_back", "hips", "butt", "pubic", "genitals", "thighs", "knees", "calves", "ankles"]

STYLES = [
    ("casual", "Casual", "casual", "casual", ""),
    ("street", "Streetwear", "streetwear", "street fashion", ""),
    ("business", "Business", "business", "office lady", "business"),
    ("elegant", "Elegant", "elegant", "formal dress", ""),
    ("sporty", "Sporty", "sporty", "sportswear", ""),
    ("beach", "Beach", "beach", "beach", ""),
    ("boudoir", "Boudoir", "boudoir", "lingerie", ""),
    ("cyberpunk", "Cyberpunk", "cyberpunk", "cyberpunk", ""),
    ("steampunk", "Steampunk", "steampunk", "steampunk", ""),
    ("medieval", "Medieval", "medieval", "medieval", ""),
    ("fantasy", "Fantasy", "fantasy", "fantasy", ""),
    ("sci_fi", "Sci-fi", "sci-fi", "science fiction", ""),
    ("gothic", "Gothic", "gothic", "gothic", ""),
    ("punk", "Punk", "punk", "punk fashion", ""),
    ("military", "Military", "military", "military uniform", ""),
    ("victorian", "Victorian", "Victorian", "victorian", ""),
    ("east_asian", "East Asian", "East Asian traditional", "east asian clothes", ""),
    ("boho", "Boho", "bohemian", "bohemian", ""),
    ("western", "Western", "Wild West", "western", ""),
]
S = {k: k for k, *_ in STYLES}


def item(id, label, noun, tag, styles="", only="", flags="", covers=None, **extra):
    """flags: x = explicit, p = plural noun (no article), l = takes a length"""
    o = {"id": id, "label": label, "noun": noun}
    if tag is not None:
        o["tag"] = tag
    if styles:
        o["styles"] = styles.split()
    if only:
        o["only"] = ["female"] if only == "F" else ["male"]
    if "x" in flags:
        o["explicit"] = True
    if "p" in flags:
        o["plural"] = True
    if "l" in flags:
        o["length"] = True
    if covers is not None:
        o["covers"] = list(covers)
    o.update(extra)
    return o


# ------------------------------------------------------------------ option sets
def color(id, label, hexv, tag=None):
    return {"id": id, "label": label, "adj": label.lower(), "swatch": hexv, "tag": tag or label.lower()}


COLORS = [
    color("black", "Black", "#161616"), color("white", "White", "#f2f2f2"), color("ivory", "Ivory", "#f1ead3"),
    color("grey", "Grey", "#8a8a8a"), color("charcoal", "Charcoal", "#3b3d41"), color("navy", "Navy", "#1c2b52"),
    color("blue", "Blue", "#2f6fd1"), color("sky_blue", "Sky blue", "#8cc6f0"), color("teal", "Teal", "#1f8f8a"),
    color("green", "Green", "#3a9a4b"), color("olive", "Olive", "#6b6b2f"), color("emerald", "Emerald", "#0f7a55"),
    color("red", "Red", "#c92a2a"), color("burgundy", "Burgundy", "#6e1428"), color("pink", "Pink", "#f09ab8"),
    color("hot_pink", "Hot pink", "#ee2f86", "hot pink"), color("purple", "Purple", "#7a3fb5"), color("lavender", "Lavender", "#b9a2e0"),
    color("yellow", "Yellow", "#f2d230"), color("mustard", "Mustard", "#c9a227"), color("orange", "Orange", "#ee8a2a"),
    color("brown", "Brown", "#6b4428"), color("beige", "Beige", "#d6c3a0"), color("gold", "Gold", "#d4a82c"), color("silver", "Silver", "#b8bcc4"),
]
PATTERNS = [
    {"id": "solid", "label": "Solid", "silent": True},
    {"id": "striped", "label": "Striped", "adj": "striped", "tag": "striped"},
    {"id": "pinstriped", "label": "Pinstriped", "adj": "pinstriped", "tag": "pinstripe pattern"},
    {"id": "plaid", "label": "Plaid", "adj": "plaid", "tag": "plaid"},
    {"id": "checkered", "label": "Checkered", "adj": "checkered", "tag": "checkered"},
    {"id": "floral", "label": "Floral", "adj": "floral", "tag": "floral print"},
    {"id": "polka", "label": "Polka dot", "adj": "polka-dot", "tag": "polka dot"},
    {"id": "camo", "label": "Camouflage", "adj": "camouflage", "tag": "camouflage"},
    {"id": "leopard", "label": "Leopard print", "adj": "leopard-print", "tag": "leopard print"},
    {"id": "snake", "label": "Snakeskin", "adj": "snakeskin", "tag": "snakeskin print"},
    {"id": "paisley", "label": "Paisley", "adj": "paisley", "tag": "paisley"},
    {"id": "geometric", "label": "Geometric", "adj": "geometric-patterned", "tag": "geometric pattern"},
    {"id": "lace_trim", "label": "Lace trim", "adj": "lace-trimmed", "tag": "lace trim"},
    {"id": "embroidered", "label": "Embroidered", "adj": "embroidered", "tag": "embroidery"},
    {"id": "sequined", "label": "Sequined", "adj": "sequined", "tag": "sequins"},
    {"id": "metallic", "label": "Metallic", "adj": "metallic", "tag": "metallic"},
]


def mat(id, label, adj=None, tag=None, x=False, styles=""):
    o = {"id": id, "label": label, "adj": adj or label.lower(), "tag": tag if tag is not None else (adj or label.lower())}
    if x:
        o["explicit"] = True
    if styles:
        o["styles"] = styles.split()
    return o


MATERIALS = [
    mat("cotton", "Cotton"), mat("denim", "Denim"), mat("leather", "Leather"), mat("faux_leather", "Faux leather", "faux leather"),
    mat("suede", "Suede"), mat("latex", "Latex", x=True), mat("pvc", "PVC", "PVC", "pvc", x=True),
    mat("silk", "Silk"), mat("satin", "Satin"), mat("velvet", "Velvet"), mat("wool", "Wool"), mat("knit", "Knit", "knitted", "knit"),
    mat("linen", "Linen"), mat("chiffon", "Chiffon"), mat("lace", "Lace"), mat("mesh", "Mesh"), mat("fur", "Fur"), mat("faux_fur", "Faux fur", "faux fur"),
    mat("nylon", "Nylon"), mat("spandex", "Spandex"), mat("tweed", "Tweed"), mat("brocade", "Brocade"),
    mat("chainmail", "Chainmail", styles="medieval fantasy"), mat("steel", "Steel plate", "steel", "armor", styles="medieval fantasy"), mat("neoprene", "Neoprene", styles="cyberpunk sci_fi"),
]
FITS = [
    {"id": "tight", "label": "Tight-fitting", "adj": "tight-fitting", "tag": "tight clothes"},
    {"id": "fitted", "label": "Fitted", "adj": "fitted", "tag": ""},
    {"id": "loose", "label": "Loose", "adj": "loose", "tag": "loose clothes"},
    {"id": "oversized", "label": "Oversized", "adj": "oversized", "tag": "oversized clothes"},
    {"id": "cropped", "label": "Cropped", "adj": "cropped", "tag": "cropped"},
]
LENGTHS = [
    {"id": "micro", "label": "Micro", "adj": "micro", "tag": "microskirt", "covers_add": []},
    {"id": "mini", "label": "Mini", "adj": "mini", "tag": "miniskirt", "covers_add": []},
    {"id": "above_knee", "label": "Above the knee", "adj": "above-the-knee", "tag": "", "covers_add": ["thighs"]},
    {"id": "knee", "label": "Knee-length", "adj": "knee-length", "tag": "", "covers_add": ["thighs", "knees"]},
    {"id": "midi", "label": "Midi", "adj": "midi", "tag": "", "covers_add": ["thighs", "knees", "calves"]},
    {"id": "ankle", "label": "Ankle-length", "adj": "ankle-length", "tag": "long skirt", "covers_add": ["thighs", "knees", "calves", "ankles"]},
    {"id": "floor", "label": "Floor-length", "adj": "floor-length", "tag": "long dress", "covers_add": ["thighs", "knees", "calves", "ankles", "feet"]},
]
SLEEVES = [
    {"id": "sleeveless", "label": "Sleeveless", "adj": "sleeveless", "tag": "sleeveless", "arms_covers": []},
    {"id": "short", "label": "Short sleeves", "adj": "short-sleeved", "tag": "short sleeves", "arms_covers": ["arms"]},
    {"id": "long", "label": "Long sleeves", "adj": "long-sleeved", "tag": "long sleeves", "arms_covers": ["arms", "forearms"]},
    {"id": "rolled", "label": "Rolled-up sleeves", "adj": "rolled-sleeve", "tag": "rolled sleeves", "arms_covers": ["arms"]},
]
HEELS = [
    {"id": "kitten", "label": "Kitten heels", "adj": "kitten-heeled", "tag": "kitten heels"},
    {"id": "block", "label": "Block heels", "adj": "block-heeled", "tag": "block heels"},
    {"id": "stiletto", "label": "Stiletto heels", "adj": "stiletto-heeled", "tag": "stiletto heels"},
    {"id": "platform", "label": "Platform", "adj": "platform", "tag": "platform footwear"},
]
METALS = [
    {"id": "gold", "label": "Gold", "adj": "gold", "tag": "gold", "swatch": "#d4a82c"},
    {"id": "silver", "label": "Silver", "adj": "silver", "tag": "silver", "swatch": "#b8bcc4"},
    {"id": "rose_gold", "label": "Rose gold", "adj": "rose gold", "tag": "rose gold", "swatch": "#e0a08a"},
    {"id": "black_metal", "label": "Black metal", "adj": "black metal", "tag": "black metal", "swatch": "#2a2a2a"},
    {"id": "brass", "label": "Brass", "adj": "brass", "tag": "brass", "swatch": "#b5893c"},
]
PALETTES = [
    {"id": "mono_black", "label": "All black", "adj": "all-black", "tag": "black clothes", "colors": ["black", "charcoal"]},
    {"id": "mono_white", "label": "All white", "adj": "all-white", "tag": "white clothes", "colors": ["white", "ivory"]},
    {"id": "pastel", "label": "Pastel", "adj": "pastel", "tag": "pastel colors", "colors": ["sky_blue", "pink", "lavender", "ivory", "beige"]},
    {"id": "neon", "label": "Neon", "adj": "neon", "tag": "neon colors", "colors": ["hot_pink", "teal", "yellow", "green", "purple"]},
    {"id": "earth", "label": "Earth tones", "adj": "earth-toned", "tag": "earth tones", "colors": ["brown", "beige", "olive", "mustard", "burgundy"]},
    {"id": "jewel", "label": "Jewel tones", "adj": "jewel-toned", "tag": "jewel tones", "colors": ["emerald", "burgundy", "navy", "purple", "gold"]},
    {"id": "red_black", "label": "Red and black", "adj": "red and black", "tag": "red and black", "colors": ["red", "black"]},
    {"id": "navy_white", "label": "Navy and white", "adj": "navy and white", "tag": "", "colors": ["navy", "white"]},
]

# ------------------------------------------------------------------ states
def st(id, label, text, tag, edit, uncover=None, x=False, noun_only=False):
    o = {"id": id, "label": label, "text": text, "tag": tag, "edit": edit}
    if uncover is not None:
        o["uncover"] = uncover
    if x:
        o["explicit"] = True
    return o


WET = st("wet", "Wet", "soaking wet", "wet clothes", "Make {pos} {noun} soaking wet.")
TORN = st("torn", "Torn", "torn", "torn clothes", "Tear {pos} {noun}.")
SEE = st("see_through", "See-through", "see-through", "see-through", "Make {pos} {noun} see-through.", uncover="all", x=True)
OFF = st("partly_off", "Partially removed", "half taken off", "clothes pull", "Take {pos} {noun} half off.", uncover="all", x=True)
STATES = {
    "top": [WET, TORN,
            st("unbuttoned", "Unbuttoned", "unbuttoned", "unbuttoned", "Unbutton {pos} {noun}.", uncover=["belly"]),
            st("tied", "Tied at the waist", "tied up at the waist", "midriff", "Tie {pos} {noun} up at the waist.", uncover=["belly"]),
            st("off_shoulder", "Off one shoulder", "slipping off one shoulder", "off shoulder", "Let {pos} {noun} slip off one shoulder.", uncover=[]),
            SEE,
            st("pulled_down", "Pulled down", "pulled down", "clothes pull, breasts out", "Pull {pos} {noun} down, exposing {pos} breasts.", uncover=["chest", "breasts", "nipples"], x=True),
            st("lifted", "Lifted up", "lifted up", "shirt lift", "Lift up {pos} {noun}, exposing {pos} breasts.", uncover=["chest", "breasts", "nipples", "belly"], x=True),
            OFF],
    "outer": [WET, TORN,
              st("open", "Open", "hanging open", "open jacket", "Open {pos} {noun}.", uncover=["chest", "breasts", "nipples", "belly"]),
              st("off_shoulders", "Off the shoulders", "slipping off the shoulders", "off shoulder", "Let {pos} {noun} slip off {pos} shoulders.", uncover=["shoulders"]),
              st("unzipped", "Unzipped", "unzipped", "unzipped", "Unzip {pos} {noun}.", uncover=["chest", "breasts", "nipples", "belly"], x=True),
              SEE, OFF],
    "onepiece": [WET, TORN,
                 st("off_shoulder", "Off one shoulder", "slipping off one shoulder", "off shoulder", "Let {pos} {noun} slip off one shoulder.", uncover=[]),
                 st("unzipped", "Unzipped", "unzipped to the waist", "unzipped", "Unzip {pos} {noun} to the waist.", uncover=["chest", "breasts", "nipples", "belly"], x=True),
                 SEE,
                 st("pulled_down", "Pulled down", "pulled down to the waist", "clothes pull, breasts out", "Pull {pos} {noun} down to the waist, exposing {pos} breasts.", uncover=["chest", "breasts", "nipples"], x=True),
                 st("hiked", "Hiked up", "hiked up", "clothes lift", "Hike up {pos} {noun}.", uncover=["hips", "butt", "pubic", "genitals", "thighs"], x=True),
                 OFF],
    "bottom": [WET, TORN,
               SEE,
               st("unzipped", "Unzipped", "unzipped", "unzipped", "Unzip {pos} {noun}.", uncover=["pubic"], x=True),
               st("hiked", "Hiked up", "hiked up", "clothes lift", "Hike up {pos} {noun}.", uncover=["hips", "butt", "pubic", "genitals", "thighs"], x=True),
               st("pulled_aside", "Pulled aside", "pulled aside", "panties aside", "Pull {pos} {noun} aside.", uncover=["pubic", "genitals"], x=True),
               st("pulled_down", "Pulled down", "pulled down to the thighs", "pants pull", "Pull {pos} {noun} down to {pos} thighs.", uncover=["hips", "butt", "pubic", "genitals"], x=True),
               OFF],
    "underwear": [WET, TORN,
                  SEE,
                  st("pulled_aside", "Pulled aside", "pulled aside", "panties aside", "Pull {pos} {noun} aside.", uncover=["pubic", "genitals", "nipples"], x=True),
                  st("pulled_down", "Pulled down", "pulled down", "panties pull", "Pull {pos} {noun} down.", uncover=["hips", "butt", "pubic", "genitals", "breasts", "nipples"], x=True),
                  st("slipping", "Slipping off", "slipping off", "bra slip", "Let {pos} {noun} slip off.", uncover=["nipples"], x=True),
                  OFF],
    "legwear": [WET, TORN, SEE, st("rolled_down", "Rolled down", "rolled down", "legwear", "Roll {pos} {noun} down.", uncover=["thighs", "knees"], x=False)],
}

# ------------------------------------------------------------------ items
HEAD = [
    item("cap", "Baseball cap", "baseball cap", "baseball cap", "casual street sporty", covers=["head"]),
    item("beanie", "Beanie", "beanie", "beanie", "casual street", covers=["head"]),
    item("beret", "Beret", "beret", "beret", "casual elegant military", covers=["head"]),
    item("fedora", "Fedora", "fedora", "fedora", "elegant western", covers=["head"]),
    item("top_hat", "Top hat", "top hat", "top hat", "steampunk victorian business", covers=["head"]),
    item("cowboy_hat", "Cowboy hat", "cowboy hat", "cowboy hat", "western", covers=["head"]),
    item("witch_hat", "Witch hat", "witch hat", "witch hat", "fantasy gothic", covers=["head"]),
    item("sun_hat", "Sun hat", "wide-brimmed sun hat", "sun hat", "beach boho", covers=["head"]),
    item("hood", "Hood", "hood", "hood", "medieval fantasy street", covers=["head", "hair"]),
    item("crown", "Crown", "crown", "crown", "fantasy elegant", covers=[]),
    item("tiara", "Tiara", "tiara", "tiara", "elegant fantasy", "F", covers=[]),
    item("circlet", "Circlet", "circlet", "circlet", "fantasy medieval", covers=[]),
    item("headband", "Headband", "headband", "hairband", "sporty casual", covers=[]),
    item("hair_bow", "Hair bow", "hair bow", "hair bow", "casual", "F", covers=[]),
    item("flower_crown", "Flower crown", "flower crown", "flower wreath", "boho fantasy", covers=[]),
    item("cyber_visor", "Cyber visor", "cyber visor", "visor", "cyberpunk sci_fi", covers=["face"]),
    item("goggles", "Goggles on head", "pair of goggles pushed up on the head", "goggles on head", "steampunk", covers=[]),
    item("military_cap", "Military cap", "military cap", "military hat", "military", covers=["head"]),
    item("helmet", "Knight helmet", "knight helmet", "helmet", "medieval fantasy", covers=["head", "hair", "face"]),
    item("veil", "Veil", "veil", "veil", "elegant gothic", "F", covers=["head"]),
    item("cat_ears", "Animal ear headband", "animal ear headband", "animal ears", "casual boudoir", covers=[]),
    item("bandana", "Bandana", "bandana", "bandana", "punk western street", covers=["head"]),
    item("headscarf", "Headscarf", "headscarf", "headscarf", "boho", "F", covers=["head", "hair"]),
]
TOPS = [
    item("tshirt", "T-shirt", "t-shirt", "t-shirt", "casual street sporty", covers=TOP_SL + ARMS),
    item("tank", "Tank top", "tank top", "tank top", "casual sporty beach", covers=TOP_SL),
    item("crop", "Crop top", "crop top", "crop top", "casual street sporty", "F", covers=CROP),
    item("blouse", "Blouse", "blouse", "blouse", "business elegant", "F", covers=TOP_SL + LONG),
    item("shirt", "Button-up shirt", "button-up shirt", "collared shirt", "business casual", covers=TOP_SL + LONG),
    item("polo", "Polo shirt", "polo shirt", "polo shirt", "sporty casual", covers=TOP_SL + ARMS),
    item("hoodie", "Hoodie", "hoodie", "hoodie", "street casual", covers=TOP_SL + LONG),
    item("sweater", "Sweater", "sweater", "sweater", "casual", covers=TOP_SL + LONG),
    item("turtleneck", "Turtleneck", "turtleneck", "turtleneck", "casual business", covers=TOP_SL + LONG + ["neck"]),
    item("corset", "Corset", "corset", "corset", "steampunk victorian gothic boudoir", "F", covers=BRA + ["belly", "back", "lower_back"]),
    item("bustier", "Bustier", "bustier", "bustier", "boudoir gothic", "F", covers=BRA + ["belly"]),
    item("tube", "Tube top", "tube top", "tube top", "casual beach", "F", covers=CROP),
    item("halter", "Halter top", "halter top", "halterneck", "casual beach", "F", covers=CROP),
    item("off_shoulder", "Off-shoulder top", "off-shoulder top", "off-shoulder shirt", "casual boho", "F", covers=TOP_SL + ["arms"]),
    item("mesh_top", "Mesh top", "mesh top", "mesh", "cyberpunk punk", "", "x", covers=[]),
    item("leather_vest", "Leather vest", "leather vest", "vest", "punk western steampunk", covers=TOP_SL),
    item("tunic", "Tunic", "tunic", "tunic", "medieval fantasy", covers=TOP_SL + ARMS + ["hips"]),
    item("chain_shirt", "Chainmail shirt", "chainmail shirt", "chain mail", "medieval fantasy", covers=TOP_SL + ARMS),
    item("sports_bra", "Sports bra", "sports bra", "sports bra", "sporty", "F", covers=BRA),
    item("techwear_top", "Techwear top", "techwear top", "techwear", "cyberpunk sci_fi", covers=TOP_SL + LONG),
]
OUTER = [
    item("leather_jacket", "Leather jacket", "leather jacket", "leather jacket", "punk street cyberpunk", covers=LONG + ["shoulders", "back"]),
    item("denim_jacket", "Denim jacket", "denim jacket", "denim jacket", "casual street western", covers=LONG + ["shoulders", "back"]),
    item("bomber", "Bomber jacket", "bomber jacket", "bomber jacket", "street sporty military", covers=LONG + ["shoulders", "back"]),
    item("blazer", "Blazer", "blazer", "blazer", "business elegant", covers=LONG + ["shoulders", "back"]),
    item("trench", "Trench coat", "trench coat", "trench coat", "business elegant", covers=LONG + ["shoulders", "back", "thighs"]),
    item("long_coat", "Long coat", "long coat", "long coat", "elegant casual gothic", covers=LONG + ["shoulders", "back", "thighs", "knees"]),
    item("puffer", "Puffer jacket", "puffer jacket", "puffer jacket", "casual street", covers=LONG + ["shoulders", "back"]),
    item("cardigan", "Cardigan", "cardigan", "cardigan", "casual", covers=LONG + ["shoulders", "back"]),
    item("cloak", "Cloak", "cloak", "cloak", "fantasy medieval gothic", covers=LONG + ["shoulders", "back", "thighs"]),
    item("cape", "Cape", "cape", "cape", "fantasy victorian", covers=["shoulders", "back", "arms"]),
    item("fur_coat", "Fur coat", "fur coat", "fur coat", "elegant", covers=LONG + ["shoulders", "back", "thighs"]),
    item("haori", "Haori", "haori", "haori", "east_asian", covers=LONG + ["shoulders", "back", "thighs"]),
    item("tailcoat", "Tailcoat", "tailcoat", "tailcoat", "steampunk victorian", covers=LONG + ["shoulders", "back", "thighs"]),
    item("military_jacket", "Military jacket", "military jacket", "military jacket", "military", covers=LONG + ["shoulders", "back"]),
    item("lab_coat", "Lab coat", "lab coat", "labcoat", "sci_fi", covers=LONG + ["shoulders", "back", "thighs"]),
    item("neon_jacket", "LED-trimmed jacket", "LED-trimmed jacket", "glowing clothes", "cyberpunk", covers=LONG + ["shoulders", "back"]),
    item("bolero", "Bolero", "bolero", "bolero", "elegant", "F", covers=["shoulders", "arms"]),
    item("varsity", "Varsity jacket", "varsity jacket", "letterman jacket", "sporty street", covers=LONG + ["shoulders", "back"]),
    item("leather_armor", "Leather armor", "leather armor", "armor", "fantasy medieval", covers=BRA + ["belly", "back", "shoulders", "arms"]),
    item("plate_armor", "Plate armor", "plate armor", "plate armor", "medieval fantasy", covers=ALL_BODY),
    item("duster", "Duster coat", "duster coat", "long coat", "western steampunk", covers=LONG + ["shoulders", "back", "thighs", "knees", "calves"]),
]
ONEPIECE = [
    item("sundress", "Sundress", "sundress", "sundress", "casual beach boho", "F", "l", covers=TOP_SL + HIP),
    item("cocktail", "Cocktail dress", "cocktail dress", "cocktail dress", "elegant", "F", "l", covers=TOP_SL + HIP),
    item("evening_gown", "Evening gown", "evening gown", "evening gown", "elegant", "F", "l", covers=TOP_SL + HIP + ["thighs", "knees", "calves", "ankles"]),
    item("lbd", "Little black dress", "little black dress", "little black dress", "elegant", "F", "l", covers=TOP_SL + HIP),
    item("bodycon", "Bodycon dress", "bodycon dress", "bodycon", "boudoir elegant", "F", "l", covers=TOP_SL + HIP),
    item("wrap_dress", "Wrap dress", "wrap dress", "dress", "elegant casual", "F", "l", covers=TOP_SL + HIP),
    item("shirt_dress", "Shirt dress", "shirt dress", "shirt dress", "casual business", "F", "l", covers=TOP_SL + HIP + LONG),
    item("slip_dress", "Slip dress", "slip dress", "slip dress", "boudoir elegant", "F", "l", covers=TOP_SL + HIP),
    item("wedding", "Wedding dress", "wedding dress", "wedding dress", "elegant", "F", "", covers=TOP_SL + HIP + ["thighs", "knees", "calves", "ankles"]),
    item("qipao", "Qipao", "qipao", "china dress", "east_asian", "F", "l", covers=TOP_SL + HIP + ["neck"]),
    item("kimono", "Kimono", "kimono", "kimono", "east_asian", "", "", covers=ALL_BODY + ["feet"]),
    item("hanfu", "Hanfu", "hanfu", "hanfu", "east_asian", "", "", covers=ALL_BODY + ["feet"]),
    item("medieval_gown", "Medieval gown", "medieval gown", "dress", "medieval fantasy", "F", "", covers=TOP_SL + HIP + LONG + ["thighs", "knees", "calves", "ankles"]),
    item("ball_gown", "Ball gown", "ball gown", "ball gown", "victorian fantasy elegant", "F", "", covers=TOP_SL + HIP + ["thighs", "knees", "calves", "ankles", "feet"]),
    item("jumpsuit", "Jumpsuit", "jumpsuit", "jumpsuit", "casual elegant", "", "", covers=TOP_SL + HIP + ["thighs", "knees", "calves", "ankles"]),
    item("overalls", "Overalls", "overalls", "overalls", "casual western", "", "p", covers=TOP_SL + HIP + ["thighs", "knees", "calves", "ankles"]),
    item("bodysuit", "Bodysuit", "bodysuit", "bodysuit", "boudoir sporty", "F", "", covers=TOP_SL + HIP),
    item("catsuit", "Catsuit", "catsuit", "catsuit", "cyberpunk sci_fi", "", "", covers=TOP_SL + HIP + LONG + ["thighs", "knees", "calves", "ankles"]),
    item("leotard", "Leotard", "leotard", "leotard", "sporty", "F", "", covers=TOP_SL + HIP),
    item("swimsuit", "One-piece swimsuit", "one-piece swimsuit", "one-piece swimsuit", "beach", "F", "", covers=TOP_SL + HIP),
    item("robe", "Robe", "robe", "robe", "fantasy casual", "", "", covers=ALL_BODY),
    item("bathrobe", "Bathrobe", "bathrobe", "bathrobe", "casual", "", "", covers=ALL_BODY),
    item("nightgown", "Nightgown", "nightgown", "nightgown", "boudoir", "F", "l", covers=TOP_SL + HIP),
    item("negligee", "Negligee", "negligee", "negligee", "boudoir", "F", "lx", covers=TOP_SL + HIP),
    item("latex_catsuit", "Latex catsuit", "latex catsuit", "latex bodysuit", "boudoir cyberpunk", "", "x", covers=TOP_SL + HIP + LONG + ["thighs", "knees", "calves", "ankles"], material_in_noun=True),
    item("sci_suit", "Skin-tight sci-fi suit", "skin-tight sci-fi suit", "bodysuit", "sci_fi", "", "", covers=TOP_SL + HIP + LONG + ["thighs", "knees", "calves", "ankles"]),
    item("toga", "Toga", "toga", "toga", "fantasy", "", "", covers=TOP_SL + HIP + ["thighs", "knees"]),
]
for o in ONEPIECE:
    o["mutes"] = ["top.*", "bottom.*"]
BOTTOM = [
    item("jeans", "Jeans", "jeans", "jeans", "casual street western", "", "p", covers=PANTS),
    item("trousers", "Trousers", "trousers", "pants", "business elegant", "", "p", covers=PANTS),
    item("cargo", "Cargo pants", "cargo pants", "cargo pants", "military street cyberpunk", "", "p", covers=PANTS),
    item("leggings", "Leggings", "leggings", "leggings", "sporty casual", "", "p", covers=PANTS),
    item("yoga", "Yoga pants", "yoga pants", "yoga pants", "sporty", "", "p", covers=PANTS),
    item("sweatpants", "Sweatpants", "sweatpants", "sweatpants", "casual sporty", "", "p", covers=PANTS),
    item("shorts", "Shorts", "shorts", "shorts", "casual sporty beach", "", "p", covers=SHORTS),
    item("denim_shorts", "Denim shorts", "denim shorts", "denim shorts", "casual beach western", "", "p", covers=SHORTS),
    item("bike_shorts", "Bike shorts", "bike shorts", "bike shorts", "sporty", "", "p", covers=SHORTS),
    item("miniskirt", "Miniskirt", "miniskirt", "miniskirt", "casual street boudoir", "F", "", covers=HIP),
    item("pencil_skirt", "Pencil skirt", "pencil skirt", "pencil skirt", "business", "F", "", covers=HIP + ["thighs", "knees"]),
    item("pleated", "Pleated skirt", "pleated skirt", "pleated skirt", "casual street", "F", "l", covers=HIP),
    item("a_line", "A-line skirt", "A-line skirt", "skirt", "casual elegant", "F", "l", covers=HIP),
    item("maxi_skirt", "Maxi skirt", "maxi skirt", "long skirt", "boho", "F", "", covers=HIP + ["thighs", "knees", "calves", "ankles"]),
    item("leather_pants", "Leather pants", "leather pants", "leather pants", "punk boudoir", "", "p", covers=PANTS, material_in_noun=True),
    item("harem", "Harem pants", "harem pants", "harem pants", "boho east_asian", "", "p", covers=PANTS),
    item("hakama", "Hakama", "hakama", "hakama", "east_asian", "", "", covers=PANTS),
    item("kilt", "Kilt", "kilt", "kilt", "medieval punk", "", "", covers=HIP + ["thighs", "knees"]),
    item("tactical", "Tactical pants", "tactical pants", "pants", "military cyberpunk", "", "p", covers=PANTS),
    item("bustle_skirt", "Bustle skirt", "bustle skirt", "skirt", "steampunk victorian", "F", "", covers=HIP + ["thighs", "knees", "calves", "ankles"]),
    item("breeches", "Riding breeches", "riding breeches", "pants", "victorian western", "", "p", covers=PANTS),
]
UNDER_TOP = [
    item("bra", "Bra", "bra", "bra", "", "F", covers=BRA),
    item("lace_bra", "Lace bra", "lace bra", "lace bra", "boudoir", "F", covers=BRA),
    item("pushup", "Push-up bra", "push-up bra", "push-up bra", "boudoir", "F", covers=BRA),
    item("bralette", "Bralette", "bralette", "bralette", "casual", "F", covers=BRA),
    item("strapless_bra", "Strapless bra", "strapless bra", "strapless bra", "", "F", covers=BRA),
    item("balconette", "Balconette bra", "balconette bra", "bra", "boudoir", "F", covers=BRA),
    item("bikini_top", "Bikini top", "bikini top", "bikini", "beach", "F", covers=BRA),
    item("micro_bikini_top", "Micro bikini top", "micro bikini top", "micro bikini", "beach boudoir", "F", "x", covers=["nipples"]),
    item("undershirt", "Undershirt", "undershirt", "undershirt", "", "M", covers=TOP_SL),
    item("babydoll", "Babydoll", "babydoll", "babydoll", "boudoir", "F", "", covers=BRA + ["belly"]),
    item("teddy", "Teddy", "teddy", "teddy (lingerie)", "boudoir", "F", "", covers=BRA + ["belly"] + HIP[:3] + ["genitals"]),
    item("open_cup", "Open-cup bra", "open-cup bra", "open bra", "boudoir", "F", "x", covers=["chest"]),
    item("pasties", "Pasties", "pasties", "pasties", "boudoir", "F", "px", covers=["nipples"]),
]
UNDER_BOTTOM = [
    item("panties", "Panties", "panties", "panties", "", "F", "p", covers=HIP),
    item("lace_panties", "Lace panties", "lace panties", "lace panties", "boudoir", "F", "p", covers=HIP),
    item("thong", "Thong", "thong", "thong", "boudoir", "F", "", covers=THONG),
    item("g_string", "G-string", "G-string", "g-string", "boudoir", "", "", covers=THONG),
    item("boyshorts", "Boyshorts", "boyshorts", "boyshort panties", "casual", "F", "p", covers=HIP),
    item("briefs", "Briefs", "briefs", "briefs", "", "M", "p", covers=HIP),
    item("boxer_briefs", "Boxer briefs", "boxer briefs", "boxer briefs", "", "M", "p", covers=HIP + ["thighs"]),
    item("boxers", "Boxers", "boxers", "boxers (clothes)", "", "M", "p", covers=HIP),
    item("bikini_bottom", "Bikini bottom", "bikini bottom", "bikini bottom only", "beach", "F", "", covers=HIP),
    item("micro_bikini_bottom", "Micro bikini bottom", "micro bikini bottom", "micro bikini", "beach boudoir", "F", "x", covers=THONG),
    item("garter_belt", "Garter belt", "garter belt", "garter belt", "boudoir", "F", "", covers=[]),
    item("crotchless", "Crotchless panties", "crotchless panties", "crotchless panties", "boudoir", "F", "px", covers=["hips"]),
    item("high_waist", "High-waisted panties", "high-waisted panties", "panties", "casual", "F", "p", covers=HIP + ["belly"]),
]
LEGWEAR = [
    item("thigh_highs", "Thigh-high stockings", "thigh-high stockings", "thighhighs", "boudoir elegant", "", "p", covers=["thighs", "knees", "calves", "ankles", "feet"]),
    item("lace_stockings", "Lace-top stockings", "lace-top stockings", "thighhighs", "boudoir elegant", "F", "p", covers=["thighs", "knees", "calves", "ankles", "feet"]),
    item("fishnet_stockings", "Fishnet stockings", "fishnet stockings", "fishnet thighhighs", "punk boudoir", "", "p", covers=[]),
    item("pantyhose", "Pantyhose", "pantyhose", "pantyhose", "business elegant", "F", "p", covers=["thighs", "knees", "calves", "ankles", "feet"]),
    item("fishnet_tights", "Fishnet tights", "fishnet tights", "fishnets", "punk gothic", "", "p", covers=[]),
    item("opaque_tights", "Opaque tights", "opaque tights", "black pantyhose", "casual gothic", "F", "p", covers=["thighs", "knees", "calves", "ankles", "feet"]),
    item("knee_socks", "Knee socks", "knee socks", "kneehighs", "casual street", "", "p", covers=["knees", "calves", "ankles", "feet"]),
    item("thigh_socks", "Thigh-high socks", "thigh-high socks", "thighhighs", "casual street", "", "p", covers=["thighs", "knees", "calves", "ankles", "feet"]),
    item("ankle_socks", "Ankle socks", "ankle socks", "socks", "casual sporty", "", "p", covers=["ankles", "feet"]),
    item("leg_warmers", "Leg warmers", "leg warmers", "leg warmers", "sporty casual", "", "p", covers=["calves", "knees"]),
    item("ripped_tights", "Ripped tights", "ripped tights", "torn pantyhose", "punk gothic", "F", "p", covers=["thighs", "knees", "calves", "ankles", "feet"]),
    item("garter_stockings", "Stockings with garters", "stockings held up by garters", "garter straps", "boudoir", "F", "p", covers=["thighs", "knees", "calves", "ankles", "feet"]),
]
FOOT = [
    item("sneakers", "Sneakers", "sneakers", "sneakers", "casual street sporty", "", "p", covers=["feet"]),
    item("running", "Running shoes", "running shoes", "sneakers", "sporty", "", "p", covers=["feet"]),
    item("heels", "High heels", "high heels", "high heels", "elegant boudoir business", "F", "p", covers=["feet"]),
    item("stilettos", "Stilettos", "stilettos", "stiletto heels", "elegant boudoir", "F", "p", covers=["feet"]),
    item("platform_heels", "Platform heels", "platform heels", "platform footwear", "street boudoir", "F", "p", covers=["feet"]),
    item("ankle_boots", "Ankle boots", "ankle boots", "ankle boots", "casual street", "", "p", covers=["feet", "ankles"]),
    item("knee_boots", "Knee-high boots", "knee-high boots", "knee boots", "casual elegant medieval", "", "p", covers=["feet", "ankles", "calves", "knees"]),
    item("thigh_boots", "Thigh-high boots", "thigh-high boots", "thigh boots", "boudoir cyberpunk", "F", "p", covers=["feet", "ankles", "calves", "knees", "thighs"]),
    item("combat_boots", "Combat boots", "combat boots", "combat boots", "military punk cyberpunk", "", "p", covers=["feet", "ankles", "calves"]),
    item("cowboy_boots", "Cowboy boots", "cowboy boots", "cowboy boots", "western", "", "p", covers=["feet", "ankles", "calves"]),
    item("sandals", "Sandals", "sandals", "sandals", "beach boho", "", "p", covers=[]),
    item("flip_flops", "Flip-flops", "flip-flops", "flip-flops", "beach casual", "", "p", covers=[]),
    item("flats", "Ballet flats", "ballet flats", "ballet slippers", "casual elegant", "F", "p", covers=["feet"]),
    item("loafers", "Loafers", "loafers", "loafers", "business casual", "", "p", covers=["feet"]),
    item("oxfords", "Oxford shoes", "oxford shoes", "dress shoes", "business elegant", "", "p", covers=["feet"]),
    item("victorian_boots", "Victorian boots", "lace-up Victorian boots", "boots", "victorian steampunk", "", "p", covers=["feet", "ankles", "calves"]),
    item("sabatons", "Armored sabatons", "armored sabatons", "armored boots", "medieval fantasy", "", "p", covers=["feet", "ankles", "calves"]),
    item("geta", "Geta", "geta", "geta", "east_asian", "", "p", covers=[]),
    item("barefoot", "Barefoot", "barefoot", "barefoot", "beach casual", "", "", covers=[], barefoot=True),
]
HANDS = [
    item("leather_gloves", "Leather gloves", "leather gloves", "gloves", "", "", "p", covers=["hands"]),
    item("fingerless", "Fingerless gloves", "fingerless gloves", "fingerless gloves", "punk cyberpunk street", "", "p", covers=["hands"]),
    item("opera_gloves", "Opera gloves", "elbow-length opera gloves", "elbow gloves", "elegant boudoir", "F", "p", covers=["hands", "forearms"]),
    item("lace_gloves", "Lace gloves", "lace gloves", "lace gloves", "elegant gothic victorian", "F", "p", covers=["hands"]),
    item("latex_gloves", "Latex gloves", "latex gloves", "latex gloves", "boudoir", "", "px", covers=["hands"], material_in_noun=True),
    item("gauntlets", "Gauntlets", "gauntlets", "gauntlets", "medieval fantasy", "", "p", covers=["hands", "forearms"]),
    item("cyber_gloves", "Cyber gloves", "cyber gloves", "gloves", "cyberpunk sci_fi", "", "p", covers=["hands"]),
    item("mittens", "Mittens", "mittens", "mittens", "casual", "", "p", covers=["hands"]),
    item("driving_gloves", "Driving gloves", "driving gloves", "gloves", "elegant", "", "p", covers=["hands"]),
    item("detached_sleeves", "Detached sleeves", "detached sleeves", "detached sleeves", "fantasy east_asian", "", "p", covers=["arms", "forearms"]),
    item("bracers", "Bracers", "bracers", "bracer", "fantasy medieval", "", "p", covers=["forearms"]),
]


def acc(id, label, noun, tag, styles="", only="", flags="", **extra):
    """flags: m = metal jewelry, c = colored cloth item"""
    o = item(id, label, noun, tag, styles, only, flags.replace("m", "").replace("c", ""), covers=extra.pop("covers", []))
    if "m" in flags:
        o["metal"] = True
    if "c" in flags:
        o["color"] = True
    o.update(extra)
    return o


NECK = [
    acc("choker", "Choker", "choker", "choker", "gothic punk boudoir", "", "m"),
    acc("collar", "Collar", "collar", "collar", "gothic punk", "", "m"),
    acc("pendant", "Pendant necklace", "pendant necklace", "necklace", "", "", "m"),
    acc("pearls", "Pearl necklace", "pearl necklace", "pearl necklace", "elegant", "F", ""),
    acc("chain", "Chain necklace", "chain necklace", "necklace", "street punk", "", "m"),
    acc("scarf", "Scarf", "scarf", "scarf", "casual", "", "c", covers=["neck"]),
    acc("necktie", "Necktie", "necktie", "necktie", "business", "", "c"),
    acc("bow_tie", "Bow tie", "bow tie", "bowtie", "elegant business", "", "c"),
    acc("ascot", "Ascot", "ascot", "ascot", "victorian steampunk", "", "c", covers=["neck"]),
]
EARRINGS = [
    acc("studs", "Stud earrings", "stud earrings", "earrings", "", "", "mp"),
    acc("hoops", "Hoop earrings", "hoop earrings", "hoop earrings", "casual street", "", "mp"),
    acc("drops", "Drop earrings", "drop earrings", "drop earrings", "elegant", "F", "mp"),
    acc("chandelier", "Chandelier earrings", "chandelier earrings", "earrings", "elegant", "F", "mp"),
]
WRIST = [
    acc("bracelet", "Bracelet", "bracelet", "bracelet", "", "", "m"),
    acc("bangles", "Bangles", "bangles", "bracelet", "boho", "F", "mp"),
    acc("watch", "Wristwatch", "wristwatch", "wristwatch", "business", "", ""),
    acc("cuffs", "Cuffs", "cuffs", "wrist cuffs", "punk gothic", "", "mp"),
]
RINGS = [
    acc("ring", "A ring", "ring", "ring", "", "", "m"),
    acc("rings", "Several rings", "several rings", "ring", "punk gothic", "", "mp"),
]
EYEWEAR = [
    acc("glasses", "Glasses", "glasses", "glasses", "casual business", "", "p"),
    acc("sunglasses", "Sunglasses", "sunglasses", "sunglasses", "casual street beach", "", "p"),
    acc("round_glasses", "Round glasses", "round glasses", "round eyewear", "casual boho steampunk", "", "p"),
    acc("monocle", "Monocle", "monocle", "monocle", "steampunk victorian", "", ""),
    acc("cyber_eyes", "Cyber visor", "cyber visor", "visor", "cyberpunk sci_fi", "", ""),
    acc("aviators", "Aviator sunglasses", "aviator sunglasses", "aviator sunglasses", "military", "", "p"),
]
FACE = [
    acc("cyber_mask", "Face mask", "face mask", "mask", "cyberpunk", "", "", covers=["face"]),
    acc("masquerade", "Masquerade mask", "masquerade mask", "masquerade", "elegant boudoir", "", "", covers=["face"]),
    acc("surgical", "Surgical mask", "surgical mask", "surgical mask", "casual", "", "", covers=["face"]),
    acc("half_mask", "Half mask", "half mask", "half mask", "fantasy gothic", "", "", covers=["face"]),
]
BELT = [
    acc("belt", "Belt", "belt", "belt", "", "", "c"),
    acc("utility_belt", "Utility belt", "utility belt", "utility belt", "cyberpunk military", "", ""),
    acc("sword_belt", "Sword belt", "sword belt with a scabbard", "sword", "fantasy medieval", "", ""),
    acc("corset_belt", "Corset belt", "corset belt", "corset belt", "steampunk gothic", "F", ""),
]
BAG = [
    acc("handbag", "Handbag", "handbag", "handbag", "elegant casual", "F", "c"),
    acc("clutch", "Clutch", "clutch", "clutch", "elegant", "F", "c"),
    acc("backpack", "Backpack", "backpack", "backpack", "casual sporty street", "", "c"),
    acc("crossbody", "Crossbody bag", "crossbody bag", "shoulder bag", "casual street", "", "c"),
    acc("satchel", "Satchel", "satchel", "satchel", "steampunk victorian", "", "c"),
]
EXTRAS = [
    acc("thigh_garter", "Thigh garter", "thigh garter", "thigh strap", "boudoir", "F", "c"),
    acc("anklet", "Anklet", "anklet", "anklet", "beach boho", "F", "m"),
    acc("body_chain", "Body chain", "body chain", "body chain", "boudoir", "", "mx"),
    acc("harness", "Leather harness", "leather harness", "harness", "boudoir punk", "", "x"),
    acc("holster", "Holster", "gun holster", "holster", "military western", "", ""),
    acc("pocket_watch", "Pocket watch", "pocket watch", "pocket watch", "steampunk victorian", "", ""),
    acc("pauldrons", "Shoulder pauldrons", "pauldrons", "pauldrons", "fantasy medieval", "", "p", covers=["shoulders"]),
]

EXPOSURE = [
    {"id": "underwear_only", "label": "Only underwear", "drops": ["top", "outer", "onepiece", "bottom"], "text": "", "tag": "underwear only", "edit": "Remove {pos} outer clothes, leaving only {pos} underwear.", "only_underwear": True},
    {"id": "topless", "label": "Topless", "drops": ["top", "outer", "onepiece", "underwear.top_type"], "text": "{Pron} {is} topless, {pos} {chest} bare.", "tag": "topless", "edit": "Remove {pos} top and bra, leaving {obj} topless."},
    {"id": "bottomless", "label": "Bottomless", "drops": ["bottom", "onepiece", "underwear.bottom_type"], "text": "{Pron} {is} bottomless.", "tag": "bottomless", "edit": "Remove {pos} bottoms and underwear, leaving {obj} bottomless."},
    {"id": "nude_except", "label": "Nude except accessories", "drops": ["top", "outer", "onepiece", "bottom", "underwear"], "text": "{Pron} {is} nude except for {rest}.", "tag": "nude", "edit": "Remove all of {pos} clothes except {rest}.", "keeps": True},
    {"id": "nude", "label": "Completely nude", "drops": ["head", "top", "outer", "onepiece", "bottom", "underwear", "legwear", "footwear", "hands", "accessories"], "text": "{Pron} {is} completely nude.", "tag": "completely nude", "edit": "Remove all of {pos} clothes, leaving {obj} completely nude."},
]
for o in EXPOSURE:
    o["explicit"] = True

# Bare areas: pick which parts of the body are left uncovered, one by one. "drops": slots (or "part.param")
# left out of the outfit; "uncover": body zones the Character Builder may then show; "implied_by": Exposure
# options that already say the same thing (the area is then not repeated).
NUDE3 = ["topless", "nude", "nude_except"]
LOW3 = ["bottomless", "nude", "nude_except"]


def lvl(id, label, text, tag, edit, **kw):
    d = {"id": id, "label": label, "text": text, "tag": tag, "edit": edit}
    d.update(kw)
    return d


def bare(id, label, text, tag, edit, *, drops=(), uncover=(), x=False, implied=(), only=None, hint=None, levels=None, default=None):
    o = {"id": id, "label": label, "text": text, "tag": tag, "edit": edit}
    if drops:
        o["drops"] = list(drops)
    if uncover:
        o["uncover"] = list(uncover)
    if x:
        o["explicit"] = True
    if implied:
        o["implied_by"] = list(implied)
    if only:
        o["only"] = list(only)
    if hint:
        o["hint"] = hint
    if levels:
        o["levels"] = levels
        o["default_level"] = default or levels[0]["id"]
    return o


BARE = [
    bare("shoulders", "Shoulders", "{Pos} shoulders are bare.", "bare shoulders", "Leave {pos} shoulders bare.", uncover=["shoulders"]),
    bare("arms", "Arms", "{Pos} arms are bare.", "bare arms", "Remove {pos} sleeves, leaving {pos} arms bare.", drops=["outer", "top.sleeves"], uncover=["arms", "forearms"]),
    bare("back", "Back", "", "", "", uncover=["back", "lower_back"], levels=[
        lvl("upper", "Open upper back", "{Pos} upper back is bare.", "bare back, open back", "Make {pos} upper back bare."),
        lvl("waist", "To the waist", "{Pos} back is bare down to the waist.", "backless, bare back", "Make {pos} back bare down to the waist."),
        lvl("low", "Very low", "{Pos} back is bare all the way down to the base of {pos} spine.", "backless, low back", "Make {pos} back bare all the way down to the base of {pos} spine."),
    ]),
    bare("midriff", "Midriff", "", "", "", uncover=["belly", "waist"], levels=[
        lvl("strip", "A strip", "A strip of {pos} midriff is visible.", "midriff", "Show a strip of {pos} midriff."),
        lvl("full", "Fully bare", "{Pos} midriff is bare, with the navel visible.", "bare midriff, navel", "Make {pos} midriff bare."),
        lvl("bust", "Up to the bust", "{Pos} whole belly is bare, all the way up to just under the breasts.", "bare midriff, navel, stomach", "Make {pos} whole belly bare, up to just under the breasts."),
    ], default="full"),
    bare("cleavage", "Cleavage", "", "", "", levels=[
        lvl("normal", "Normal", "{Pos} cleavage is visible.", "cleavage", "Show some of {pos} cleavage."),
        lvl("deep", "Deep", "{Pos} neckline plunges, showing deep cleavage.", "deep cleavage, plunging neckline", "Lower {pos} neckline to show deep cleavage."),
        lvl("super", "Super deep", "{Pos} neckline plunges almost to the navel, with extremely deep cleavage on display.", "extreme cleavage, plunging neckline", "Lower {pos} neckline almost to the navel, showing extremely deep cleavage."),
    ]),
    bare("thighs", "Thighs", "{Pos} thighs are bare.", "bare thighs", "Make {pos} thighs bare.", uncover=["thighs"]),
    bare("legs", "Legs", "{Pos} legs are bare.", "bare legs", "Remove {pos} legwear, leaving {pos} legs bare.", drops=["legwear"], uncover=["thighs", "knees", "calves"]),
    bare("feet", "Feet", "{Pron} {is} barefoot.", "barefoot, bare feet", "Remove {pos} shoes, leaving {obj} barefoot.", drops=["footwear"], uncover=["ankles", "feet"], implied=["nude"]),
    bare("hands", "Hands", "{Pos} hands are bare.", "bare hands", "Remove {pos} gloves.", drops=["hands"], implied=["nude"]),
    bare("underboob", "Underboob", "", "", "", x=True, implied=NUDE3, levels=[
        lvl("hint", "A hint", "The lower edge of {pos} breasts peeks out from under the clothes.", "underboob", "Let the lower edge of {pos} breasts peek out from under the clothes."),
        lvl("half", "Half", "The lower half of {pos} breasts shows below the clothes.", "underboob", "Show the lower half of {pos} breasts below the clothes."),
        lvl("full", "Fully", "{Pos} breasts hang out from under the clothes, the undersides fully visible.", "underboob", "Let {pos} breasts hang out from under the clothes, the undersides fully visible."),
    ]),
    bare("sideboob", "Sideboob", "", "", "", x=True, implied=NUDE3, levels=[
        lvl("hint", "A hint", "A hint of {pos} breasts shows at the sides.", "sideboob", "Show a hint of {pos} breasts at the sides."),
        lvl("clear", "Clearly", "{Pos} breasts are clearly visible at the sides.", "sideboob", "Make {pos} breasts clearly visible at the sides."),
        lvl("most", "Almost all", "Almost the whole side of {pos} breasts is on display.", "sideboob", "Show almost the whole side of {pos} breasts."),
    ]),
    bare("breasts", "Naked breasts", "{Pron} {is} topless, {pos} {chest} bare.", "topless, bare breasts", "Remove {pos} top and bra, leaving {pos} {chest} bare.",
         drops=["top", "outer", "onepiece", "underwear.top_type"], uncover=["chest", "breasts", "nipples"], x=True, implied=NUDE3),
    bare("nipples", "Naked nipples", "", "", "", uncover=["nipples"], x=True, implied=NUDE3,
         hint="Visible through cutouts or pulled-aside cloth; the clothes stay. Click it again to choose how much shows.", levels=[
        lvl("peek", "Areola peeks out", "The tops of {pos} areolas peek out from the clothes, the nipples hidden.", "areola slip", "Let the tops of {pos} areolas peek out from the clothes, with the nipples still hidden."),
        lvl("half", "Half areola, nipple visible", "{Pos} areolas are half visible and the nipples show.", "nipple slip, areolae", "Show half of {pos} areolas, with the nipples visible."),
        lvl("full", "Fully exposed", "{Pos} areolas and nipples are fully exposed.", "nipples, areolae", "Fully expose {pos} areolas and nipples."),
    ], default="full"),
    bare("butt", "Naked butt", "", "", "", uncover=["butt"], x=True, implied=LOW3,
         hint="Thong, cutouts or chaps: the clothes stay, the butt is visible.", levels=[
        lvl("peek", "Peeking out", "The lower edges of {pos} butt cheeks peek out.", "ass visible, butt cheeks", "Let the lower edges of {pos} butt cheeks peek out."),
        lvl("half", "Half exposed", "{Pos} butt cheeks are half exposed.", "ass visible, butt cheeks", "Half expose {pos} butt cheeks."),
        lvl("full", "Fully exposed", "{Pos} butt cheeks are completely exposed.", "bare ass, butt", "Completely expose {pos} butt cheeks."),
    ], default="full"),
    bare("pussy", "Naked pussy", "", "", "", uncover=["genitals", "pubic"], x=True, implied=LOW3, only=["female"],
         hint="Open or cut-out clothes: the clothes stay, the pussy is visible.", levels=[
        lvl("peek", "Peeking out", "{Pos} labia peek out from the edge of the clothes.", "pussy, labia", "Let {pos} labia peek out from the edge of the clothes."),
        lvl("most", "Mostly exposed", "{Pos} pussy is mostly exposed, framed by the edges of the clothes.", "pussy", "Expose most of {pos} pussy, framed by the edges of the clothes."),
        lvl("full", "Fully exposed", "{Pos} pussy is completely exposed.", "pussy, naked pussy", "Completely expose {pos} pussy."),
    ], default="full"),
    bare("penis", "Naked penis", "", "", "", uncover=["genitals", "pubic"], x=True, implied=LOW3, only=["male"],
         hint="How much of the penis is covered; the clothes stay.", levels=[
        lvl("head_cov", "Only the head covered", "{Pos} penis is exposed except for the head, which is covered by the clothes.", "penis, covered glans", "Expose {pos} penis, covering only the head."),
        lvl("head_half_cov", "Head and half covered", "{Pos} penis is covered from the head down to the middle of the shaft, while the lower half is exposed.", "penis", "Cover {pos} penis from the head down to the middle of the shaft, exposing the lower half."),
        lvl("base_cov", "Base covered", "{Pos} penis is covered from the base up to the middle, while the upper half and the head are exposed.", "penis", "Cover {pos} penis from the base up to the middle, exposing the upper half and the head."),
        lvl("head_only", "Only the head exposed", "{Pos} penis is almost completely covered, with only the head showing.", "penis, glans", "Cover {pos} penis almost completely, leaving only the head exposed."),
        lvl("full", "Fully exposed", "{Pos} penis is fully exposed, with nothing covering it.", "penis, naked penis", "Fully expose {pos} penis, with nothing covering it."),
    ], default="full"),
    bare("balls", "Naked balls", "", "", "", uncover=["genitals"], x=True, implied=LOW3, only=["male"],
         hint="Shows the testicles while the penis stays covered.", levels=[
        lvl("peek", "Peeking out", "{Pos} testicles peek out from the edge of the clothes, with the penis covered.", "testicles", "Let {pos} testicles peek out from the edge of the clothes, with the penis covered."),
        lvl("half", "Half exposed", "{Pos} testicles are half exposed, with the penis covered.", "testicles", "Half expose {pos} testicles, keeping the penis covered."),
        lvl("full", "Fully exposed", "{Pos} testicles are fully exposed while {pos} penis stays covered.", "testicles, naked balls", "Fully expose {pos} testicles, keeping the penis covered."),
    ], default="full"),
    bare("no_bra", "No bra", "{Pron} {is} not wearing a bra.", "no bra", "Remove {pos} bra.", drops=["underwear.top_type"], x=True, implied=NUDE3, only=["female"]),
    bare("no_panties", "No panties", "{Pron} {is} not wearing panties.", "no panties", "Remove {pos} panties.", drops=["underwear.bottom_type"], x=True, implied=LOW3, only=["female"]),
    bare("no_underwear", "No underwear", "{Pron} {is} not wearing any underwear.", "no underwear", "Remove {pos} underwear.", drops=["underwear"], x=True, implied=["nude", "nude_except"]),
]


def slot(noun, add, replace, remove, change=None, **kw):
    d = {"noun": noun, "add": add, "replace": replace, "remove": remove}
    if change:
        d["change"] = change
    d.update(kw)
    return d


def param(id, label, options, *, type="choice", hint=None, **kw):
    p = {"id": id, "label": label, "type": type}
    if hint:
        p["hint"] = hint
    p.update(kw)
    if isinstance(options, str):
        p["set"] = options
    else:
        p["options"] = options
    return p


OPS = {"ops": ["add", "replace", "remove"]}


def type_param(options, hint, label="Type", id="type", **kw):
    return param(id, label, options, hint=hint, custom=True, custom_placeholder="e.g. velvet bomber jacket", custom_hint="Type your own item, in words.", filter_by="style.styles", edit=dict(OPS), **kw)


def look(*names, color_hint="The color of the item."):
    """color, pattern, material, fit parameters shared by the garments"""
    d = {
        "color": param("color", "Color", "clothing_colors", type="color", hint=color_hint),
        "pattern": param("pattern", "Pattern", "patterns", hint="A print or trim. Solid adds nothing to the text."),
        "material": param("material", "Material", "materials", hint="The fabric. Latex and PVC need the Explicit switch.", custom=True, custom_placeholder="e.g. holographic foil", filter_by="style.styles"),
        "fit": param("fit", "Fit", "fits", hint="How the item sits on the body."),
    }
    return [d[n] for n in names]


def state_param(kind):
    return param("state", "State", STATES[kind], multi=3, hint="What is happening to the item. Open, unbuttoned, wet, torn; the explicit ones need the Explicit switch. States change what the item covers.")


ACC_IDS = ["neckwear", "earrings", "wrist", "rings", "eyewear", "face", "belt", "bag", "extras"]
PARTS = []
ZONES = []


def add(id, label, params, slot_def=None, **kw):
    part = {"id": id, "label": label, "params": params}
    if slot_def:
        part["slot"] = slot_def
    part.update(kw)
    PARTS.append(part)
    ZONES.append({"id": id, "label": label, "params": [f"{id}.{p['id']}" for p in params]})


add("style", "Style", [
    param("wearer", "Wearer", [
        {"id": "female", "label": "Female", "pron": "she"},
        {"id": "male", "label": "Male", "pron": "he"},
        {"id": "neutral", "label": "Neutral", "pron": "they"},
    ], hint="Whose outfit it is: picks her / his words and which items random may use. When the outfit goes into a Character Builder, the character's sex is used instead."),
    param("styles", "Styles", [{"id": k, "label": l, "adj": a, "tag": t} for k, l, a, t, _ in STYLES], multi=3,
          hint="Up to three styles, mixed. Random picks only items that suit them (items that suit every style stay possible), and the styles are named in the text."),
    param("palette", "Palette", PALETTES, hint="Random colors of the items come from this palette. Colors you set yourself stay as they are."),
    param("exposure", "Exposure", EXPOSURE, explicit=True, hint="How much is worn at all: a ready-made state. It drops whole slots from the outfit and lets the Character Builder show the body. For single areas use Naked areas."),
    param("bare", "Naked areas", BARE, multi=8, hint="Pick which parts of the body are left uncovered, one by one (up to 8). Some drop the clothes there, some only show the body through the clothes. A part with a degree (cleavage, nipples, penis...) shows a selector under the chips: how much of it is exposed. Intimate parts need the Explicit switch."),
], slot_def=None)

add("head", "Head", [
    type_param(HEAD, "Hats, crowns, hoods and other things worn on the head. A hood or a helmet hides the hair."),
    *look("color", "material"),
], slot("headwear", "Put {item} on {pos} head.", "Replace {pos} headwear with {item}.", "Remove {pos} headwear.", kind="wear"))

add("top", "Top", [
    type_param(TOPS, "The upper garment. A one-piece (dress, jumpsuit) takes over the top and the bottom."),
    *look("color", "pattern", "material", "fit"),
    param("sleeves", "Sleeves", SLEEVES, hint="Sleeve length. It also decides how much of the arms is covered."),
    state_param("top"),
], slot("top", "Dress {obj} in {item}.", "Replace {pos} top with {item}.", "Remove {pos} top.", "Change {pos} top to {attrs}.", kind="garment"))

add("outer", "Outerwear", [
    type_param(OUTER, "A jacket, coat or armor worn over the rest."),
    *look("color", "pattern", "material", "fit"),
    state_param("outer"),
], slot("jacket", "Put {item} on {obj}.", "Replace {pos} jacket with {item}.", "Remove {pos} jacket.", "Change {pos} jacket to {attrs}.", kind="garment"))

add("onepiece", "One-piece", [
    type_param(ONEPIECE, "A dress, jumpsuit or similar. While it is set, Top and Bottom are not used."),
    *look("color", "pattern", "material", "fit"),
    param("length", "Length", LENGTHS, requires={"p": "onepiece.type", "in": [o["id"] for o in ONEPIECE if o.get("length")]}, hint="How long the dress is. It decides how much of the legs is covered."),
    state_param("onepiece"),
], slot("dress", "Dress {obj} in {item}.", "Replace {pos} outfit with {item}.", "Remove {pos} dress.", "Change {pos} dress to {attrs}.", kind="garment"))

add("bottom", "Bottom", [
    type_param(BOTTOM, "Pants, shorts or a skirt."),
    *look("color", "pattern", "material", "fit"),
    param("length", "Length", LENGTHS, requires={"p": "bottom.type", "in": [o["id"] for o in BOTTOM if o.get("length")]}, hint="How long the skirt is."),
    state_param("bottom"),
], slot("bottoms", "Dress {obj} in {item}.", "Replace {pos} bottoms with {item}.", "Remove {pos} bottoms.", "Change {pos} bottoms to {attrs}.", kind="garment", plural=True))

add("underwear", "Underwear", [
    type_param(UNDER_TOP, "Bra, bikini top or similar.", label="Top", id="top_type"),
    type_param(UNDER_BOTTOM, "Panties, bikini bottom or similar.", label="Bottom", id="bottom_type"),
    param("matching", "Matching set", [{"id": "matching", "label": "Matching set"}], hint="The bottom matches the top in color and material: 'a black lace bra and matching panties'."),
    *look("color", "material"),
    state_param("underwear"),
], slot("underwear", "Dress {obj} in {item}.", "Replace {pos} underwear with {item}.", "Remove {pos} underwear.", "Change {pos} underwear to {attrs}.", kind="garment", plural=True))

add("legwear", "Legwear", [
    type_param(LEGWEAR, "Stockings, tights or socks."),
    *look("color"),
    state_param("legwear"),
], slot("stockings", "Put {item} on {pos} legs.", "Replace {pos} legwear with {item}.", "Remove {pos} stockings.", "Change {pos} stockings to {attrs}.", kind="wear", plural=True))

add("footwear", "Footwear", [
    type_param(FOOT, "Shoes and boots. Barefoot says so in the text."),
    *look("color", "material"),
    param("heel", "Heel", HEELS, requires={"p": "footwear.type", "in": ["heels", "stilettos", "platform_heels", "ankle_boots", "knee_boots", "thigh_boots"]}, hint="The heel shape."),
], slot("shoes", "Put {item} on {pos} feet.", "Replace {pos} shoes with {item}.", "Remove {pos} shoes, leaving {obj} barefoot.", "Change {pos} shoes to {attrs}.", kind="wear"))

add("hands", "Gloves", [
    type_param(HANDS, "Gloves, gauntlets, detached sleeves."),
    *look("color", "material"),
], slot("gloves", "Put {item} on {pos} hands.", "Replace {pos} gloves with {item}.", "Remove {pos} gloves.", "Change {pos} gloves to {attrs}.", kind="wear"))


def acc_param(id, label, options, hint, **kw):
    return param(id, label, options, hint=hint, custom=True, custom_placeholder="e.g. jade pendant", custom_hint="Type your own item, in words.", edit=dict(OPS), filter_by="style.styles", **kw)


add("accessories", "Accessories", [
    acc_param("neckwear", "Neckwear", NECK, "Necklaces, chokers, scarves, ties."),
    acc_param("earrings", "Earrings", EARRINGS, "Earrings."),
    acc_param("wrist", "Wrist", WRIST, "Bracelets, watches, cuffs."),
    acc_param("rings", "Rings", RINGS, "Rings."),
    acc_param("eyewear", "Eyewear", EYEWEAR, "Glasses and visors."),
    acc_param("face", "Face", FACE, "Masks."),
    acc_param("belt", "Belt", BELT, "Belts."),
    acc_param("bag", "Bag", BAG, "Bags."),
    acc_param("extras", "Extras", EXTRAS, "Up to three more things. The leather harness and the body chain need the Explicit switch.", multi=3),
    param("metal", "Metal", METALS, type="color", hint="The metal of jewelry (necklaces, earrings, rings, bracelets...)."),
    param("color", "Color", "clothing_colors", type="color", hint="The color of cloth items (scarf, tie, bag, mask, belt...)."),
], slot("accessories", "Add {item}.", "Replace {pos} accessories with {item}.", "Remove {pos} {item}.", kind="accessory"))

# random leaves some parameters unset (a real outfit has no hat, no gloves and a few accessories)
SKIP = {"head.type": .55, "outer.type": .5, "hands.type": .8, "legwear.type": .45, "underwear.top_type": .5, "underwear.bottom_type": .5,
        "underwear.matching": .6, "footwear.heel": .3, "style.palette": .6, "style.exposure": .75, "style.bare": .8}
for part in PARTS:
    for p in part["params"]:
        pid = f"{part['id']}.{p['id']}"
        if pid in SKIP:
            p["skip"] = SKIP[pid]
        elif part["id"] == "accessories" and p["id"] in ACC_IDS:
            p["skip"] = .55
        elif p["id"] in ("pattern",):
            p["skip"] = .55
        elif p["id"] in ("material", "fit", "sleeves"):
            p["skip"] = .4
        elif p["id"] == "state":
            p["skip"] = .75
        elif p["id"] == "length":
            p["skip"] = .2

CONFLICTS = []

DATA = {
    "version": 1,
    "sex_param": "style.wearer",
    "_about": (
        "Data for ND Outfit Builder (same engine as the Character Builder, see character_builder.json for the shared fields). "
        "Generated by tools/make_outfit_data.py; edit this file directly to tune wording. "
        "Item (option) fields: noun (what it is called in a sentence), tag (Danbooru tag), styles (styles it suits; random uses it only when no style is chosen, "
        "or one of its styles is), only (female / male; random skips it for the other wearer), explicit (needs the Explicit switch), plural (no article, 'are'), "
        "covers (parts of the body it hides, see covers in character_builder.json), length (the Length parameter applies), mutes (e.g. 'top.*': a one-piece switches Top off), "
        "material_in_noun (the noun already says the material), metal / color (which accessory parameter colors it), barefoot. "
        "Parameter fields: custom (a Custom chip with a text field), filter_by (random is filtered by the chosen styles), explicit (the whole parameter needs the Explicit switch), edit.ops (Add / Replace / Remove in Edit mode). "
        "State fields: text (predicate after 'is'), tag, edit (Edit sentence with {pos} and {noun}), uncover (covers the state removes from the item: a list or 'all'), explicit. "
        "Length fields: covers_add. Sleeve fields: arms_covers. Exposure fields: drops (slots or 'part.param' left out), text, tag, edit. "
        "Part field slot: noun, add / replace / remove / change (Edit sentences), kind (garment, wear, accessory)."
    ),
    "outputs": [{"key": "Outfit", "part": None}],
    "option_sets": {"clothing_colors": COLORS, "patterns": PATTERNS, "materials": MATERIALS, "fits": FITS},
    "parts": PARTS,
    "zones": ZONES,
    "covers": {},
    "conflicts": CONFLICTS,
}


def dump(d, indent=0, key=None):
    """JSON with one option per line, like the Character Builder file."""
    pad = "  " * indent
    if isinstance(d, dict):
        if not d:
            return "{}"
        inner = [f'{pad}  {json.dumps(k, ensure_ascii=False)}: {dump(v, indent + 1, k)}' for k, v in d.items()]
        return "{\n" + ",\n".join(inner) + f"\n{pad}}}"
    if isinstance(d, list):
        if not d:
            return "[]"
        if key in ("options", "parts", "params", "zones") or key in ("clothing_colors", "patterns", "materials", "fits"):
            inner = [f"{pad}  " + (dump(x, indent + 1) if key in ("parts", "params") else json.dumps(x, ensure_ascii=False)) for x in d]
            return "[\n" + ",\n".join(inner) + f"\n{pad}]"
        return json.dumps(d, ensure_ascii=False)
    return json.dumps(d, ensure_ascii=False)


if __name__ == "__main__":
    from hints.apply import apply_dict  # the English hints live in tools/hints/hints_outfit.py
    import hints.hints_outfit as _hints
    apply_dict(DATA, _hints)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(dump(DATA) + "\n")
    n = sum(len(p.get("options", [])) for part in PARTS for p in part["params"])
    print(f"wrote {OUT}: {len(PARTS)} parts, {n} options")
