"""Pose presets of ND Pose Builder: a preset sets other parameters ("sets"). Used by make_pose_data.py."""

CATS = [
    ("photo", "Photoshoot", False),
    ("natural", "Natural", False),
    ("sitting", "Sitting", False),
    ("lying", "Lying", False),
    ("action", "Heroic & Action", False),
    ("dance", "Dance & Fitness", False),
    ("sensual", "Sensual", False),
    ("explicit", "Explicit", True),
    ("masturbation", "Masturbation", True),
]

KEYS = {
    "base": "posture.base", "surf": "posture.surface", "face": "posture.facing", "torso": "torso.shape",
    "tilt": "head.tilt", "gaze": "head.gaze", "expr": "head.expression", "both": "arms.both",
    "h1": "arms.hand1", "h2": "arms.hand2", "prop": "arms.prop", "legs": "legs.pose", "feet": "legs.feet",
    "act1": "pleasure.act1", "act2": "pleasure.act2", "pbody": "pleasure.body", "clothes": "pleasure.clothes",
    "inten": "pleasure.intensity", "toys": "toys.items", "tcol": "toys.color", "fluids": "fluids.items",
    "angle": "view.angle", "frame": "view.framing",
}
CORE_ORDER = ["legs", "torso", "act1", "pbody", "toys", "both", "h1", "surf"]

PRESETS = []


def P(cat, group, id, label, base, lead="", tag="", x=False, anat=(), any_of=(), hint="", tl=None, fl=None, **kw):
    sets = {"posture.base": base}
    for k, v in kw.items():
        sets[KEYS[k]] = v
    core = ["posture.base"] + [KEYS[k] for k in CORE_ORDER if k in kw][:2]
    d = {"id": f"{cat}_{id}", "label": label, "cat": cat, "group": group, "icon": base, "sets": sets, "core": core}
    if lead:
        d["lead"] = lead
    if tag:
        d["tag"] = tag
    if x or CATS_X.get(cat):
        d["explicit"] = True
    if anat:
        d["anatomy"] = list(anat)
    if any_of:
        d["anatomy_any"] = list(any_of)
    if hint:
        d["hint"] = hint
    levels = {}
    if tl:
        levels["toys.items"] = tl
    if fl:
        levels["fluids.items"] = fl
    if levels:
        d["sets_levels"] = levels
    PRESETS.append(d)


CATS_X = {c: x for c, _, x in CATS}

# ------------------------------------------------------------------ Photoshoot
c = "photo"
P(c, "Standing", "contrapposto", "Contrapposto", "standing", face="camera", torso=["hip_cock"], h1="hip", h2="hair", gaze="camera", expr="confident", frame="full", lead="in a relaxed model pose")
P(c, "Standing", "hip_hand", "One hand on hip", "standing", face="three_q", h1="hip", legs="crossed", gaze="camera", expr="smile", frame="cowboy")
P(c, "Standing", "hips_both", "Hands on hips", "standing", face="camera", both="hips", legs="apart", gaze="camera", expr="confident", frame="full")
P(c, "Standing", "arms_crossed", "Arms crossed", "standing", face="camera", both="crossed", legs="apart", gaze="camera", expr="serious", frame="waist")
P(c, "Standing", "pockets", "Hands in pockets", "standing", face="three_q", h1="pocket", h2="pocket", gaze="away", expr="serious", frame="cowboy", lead="in a casual pose")
P(c, "Standing", "wall_lean", "Leaning on a wall", "standing", surf="wall", face="three_q", legs="crossed", h1="pocket", gaze="camera", expr="smirk", frame="full")
P(c, "Standing", "over_shoulder", "Over the shoulder", "standing", face="back", gaze="shoulder", torso=["hip_cock"], h1="hair", expr="seductive", frame="cowboy")
P(c, "Standing", "walking_cam", "Walking to camera", "walking", face="camera", gaze="camera", expr="confident", both="hips", frame="full", lead="in a confident stride")
P(c, "Standing", "catwalk", "Catwalk stride", "walking", face="camera", legs="knee_fwd", h1="hip", gaze="camera", expr="serious", torso=["chest_out"], frame="full", lead="in a catwalk stride")
P(c, "Standing", "hair_flip", "Hair flip", "standing", face="three_q", both="in_hair", tilt="back", gaze="closed", expr="laugh", frame="waist")
P(c, "Standing", "hair_touch", "Hand in hair", "standing", face="camera", h1="hair", h2="hip", gaze="camera", expr="playful", frame="waist")
P(c, "Standing", "chin_hand", "Hand on chin", "standing", face="three_q", h1="chin", h2="hip", tilt="side", gaze="camera", expr="smile", frame="waist")
P(c, "Standing", "s_curve", "S-curve", "standing", face="three_q", torso=["hip_cock", "arched"], legs="crossed", both="behind_head", gaze="camera", expr="seductive", frame="full", lead="in an elegant S-curve")
P(c, "Standing", "profile", "Profile", "standing", face="profile", gaze="away", expr="serious", tilt="up", frame="waist")
P(c, "Standing", "back_view", "Back to camera", "standing", face="back", gaze="shoulder", h1="hip", frame="full")
P(c, "Standing", "power", "Power pose", "standing", face="camera", legs="wide", both="hips", torso=["chest_out"], gaze="camera", expr="fierce", angle="low", frame="full", lead="in a power pose")
P(c, "Standing", "look_up", "Looking up", "standing", face="three_q", gaze="up", tilt="back", h1="chest", expr="serious", frame="waist")
P(c, "Standing", "lean_toward", "Leaning toward camera", "standing", face="camera", torso=["lean_fwd"], both="on_knees", gaze="camera", expr="playful", angle="high", frame="waist")
P(c, "Standing", "jacket_shoulder", "Jacket over the shoulder", "walking", face="three_q", h1="hip", gaze="away", expr="confident", frame="full", hint="Add an outerwear item in the Outfit Builder.")
P(c, "Standing", "peace", "Peace sign", "standing", face="camera", h1="peace", h2="hip", tilt="side", gaze="camera", expr="playful", frame="waist")

