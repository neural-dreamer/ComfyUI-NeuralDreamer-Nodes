"""
Neural Dreamer Nodes — Outfit Builder

Builds a clothing description on the same engine as the Character Builder: the data is
js/outfit_builder.json (slots as sections, items as options), the state is one JSON string
(the hidden `state` widget), random picks come from the seed.

    {"formats": {...}, "explicit": false, "mode": "create", "ops": {}, "values": {"top.type": "blouse", ...}}

The node has one input and one output, both ND_PARAMS ("seed" comes in on the input).
Output fields:
    Outfit  the text of the outfit (Create: sentences and / or tags; Edit: instructions) with the extra prompt
    outfit  for the Character Builder (Pack Parameters: "outfit"):
              text / tags      the Create text with the wearer's pronouns, and the tags
              template         the Create text with pronoun tokens ({Pron} {pos} {obj} {is}), so the builder fills in its character's sex
              edit             the Edit instructions with tokens (Add / Replace / Remove per slot, or the simple form)
              edit_simple      the simple Edit form ("Change her outfit to ...")
              covers           the body parts the clothes hide (names of "covers" in character_builder.json)
              mode, touched    the node's mode and the slots an Edit instruction names
"""

import json
import logging
import os
import re

from .params import PARAMS, NDParams
from .character_builder import (
    DEFAULT_STATE as _CB_STATE, MAX_SEED, RANDOM, as_list, blank_state, compose, fill_pron, join_list, load_schema, paragraphs,
    parse_state, resolve, seed_for, unique, with_article,
)

log = logging.getLogger("NeuralDreamer")

OUTFIT_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "js", "outfit_builder.json")
DEFAULT_STATE = {
    "formats": {"natural": True, "tags": False}, "avoid_conflicts": True, "explicit": False, "extra": "", "custom": {},
    "mode": "create", "ops": {}, "edit_keep": True, "edit_style": "full", "values": {}, "pools": {},
}
SLOTS = ["head", "top", "outer", "onepiece", "bottom", "underwear", "legwear", "footwear", "hands", "accessories"]
ACC = ["neckwear", "earrings", "wrist", "rings", "eyewear", "face", "belt", "bag", "extras"]
ACC_NOUN = {"neckwear": "neckwear", "earrings": "earrings", "wrist": "wrist accessories", "rings": "rings", "eyewear": "glasses",
            "face": "face accessories", "belt": "belt", "bag": "bag", "extras": "extra accessories"}
ARMS_COVERS = {"arms", "forearms"}
STYLE_TAG_DEFAULT = ""
WEARER = "style.wearer"


def strip_article(t):
    return re.sub(r"^(a|an|the)\s+", "", t.strip(), flags=re.I)


class Item:
    """One thing that is worn: what it is, how it is worded, what it hides."""

    def __init__(self, slot, pid, opt, noun, phrase, plural=False, tags=(), covers=(), states=(), ghost=False):
        self.slot, self.pid, self.opt = slot, pid, opt
        self.noun, self.phrase, self.plural = noun, phrase, plural
        self.tags, self.covers, self.states, self.ghost = list(tags), set(covers), list(states), ghost

    @property
    def be(self):
        return "are" if self.plural else "is"


