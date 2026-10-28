"""Option tables of ND Pose Builder (used by make_pose_data.py). Every option: id, label, text, tag, edit.

text: the words used in the Create sentence (see _about in pose_builder.json for how each parameter is used).
Tokens: {Pron} {pron} {Pos} {pos} {obj} {is}; {toy} (toy parameter).
"""


def o(id, label, text, tag="", edit="", **kw):
    d = {"id": id, "label": label, "text": text}
    if tag:
        d["tag"] = tag
    if edit:
        d["edit"] = edit
    d.update(kw)
    return d


def x(opt):
    opt["explicit"] = True
    return opt


# ----------------------------------------------------------------- subject
SUBJECT = [
    {"id": "female", "label": "Female", "pron": "she", "have": ["vulva", "anus", "breasts"]},
    {"id": "male", "label": "Male", "pron": "he", "have": ["penis", "testicles", "anus"]},
    {"id": "futa", "label": "Futanari", "pron": "she", "have": ["vulva", "penis", "testicles", "anus", "breasts"]},
    {"id": "neutral", "label": "Neutral", "pron": "they"},
]

# ----------------------------------------------------------------- posture
BASE = [
    o("standing", "Standing", "standing", "standing", "Make {obj} stand."),
    o("walking", "Walking", "walking", "walking", "Make {obj} walk."),
    o("running", "Running", "running", "running", "Make {obj} run."),
    o("jumping", "Jumping", "jumping in mid-air", "jumping, midair", "Make {obj} jump in mid-air."),
    o("sitting", "Sitting", "sitting", "sitting", "Make {obj} sit."),
    o("sitting_cross", "Cross-legged", "sitting cross-legged", "sitting, crossed legs, indian style", "Make {obj} sit cross-legged."),
    o("sitting_heels", "On the heels", "sitting on {pos} heels", "seiza, sitting", "Make {obj} sit on {pos} heels."),
    o("sitting_side", "Legs to one side", "sitting with {pos} legs tucked to one side", "yokozuwari, sitting", "Make {obj} sit with {pos} legs tucked to one side."),
    o("kneeling", "Kneeling", "kneeling upright", "kneeling", "Make {obj} kneel upright."),
    o("kneeling_one", "One knee", "kneeling on one knee", "one knee, kneeling", "Make {obj} kneel on one knee."),
    o("squatting", "Squatting", "squatting", "squatting", "Make {obj} squat."),
    o("crouching", "Crouching", "crouching low", "crouching", "Make {obj} crouch low."),
    o("all_fours", "On all fours", "on all fours", "all fours", "Put {obj} on all fours."),
    o("bending", "Bending over", "bending over", "bent over", "Make {obj} bend over."),
    o("lying_back", "On the back", "lying on {pos} back", "lying, on back", "Make {obj} lie on {pos} back."),
    o("lying_stomach", "On the stomach", "lying on {pos} stomach", "lying, on stomach", "Make {obj} lie on {pos} stomach."),
    o("lying_side", "On the side", "lying on {pos} side", "lying, on side", "Make {obj} lie on {pos} side."),
    o("reclining", "Reclining", "reclining on {pos} elbows", "reclining", "Make {obj} recline on {pos} elbows."),
    o("hips_up", "Hips raised", "lying on {pos} back with {pos} hips raised", "lying, on back, hips up", "Make {obj} lie on {pos} back with {pos} hips raised."),
    o("straddle_chair", "Astride a chair", "sitting astride a chair backwards", "straddling, chair, sitting backwards", "Make {obj} sit astride a chair backwards."),
    o("bridge", "Backbend", "arching back into a backbend", "bridge, backbend", "Make {obj} arch back into a backbend."),
    o("downdog", "Downward dog", "in a downward dog yoga pose", "downward dog, yoga", "Put {obj} in a downward dog yoga pose."),
    o("stretching", "Stretching", "stretching", "stretching", "Make {obj} stretch."),
]
for _b in BASE:
    _b["icon"] = _b["id"]

# surface: where; "postures" lists the postures random pairs it with
ON_SIT = ["sitting", "sitting_cross", "sitting_heels", "sitting_side"]
ON_KNEEL = ["kneeling", "kneeling_one", "all_fours"]
ON_LIE = ["lying_back", "lying_stomach", "lying_side", "reclining", "hips_up"]
SURFACE = [
    o("bed", "On a bed", "on a bed", "on bed", "Place {obj} on a bed.", postures=ON_SIT + ON_KNEEL + ON_LIE + ["squatting", "crouching", "stretching"]),
    o("bed_edge", "Edge of a bed", "on the edge of a bed", "sitting, on bed, bed edge", "Place {obj} on the edge of a bed.", postures=["sitting", "sitting_side", "kneeling"]),
    o("floor", "On the floor", "on the floor", "on floor", "Place {obj} on the floor.", postures=ON_SIT + ON_KNEEL + ON_LIE + ["squatting", "crouching", "stretching", "downdog", "bridge"]),
    o("sofa", "On a sofa", "on a sofa", "on couch", "Place {obj} on a sofa.", postures=ON_SIT + ON_LIE + ["all_fours", "kneeling"]),
    o("chair", "On a chair", "on a chair", "chair", "Place {obj} on a chair.", postures=["sitting", "sitting_cross", "sitting_side"]),
    o("armchair", "In an armchair", "in an armchair", "armchair", "Place {obj} in an armchair.", postures=["sitting", "reclining", "sitting_side"]),
    o("desk", "On a desk", "on a desk", "on desk, table", "Place {obj} on a desk.", postures=["sitting", "sitting_cross", "lying_back", "lying_stomach", "bending"]),
    o("counter", "On a counter", "on a kitchen counter", "kitchen, counter", "Place {obj} on a kitchen counter.", postures=["sitting"]),
    o("wall", "Against a wall", "leaning against a wall", "against wall", "Make {obj} lean against a wall.", postures=["standing", "bending", "crouching", "squatting"]),
    o("stairs", "On stairs", "on a flight of stairs", "stairs", "Place {obj} on a flight of stairs.", postures=["sitting", "standing", "walking", "lying_back"]),
    o("bathtub", "In a bathtub", "in a bathtub", "bathtub, partially submerged", "Place {obj} in a bathtub.", postures=["sitting", "lying_back", "kneeling", "reclining"]),
    o("shower", "In the shower", "in a shower", "shower, wet", "Place {obj} in a shower.", postures=["standing", "kneeling", "squatting", "bending", "sitting"]),
    o("grass", "On the grass", "on the grass", "grass, outdoors", "Place {obj} on the grass.", postures=ON_SIT + ON_LIE + ["kneeling"]),
    o("sand", "On the sand", "on the sand", "sand, beach", "Place {obj} on the sand.", postures=ON_SIT + ON_LIE + ["kneeling", "standing", "walking"]),
    o("window", "By a window", "by a window", "window, window light", "Place {obj} by a window.", postures=["standing", "sitting", "kneeling", "reclining"]),
    o("mirror", "At a mirror", "in front of a large mirror", "mirror, reflection", "Place {obj} in front of a large mirror.", postures=["standing", "kneeling", "sitting", "bending", "squatting"]),
    o("yoga_mat", "On a yoga mat", "on a yoga mat", "yoga mat", "Place {obj} on a yoga mat.", postures=["downdog", "bridge", "sitting_cross", "kneeling", "stretching", "lying_back"]),
    o("pole", "At a pole", "at a dance pole", "pole dancing, pole", "Place {obj} at a dance pole.", postures=["standing", "kneeling", "walking", "squatting"]),
]