# --------------------------------------------------------------------- Natural
c = "natural"
P(c, "Everyday", "relaxed", "Relaxed standing", "standing", face="camera", both="hips", legs="apart", gaze="camera", expr="smile", frame="full")
P(c, "Everyday", "walking", "Walking", "walking", face="three_q", h1="pocket", gaze="away", expr="smile", frame="full")
P(c, "Everyday", "laughing", "Laughing", "standing", face="three_q", tilt="back", expr="laugh", gaze="closed", h1="mouth", frame="waist")
P(c, "Everyday", "selfie", "Taking a selfie", "standing", face="camera", prop="phone", tilt="side", expr="playful", gaze="camera", h2="peace", frame="waist")
P(c, "Everyday", "coffee", "Drinking coffee", "standing", face="three_q", prop="coffee", gaze="away", expr="smile", frame="waist")
P(c, "Everyday", "reading", "Reading a book", "sitting", surf="armchair", face="three_q", prop="book", gaze="down", legs="crossed", expr="serious", frame="cowboy")
P(c, "Everyday", "stretch_up", "Stretching up", "stretching", face="camera", both="raised", torso=["stretched"], gaze="closed", expr="smile", frame="full")
P(c, "Everyday", "tying_hair", "Tying the hair", "standing", face="back", both="behind_head", gaze="shoulder", frame="waist")
P(c, "Everyday", "waving", "Waving", "standing", face="camera", h1="wave", h2="hip", gaze="camera", expr="smile", frame="full")
P(c, "Everyday", "railing", "Leaning on a railing", "standing", surf="wall", face="three_q", torso=["lean_fwd"], gaze="away", expr="smile", frame="cowboy")
P(c, "Everyday", "chin_table", "Chin on hand", "sitting", surf="desk", face="three_q", h1="chin", tilt="side", gaze="camera", expr="smile", frame="waist")
P(c, "Everyday", "stairs_sit", "Sitting on stairs", "sitting", surf="stairs", face="three_q", both="on_knees", legs="together", gaze="camera", expr="smile", frame="full")
P(c, "Everyday", "grass_lie", "Lying in the grass", "lying_back", surf="grass", both="behind_head", legs="knees_up", gaze="up", expr="smile", angle="high", frame="full")
P(c, "Everyday", "hug_knees", "Hugging the knees", "sitting", surf="floor", legs="knees_up", both="hug_self", tilt="side", gaze="camera", expr="shy", frame="full")
P(c, "Everyday", "pillow_hug", "Hugging a pillow", "sitting", surf="sofa", prop="pillow", legs="tucked", gaze="camera", expr="smile", frame="full")
P(c, "Everyday", "dancing", "Casual dance", "standing", face="camera", both="raised", legs="apart", torso=["hip_cock"], gaze="closed", expr="laugh", frame="full")

# --------------------------------------------------------------------- Sitting
c = "sitting"
P(c, "On a seat", "chair_cross", "Crossed legs on a chair", "sitting", surf="chair", face="three_q", legs="crossed", h1="knee", gaze="camera", expr="confident", frame="full")
P(c, "On a seat", "chair_straddle", "Astride a chair", "straddle_chair", face="camera", both="stretched", gaze="camera", expr="smirk", frame="full", lead="resting {pos} arms on the backrest")
P(c, "On a seat", "armchair", "Reclining in an armchair", "sitting", surf="armchair", face="three_q", torso=["lean_back"], legs="crossed", h1="chin", gaze="camera", expr="confident", frame="full")
P(c, "On a seat", "stool", "On a stool", "sitting", surf="chair", face="three_q", legs="chair_foot", h1="knee", gaze="away", expr="serious", frame="full")
P(c, "On a seat", "desk_dangle", "On a desk, legs dangling", "sitting", surf="desk", face="three_q", h1="surface", h2="surface", legs="crossed", gaze="camera", expr="playful", frame="full")
P(c, "On a seat", "bed_edge", "Edge of the bed", "sitting", surf="bed_edge", face="three_q", both="on_knees", legs="together", gaze="down", expr="shy", frame="full")
P(c, "On a seat", "stairs_elbows", "Elbows on knees", "sitting", surf="stairs", torso=["lean_fwd"], both="on_knees", gaze="camera", expr="serious", frame="full")
P(c, "On the floor", "cross_legged", "Cross-legged", "sitting_cross", surf="floor", face="camera", both="on_knees", gaze="camera", expr="smile", frame="full")
P(c, "On the floor", "seiza", "Seiza", "sitting_heels", surf="floor", face="camera", both="on_thighs", torso=["chest_out"], gaze="camera", expr="serious", frame="full")
P(c, "On the floor", "side_sit", "Legs to one side", "sitting_side", surf="floor", face="three_q", h1="surface", h2="hair", gaze="camera", expr="smile", frame="full")
P(c, "On the floor", "wsit", "W-sit", "sitting", surf="floor", face="camera", legs="w_sit", both="on_thighs", gaze="camera", expr="shy", frame="full")
P(c, "On the floor", "knees_up", "Knees up, arms around", "sitting", surf="floor", legs="knees_up", both="hug_self", tilt="side", gaze="camera", expr="shy", frame="full")
P(c, "On the floor", "lean_hands", "Leaning back on hands", "sitting", surf="floor", both="planted", torso=["lean_back"], legs="stretched", gaze="camera", expr="smile", frame="full")
P(c, "On the floor", "lotus", "Lotus", "sitting_cross", surf="yoga_mat", face="camera", both="on_knees", gaze="closed", expr="serious", frame="full", lead="in a meditation pose")