class OutfitText:
    def __init__(self, schema, resolved, state, seed):
        self.schema, self.r, self.state, self.seed = schema, resolved, state, int(seed)
        self.custom = state.get("custom") or {}
        self.ops = state.get("ops") or {}
        w = resolved.get(WEARER)
        self.pron = {"female": "she", "male": "he", "neutral": "they"}.get(w, "she")
        self.exposure = self.option("style.exposure")
        # Bare areas: single parts of the body left uncovered (an area the Exposure already says is not repeated)
        exp_id = (self.exposure or {}).get("id")
        self.bare = self.naked_areas(exp_id)
        self.drops = set((self.exposure or {}).get("drops", [])) | {d for o in self.bare for d in o.get("drops", [])}
        self.items = {}  # key -> Item   (underwear: "under_top", "under_bottom"; accessories by parameter)
        self.build_items()

    def naked_areas(self, exp_id):
        """The chosen Naked areas as options, each with its degree of exposure merged in (an area the Exposure already says is not repeated)."""
        pid = "style.bare"
        if pid not in self.schema.params:
            return []
        raw = self.state.get("values", {}).get(pid)
        fixed = not self.state.get("all_random") and raw not in (None, "*")
        out = []
        for o in self.options(pid):
            if exp_id in o.get("implied_by", []):
                continue
            levels = o.get("levels")
            if levels:
                want = (self.state.get("levels", {}).get(pid) or {}).get(o["id"])
                lv = next((x for x in levels if x["id"] == want), None)
                if lv is None:
                    if fixed:
                        lv = next((x for x in levels if x["id"] == o.get("default_level")), levels[0])
                    else:  # picked by random: the degree is random too
                        import random
                        lv = random.Random(seed_for(self.seed, f"{pid}:{o['id']}:level")).choice(levels)
                o = {**o, **{k: lv[k] for k in ("text", "tag", "edit", "uncover", "drops") if k in lv}}
            out.append(o)
        return out

    # ---------------------------------------------------------------- lookups
    def option(self, pid):
        v = self.r.get(pid)
        if v is None or isinstance(v, list):
            return None
        return self.schema.params[pid]["opt"].get(v)

    def options(self, pid):
        return [self.schema.params[pid]["opt"][x] for x in as_list(self.r.get(pid)) if x in self.schema.params[pid]["opt"]]

    def words(self, pid, o):
        """The adjective of a chosen option; a custom one is the typed text."""
        if o is None:
            return ""
        if o.get("custom"):
            return self.custom.get(pid, "")
        return o.get("adj") or o.get("label", "").lower()

    def dropped(self, part, name=None):
        return part in self.drops or (name is not None and f"{part}.{name}" in self.drops)

    def slot_def(self, part):
        return self.schema.part_by_id[part].get("slot", {})

    # ---------------------------------------------------------------- items
    def attrs(self, part, type_pid=None):
        """(fit, color, pattern, material, sleeves, heel, length) options of a part."""
        def one(name):
            pid = f"{part}.{name}"
            return (pid, self.option(pid)) if pid in self.schema.params else (pid, None)
        return {n: one(n) for n in ("fit", "color", "pattern", "material", "sleeves", "heel", "length")}

    def palette_color(self, key):
        pal = self.option("style.palette")
        if not pal or not pal.get("colors"):
            return None
        import random
        c = random.Random(seed_for(self.seed, key + ":palette")).choice(pal["colors"])
        return self.schema.params["head.color"]["opt"].get(c)

    def make_item(self, part, tpid, key, *, share=None, matching=False):
        """The Item for the type parameter `tpid`, or None when it is not set. share: color / material taken from the top (matching set)."""
        v = self.r.get(tpid)
        if v is None or isinstance(v, list):
            return None
        o = self.schema.params[tpid]["opt"].get(v)
        if o is None:
            return None
        if o.get("custom"):
            noun = strip_article(self.custom.get(tpid, "")) or "item"
            o = {"id": "custom", "noun": noun, "tag": noun, "covers": [], "custom": True}
        noun = o.get("noun") or o.get("label", "").lower()
        at = self.attrs(part)
        adjs, tags = [], []
        tags_after = []
        # color: set, or from the palette
        cpid, copt = at["color"]
        if matching and share:
            adjs_color, tag_color = share.get("color"), share.get("color_tag")
        else:
            if copt is None and cpid in self.schema.params:
                copt = self.palette_color(f"{tpid}")
            col = self.words(cpid, copt) if copt else ""
            adjs_color = col
            tag_color = (copt.get("tag") or col) if copt and not copt.get("custom") else col
        mpid, mopt = at["material"]
        if matching and share:
            mat, mat_tag = share.get("material", ""), share.get("material_tag", "")
        else:
            mat = self.words(mpid, mopt) if mopt else ""
            mat_tag = (mopt.get("tag") or "") if mopt and not mopt.get("custom") else mat
        if mat and (o.get("material_in_noun") or any(m.get("adj", "").lower() in noun.lower() or m.get("label", "").lower() in noun.lower()
                                                    for m in (self.schema.params[mpid]["options"] if mpid in self.schema.params else []))):
            mat, mat_tag = "", ""  # the noun already says what it is made of ("leather gloves")
        fpid, fopt = at["fit"]
        fit = self.words(fpid, fopt) if fopt else ""
        ppid, popt = at["pattern"]
        pat = "" if (popt is None or popt.get("silent")) else self.words(ppid, popt)
        spid, sopt = at["sleeves"]
        sleeve = self.words(spid, sopt) if sopt else ""
        hpid, hopt = at["heel"]
        heel = self.words(hpid, hopt) if hopt else ""
        lpid, lopt = at["length"]
        length = self.words(lpid, lopt) if (lopt and o.get("length")) else ""
        adjs = [x for x in (fit, adjs_color, pat, mat, sleeve, heel, length) if x]
        body = " ".join(adjs + [noun])
        plural = bool(o.get("plural"))
        phrase = body if plural else with_article(body)
        # covers
        covers = set(o.get("covers") or [])
        if sopt and part == "top":
            covers -= ARMS_COVERS
            covers |= set(sopt.get("arms_covers", []))
        if lopt and o.get("length"):
            covers |= set(lopt.get("covers_add", []))
        # tags
        tg = []
        base = o.get("tag", noun)
        if base is not None:
            tg.append(f"{tag_color} {base}".strip() if (tag_color and base) else base)
        for x in (mat_tag, popt.get("tag") if pat and popt and not popt.get("custom") else pat, fopt.get("tag") if fopt and not fopt.get("custom") else fit,
                  sopt.get("tag") if sopt else "", hopt.get("tag") if hopt else "", lopt.get("tag") if lopt and o.get("length") else ""):
            if x:
                tg.append(x)
        states = self.options(f"{part}.state")
        it = Item(part, tpid, o, noun, phrase, plural, tg, covers, states)
        it.color, it.color_tag, it.material, it.material_tag = adjs_color, tag_color, mat, mat_tag
        return it

    def build_items(self):
        sc = self.schema
        for part in ("head", "top", "outer", "onepiece", "bottom", "legwear", "footwear", "hands"):
            if self.dropped(part):
                continue
            it = self.make_item(part, f"{part}.type", part)
            if it is not None:
                self.items[part] = it
        # underwear: a top and a bottom, optionally a matching set
        if not self.dropped("underwear"):
            top = None if self.dropped("underwear", "top_type") else self.make_item("underwear", "underwear.top_type", "under_top")
            if top is not None:
                self.items["under_top"] = top
            if not self.dropped("underwear", "bottom_type"):
                matching = bool(self.r.get("underwear.matching")) and top is not None
                share = {"color": getattr(top, "color", ""), "color_tag": getattr(top, "color_tag", ""), "material": getattr(top, "material", ""), "material_tag": getattr(top, "material_tag", "")} if matching else None
                bottom = self.make_item("underwear", "underwear.bottom_type", "under_bottom", share=share, matching=matching)
                if bottom is not None:
                    if matching:
                        bottom.phrase = "matching " + bottom.noun
                        bottom.matching = True
                    self.items["under_bottom"] = bottom
        # accessories
        if not self.dropped("accessories"):
            metal = self.option("accessories.metal")
            cloth = self.option("accessories.color")
            for name in ACC:
                pid = f"accessories.{name}"
                for o in (self.options(pid) if name == "extras" else [self.option(pid)]):
                    if o is None:
                        continue
                    if o.get("custom"):
                        noun = strip_article(self.custom.get(pid, "")) or "item"
                        o = {"id": "custom", "noun": noun, "tag": noun, "covers": [], "custom": True}
                    noun = o.get("noun") or o.get("label", "").lower()
                    col = ""
                    if o.get("metal") and metal:
                        col, ctag = self.words("accessories.metal", metal), metal.get("tag") or ""
                    elif o.get("color") and cloth:
                        col, ctag = self.words("accessories.color", cloth), (cloth.get("tag") or "")
                    else:
                        ctag = ""
                    body = f"{col} {noun}".strip()
                    plural = bool(o.get("plural"))
                    phrase = body if plural or body.startswith("several") else with_article(body)
                    tags = [f"{ctag} {o['tag']}".strip() if (ctag and o.get("tag")) else (o.get("tag") or "")]
                    it = Item("accessories", pid, o, noun, phrase, plural, [t for t in tags if t], o.get("covers") or [], [])
                    self.items[f"acc:{pid}:{o['id']}"] = it
        # an outer garment alone also hides the front of the body
        inner = self.items.get("top") or self.items.get("onepiece")
        outer = self.items.get("outer")
        if outer is not None and inner is None:
            outer.covers |= {"chest", "breasts", "nipples", "belly"}
        # bare areas show the body through the clothes
        for o in self.bare:
            for it in self.items.values():
                it.covers -= set(o.get("uncover") or [])
        # states take covers away
        for it in self.items.values():
            for s in it.states:
                u = s.get("uncover")
                if u == "all":
                    it.covers = set()
                elif u:
                    it.covers -= set(u)
        # a state needs something to talk about: "Her top is unbuttoned" with no top chosen
        for part in ("top", "outer", "onepiece", "bottom", "legwear"):
            key = part
            if key in self.items or self.dropped(part) or f"{part}.state" not in self.schema.params:
                continue
            sts = self.options(f"{part}.state")
            if sts:
                noun = self.slot_def(part).get("noun", part)
                it = Item(part, f"{part}.type", {}, noun, "", bool(self.slot_def(part).get("plural")), [], [], sts, ghost=True)
                self.items[key] = it
        if not self.dropped("underwear"):
            sts = self.options("underwear.state")
            if sts and "under_top" not in self.items and "under_bottom" not in self.items:
                self.items["under_bottom"] = Item("underwear", "underwear.bottom_type", {}, "underwear", "", True, [], [], sts, ghost=True)

    # ---------------------------------------------------------------- covers
    def covers(self):
        out = set()
        for it in self.items.values():
            if not it.ghost:
                out |= it.covers
        return sorted(out)

    # ---------------------------------------------------------------- style words
    def style_words(self):
        adjs = []
        pal = self.option("style.palette")
        if pal:
            adjs.append(pal.get("adj") or pal.get("label", "").lower())
        adjs += [o.get("adj") or o.get("label", "").lower() for o in self.options("style.styles")]
        return adjs

    def style_phrase(self, article=True):
        adjs = self.style_words()
        if not adjs:
            return ""
        if self.options("style.styles") and len(adjs) > 1:
            pal = self.option("style.palette")
            if pal:
                # "an all-black cyberpunk and steampunk outfit"
                head, rest = adjs[0], adjs[1:]
                body = f"{head} {join_list(rest)} outfit"
            else:
                body = f"{join_list(adjs)} outfit"
        else:
            body = f"{' '.join(adjs)} outfit"
        return with_article(body) if article else body

    def style_tags(self):
        out = [o.get("tag") for o in self.options("style.styles") if o.get("tag")]
        pal = self.option("style.palette")
        if pal and pal.get("tag"):
            out.append(pal["tag"])
        return out

    # ---------------------------------------------------------------- Create
    def pieces(self):
        """The parts of the Create text: main list, underwear list, accessories list."""
        it = self.items
        vis = lambda k: it.get(k) if it.get(k) is not None and not it[k].ghost else None
        ph = []
        inner = vis("onepiece") or vis("top")
        outer = vis("outer")
        if outer and inner:
            ph.append(f"{outer.phrase} over {inner.phrase}")
        elif outer or inner:
            ph.append((outer or inner).phrase)
        if vis("onepiece") is None and vis("bottom"):
            ph.append(vis("bottom").phrase)
        barefoot = False
        for k in ("legwear", "footwear", "hands", "head"):
            x = vis(k)
            if x is None:
                continue
            if x.opt.get("barefoot"):
                barefoot = True
            else:
                ph.append(x.phrase)
        under = [it[k].phrase for k in ("under_top", "under_bottom") if vis(k)]
        acc = [x.phrase for k, x in it.items() if k.startswith("acc:") and not x.ghost]
        return ph, under, acc, barefoot

    def exposure_sentence(self, rest):
        e = self.exposure
        if not e or not e.get("text"):
            return ""
        if "{rest}" in e["text"]:
            if not rest:
                return "{Pron} {is} completely nude."
            return e["text"].replace("{rest}", join_list(rest))
        return e["text"]

    def bare_sentences(self):
        return [o["text"] for o in self.bare if o.get("text")]

    def state_sentences(self):
        out = []
        for key in ("top", "outer", "onepiece", "bottom", "under_top", "under_bottom", "legwear"):
            x = self.items.get(key)
            if x is None or not x.states:
                continue
            texts = [s.get("text") for s in x.states if s.get("text")]
            if texts:
                noun = x.noun if not x.ghost else x.noun
                out.append(f"{{Pos}} {noun} {x.be} {join_list(texts)}.")
        return out

    def create(self):
        """(template natural text, tags list)"""
        ph, under, acc, barefoot = self.pieces()
        sty = self.style_phrase()
        only_under = bool(self.exposure and self.exposure.get("only_underwear"))
        if self.exposure and self.exposure.get("keeps"):
            # "nude except for ...": the one sentence says what is left on
            lines = [self.exposure_sentence(ph + acc)] + ([("{Pron} {is} barefoot.")] if barefoot else [])
            return " ".join(lines), self.tags()
        lines = []
        main = list(ph)
        if only_under and under:
            lines.append("{Pron} {is} wearing only " + join_list(under + main) + ".")
            under_used = True
        else:
            under_used = False
            if main:
                lines.append("{Pron} {is} wearing " + (f"{sty}: " if sty else "") + join_list(main) + ".")
            elif sty and not under and not acc:
                lines.append("{Pron} {is} wearing " + sty + ".")
            elif sty:
                lines.append("{Pron} {is} wearing " + sty + ".")
        if under and not under_used:
            lines.append(("Underneath, {pron} {is} wearing " if main else "{Pron} {is} wearing only ") + join_list(under) + ".")
        if acc:
            lines.append("{Pron} {is} " + ("also " if (main or under) else "") + "wearing " + join_list(acc) + ".")
        if barefoot:
            lines.append("{Pron} {is} barefoot.")
        lines += self.state_sentences()
        e = self.exposure_sentence(ph + acc)  # what is left on for "nude except for ..."
        if e:
            lines.append(e)
        lines += self.bare_sentences()
        lines = unique(lines)
        tags = self.tags()
        return " ".join(lines), tags

    def tags(self):
        out = list(self.style_tags())
        for x in self.items.values():
            if x.ghost:
                for s in x.states:
                    if s.get("tag"):
                        out.append(s["tag"])
                continue
            out += x.tags
            for s in x.states:
                if s.get("tag"):
                    out.append(s["tag"])
        if self.exposure and self.exposure.get("tag"):
            out.append(self.exposure["tag"])
        for o in self.bare:
            out += [t.strip() for t in (o.get("tag") or "").split(",") if t.strip()]
        return unique([t for t in out if t])

    # ---------------------------------------------------------------- Edit
    def op(self, pid):
        return self.ops.get(pid, "add") if self.ops.get(pid) in ("add", "replace", "remove") else "add"

    def attr_words(self, part):
        at = self.attrs(part)
        out = []
        for n in ("fit", "color", "pattern", "material"):
            pid, o = at[n]
            if o is None or o.get("silent"):
                continue
            out.append(self.words(pid, o))
        return [x for x in out if x]

    def edit(self):
        """(instruction sentences with tokens, touched slots)"""
        out, touched = [], []
        sty = self.style_phrase()
        acted = False
        type_pids = []
        for part in SLOTS:
            if part == "underwear":
                type_pids += [(part, "underwear.top_type"), (part, "underwear.bottom_type")]
            elif part == "accessories":
                type_pids += [(part, f"accessories.{n}") for n in ACC]
            else:
                type_pids.append((part, f"{part}.type"))
        sentences = []
        for part, tpid in type_pids:
            sd = self.slot_def(part)
            op = self.op(tpid)
            if self.dropped(part) or (part == "underwear" and self.dropped("underwear", tpid.split(".")[1])):
                continue
            key = {"underwear.top_type": "under_top", "underwear.bottom_type": "under_bottom"}.get(tpid, part)
            if part == "accessories":
                cands = [x for k, x in self.items.items() if k.startswith(f"acc:{tpid}:")]
            else:
                cands = [self.items[key]] if key in self.items and not self.items[key].ghost else []
            noun = sd.get("noun", part)
            if part == "accessories":
                noun = ACC_NOUN[tpid.split(".")[1]]
            if op == "remove":
                if cands:
                    sentences.append((part, "Remove {pos} " + join_list([c.noun for c in cands]) + "."))
                else:
                    t = sd.get("remove", "Remove {pos} {item}.")
                    sentences.append((part, t.replace("{item}", noun)))
                continue
            if cands:
                item = join_list([c.phrase for c in cands])
                t = sd.get("replace" if op == "replace" else "add", "Add {item}.")
                sentences.append((part, t.replace("{item}", item)))
                acted = True
            elif part != "accessories":
                words = self.attr_words(part)
                if words and sd.get("change"):
                    pid_c, copt = self.attrs(part)["color"]
                    if len(words) == 1 and copt is not None:
                        sentences.append((part, f"Change the color of {{pos}} {noun} to {words[0]}."))
                    else:
                        sentences.append((part, sd["change"].replace("{attrs}", " ".join(words))))
        # states
        for key in ("top", "outer", "onepiece", "bottom", "under_top", "under_bottom", "legwear"):
            x = self.items.get(key)
            if not x or not x.states:
                continue
            part = x.slot
            if self.op(f"{part}.type" if key not in ("under_top", "under_bottom") else f"underwear.{'top_type' if key == 'under_top' else 'bottom_type'}") == "remove":
                continue
            for s in x.states:
                if s.get("edit"):
                    sentences.append((part, s["edit"].replace("{noun}", x.noun)))
        # exposure
        e = self.exposure
        if e:
            rest = [x.phrase for k, x in self.items.items() if not x.ghost and not k.startswith("under")]
            t = e.get("edit") or ""
            if "{rest}" in t and not rest:
                t = "Remove all of {pos} clothes, leaving {obj} completely nude."
            sentences.append(("exposure", t.replace("{rest}", join_list(rest))))
        for o in self.bare:
            if o.get("edit"):
                sentences.append(("exposure", o["edit"]))
        if sty and acted:
            out.append(f"Give {{obj}} {sty}.")
        for part, s in sentences:
            out.append(s)
            if part not in touched:
                touched.append(part)
        return out, touched

    def simple(self):
        """The simple Edit form: "Change her outfit to ..."."""
        ph, under, acc, barefoot = self.pieces()
        sty = self.style_phrase()
        core = join_list(ph)
        if under:
            core = f"{core}, with {join_list(under)} underneath" if core else f"{join_list(under)} only"
        if acc:
            core = f"{core}, plus {join_list(acc)}" if core else join_list(acc)
        if barefoot:
            core = f"{core}, barefoot" if core else "barefoot"
        if not core and not sty and not self.exposure and not self.bare:
            return [], []
        out = []
        if core or sty:
            out.append("Change {pos} outfit to " + (f"{sty}" + (f": {core}" if core else "") if sty else core) + ".")
        out += self.state_sentences()
        e = self.exposure_sentence([x.phrase for k, x in self.items.items() if not x.ghost and not k.startswith("under")])
        if e:
            out.append(e)
        out += self.bare_sentences()
        return unique(out), ["outfit"]

    def tail(self, touched):
        if not touched:
            return ""
        return "Keep {pos} face, hair, body and pose the same, along with the rest of {pos} clothing, the background, the lighting and the camera angle."