FACING = [
    o("camera", "To the camera", "facing the camera", "facing viewer", "Make {obj} face the camera."),
    o("three_q", "Three-quarter", "turned three-quarters toward the camera", "three-quarter view", "Turn {obj} three-quarters toward the camera."),
    o("profile", "Profile", "seen in profile", "profile, from side", "Turn {obj} to face sideways, in profile."),
    o("back", "Back to camera", "facing away from the camera", "from behind, facing away", "Turn {obj} so that {pos} back is to the camera."),
]

# ------------------------------------------------------------------- torso
TORSO = [
    o("arched", "Arched back", "{pos} back arched", "arched back", "Arch {pos} back."),
    o("lean_fwd", "Leaning forward", "{pos} torso leaning forward", "leaning forward", "Make {obj} lean forward."),
    o("lean_back", "Leaning back", "{pos} torso leaning back", "leaning back", "Make {obj} lean back."),
    o("twist", "Twisted", "{pos} torso twisted at the waist", "twisted torso, twisting", "Twist {pos} torso at the waist."),
    o("hip_cock", "Hip to the side", "{pos} hips cocked to one side", "contrapposto, hip to the side", "Cock {pos} hips to one side."),
    o("chest_out", "Chest out", "{pos} chest pushed out", "chest out", "Push out {pos} chest."),
    o("butt_out", "Butt out", "{pos} butt pushed out", "arched back, ass out", "Push out {pos} butt."),
    o("curled", "Curled up", "{pos} body curled up", "curled up, fetal position", "Curl {pos} body up."),
    o("stretched", "Stretched out", "{pos} body stretched out", "stretching", "Stretch {pos} body out."),
]

# -------------------------------------------------------------------- head
TILT = [
    o("side", "To one side", "{pos} head tilted to one side", "head tilt", "Tilt {pos} head to one side."),
    o("back", "Back", "{pos} head tilted back", "head back", "Tilt {pos} head back."),
    o("down", "Chin down", "{pos} chin tucked down", "chin down", "Tuck {pos} chin down."),
    o("up", "Chin up", "{pos} chin raised", "chin up", "Raise {pos} chin."),
]
GAZE = [
    o("camera", "At the camera", "looking at the camera", "looking at viewer", "Make {obj} look at the camera."),
    o("away", "Away", "looking away from the camera", "looking away", "Make {obj} look away from the camera."),
    o("shoulder", "Over the shoulder", "looking back over {pos} shoulder", "looking back", "Make {obj} look back over {pos} shoulder."),
    o("side", "To the side", "looking off to the side", "looking to the side", "Make {obj} look off to the side."),
    o("up", "Up", "looking up", "looking up", "Make {obj} look up."),
    o("down", "Down", "looking down", "looking down", "Make {obj} look down."),
    o("own_body", "At own body", "looking down at {pos} own body", "looking at own body", "Make {obj} look down at {pos} own body."),
    o("closed", "Eyes closed", "keeping {pos} eyes closed", "closed eyes", "Close {pos} eyes."),
    o("half", "Half-closed", "keeping {pos} eyes half-closed", "half-closed eyes", "Half-close {pos} eyes."),
    x(o("rolled", "Eyes rolled back", "rolling {pos} eyes back", "rolling eyes", "Roll {pos} eyes back.")),
]
EXPRESSION = [
    o("smile", "Smiling", "smiling warmly", "smile", "Give {obj} a warm smile."),
    o("laugh", "Laughing", "laughing", "laughing", "Make {obj} laugh."),
    o("seductive", "Seductive", "smiling seductively", "seductive smile", "Give {obj} a seductive smile."),
    o("smirk", "Smirking", "smirking", "smirk", "Give {obj} a smirk."),
    o("playful", "Playful", "smiling playfully", "playful, wink", "Give {obj} a playful smile."),
    o("confident", "Confident", "wearing a confident expression", "confident", "Give {obj} a confident expression."),
    o("serious", "Serious", "wearing a serious expression", "serious", "Give {obj} a serious expression."),
    o("fierce", "Fierce", "wearing a fierce, determined expression", "determined, serious", "Give {obj} a fierce, determined expression."),
    o("shy", "Shy", "blushing shyly", "blush, shy", "Make {obj} blush shyly."),
    o("surprised", "Surprised", "looking surprised", "surprised", "Give {obj} a surprised look."),
    o("lip_bite", "Biting lip", "biting {pos} lower lip", "lip biting", "Make {obj} bite {pos} lower lip."),
    o("flushed", "Flushed", "with flushed cheeks, blushing", "blush, flushed", "Give {obj} flushed cheeks."),
    x(o("moan", "Moaning", "moaning with {pos} mouth open", "open mouth, moaning", "Make {obj} moan with {pos} mouth open.")),
    x(o("pant", "Panting", "panting with parted lips", "parted lips, heavy breathing", "Make {obj} pant with parted lips.")),
    x(o("tongue", "Tongue out", "sticking out {pos} tongue", "tongue out", "Make {obj} stick out {pos} tongue.")),
    x(o("ahegao", "Ahegao", "wearing an ahegao expression, eyes rolled back and tongue out", "ahegao, rolling eyes, tongue out", "Give {obj} an ahegao expression, eyes rolled back and tongue out.")),
    x(o("drool", "Drooling", "drooling", "drooling, saliva", "Make {obj} drool.")),
    x(o("bliss", "Blissful", "wearing a blissful, satisfied expression", "blissful, satisfied", "Give {obj} a blissful, satisfied expression.")),
]