# ----------------------------------------------------------------------- Lying
c = "lying"
P(c, "On the back", "back_arms_up", "Arms above the head", "lying_back", surf="bed", both="raised", legs="together", gaze="camera", expr="smile", angle="high", frame="full")
P(c, "On the back", "back_knee", "One knee up", "lying_back", surf="bed", legs="knees_up", h1="hair", gaze="camera", expr="seductive", angle="high", frame="full")
P(c, "On the back", "sprawled", "Sprawled out", "lying_back", surf="bed", both="stretched", legs="apart", gaze="up", expr="smile", angle="above", frame="full")
P(c, "On the back", "legs_wall", "Legs up the wall", "lying_back", surf="floor", legs="legs_up", both="behind_head", gaze="up", expr="laugh", frame="full", lead="with {pos} legs up against a wall")
P(c, "On the back", "head_hang", "Head over the edge", "lying_back", surf="bed_edge", tilt="back", both="raised", gaze="closed", expr="smile", frame="full")
P(c, "On the back", "sand", "On the sand", "lying_back", surf="sand", both="behind_head", legs="crossed", gaze="closed", expr="smile", angle="high", frame="full")
P(c, "On the stomach", "stomach_chin", "Chin in the hands", "lying_stomach", surf="bed", h1="chin", h2="chin", legs="kick", gaze="camera", expr="playful", frame="full")
P(c, "On the stomach", "stomach_back_look", "Looking back", "lying_stomach", surf="bed", torso=["arched"], legs="kick", gaze="shoulder", expr="seductive", frame="full")
P(c, "On the stomach", "stomach_book", "With a book", "lying_stomach", surf="sofa", prop="book", legs="crossed", gaze="down", expr="smile", frame="full")
P(c, "On the side", "side_head", "Head on the hand", "lying_side", surf="bed", h1="chin", h2="hip", legs="together", gaze="camera", expr="seductive", frame="full", lead="propped up on one elbow")
P(c, "On the side", "side_sofa", "Draped over the sofa", "lying_side", surf="sofa", both="stretched", legs="crossed", gaze="camera", expr="smirk", frame="full")
P(c, "On the side", "curled", "Curled up", "lying_side", surf="bed", torso=["curled"], both="hug_self", gaze="closed", expr="smile", frame="full")
P(c, "Reclining", "elbows", "On the elbows", "reclining", surf="bed", legs="crossed", torso=["chest_out"], gaze="camera", expr="seductive", frame="full")
P(c, "Reclining", "reclined_grass", "Reclining on the grass", "reclining", surf="grass", legs="stretched", gaze="away", expr="smile", frame="full")