def build_outfit(schema, st, seed):
    """(resolved, picked, bundle fields) for a parsed state."""
    resolved, picked = resolve(schema, st, int(seed))
    t = OutfitText(schema, resolved, st, seed)
    tpl, tags = t.create()
    full, touched = t.edit()
    simple, simple_touched = t.simple()
    edit_text = " ".join(full)
    simple_text = " ".join(simple)
    pron = t.pron
    tags_text = ", ".join(tags)
    fields = {
        "template": tpl,
        "tags": tags_text,
        "text": fill_pron(tpl, pron),
        "edit": edit_text,
        "edit_simple": simple_text,
        "covers": t.covers(),
        "touched": touched,
    }
    return resolved, picked, t, fields


class NDOutfitBuilder:
    CATEGORY = "Neural Dreamer/Prompt"
    DESCRIPTION = (
        "Builds an outfit description: pick a slot on the left (head, top, outerwear, one-piece, bottom, "
        "underwear, legwear, footwear, gloves, accessories) and set its items. Any parameter can be random "
        "(picked with the seed). Input: an optional parameters wire with 'seed'. The output bundle holds the "
        "outfit text and an 'outfit' field for the Character Builder (Pack Parameters: 'outfit')."
    )
    RETURN_TYPES = (PARAMS,)
    RETURN_NAMES = ("params",)
    FUNCTION = "build"
    SEARCH_ALIASES = ["outfit builder", "outfit", "clothes", "clothing", "wardrobe", "fashion"]

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"state": ("STRING", {"default": json.dumps(DEFAULT_STATE)})},
            "optional": {"params": (PARAMS,)},
        }

    def build(self, state, params=None):
        seed = 0
        if isinstance(params, dict) and params.get("seed") is not None:
            try:
                seed = int(params["seed"]) % (MAX_SEED + 1)
            except (TypeError, ValueError):
                log.warning("[Neural Dreamer] Outfit Builder: seed on the input is not a number: %r", params["seed"])
        schema = load_schema(OUTFIT_PATH)
        st = parse_state(state)
        if not st["enabled"]:
            st = blank_state(st, DEFAULT_STATE)
        resolved, picked, t, f = build_outfit(schema, st, seed)
        extra = st.get("extra", "")
        mode = st["mode"]
        if mode == "edit":
            lines = f["edit_simple"] if st.get("edit_style") == "simple" else f["edit"]
            touched = f["touched"] if st.get("edit_style") != "simple" else (["outfit"] if f["edit_simple"] else [])
            tail = t.tail(touched) if st.get("edit_keep", True) else ""
            text = paragraphs(fill_pron(lines, t.pron), fill_pron(tail, t.pron), extra)
        else:
            text = paragraphs(compose(f["text"], f["tags"].split(", ") if f["tags"] else [], st), extra)
        outfit = NDParams({
            "version": 2,
            "text": f["text"],
            "tags": f["tags"],
            "template": f["template"],
            "edit": f["edit"],
            "edit_simple": f["edit_simple"],
            "covers": f["covers"],
            "mode": mode,
            "touched": f["touched"],
        })
        bundle = NDParams({"Outfit": text, "outfit": outfit})
        return {"ui": {"nd_character": [{"seed": int(seed), "picked": picked}]}, "result": (bundle,)}


NODE_CLASS_MAPPINGS = {"NDOutfitBuilder": NDOutfitBuilder}
NODE_DISPLAY_NAME_MAPPINGS = {"NDOutfitBuilder": "ND Outfit Builder"}