# -------------------------------------------------------------------- arms
BOTH = [
    o("crossed", "Arms crossed", "{Pos} arms are crossed.", "crossed arms", "Cross {pos} arms."),
    o("hips", "Hands on hips", "{Pos} hands are on {pos} hips.", "hands on hips", "Put {pos} hands on {pos} hips."),
    o("behind_head", "Behind the head", "{Pos} hands are behind {pos} head.", "hands behind head, arms behind head", "Put {pos} hands behind {pos} head."),
    o("raised", "Arms raised", "{Pos} arms are raised above {pos} head.", "arms up", "Raise {pos} arms above {pos} head."),
    o("stretched", "Arms out", "{Pos} arms are stretched out to the sides.", "outstretched arms", "Stretch {pos} arms out to the sides."),
    o("clasped", "Hands clasped", "{Pos} hands are clasped in front of {obj}.", "own hands together", "Clasp {pos} hands in front of {obj}."),
    o("behind_back", "Behind the back", "{Pos} hands are clasped behind {pos} back.", "hands behind back, arms behind back", "Clasp {pos} hands behind {pos} back."),
    o("hug_self", "Hugging herself", "{Pos} arms are wrapped around {pos} body.", "hugging own legs? no", "Wrap {pos} arms around {pos} body."),
    o("in_hair", "Hands in hair", "{Pos} hands are in {pos} hair.", "hands in hair, adjusting hair", "Put {pos} hands in {pos} hair."),
    o("on_knees", "Hands on knees", "{Pos} hands rest on {pos} knees.", "hands on own knees", "Rest {pos} hands on {pos} knees."),
    o("on_thighs", "Hands on thighs", "{Pos} hands rest on {pos} thighs.", "hands on thighs", "Rest {pos} hands on {pos} thighs."),
    o("planted", "Hands planted behind", "{Pos} hands are planted behind {obj}, supporting {pos} weight.", "hands on floor, leaning back", "Plant {pos} hands behind {obj}, supporting {pos} weight."),
    o("cover_breasts", "Covering breasts", "{Pos} hands cover {pos} {chest}.", "covering breasts, hand on own chest", "Make {obj} cover {pos} {chest} with {pos} hands."),
    x(o("cover_crotch", "Covering crotch", "{Pos} hands cover {pos} crotch.", "covering crotch, covering privates", "Make {obj} cover {pos} crotch with {pos} hands.")),
    x(o("hold_breasts", "Holding breasts", "{Pos} hands hold {pos} breasts up.", "grabbing own breasts, breast hold", "Make {obj} hold {pos} breasts up with {pos} hands.", anatomy=["breasts"])),
    x(o("spread_legs", "Holding legs open", "{Pos} hands hold {pos} legs apart.", "spread legs, legs held open", "Make {obj} hold {pos} legs apart with {pos} hands.")),
    x(o("spread_butt", "Spreading butt", "{Pos} hands spread {pos} butt cheeks apart.", "spread ass, spreading own butt cheeks", "Make {obj} spread {pos} butt cheeks apart with {pos} hands.")),
]
for _b in BOTH:
    _b["mutes"] = ["arms.hand1", "arms.hand2"]
BOTH[7]["label"] = "Hugging the body"
BOTH[7]["tag"] = "hugging own body, arms around self"

HAND = [
    o("hip", "On the hip", "rests on {pos} hip", "hand on hip", "Rest one hand on {pos} hip."),
    o("hair", "In the hair", "plays with {pos} hair", "hand in hair, adjusting hair", "Make one hand play with {pos} hair."),
    o("face", "On the face", "touches {pos} face", "hand on own face", "Make one hand touch {pos} face."),
    o("lips", "Finger to lips", "raises a finger to {pos} lips", "finger to mouth", "Raise one finger to {pos} lips."),
    o("chin", "Under the chin", "supports {pos} chin", "hand on own chin", "Make one hand support {pos} chin."),
    o("neck", "On the neck", "rests on {pos} neck", "hand on own neck", "Rest one hand on {pos} neck."),
    o("chest", "On the chest", "rests on {pos} chest", "hand on own chest", "Rest one hand on {pos} chest."),
    o("thigh", "On the thigh", "rests on {pos} thigh", "hand on thigh", "Rest one hand on {pos} thigh."),
    o("knee", "On the knee", "rests on {pos} knee", "hand on knee", "Rest one hand on {pos} knee."),
    o("surface", "Planted", "is planted on the surface beside {obj}", "hand on floor", "Plant one hand on the surface beside {obj}."),
    o("hem", "Holding the hem", "holds the hem of {pos} clothes", "holding hem, clothes lift", "Make one hand hold the hem of {pos} clothes."),
    o("mouth", "Over the mouth", "covers {pos} mouth", "hand over own mouth", "Make one hand cover {pos} mouth."),
    o("wave", "Waving", "waves at the camera", "waving", "Make one hand wave at the camera."),
    o("peace", "Peace sign", "makes a peace sign", "v, peace sign", "Make one hand show a peace sign."),
    o("point", "Pointing", "points at the camera", "pointing at viewer", "Make one hand point at the camera."),
    o("kiss", "Blowing a kiss", "blows a kiss", "blowing kiss", "Make one hand blow a kiss."),
    o("reach", "Reaching out", "reaches toward the camera", "reaching out, outstretched hand", "Make one hand reach toward the camera."),
    o("pocket", "In a pocket", "is tucked in {pos} pocket", "hand in pocket", "Tuck one hand in {pos} pocket."),
    o("fist", "Clenched fist", "is clenched into a fist", "clenched fist", "Clench one hand into a fist."),
    o("ground", "On the ground", "is pressed flat against the ground", "hand on ground", "Press one hand flat against the ground."),
    o("up", "Raised high", "is raised high above {pos} head", "arm up, raised arm", "Raise one hand high above {pos} head."),
    o("forward", "Stretched forward", "is stretched out in front of {obj}", "outstretched arm", "Stretch one hand out in front of {obj}."),
    o("cast", "Casting magic", "is held out, glowing with magic", "magic, glowing hand, casting spell", "Hold one hand out, glowing with magic."),
    o("hilt", "On a sword hilt", "grips the hilt of a sword", "hand on sword, sword hilt", "Make one hand grip the hilt of a sword."),
    x(o("sheets", "Gripping the sheets", "grips the sheets tightly", "gripping sheets", "Make one hand grip the sheets tightly.")),
]