# ------------------------------------------------------------ Heroic & Action
c = "action"
P(c, "Heroic", "landing", "Superhero landing", "kneeling_one", face="camera", h1="ground", h2="fist", torso=["lean_fwd"], gaze="camera", expr="fierce", angle="low", frame="full", lead="in a superhero landing")
P(c, "Heroic", "stance", "Heroic stance", "standing", face="camera", legs="wide", both="hips", torso=["chest_out"], gaze="camera", expr="fierce", angle="low", frame="full")
P(c, "Heroic", "cape", "Fists on hips", "standing", face="camera", legs="wide", both="hips", gaze="away", expr="confident", angle="low", frame="full", lead="as if a cape billows behind {obj}")
P(c, "Heroic", "sword_raised", "Sword raised", "standing", face="three_q", prop="sword", h2="up", legs="wide", gaze="up", expr="fierce", angle="low", frame="full")
P(c, "Heroic", "sword_draw", "Drawing a sword", "standing", face="three_q", h1="hilt", legs="lunge", gaze="camera", expr="fierce", frame="full")
P(c, "Heroic", "sword_planted", "Kneeling on a sword", "kneeling_one", face="camera", prop="sword", h2="ground", tilt="down", gaze="down", expr="serious", frame="full")
P(c, "Heroic", "gaze_far", "Gazing into the distance", "standing", face="back", h1="forward", legs="apart", gaze="away", expr="serious", frame="full")
P(c, "Heroic", "back_to_back", "Guarding stance", "standing", face="three_q", prop="sword", legs="lunge", gaze="side", expr="fierce", frame="full")
P(c, "Action", "aim_gun", "Aiming a gun", "standing", face="three_q", prop="gun", h2="forward", legs="apart", gaze="camera", expr="fierce", frame="full")
P(c, "Action", "gun_ready", "Gun at the ready", "crouching", face="three_q", prop="gun", legs="lunge", gaze="side", expr="serious", frame="full")
P(c, "Action", "archer", "Drawing a bow", "standing", face="profile", prop="bow", h2="forward", legs="wide", gaze="side", expr="serious", frame="full")
P(c, "Action", "cast", "Casting a spell", "standing", face="camera", h1="cast", h2="up", legs="wide", gaze="camera", expr="fierce", angle="low", frame="full")
P(c, "Action", "fighter", "Fighting stance", "standing", face="three_q", h1="fist", h2="fist", legs="wide", torso=["lean_fwd"], gaze="camera", expr="fierce", frame="full")
P(c, "Action", "jump", "Mid-air jump", "jumping", face="camera", both="stretched", legs="knees_up", expr="laugh", gaze="camera", angle="low", frame="full")
P(c, "Action", "sprint", "Sprinting", "running", face="three_q", torso=["lean_fwd"], gaze="side", expr="fierce", frame="full")
P(c, "Action", "high_kick", "High kick", "jumping", face="three_q", legs="high_kick", h1="fist", expr="fierce", gaze="camera", frame="full")
P(c, "Action", "punch", "Punching", "standing", face="three_q", h1="forward", h2="fist", legs="lunge", expr="fierce", gaze="camera", frame="full")
P(c, "Action", "crouch_spring", "Ready to spring", "crouching", face="three_q", h1="ground", legs="wide", gaze="camera", expr="fierce", frame="full")

# ------------------------------------------------------------ Dance & Fitness
c = "dance"
P(c, "Dance", "arabesque", "Arabesque", "standing", face="profile", legs="arabesque", both="stretched", tilt="up", gaze="away", expr="serious", feet="pointed", frame="full")
P(c, "Dance", "pirouette", "Twirl", "standing", face="three_q", legs="tree", both="raised", tilt="back", gaze="closed", expr="smile", frame="full")
P(c, "Dance", "splits_front", "Front splits", "sitting", surf="floor", legs="split_front", both="raised", gaze="camera", expr="confident", feet="pointed", frame="full")
P(c, "Dance", "splits_side", "Side splits", "sitting", surf="floor", face="camera", legs="split_side", both="stretched", gaze="camera", expr="confident", frame="full")
P(c, "Dance", "dance_twirl", "Mid-dance twirl", "jumping", face="three_q", both="stretched", legs="knees_up", expr="laugh", gaze="closed", frame="full")
P(c, "Dance", "pole_spin", "Pole spin", "standing", surf="pole", prop="pole", legs="one_up", torso=["arched"], gaze="camera", expr="seductive", frame="full")
P(c, "Yoga & Fitness", "warrior", "Warrior pose", "standing", surf="yoga_mat", face="profile", legs="warrior", both="stretched", gaze="side", expr="serious", frame="full")
P(c, "Yoga & Fitness", "downdog", "Downward dog", "downdog", surf="yoga_mat", face="profile", gaze="down", expr="serious", feet="planted", frame="full")
P(c, "Yoga & Fitness", "tree", "Tree pose", "standing", surf="yoga_mat", face="camera", legs="tree", both="raised", gaze="camera", expr="serious", frame="full")
P(c, "Yoga & Fitness", "bridge", "Bridge", "bridge", surf="yoga_mat", face="profile", gaze="up", expr="serious", frame="full")
P(c, "Yoga & Fitness", "mat_stretch", "Stretching on the mat", "sitting", surf="yoga_mat", legs="stretched", torso=["lean_fwd"], both="stretched", gaze="down", expr="serious", frame="full")
P(c, "Yoga & Fitness", "lunge", "Lunge", "standing", face="three_q", legs="lunge", both="hips", gaze="camera", expr="confident", frame="full")