PROP = [
    o("phone", "Phone", "holding a phone, taking a selfie", "holding phone, selfie", "Put a phone in {pos} hand, as if taking a selfie."),
    o("coffee", "Coffee", "holding a cup of coffee", "holding cup, coffee", "Put a cup of coffee in {pos} hand."),
    o("wine", "Glass of wine", "holding a glass of wine", "holding wine glass, wine", "Put a glass of wine in {pos} hand."),
    o("book", "Book", "holding a book", "holding book", "Put a book in {pos} hand."),
    o("flower", "Flower", "holding a flower", "holding flower", "Put a flower in {pos} hand."),
    o("umbrella", "Umbrella", "holding an umbrella", "holding umbrella, umbrella", "Put an umbrella in {pos} hand."),
    o("sword", "Sword", "holding a sword", "holding sword, sword", "Put a sword in {pos} hand."),
    o("gun", "Gun", "holding a gun", "holding gun, handgun", "Put a gun in {pos} hand."),
    o("bow", "Bow", "holding a bow", "holding bow (weapon), bow (weapon)", "Put a bow in {pos} hand."),
    o("staff", "Staff", "holding a staff", "holding staff, staff", "Put a staff in {pos} hand."),
    o("mic", "Microphone", "holding a microphone", "holding microphone, microphone", "Put a microphone in {pos} hand."),
    o("guitar", "Guitar", "holding a guitar", "holding guitar, guitar", "Put a guitar in {pos} hands."),
    o("towel", "Towel", "holding a towel", "holding towel, towel", "Put a towel in {pos} hand."),
    o("mirror", "Hand mirror", "holding a hand mirror", "hand mirror, holding mirror", "Put a hand mirror in {pos} hand."),
    o("pole", "Dance pole", "holding onto a dance pole", "pole dancing, holding pole", "Make {obj} hold onto a dance pole."),
    o("pillow", "Pillow", "hugging a pillow", "holding pillow, pillow hug", "Make {obj} hug a pillow."),
]

# -------------------------------------------------------------------- legs
LEGS = [
    o("together", "Together", "{pos} legs together", "legs together", "Pose {obj} with {pos} legs together."),
    o("crossed", "Crossed", "{pos} legs crossed", "crossed legs", "Pose {obj} with {pos} legs crossed."),
    o("apart", "Apart", "{pos} legs shoulder-width apart", "legs apart", "Pose {obj} with {pos} legs shoulder-width apart."),
    o("wide", "Wide stance", "{pos} feet planted wide apart", "wide stance, legs apart", "Pose {obj} with {pos} feet planted wide apart."),
    o("tiptoe", "On tiptoes", "{pos} weight on {pos} tiptoes", "on tiptoes", "Pose {obj} on {pos} tiptoes."),
    o("one_up", "One leg raised", "one leg raised", "leg up, raised leg", "Pose {obj} with one leg raised."),
    o("knee_fwd", "Knee forward", "one knee bent forward", "bent knee", "Pose {obj} with one knee bent forward."),
    o("knees_up", "Knees drawn up", "{pos} knees drawn up", "knees up", "Pose {obj} with {pos} knees drawn up."),
    o("stretched", "Stretched out", "{pos} legs stretched out in front of {obj}", "outstretched legs, legs out", "Pose {obj} with {pos} legs stretched out in front."),
    o("tucked", "Tucked under", "{pos} legs tucked under {obj}", "legs tucked", "Pose {obj} with {pos} legs tucked under {obj}."),
    o("w_sit", "W-sit", "{pos} legs folded back in a W shape", "wariza, w sitting", "Pose {obj} with {pos} legs folded back in a W shape."),
    o("kick", "Feet kicked up", "{pos} feet kicked up behind {obj}", "kicking feet, legs up", "Pose {obj} with {pos} feet kicked up behind {obj}."),
    o("lunge", "Lunge", "{pos} legs in a deep lunge", "lunge", "Pose {obj} in a deep lunge."),
    o("warrior", "Warrior stance", "{pos} legs in a wide warrior stance, one knee bent", "warrior pose, yoga", "Pose {obj} in a wide warrior stance."),
    o("tree", "Tree pose", "{pos} weight on one leg, the other foot pressed against {pos} thigh", "tree pose, standing on one leg, yoga", "Pose {obj} on one leg, the other foot against {pos} thigh."),
    o("arabesque", "Arabesque", "one leg extended high behind {obj}", "arabesque, ballet, leg up", "Pose {obj} with one leg extended high behind {obj}."),
    o("high_kick", "High kick", "one leg kicked high", "high kick, leg up", "Pose {obj} with one leg kicked high."),
    o("split_front", "Front split", "{pos} legs in a full front split", "split, splits", "Put {obj} in a full front split."),
    o("split_side", "Side split", "{pos} legs in a full side split", "split, splits, spread legs", "Put {obj} in a full side split."),
    o("chair_foot", "Foot on a chair", "one foot up on a chair", "foot on chair", "Put one of {pos} feet up on a chair."),
    x(o("spread", "Spread wide", "{pos} legs spread wide", "spread legs", "Spread {pos} legs wide.")),
    x(o("m_legs", "M-shaped", "{pos} knees bent and spread apart in an M shape", "m legs, spread legs", "Pose {obj} with {pos} knees bent and spread apart in an M shape.")),
    x(o("knees_apart", "Knees wide apart", "{pos} knees wide apart", "spread legs, knees apart", "Pose {obj} with {pos} knees wide apart.")),
    x(o("legs_up", "Legs in the air", "{pos} legs raised in the air", "legs up", "Raise {pos} legs in the air.")),
    x(o("v_legs", "V-shaped", "{pos} legs raised and spread in a V", "spread legs, legs up", "Raise {pos} legs and spread them in a V.")),
    x(o("armrests", "Over armrests", "{pos} legs draped over the armrests", "legs over armrests, legs up", "Drape {pos} legs over the armrests.")),
    x(o("behind_head", "Behind the head", "{pos} legs pulled back behind {pos} head", "leg behind head, legs behind head", "Pull {pos} legs back behind {pos} head.")),
    x(o("leg_high", "One leg high", "one leg lifted high and held open", "leg lift, spread legs, one leg up", "Lift one of {pos} legs high and hold it open.")),
    x(o("pillow_wrap", "Around a pillow", "{pos} legs wrapped around a pillow", "pillow between legs", "Wrap {pos} legs around a pillow.")),
]
FEET = [
    o("pointed", "Pointed toes", "{pos} toes pointed", "pointed toes", "Point {pos} toes."),
    o("crossed_ankles", "Crossed ankles", "{pos} ankles crossed", "crossed ankles", "Cross {pos} ankles."),
    o("planted", "Planted", "{pos} feet planted firmly", "feet on floor", "Plant {pos} feet firmly."),
    o("soles", "Soles to camera", "the soles of {pos} feet toward the camera", "soles, feet", "Turn the soles of {pos} feet toward the camera."),
    o("curled", "Toes curled", "{pos} toes curled", "curled toes, toes", "Curl {pos} toes."),
]

# ---------------------------------------------------------------- pleasure
# groups: what the hand does. anatomy: all of; area: covers names (is that area dressed?); hands2: both hands
ACTS = []


def act(group, id, label, text, tag, edit, anat=(), area=(), both=False, any_of=()):
    d = o(id, label, text, tag, edit, group=group)
    if anat:
        d["anatomy"] = list(anat)
    if any_of:
        d["anatomy_any"] = list(any_of)
    if area:
        d["area"] = list(area)
    if both:
        d["both_hands"] = True
    ACTS.append(d)


G, GN = ["genitals", "pubic"], ["genitals"]
act("Vulva", "clit_rub", "Rubbing the clitoris", "rubbing {pos} clitoris", "masturbation, female masturbation, clitoral stimulation, fingering", "Make {obj} rub {pos} clitoris with a hand.", ["vulva"], G)
act("Vulva", "clit_circle", "Circling the clitoris", "circling {pos} clitoris with a fingertip", "masturbation, female masturbation, clitoral stimulation", "Make {obj} circle {pos} clitoris with a fingertip.", ["vulva"], G)
act("Vulva", "finger1", "One finger", "sliding one finger into {pos} pussy", "masturbation, female masturbation, fingering, pussy", "Make {obj} slide one finger into {pos} pussy.", ["vulva"], G)
act("Vulva", "finger2", "Two fingers", "sliding two fingers into {pos} pussy", "masturbation, female masturbation, fingering, pussy", "Make {obj} slide two fingers into {pos} pussy.", ["vulva"], G)
act("Vulva", "finger3", "Three fingers", "sliding three fingers deep into {pos} pussy", "masturbation, female masturbation, fingering, pussy", "Make {obj} slide three fingers deep into {pos} pussy.", ["vulva"], G)
act("Vulva", "spread_labia", "Spreading the lips", "spreading {pos} labia apart with two fingers", "spread pussy, pussy, masturbation, female masturbation", "Make {obj} spread {pos} labia apart with two fingers.", ["vulva"], G)
act("Vulva", "cup_pussy", "Cupping the pussy", "cupping {pos} pussy", "hand on pussy, masturbation, female masturbation", "Make {obj} cup {pos} pussy with a hand.", ["vulva"], G)
act("Vulva", "grind_palm", "Grinding on the palm", "grinding against {pos} own palm", "masturbation, female masturbation, grinding", "Make {obj} grind against {pos} own palm.", ["vulva"], G)
act("Penis", "stroke", "Stroking", "stroking {pos} penis", "masturbation, male masturbation, penis, stroking, handjob", "Make {obj} stroke {pos} penis.", ["penis"], GN)
act("Penis", "stroke_tight", "Tight grip", "stroking {pos} penis with a tight grip", "masturbation, male masturbation, penis, stroking", "Make {obj} stroke {pos} penis with a tight grip.", ["penis"], GN)
act("Penis", "stroke_both", "Both hands", "stroking {pos} penis with both hands", "masturbation, male masturbation, penis, stroking, two-handed handjob", "Make {obj} stroke {pos} penis with both hands.", ["penis"], GN, both=True)
act("Penis", "rub_head", "Rubbing the head", "rubbing the head of {pos} penis with {pos} palm", "masturbation, male masturbation, penis, glans", "Make {obj} rub the head of {pos} penis with {pos} palm.", ["penis"], GN)
act("Penis", "tease_head", "Teasing the head", "teasing the head of {pos} penis with {pos} fingertips", "masturbation, male masturbation, penis, glans, teasing", "Make {obj} tease the head of {pos} penis with {pos} fingertips.", ["penis"], GN)
act("Penis", "grip_base", "Edging", "gripping the base of {pos} penis to hold back, edging", "masturbation, male masturbation, penis, edging", "Make {obj} grip the base of {pos} penis, edging.", ["penis"], GN)
act("Penis", "pump", "Pumping toward camera", "pumping {pos} penis toward the camera", "masturbation, male masturbation, penis, stroking, pov", "Make {obj} pump {pos} penis toward the camera.", ["penis"], GN)
act("Testicles", "cup_balls", "Cupping the balls", "cupping {pos} testicles", "testicle grab, testicles, masturbation", "Make {obj} cup {pos} testicles.", ["testicles"], GN)
act("Testicles", "tug_balls", "Tugging the balls", "gently tugging {pos} testicles", "testicles, masturbation, ball tugging", "Make {obj} gently tug {pos} testicles.", ["testicles"], GN)
act("Breasts", "squeeze", "Squeezing a breast", "squeezing a breast", "grabbing own breast, breast grab, masturbation", "Make {obj} squeeze a breast.", ["breasts"], ["breasts", "nipples", "chest"])
act("Breasts", "knead_both", "Kneading both", "kneading both breasts", "grabbing own breasts, breast grab, masturbation", "Make {obj} knead both breasts.", ["breasts"], ["breasts", "nipples", "chest"], both=True)
act("Breasts", "lift", "Lifting a breast", "lifting a breast", "breast lift, grabbing own breast", "Make {obj} lift a breast.", ["breasts"], ["breasts", "nipples", "chest"])
act("Breasts", "pinch", "Pinching a nipple", "pinching a nipple", "nipple tweak, nipple play, masturbation", "Make {obj} pinch a nipple.", [], ["breasts", "nipples", "chest"])
act("Breasts", "roll", "Rolling a nipple", "rolling a nipple between {pos} fingers", "nipple tweak, nipple play, masturbation", "Make {obj} roll a nipple between {pos} fingers.", [], ["breasts", "nipples", "chest"])
act("Breasts", "areola", "Circling an areola", "circling an areola with a fingertip", "nipple play, areolae", "Make {obj} circle an areola with a fingertip.", [], ["breasts", "nipples", "chest"])
act("Breasts", "press_together", "Pressing together", "pressing {pos} breasts together", "breasts squeezed together, grabbing own breasts", "Make {obj} press {pos} breasts together.", ["breasts"], ["breasts", "nipples", "chest"], both=True)
act("Breasts", "lick", "Licking a nipple", "lifting a breast to lick {pos} own nipple", "licking own nipple, self breast suck, nipple lick", "Make {obj} lift a breast and lick {pos} own nipple.", ["breasts"], ["breasts", "nipples", "chest"], both=True)
act("Anus", "tease_anus", "Teasing the anus", "teasing {pos} anus with a fingertip", "anus, anal fingering, masturbation", "Make {obj} tease {pos} anus with a fingertip.", ["anus"], ["butt", "hips"])
act("Anus", "finger_anus", "Fingering the anus", "fingering {pos} anus", "anal fingering, anus, masturbation", "Make {obj} finger {pos} anus.", ["anus"], ["butt", "hips"])
act("Other", "thigh", "Caressing the thigh", "caressing {pos} inner thigh", "hand on thigh, thigh caress", "Make {obj} caress {pos} inner thigh.")
act("Other", "belly", "Hand down the belly", "sliding a hand slowly down {pos} belly", "hand on stomach, sliding hand down", "Make {obj} slide a hand slowly down {pos} belly.")
act("Other", "muffle", "Muffling the moans", "covering {pos} mouth to muffle {pos} moans", "hand over own mouth, covering mouth", "Make {obj} cover {pos} mouth to muffle {pos} moans.")
act("Other", "sheets", "Gripping the sheets", "gripping the sheets", "gripping sheets", "Make {obj} grip the sheets.")