# --------------------------------------------------------------------- Sensual
c = "sensual"
P(c, "Pin-up", "pinup", "Classic pin-up", "kneeling", surf="bed", face="three_q", torso=["arched", "hip_cock"], h1="hair", h2="hip", gaze="camera", expr="seductive", frame="full", lead="in a classic pin-up pose", tag="pin-up")
P(c, "Pin-up", "pinup_side", "Pin-up on the side", "lying_side", surf="bed", legs="crossed", h1="chin", h2="hip", torso=["hip_cock"], gaze="camera", expr="seductive", frame="full", lead="in a pin-up pose")
P(c, "Pin-up", "pinup_kick", "Legs kicked up", "lying_stomach", surf="bed", legs="kick", h1="chin", h2="chin", gaze="camera", expr="playful", frame="full", lead="in a playful pin-up pose")
P(c, "Pin-up", "pinup_stretch", "Stretched on the sofa", "reclining", surf="sofa", legs="crossed", both="behind_head", torso=["arched"], gaze="camera", expr="seductive", frame="full")
P(c, "Boudoir", "kneel_hair", "Kneeling, hands in hair", "kneeling", surf="bed", both="in_hair", torso=["arched"], tilt="back", gaze="closed", expr="seductive", frame="full")
P(c, "Boudoir", "heels_arch", "On the heels, arched", "sitting_heels", surf="bed", both="on_thighs", torso=["arched", "chest_out"], gaze="camera", expr="lip_bite", frame="full")
P(c, "Boudoir", "look_back", "Looking back", "bending", face="back", torso=["arched", "butt_out"], h1="hip", gaze="shoulder", expr="seductive", frame="full")
P(c, "Boudoir", "wall_knee", "Against the wall, knee up", "standing", surf="wall", face="three_q", legs="one_up", torso=["hip_cock"], h1="hair", gaze="camera", expr="seductive", frame="full")
P(c, "Boudoir", "covering", "Covering with the hands", "standing", face="three_q", both="cover_breasts", legs="crossed", tilt="side", gaze="camera", expr="shy", frame="waist", hint="Works best with a topless or nude outfit.")
P(c, "Boudoir", "sheet", "Draped in a sheet", "lying_side", surf="bed", h1="hem", torso=["curled"], gaze="camera", expr="seductive", frame="full", hint="Add the sheet in the prompt or in the Extra prompt.")
P(c, "Boudoir", "finger_bite", "Biting a finger", "reclining", surf="bed", h1="lips", legs="crossed", gaze="camera", expr="lip_bite", frame="waist")
P(c, "Boudoir", "stocking", "Rolling down a stocking", "sitting", surf="bed_edge", torso=["lean_fwd"], h1="thigh", legs="one_up", gaze="down", expr="seductive", frame="full")
P(c, "Boudoir", "bra_unhook", "Unhooking the bra", "standing", face="back", both="behind_back", gaze="shoulder", expr="seductive", frame="waist")
P(c, "Boudoir", "bath_leg", "In the bath, leg raised", "sitting", surf="bathtub", legs="one_up", h1="hair", gaze="camera", expr="seductive", frame="waist")
P(c, "Boudoir", "chair_back", "Backwards on a chair", "straddle_chair", face="camera", torso=["lean_fwd"], gaze="camera", expr="seductive", frame="full")
P(c, "Boudoir", "all_fours_look", "On all fours, looking back", "all_fours", surf="bed", face="back", torso=["arched", "butt_out"], gaze="shoulder", expr="seductive", frame="full")
P(c, "Boudoir", "bed_arch", "Arching on the bed", "lying_back", surf="bed", torso=["arched"], both="raised", legs="together", gaze="closed", expr="seductive", angle="high", frame="full")
P(c, "Boudoir", "twerk", "Twerk stance", "bending", face="back", torso=["butt_out"], both="on_knees", legs="wide", gaze="shoulder", expr="playful", frame="full")
P(c, "Boudoir", "shirt_pull", "Pulling the shirt up", "standing", face="camera", h1="hem", h2="hip", gaze="camera", expr="seductive", frame="waist")
P(c, "Boudoir", "whisper", "Whispering to the camera", "kneeling", surf="bed", torso=["lean_fwd"], h1="lips", gaze="camera", expr="seductive", angle="high", frame="portrait")
P(c, "Boudoir", "mirror_pose", "At the mirror", "standing", surf="mirror", face="three_q", torso=["hip_cock"], h1="hair", gaze="camera", expr="seductive", frame="full")