def act_copy(slot):
    out = []
    for a in ACTS:
        c = dict(a)
        c["explicit"] = True
        m = [f"arms.hand{slot}", "arms.both"]
        if slot == 1 and a.get("both_hands"):
            m += ["pleasure.act2", "arms.hand2"]
        c["mutes"] = m
        out.append(c)
    return out


def body(id, label, text, tag, edit, any_of=(), anat=()):
    d = x(o(id, label, text, tag, edit))
    if any_of:
        d["anatomy_any"] = list(any_of)
    if anat:
        d["anatomy"] = list(anat)
    return d


PBODY = [
    body("hump_pillow", "Humping a pillow", "humping a pillow", "humping, pillow, masturbation", "Make {obj} hump a pillow.", any_of=["vulva", "penis"]),
    body("grind_armrest", "Grinding on an armrest", "grinding against the armrest", "grinding, humping, masturbation", "Make {obj} grind against the armrest.", any_of=["vulva", "penis"]),
    body("grind_edge", "On the bed edge", "grinding against the edge of the bed", "grinding, humping, masturbation", "Make {obj} grind against the edge of the bed.", any_of=["vulva", "penis"]),
    body("grind_floor", "On the floor", "grinding against the floor", "grinding, humping, masturbation", "Make {obj} grind against the floor.", any_of=["vulva", "penis"]),
    body("shower_head", "Shower head", "holding a shower head between {pos} legs", "shower head, masturbation, showering", "Make {obj} hold a shower head between {pos} legs.", anat=["vulva"]),
]
CLOTHES = [
    x(o("through", "Through the clothes", ", through {pos} clothes", "clothed masturbation, through clothes", "Make it happen through {pos} clothes.")),
    x(o("inside", "Hand inside", ", slipping a hand inside {pos} clothes", "hand in panties, hand under clothes", "Slip a hand inside {pos} clothes.")),
    x(o("aside", "Clothes pulled aside", ", {pos} clothes pulled aside", "panties aside, clothes pull", "Pull {pos} clothes aside.")),
]
INTENSITY = [
    o("tease", "Teasing", ", slowly and teasingly", "teasing, slow", "Make it slow and teasing.", solo="{Pron} {is} teasing {obj}self slowly."),
    o("aroused", "Aroused", ", breathing heavily, growing more and more aroused", "aroused, heavy breathing, blush", "Make {obj} look aroused, breathing heavily.", solo="{Pron} {is} breathing heavily, visibly aroused."),
    o("intense", "Intense", ", eagerly and intensely", "intense, passionate", "Make it eager and intense.", solo="{Pron} {is} lost in intense passion."),
    o("edge", "On the edge", ", frantically, right on the edge of orgasm", "about to orgasm, trembling, heavy breathing", "Make {obj} frantic, right on the edge of orgasm.", solo="{Pron} {is} trembling right on the edge of orgasm."),
    o("climax", "Climaxing", ", in the middle of an intense orgasm, {pos} body trembling", "orgasm, trembling, climax", "Show {obj} in the middle of an intense orgasm, {pos} body trembling.", solo="{Pron} {is} in the middle of an intense orgasm, {pos} body trembling."),
    o("afterglow", "Afterglow", "", "afterglow, sweat, satisfied, after orgasm", "Show {obj} limp and spent after an orgasm.", solo="{Pron} {is} lying limp and spent, still catching {pos} breath after {pos} orgasm."),
]
for _i in INTENSITY:
    _i["explicit"] = True

# ------------------------------------------------------------------- toys
TOY_COLORS = [
    o("pink", "Pink", "pink", "pink"), o("purple", "Purple", "purple", "purple"), o("black", "Black", "black", "black"),
    o("red", "Red", "red", "red"), o("blue", "Blue", "blue", "blue"), o("white", "White", "white", "white"),
    o("clear", "Transparent", "transparent", "transparent"), o("chrome", "Chrome", "chrome", "metal"),
    o("flesh", "Flesh-toned", "flesh-toned", "flesh color"), o("neon", "Neon green", "neon green", "green"),
]


def lv(id, label, text, edit, anat=(), any_of=(), tag=""):
    d = {"id": id, "label": label, "text": text, "edit": edit}
    if tag:
        d["tag"] = tag
    if anat:
        d["anatomy"] = list(anat)
    if any_of:
        d["anatomy_any"] = list(any_of)
    return d