# -------------------------------------------------------------------- Explicit
c = "explicit"
P(c, "Seated", "seat_spread", "Seated, legs spread", "sitting", surf="bed_edge", face="camera", legs="spread", both="planted", gaze="camera", expr="seductive", frame="full")
P(c, "Seated", "m_display", "M-legs display", "sitting", surf="bed", face="camera", legs="m_legs", both="planted", gaze="camera", expr="lip_bite", angle="eye", frame="full")
P(c, "Seated", "armrests", "Legs over the armrests", "sitting", surf="armchair", legs="armrests", torso=["lean_back"], gaze="camera", expr="seductive", frame="full")
P(c, "Seated", "chair_foot", "Foot on a chair", "sitting", surf="chair", legs="chair_foot", both="planted", gaze="camera", expr="seductive", frame="full")
P(c, "Seated", "hands_open", "Holding the legs open", "sitting", surf="bed", legs="spread", both="spread_legs", gaze="camera", expr="seductive", frame="full")
P(c, "Seated", "lean_hands", "Leaning back, knees apart", "kneeling", surf="bed", legs="knees_apart", both="planted", torso=["lean_back", "arched"], gaze="camera", expr="lip_bite", frame="full")
P(c, "Seated", "mirror_open", "Mirror display", "sitting", surf="mirror", legs="m_legs", both="planted", gaze="own_body", expr="seductive", frame="full", lead="watching {obj}self in the mirror")
P(c, "Lying", "back_v", "Lying back, legs in a V", "lying_back", surf="bed", legs="v_legs", both="hold_breasts", gaze="camera", expr="seductive", angle="high", frame="full")
P(c, "Lying", "back_hips", "Hips raised", "hips_up", surf="bed", legs="legs_up", gaze="camera", expr="lip_bite", frame="full")
P(c, "Lying", "behind_head", "Legs behind the head", "lying_back", surf="bed", legs="behind_head", gaze="camera", expr="seductive", frame="full")
P(c, "Lying", "side_leg", "Side, leg lifted high", "lying_side", surf="bed", legs="leg_high", h1="chin", gaze="camera", expr="seductive", frame="full")
P(c, "Lying", "face_down", "Face down, ass up", "lying_stomach", surf="bed", torso=["arched", "butt_out"], legs="knees_apart", gaze="shoulder", expr="seductive", frame="full")
P(c, "Lying", "pillow", "Straddling a pillow", "lying_side", surf="bed", legs="pillow_wrap", torso=["arched"], gaze="closed", expr="lip_bite", frame="full")
P(c, "Back view", "all_fours_present", "Presenting on all fours", "all_fours", surf="bed", face="back", torso=["arched", "butt_out"], gaze="shoulder", expr="seductive", frame="full", angle="behind")
P(c, "Back view", "spread_butt", "Spreading the cheeks", "bending", face="back", both="spread_butt", torso=["butt_out"], gaze="shoulder", expr="seductive", frame="full", angle="behind")
P(c, "Back view", "bend_wall", "Bent over, hands on the wall", "bending", surf="wall", face="back", torso=["butt_out", "arched"], legs="wide", gaze="shoulder", expr="pant", frame="full", angle="behind")
P(c, "Back view", "kneel_back", "Kneeling, looking back", "kneeling", surf="bed", face="back", torso=["arched"], gaze="shoulder", expr="lip_bite", frame="full")
P(c, "Showing off", "squat_wide", "Squatting, knees wide", "squatting", face="camera", legs="knees_apart", both="on_knees", gaze="camera", expr="seductive", frame="full")
P(c, "Showing off", "kneel_open", "Kneeling, knees apart", "kneeling", surf="bed", face="camera", legs="knees_apart", both="on_thighs", torso=["chest_out"], gaze="camera", expr="lip_bite", frame="full")
P(c, "Showing off", "stand_open", "Standing, hands behind the head", "standing", face="camera", legs="wide", both="behind_head", torso=["chest_out"], gaze="camera", expr="confident", frame="full")
P(c, "Showing off", "breast_hold", "Holding the breasts up", "standing", face="camera", both="hold_breasts", gaze="camera", expr="seductive", frame="waist", anat=["breasts"])
P(c, "Showing off", "penis_show", "Showing the penis", "standing", face="camera", legs="apart", both="hips", gaze="camera", expr="confident", frame="full", anat=["penis"], hint="Needs a character with a penis.")
P(c, "Showing off", "penis_rest", "Penis on the thigh", "sitting", surf="bed_edge", legs="spread", both="planted", gaze="camera", expr="smirk", frame="full", anat=["penis"], hint="Needs a character with a penis.")
P(c, "Showing off", "shower_arch", "Arching in the shower", "standing", surf="shower", face="three_q", torso=["arched"], both="behind_head", tilt="back", gaze="closed", expr="pant", fl=None, fluids=["sweat"], tl=None, frame="full")