def toy(id, label, noun, tag, levels, default=None):
    d = x(o(id, label, "", tag))
    d["noun"] = noun
    d["levels"] = levels
    d["default_level"] = default or levels[0]["id"]
    return d


TOYS = [
    toy("bullet", "Bullet vibrator", "bullet vibrator", "vibrator, sex toy, bullet vibrator", [
        lv("clit", "On the clitoris", "pressing {toy} against {pos} clitoris", "Add {toy} pressed against {pos} clitoris.", ["vulva"]),
        lv("nipple", "On a nipple", "holding {toy} against a nipple", "Add {toy} held against a nipple.", ["breasts"]),
        lv("head", "On the penis head", "pressing {toy} against the head of {pos} penis", "Add {toy} pressed against the head of {pos} penis.", ["penis"]),
    ]),
    toy("wand", "Wand massager", "wand massager", "vibrator, hitachi magic wand, sex toy", [
        lv("clit", "On the clitoris", "pressing {toy} against {pos} clitoris", "Add {toy} pressed against {pos} clitoris.", ["vulva"]),
        lv("penis", "On the penis", "pressing {toy} against {pos} penis", "Add {toy} pressed against {pos} penis.", ["penis"]),
        lv("through", "Through the panties", "pressing {toy} against {pos} crotch through {pos} underwear", "Add {toy} pressed against {pos} crotch through {pos} underwear.", any_of=["vulva", "penis"]),
    ]),
    toy("rabbit", "Rabbit vibrator", "rabbit vibrator", "vibrator, rabbit vibrator, sex toy, object insertion", [
        lv("inside", "Inside", "using {toy} with the shaft inside {pos} pussy and the ears resting on {pos} clitoris", "Add {toy} inside {pos} pussy, its ears resting on {pos} clitoris.", ["vulva"]),
    ]),
    toy("dildo", "Dildo", "dildo", "dildo, sex toy", [
        lv("pussy", "Into the pussy", "thrusting {toy} into {pos} pussy", "Add {toy} thrusting into {pos} pussy.", ["vulva"], tag="dildo insertion, object insertion, vaginal object insertion"),
        lv("anal", "Into the anus", "pushing {toy} into {pos} anus", "Add {toy} pushed into {pos} anus.", ["anus"], tag="anal object insertion, object insertion"),
        lv("lips", "At the lips", "holding {toy} to {pos} lips", "Add {toy} held to {pos} lips."),
        lv("lick", "Licking it", "licking {toy}", "Make {obj} lick {toy}.", tag="licking dildo, oral simulation"),
    ]),
    toy("suction", "Suction-cup dildo", "suction-cup dildo", "dildo, suction cup dildo, sex toy", [
        lv("floor", "Riding on the floor", "riding {toy} stuck to the floor", "Add {toy} stuck to the floor, ridden by {obj}.", any_of=["vulva", "anus"], tag="dildo riding, riding dildo"),
        lv("wall", "On the wall", "backing onto {toy} mounted on the wall", "Add {toy} mounted on the wall, with {obj} backing onto it.", any_of=["vulva", "anus"], tag="dildo, dildo on wall"),
    ]),
    toy("glass", "Glass dildo", "glass dildo", "dildo, glass dildo, sex toy", [
        lv("pussy", "Into the pussy", "sliding {toy} into {pos} pussy", "Add {toy} sliding into {pos} pussy.", ["vulva"]),
        lv("anal", "Into the anus", "sliding {toy} into {pos} anus", "Add {toy} sliding into {pos} anus.", ["anus"]),
    ]),
    toy("double", "Double-ended dildo", "double-ended dildo", "dildo, double dildo, sex toy", [
        lv("both", "Pussy and anus", "filling both {pos} pussy and {pos} anus with {toy}", "Add {toy} filling both {pos} pussy and {pos} anus.", ["vulva", "anus"], tag="double penetration, double dildo"),
    ]),
    toy("plug", "Anal plug", "anal plug", "anal plug, sex toy, butt plug", [
        lv("in", "Inserted", "wearing {toy} in {pos} anus, its jeweled base visible", "Add {toy} in {pos} anus, its jeweled base visible.", ["anus"]),
        lv("pushing", "Being inserted", "slowly pushing {toy} into {pos} anus", "Add {toy} slowly pushed into {pos} anus.", ["anus"]),
    ]),
    toy("beads", "Anal beads", "string of anal beads", "anal beads, sex toy", [
        lv("half", "Half inserted", "keeping {toy} half inserted in {pos} anus", "Add {toy} half inserted in {pos} anus.", ["anus"]),
        lv("pull", "Pulling out", "pulling {toy} out of {pos} anus", "Add {toy} being pulled out of {pos} anus.", ["anus"]),
    ]),
    toy("egg", "Remote egg", "remote egg vibrator", "egg vibrator, remote control vibrator, sex toy", [
        lv("inside", "Inside", "wearing {toy} inside {obj}, the remote in {pos} hand", "Add {toy} inside {obj}, the remote in {pos} hand.", ["vulva"]),
    ]),
    toy("stroker", "Penis stroker", "penis stroker", "masturbator, onahole, sex toy", [
        lv("slide", "Sliding", "sliding {toy} along {pos} penis", "Add {toy} sliding along {pos} penis.", ["penis"]),
    ]),
    toy("ring", "Cock ring", "cock ring", "cock ring, penis ring, sex toy", [
        lv("base", "At the base", "wearing {toy} around the base of {pos} penis", "Add {toy} around the base of {pos} penis.", ["penis"]),
    ]),
    toy("clamps", "Nipple clamps", "pair of nipple clamps", "nipple clamps, sex toy", [
        lv("both", "On both nipples", "wearing {toy} on both nipples", "Add {toy} on both nipples.", ["breasts"]),
    ]),
]

# ------------------------------------------------------------------ fluids


def fluid(id, label, tag, levels, explicit=True, anat=(), default=None):
    d = o(id, label, "", tag)
    d["levels"] = levels
    d["default_level"] = default or levels[0]["id"]
    if explicit:
        d["explicit"] = True
    if anat:
        d["anatomy"] = list(anat)
    return d