# --------------------------------------------------------------- Masturbation
c = "masturbation"
G = "Vulva"
P(c, G, "clit_back", "Lying back, rubbing", "lying_back", surf="bed", legs="m_legs", act1="clit_rub", h2="hair", gaze="closed", expr="moan", inten="aroused", anat=["vulva"], frame="full", angle="high")
P(c, G, "fingers_breast", "Two fingers, hand on a breast", "lying_back", surf="bed", legs="spread", act1="finger2", act2="squeeze", gaze="closed", expr="moan", inten="intense", anat=["vulva", "breasts"], frame="full", angle="high")
P(c, G, "spread_open", "M-legs, spreading the lips", "lying_back", surf="bed", legs="m_legs", act1="spread_labia", gaze="camera", expr="lip_bite", inten="tease", anat=["vulva"], frame="full", angle="eye")
P(c, G, "edge_hand", "Edge of the bed", "sitting", surf="bed_edge", legs="spread", act1="clit_circle", h2="surface", gaze="down", expr="pant", inten="aroused", anat=["vulva"], frame="full")
P(c, G, "kneel_hand", "Kneeling, hand between the legs", "kneeling", surf="bed", legs="knees_apart", torso=["arched"], act1="finger1", h2="hair", tilt="back", gaze="closed", expr="moan", inten="intense", anat=["vulva"], frame="full")
P(c, G, "allfours_reach", "On all fours, reaching back", "all_fours", surf="bed", face="back", torso=["arched", "butt_out"], act1="finger2", gaze="shoulder", expr="moan", inten="intense", anat=["vulva"], frame="full", angle="behind")
P(c, G, "stomach_grind", "On the stomach, grinding", "lying_stomach", surf="bed", torso=["arched"], act1="grind_palm", gaze="closed", expr="pant", inten="aroused", anat=["vulva"], frame="full")
P(c, "Grinding", "pillow_hump", "Humping a pillow", "lying_side", surf="bed", legs="pillow_wrap", pbody="hump_pillow", gaze="closed", expr="pant", inten="intense", any_of=["vulva", "penis"], frame="full")
P(c, G, "shower_hand", "Shower, hand in the panties", "standing", surf="shower", face="three_q", act1="clit_rub", clothes="inside", h2="surface", tilt="back", gaze="closed", expr="moan", inten="aroused", fluids=["sweat"], fl={"sweat": "drip"}, anat=["vulva"], frame="full")
P(c, G, "shower_jet", "Shower head", "standing", surf="shower", legs="apart", pbody="shower_head", both="behind_head", tilt="back", gaze="closed", expr="moan", inten="intense", anat=["vulva"], frame="full")
P(c, G, "squat_finger", "Squatting, fingering", "squatting", legs="knees_apart", act1="finger2", h2="surface", gaze="camera", expr="moan", inten="intense", anat=["vulva"], frame="full", angle="low")
P(c, G, "side_finger", "Side, leg raised", "lying_side", surf="bed", legs="leg_high", act1="finger2", gaze="closed", expr="moan", inten="intense", anat=["vulva"], frame="full")
P(c, G, "armchair_open", "Armchair, legs over the arms", "sitting", surf="armchair", legs="armrests", act1="clit_rub", act2="roll", gaze="camera", expr="lip_bite", inten="aroused", anat=["vulva", "breasts"], frame="full")
P(c, G, "mirror_open", "At the mirror", "sitting", surf="mirror", legs="m_legs", act1="clit_circle", gaze="own_body", expr="pant", inten="aroused", anat=["vulva"], frame="full")
P(c, G, "through_panties", "Through the panties", "lying_back", surf="bed", legs="spread", act1="cup_pussy", clothes="through", gaze="closed", expr="lip_bite", inten="tease", anat=["vulva"], frame="full")
G = "Penis"
P(c, G, "pen_back", "Lying back, stroking", "lying_back", surf="bed", legs="spread", act1="stroke", gaze="closed", expr="moan", inten="aroused", anat=["penis"], frame="full", angle="high")
P(c, G, "pen_sit_both", "Sitting, both hands", "sitting", surf="bed_edge", legs="spread", act1="stroke_both", gaze="down", expr="pant", inten="intense", anat=["penis"], frame="full")
P(c, G, "pen_kneel_balls", "Kneeling, cupping the balls", "kneeling", surf="bed", legs="knees_apart", act1="stroke", act2="cup_balls", gaze="camera", expr="lip_bite", inten="intense", anat=["penis", "testicles"], frame="full")
P(c, G, "pen_stand", "Standing, head tilted back", "standing", face="camera", legs="apart", act1="stroke", tilt="back", gaze="closed", expr="moan", inten="aroused", anat=["penis"], frame="full")
P(c, G, "pen_edging", "Edging", "sitting", surf="bed", legs="spread", act1="grip_base", h2="surface", gaze="down", expr="pant", inten="edge", anat=["penis"], fluids=["precum"], fl={"precum": "drip"}, frame="full")
P(c, G, "pen_tease", "Teasing the head", "lying_back", surf="bed", legs="spread", act1="tease_head", gaze="own_body", expr="lip_bite", inten="tease", anat=["penis"], fluids=["precum"], fl={"precum": "bead"}, frame="full", angle="high")
P(c, G, "pen_stroker", "With a stroker", "sitting", surf="sofa", legs="spread", toys=["stroker"], tl={"stroker": "slide"}, h2="surface", gaze="closed", expr="moan", inten="intense", anat=["penis"], frame="full")
P(c, G, "pen_belly", "Cumming on the belly", "lying_back", surf="bed", legs="knees_up", act1="stroke_tight", gaze="closed", expr="moan", inten="climax", fluids=["cum"], fl={"cum": "belly"}, anat=["penis"], frame="full", angle="high")
P(c, G, "pen_shower", "In the shower", "standing", surf="shower", face="three_q", act1="stroke", tilt="back", gaze="closed", expr="pant", inten="aroused", anat=["penis"], fluids=["sweat"], frame="full")
P(c, G, "pen_side", "On the side, slowly", "lying_side", surf="bed", legs="together", act1="stroke", gaze="closed", expr="pant", inten="tease", anat=["penis"], frame="full")
P(c, G, "pen_pov", "POV, pumping to camera", "kneeling", surf="bed", legs="knees_apart", act1="pump", gaze="camera", expr="pant", inten="edge", angle="pov", anat=["penis"], frame="waist")
P(c, G, "pen_big_both", "Big penis, both hands", "kneeling", surf="bed", legs="knees_apart", act1="stroke_both", torso=["lean_back"], gaze="camera", expr="smirk", inten="intense", anat=["penis"], frame="full", hint="Set the penis size in the Character Builder.")
G = "Futanari"
P(c, G, "futa_both", "Stroking and fingering", "lying_back", surf="bed", legs="m_legs", act1="stroke", act2="finger2", gaze="closed", expr="moan", inten="intense", anat=["penis", "vulva"], frame="full", angle="high")
P(c, G, "futa_ride", "Riding a dildo, stroking", "squatting", surf="floor", legs="knees_apart", toys=["suction"], tl={"suction": "floor"}, act1="stroke", gaze="camera", expr="moan", inten="intense", anat=["penis", "vulva"], frame="full")
P(c, G, "futa_clit", "Stroking and rubbing", "sitting", surf="bed", legs="spread", act1="stroke", act2="clit_rub", gaze="down", expr="pant", inten="aroused", anat=["penis", "vulva"], frame="full")
P(c, G, "futa_climax", "Cumming and squirting", "lying_back", surf="bed", legs="m_legs", act1="stroke_tight", act2="clit_rub", gaze="rolled", expr="ahegao", inten="climax", fluids=["cum", "squirt"], fl={"cum": "mid", "squirt": "arc"}, anat=["penis", "vulva"], frame="full", angle="high")
G = "Breasts"
P(c, G, "br_squeeze", "Squeezing the breasts", "kneeling", surf="bed", act1="press_together", torso=["chest_out"], gaze="camera", expr="lip_bite", inten="tease", anat=["breasts"], frame="waist")
P(c, G, "br_pinch", "Pinching the nipples", "lying_back", surf="bed", act1="pinch", act2="pinch", gaze="closed", expr="moan", inten="aroused", anat=["breasts"], frame="waist", angle="high")
P(c, G, "br_knead", "Kneading, eyes closed", "sitting", surf="bed", act1="knead_both", tilt="back", gaze="closed", expr="pant", inten="intense", anat=["breasts"], frame="waist")
P(c, G, "br_lick", "Licking a nipple", "kneeling", surf="bed", act1="lick", gaze="own_body", expr="seductive", inten="aroused", anat=["breasts"], frame="waist")
P(c, G, "br_vibe", "Vibrator on a nipple", "lying_back", surf="bed", toys=["bullet"], tl={"bullet": "nipple"}, act2="squeeze", gaze="closed", expr="moan", inten="aroused", anat=["breasts"], frame="waist", angle="high")
G = "Anal"
P(c, G, "an_allfours", "On all fours, fingering", "all_fours", surf="bed", face="back", torso=["arched", "butt_out"], act1="finger_anus", gaze="shoulder", expr="moan", inten="intense", anat=["anus"], frame="full", angle="behind")
P(c, G, "an_plug", "Lying back, anal plug", "lying_back", surf="bed", legs="legs_up", toys=["plug"], tl={"plug": "in"}, gaze="camera", expr="lip_bite", inten="aroused", anat=["anus"], frame="full")
P(c, G, "an_ride", "Squatting on a dildo", "squatting", surf="floor", legs="knees_apart", toys=["suction"], tl={"suction": "floor"}, gaze="camera", expr="moan", inten="intense", any_of=["anus", "vulva"], frame="full", angle="low")
P(c, G, "an_beads", "Face down, anal beads", "lying_stomach", surf="bed", torso=["butt_out"], toys=["beads"], tl={"beads": "pull"}, gaze="shoulder", expr="moan", inten="intense", anat=["anus"], frame="full", angle="behind")
G = "Toys"
P(c, G, "toy_wand", "Wand on the clitoris", "lying_back", surf="bed", legs="spread", toys=["wand"], tl={"wand": "clit"}, tcol="white", gaze="closed", expr="moan", inten="edge", anat=["vulva"], frame="full", angle="high", fluids=["juice"], fl={"juice": "wet"})
P(c, G, "toy_suction", "Riding a suction dildo", "kneeling", surf="floor", legs="knees_apart", toys=["suction"], tl={"suction": "floor"}, tcol="pink", gaze="camera", expr="moan", inten="intense", any_of=["vulva", "anus"], frame="full")
P(c, G, "toy_dildo", "Thrusting a dildo", "lying_back", surf="bed", legs="m_legs", toys=["dildo"], tl={"dildo": "pussy"}, tcol="purple", gaze="closed", expr="moan", inten="intense", anat=["vulva"], frame="full", angle="high", fluids=["juice"], fl={"juice": "drip"})
P(c, G, "toy_rabbit", "Rabbit vibrator, back arched", "lying_back", surf="bed", legs="spread", torso=["arched"], toys=["rabbit"], tl={"rabbit": "inside"}, tcol="pink", gaze="rolled", expr="moan", inten="edge", anat=["vulva"], frame="full")
P(c, G, "toy_double", "Double-ended dildo", "lying_back", surf="bed", legs="m_legs", toys=["double"], tl={"double": "both"}, tcol="purple", gaze="camera", expr="moan", inten="intense", anat=["vulva", "anus"], frame="full", angle="high")
P(c, G, "toy_egg", "Remote egg", "sitting", surf="sofa", legs="crossed", toys=["egg"], tl={"egg": "inside"}, tcol="pink", h1="lips", gaze="camera", expr="flushed", inten="aroused", anat=["vulva"], frame="full", hint="A pose only: no scene around it.")
G = "Climax"
P(c, G, "cl_squirt", "Squirting climax", "lying_back", surf="bed", legs="m_legs", torso=["arched"], act1="clit_rub", gaze="rolled", expr="moan", inten="climax", fluids=["squirt"], fl={"squirt": "arc"}, anat=["vulva"], frame="full", angle="high")
P(c, G, "cl_toes", "Full-body orgasm", "lying_back", surf="bed", legs="legs_up", feet="curled", torso=["arched"], act1="finger2", gaze="closed", expr="moan", inten="climax", anat=["vulva"], frame="full", angle="high")
P(c, G, "cl_afterglow", "Afterglow", "lying_back", surf="bed", legs="spread", both="stretched", gaze="half", expr="bliss", inten="afterglow", fluids=["sweat", "juice"], fl={"sweat": "sheen", "juice": "soaked"}, frame="full", angle="high")
P(c, G, "cl_ahegao", "Ahegao climax", "lying_back", surf="bed", legs="v_legs", gaze="rolled", expr="ahegao", act1="clit_rub", inten="climax", fluids=["saliva"], fl={"saliva": "chin"}, anat=["vulva"], frame="portrait")