FLUIDS = [
    fluid("juice", "Pussy juices", "pussy juice, wet pussy", [
        lv("wet", "Wet", "{Pos} pussy is wet and glistening.", "Make {pos} pussy wet and glistening."),
        lv("drip", "Dripping", "{Pos} pussy is dripping with juices that run down {pos} thighs.", "Make {pos} pussy drip with juices that run down {pos} thighs.", tag="dripping, pussy juice"),
        lv("soaked", "Soaked", "{Pos} inner thighs are soaked with {pos} juices.", "Make {pos} inner thighs soaked with {pos} juices.", tag="pussy juice, wet thighs"),
    ], anat=["vulva"]),
    fluid("precum", "Precum", "precum, penis", [
        lv("bead", "A bead", "A bead of precum shines at the tip of {pos} penis.", "Add a bead of precum at the tip of {pos} penis."),
        lv("drip", "Dripping", "Precum drips from the tip of {pos} penis.", "Make precum drip from the tip of {pos} penis.", tag="dripping"),
        lv("strings", "Strings", "Strings of precum hang from the tip of {pos} penis.", "Add strings of precum hanging from the tip of {pos} penis."),
    ], anat=["penis"]),
    fluid("cum", "Cum", "cum", [
        lv("belly", "On the belly", "Cum is splashed across {pos} belly.", "Add cum splashed across {pos} belly.", tag="cum on stomach"),
        lv("breasts", "On the breasts", "Cum covers {pos} {chest}.", "Add cum covering {pos} {chest}.", tag="cum on breasts"),
        lv("thighs", "On the thighs", "Cum drips down {pos} thighs.", "Add cum dripping down {pos} thighs.", tag="cum on legs, cum drip"),
        lv("hand", "On the hand", "Cum drips from {pos} hand.", "Add cum dripping from {pos} hand.", tag="cum on hand"),
        lv("face", "On the face", "Cum is splattered across {pos} face.", "Add cum splattered across {pos} face.", tag="cum on face, facial"),
        lv("mid", "Shooting", "{Pron} {is} shooting cum from {pos} penis, mid-ejaculation.", "Show cum shooting from {pos} penis, mid-ejaculation.", ["penis"], tag="ejaculation, cumshot, cum in air"),
        lv("covered", "Covered all over", "{Pos} whole body is covered in cum.", "Cover {pos} whole body in cum.", tag="bukkake, covered in cum, cum on body"),
    ], default="belly"),
    fluid("squirt", "Squirt", "squirting, female ejaculation", [
        lv("squirt", "Squirting", "{Pron} {is} squirting.", "Make {obj} squirt."),
        lv("arc", "A powerful arc", "A powerful arc of squirt shoots from {pos} pussy.", "Add a powerful arc of squirt shooting from {pos} pussy."),
        lv("puddle", "A puddle", "A puddle of squirt soaks the surface beneath {obj}.", "Add a puddle of squirt soaking the surface beneath {obj}."),
    ], anat=["vulva"]),
    fluid("lube", "Lube", "lube, shiny skin", [
        lv("shiny", "A shiny layer", "{Pos} skin is slick with lube.", "Make {pos} skin slick with lube."),
        lv("drip", "Dripping", "Lube drips from {pos} body.", "Add lube dripping from {pos} body.", tag="dripping"),
    ]),
    fluid("oil", "Body oil", "oiled skin, shiny skin", [
        lv("light", "Lightly oiled", "{Pos} skin is lightly oiled.", "Lightly oil {pos} skin."),
        lv("glisten", "Glistening", "{Pos} oiled skin glistens under the light.", "Make {pos} oiled skin glisten under the light."),
    ], explicit=False),
    fluid("sweat", "Sweat", "sweat, sweaty", [
        lv("sheen", "A light sheen", "A light sheen of sweat covers {pos} skin.", "Add a light sheen of sweat on {pos} skin."),
        lv("drip", "Dripping", "Sweat drips down {pos} body.", "Add sweat dripping down {pos} body.", tag="dripping sweat"),
    ], explicit=False),
    fluid("saliva", "Saliva", "saliva, drooling", [
        lv("chin", "On the chin", "Drool runs down {pos} chin.", "Add drool running down {pos} chin.", tag="drooling"),
        lv("strings", "Strings", "Strings of saliva hang from {pos} lips.", "Add strings of saliva hanging from {pos} lips.", tag="saliva trail"),
    ]),
]

# -------------------------------------------------------------------- view
ANGLE = [
    o("eye", "Eye level", "straight-on, at eye level", "straight-on", "Shoot {obj} straight-on, at eye level."),
    o("low", "Low angle", "from a low angle", "from below", "Shoot {obj} from a low angle."),
    o("high", "High angle", "from a high angle", "from above", "Shoot {obj} from a high angle."),
    o("above", "From directly above", "from directly above", "from above, top-down", "Shoot {obj} from directly above."),
    o("below", "From below", "from below", "from below", "Shoot {obj} from below."),
    o("behind", "From behind", "from behind", "from behind", "Shoot {obj} from behind."),
    o("side", "From the side", "from the side", "from side", "Shoot {obj} from the side."),
    o("pov", "POV", "from a first-person point of view", "pov", "Shoot {obj} from a first-person point of view."),
    x(o("between", "From between the legs", "from between {pos} legs", "from between legs, pov", "Shoot {obj} from between {pos} legs.")),
]
FRAMING = [
    o("full", "Full body", "full body", "full body", "Frame {obj} full body.", solo="A full-body shot."),
    o("cowboy", "Knees up", "knees up", "cowboy shot", "Frame {obj} from the knees up.", solo="A cowboy shot, from the knees up."),
    o("waist", "Waist up", "waist up", "upper body", "Frame {obj} from the waist up.", solo="A waist-up shot."),
    o("portrait", "Portrait", "head and shoulders", "portrait", "Frame {obj} as a head-and-shoulders portrait.", solo="A head-and-shoulders portrait."),
    o("face", "Face close-up", "a close-up on the face", "close-up, face focus", "Frame {obj} in a close-up on the face.", solo="A close-up on the face."),
    o("feet", "Feet close-up", "a close-up on the feet", "foot focus, close-up", "Frame {obj} in a close-up on the feet.", solo="A close-up on the feet."),
    x(o("breasts", "Breasts close-up", "a close-up on the breasts", "breast focus, close-up", "Frame {obj} in a close-up on the breasts.", solo="A close-up on the breasts.", anatomy=["breasts"])),
    x(o("crotch", "Crotch close-up", "a close-up on the crotch", "crotch focus, close-up", "Frame {obj} in a close-up on the crotch.", solo="A close-up on the crotch.")),
]
