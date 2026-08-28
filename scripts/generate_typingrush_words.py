import json
import math
import random
import urllib.request
import time

# ============================================================
# Typing Rush — tiered dictionary generator
# Downloads the "an-array-of-english-words" corpus, scores every word
# by length + letter rarity + repetition, then buckets words into 12
# escalating difficulty tiers saved to data/typingrush_words.json
# ============================================================

random.seed(20260828)

SOURCE_URL = "https://cdn.jsdelivr.net/npm/an-array-of-english-words@2.0.0/index.json"
OUT_PATH = "data/typingrush_words.json"
TIER_COUNT = 12
WORDS_PER_TIER = 200
MIN_LEN = 3
MAX_LEN = 14

# English letter frequency (percent) — rarer letters make typing harder
FREQ = {
    'e': 12.7, 't': 9.1, 'a': 8.2, 'o': 7.5, 'i': 7.0, 'n': 6.7, 's': 6.3,
    'h': 6.1, 'r': 6.0, 'd': 4.3, 'l': 4.0, 'c': 2.8, 'u': 2.8, 'm': 2.4,
    'w': 2.4, 'f': 2.2, 'g': 2.0, 'y': 2.0, 'p': 1.9, 'b': 1.5, 'v': 1.0,
    'k': 0.8, 'j': 0.15, 'x': 0.15, 'q': 0.1, 'z': 0.07,
}

LEN_WEIGHT = {3: 1, 4: 2, 5: 4, 6: 7, 7: 11, 8: 16, 9: 22, 10: 29, 11: 37, 12: 46, 13: 56, 14: 67}


def word_score(w):
    s = LEN_WEIGHT.get(len(w), 70)
    for c in w:
        s += 0.9 / math.sqrt(FREQ.get(c, 1.0))
    # Repeated letters are slightly harder to type accurately
    s += (len(w) - len(set(w))) * 1.2
    return round(s, 3)


def is_playable(w):
    if not (MIN_LEN <= len(w) <= MAX_LEN):
        return False
    if not all('a' <= c <= 'z' for c in w):
        return False
    # No 3+ consecutive identical letters (e.g. "aaah")
    for i in range(len(w) - 2):
        if w[i] == w[i + 1] == w[i + 2]:
            return False
    # Too many ultra-rare letters at once makes a word feel like Scrabble soup
    rare = sum(1 for c in w if c in 'jqxz')
    if rare > 2:
        return False
    return True


def fetch_words():
    print(f"Fetching {SOURCE_URL} ...")
    req = urllib.request.Request(SOURCE_URL, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.loads(r.read().decode('utf-8'))
    print(f"  -> fetched {len(data)} raw words")
    return data


# -----------------------------------------------
# Offline fallback corpus (used if the network is unavailable)
# -----------------------------------------------
FALLBACK_WORDS = [
    # 3-letter
    "the", "and", "you", "for", "are", "but", "not", "all", "can", "day",
    "get", "had", "her", "him", "his", "how", "new", "now", "old", "one",
    "out", "own", "put", "say", "see", "two", "use", "way", "who", "why",
    "yes", "cat", "dog", "sun", "red", "big", "box", "key", "top", "map",
    "sky", "hat", "cup", "bug", "jet", "fan", "ice", "pen", "fox", "egg",
    "bee", "ant", "cow", "pig", "hen", "rat", "bat", "car", "bus", "toy",
    "bed", "log", "net", "rug", "jam", "mud", "nut", "dot", "kit", "zip",
    "arm", "bag", "bar", "bow", "cab", "dig", "ear", "fig", "gum", "hut",
    "ink", "kid", "leg", "lip", "nap", "rib", "tag", "van", "war", "wax",
    "zoo", "ago", "bit", "cut", "dry", "eel", "fat", "gas", "hot", "ill",
    "job", "law", "mix", "off", "pin", "raw", "sad", "tie", "urn", "wet",
    # 4-letter
    "able", "back", "bank", "ball", "bear", "beat", "bill", "bird", "bite",
    "blue", "boat", "body", "bone", "book", "boot", "born", "both", "bowl",
    "burn", "cake", "call", "calm", "camp", "card", "care", "case", "cash",
    "cast", "cell", "chat", "chip", "city", "clay", "club", "coal", "coat",
    "code", "coin", "cold", "come", "cook", "cool", "copy", "core", "corn",
    "cost", "crew", "crop", "cube", "dart", "date", "dawn", "deal", "debt",
    "deep", "deer", "desk", "diet", "dive", "door", "dove", "down", "drag",
    "draw", "drop", "drum", "duck", "dust", "earn", "each", "east", "echo",
    "edge", "fade", "fair", "fast", "fear", "feet", "file", "fill", "film",
    "find", "fine", "fire", "fish", "five", "flag", "flat", "flow", "foam",
    "fold", "food", "foot", "fork", "form", "free", "frog", "fuel", "full",
    "gain", "game", "gate", "gear", "gift", "girl", "give", "glad", "glow",
    "goal", "gold", "golf", "good", "grab", "gray", "grow", "hair", "half",
    "hand", "hard", "heat", "hero", "high", "hill", "hint", "hire", "hold",
    "hole", "home", "hope", "host", "huge", "hunt", "icon", "idea", "inch",
    "iron", "item", "join", "joke", "jump", "just", "keep", "kick", "kind",
    "king", "kiss", "kite", "knee", "knew", "knob", "knot", "lamb", "lamp",
    "land", "lane", "late", "lawn", "lazy", "lead", "leaf", "lean", "left",
    "lens", "lift", "like", "limb", "lime", "line", "link", "lion", "list",
    "live", "load", "loan", "lock", "logo", "long", "look", "lord", "lose",
    "loud", "love", "luck", "lump", "lung", "made", "mail", "main", "make",
    "male", "mall", "many", "mark", "mask", "mast", "mate", "math", "meal",
    "mean", "meat", "meet", "melt", "menu", "mesh", "mice", "milk", "mind",
    "mine", "mint", "miss", "mode", "mole", "moon", "more", "most", "move",
    "much", "mule", "must", "nail", "name", "near", "neat", "neck", "need",
    "news", "nice", "nine", "node", "noon", "nose", "note", "noun", "obey",
    "oven", "pace", "pack", "page", "paid", "pain", "pair", "palm", "park",
    "part", "pass", "past", "path", "peak", "pear", "perk", "pest", "pick",
    "pile", "pill", "pine", "pink", "pipe", "plan", "play", "plot", "plug",
    "plus", "poem", "pole", "pond", "pool", "pose", "post", "pour", "puff",
    "pull", "pure", "push", "quit", "quiz", "rain", "ramp", "rank", "rare",
    "rate", "read", "real", "reef", "rely", "rice", "rich", "ride", "ring",
    "ripe", "rise", "risk", "road", "rock", "role", "roll", "roof", "room",
    "root", "rope", "rose", "ruin", "rule", "rung", "rush", "rust", "salt",
    "safe", "sail", "sale", "same", "sand", "save", "saw", "scan", "scar",
    "seal", "seat", "seed", "seek", "seem", "self", "sell", "send", "ship",
    "shoe", "shop", "shot", "shut", "sick", "side", "sign", "silk", "sing",
    "sink", "site", "size", "skin", "skip", "slam", "slap", "sled", "slim",
    "slip", "slow", "snap", "snow", "soap", "soak", "sock", "sofa", "soft",
    "soil", "sold", "sole", "song", "soon", "sort", "soup", "sour", "spin",
    "spit", "spot", "star", "stay", "stem", "step", "stir", "stow", "suit",
    "tack", "tail", "take", "tale", "talk", "tall", "tank", "tape", "task",
    "team", "tear", "tell", "tend", "tent", "term", "test", "text", "than",
    "that", "then", "they", "thin", "this", "thus", "tick", "tide", "tile",
    "till", "time", "tiny", "tire", "toil", "tone", "took", "tool", "tore",
    "torn", "toss", "tour", "town", "trap", "tray", "tree", "trim", "trip",
    "tube", "tune", "turn", "twin", "unit", "upon", "vain", "vast", "vein",
    "vent", "verb", "very", "vest", "veto", "view", "vine", "visa", "void",
    "vote", "wage", "wait", "wake", "walk", "wall", "want", "warm", "warn",
    "wash", "wave", "weak", "wear", "week", "well", "went", "were", "west",
    "what", "when", "wide", "wife", "wild", "will", "wind", "wine", "wing",
    "wipe", "wire", "wise", "wish", "with", "wolf", "wood", "wool", "word",
    "wore", "work", "worm", "worn", "wrap", "yard", "yarn", "year", "yell",
    "yoke", "your", "zero", "zone",
    # 5 letters
    "about", "above", "actor", "acute", "admit", "adult", "after", "again",
    "agent", "agree", "ahead", "alarm", "album", "alert", "alien", "alive",
    "allow", "alone", "along", "alter", "among", "anger", "angle", "angry",
    "apart", "apple", "apply", "arena", "argue", "arise", "array", "aside",
    "asset", "audio", "audit", "avoid", "awake", "aware", "badly", "basic",
    "basis", "beach", "began", "begin", "being", "below", "bench", "berry",
    "birth", "black", "blade", "blame", "blank", "blast", "blaze", "bleed",
    "blend", "bless", "blind", "block", "blood", "bloom", "blown", "board",
    "boast", "bonus", "boost", "bound", "brain", "brand", "brave", "bread",
    "break", "breed", "brick", "bride", "brief", "bring", "broad", "broke",
    "brook", "brown", "brush", "build", "built", "bunch", "burst", "cabin",
    "cable", "camel", "candy", "canoe", "cargo", "carry", "carve", "cause",
    "cease", "chain", "chalk", "champ", "chant", "charm", "chart", "chase",
    "cheat", "check", "cheek", "cheer", "chest", "chief", "child", "chill",
    "china", "chord", "chose", "chunk", "civil", "claim", "clamp", "clash",
    "class", "clean", "clear", "cleat", "clerk", "click", "cliff", "climb",
    "cling", "cloak", "clock", "close", "cloth", "cloud", "clown", "coach",
    "coast", "cobra", "comic", "coral", "couch", "cough", "count", "court",
    "cover", "crack", "craft", "crane", "crash", "crawl", "creek", "creep",
    "crest", "crime", "crisp", "cross", "crowd", "crown", "cruel", "crush",
    "curve", "cycle",
    # 6 letters (a-m)
    "dagger", "dancer", "danger", "debate", "decade", "decide", "defeat",
    "defend", "define", "degree", "demand", "denial", "depart", "depend",
    "desert", "design", "desire", "detail", "detect", "device", "devote",
    "dinner", "direct", "divide", "dollar", "domain", "double", "dragon",
    "during", "eager", "easily", "economy", "effort", "either", "elect",
    "empire", "employ", "enable", "energy", "engage", "engine", "enough",
    "ensure", "entire", "entity", "escape", "estate", "ethnic", "evolve",
    "exceed", "except", "excite", "expand", "expect", "expert", "export",
    "expose", "extend", "fabric", "factor", "family", "famous", "farmer",
    "fatal", "favor", "feature", "fiber", "fiction", "figure", "filter",
    "final", "finance", "finger", "finish", "fiscal", "flame", "flavor",
    "flight", "flower", "formal", "format", "forum", "fossil", "foster",
    "fought", "freedom", "freeze", "friend", "front", "frost", "frozen",
    "future", "galaxy", "garden", "gather", "gender", "genius", "gentle",
    "gesture", "giant", "glacier", "glance", "global", "golden", "govern",
    "grace", "grand", "grant", "graphic", "gravity", "great", "ground",
    "growth", "guilty", "guitar", "hammer", "handle", "happen", "harbor",
    "harvest", "hazard", "health", "heaven", "height", "helpful", "heroic",
    "hidden", "highway", "history", "hollow", "honest", "honey", "honor",
    "horizon", "hostile", "hunger", "hunter", "ignore", "illness", "imagine",
    "impact", "import", "impose", "income", "indeed", "indoor", "infant",
    "inform", "injury", "inland", "insect", "insert", "insist", "intact",
    "intend", "intent", "invest", "invite", "island", "itself", "jacket",
    "jungle", "junior", "kayak", "kernel", "kettle", "kindle", "kingdom",
    "kitten", "knight", "label", "labor", "lagoon", "latter", "launch",
    "laundry", "lawyer", "leader", "leather", "lecture", "legend", "leisure",
    "letter", "library", "license", "likely", "linear", "liquid", "listen",
    "little", "lively", "living", "lobby", "local", "locate", "lonely",
    "lounge", "loyal", "lucky", "luxury", "machine", "magic", "magnet",
    "major", "manner", "manual", "marble", "margin", "marine", "market",
    "mascot", "master", "matter", "mature", "maximum", "meadow", "measure",
    "medal", "medical", "medium", "member", "memory", "mental", "mention",
    "mentor", "mercy", "merge", "metal", "method", "middle", "might",
    "mighty", "minute", "miracle", "mirror", "mission", "mobile", "modern",
    "modest", "module", "moment", "monitor", "monkey", "moral", "morning",
    "motion", "mountain", "movement", "museum", "musical", "mutual", "mystery",
    # 6-7 letters (n-z)
    "nation", "nature", "nectar", "needle", "nerve", "network", "neutral",
    "notice", "notion", "novel", "nuclear", "number", "nurse", "object",
    "obtain", "occupy", "offend", "office", "often", "online", "opening",
    "operate", "opinion", "oppose", "option", "orange", "orbit", "ordinary",
    "organic", "origin", "outcome", "outdoor", "outline", "output", "oxygen",
    "pacific", "package", "palace", "panic", "parade", "parcel", "parent",
    "partly", "passage", "passion", "passive", "patent", "patrol", "pattern",
    "pause", "payment", "peace", "pebble", "penalty", "pencil", "people",
    "pepper", "percent", "perfect", "perform", "period", "permit", "person",
    "phrase", "physics", "picture", "pillar", "pilot", "pirate", "pitch",
    "planet", "plasma", "plenty", "pocket", "poetry", "police", "policy",
    "polish", "popular", "portal", "portion", "portrait", "position", "possess",
    "potato", "pottery", "poverty", "powder", "prayer", "precise", "predict",
    "prefer", "premium", "prepare", "present", "pressed", "pressure", "pretend",
    "pretty", "prevent", "primary", "prince", "printer", "prison", "privacy",
    "private", "prize", "problem", "process", "produce", "product", "profile",
    "profit", "program", "progress", "project", "promise", "promote", "proper",
    "prospect", "protest", "proud", "prove", "provide", "public", "publish",
    "puddle", "purpose", "pursue", "puzzle", "quality", "quantum", "quarter",
    "queen", "quest", "quick", "quiet", "quite", "radical", "radius", "rally",
    "random", "rapid", "rather", "react", "reader", "reality", "realize",
    "reason", "recall", "receive", "recent", "recipe", "recover", "reduce",
    "reflect", "reform", "refuge", "region", "regular", "reject", "relate",
    "relax", "relief", "remain", "remark", "remind", "remote", "remove",
    "render", "rental", "repair", "repeat", "replace", "report", "request",
    "require", "rescue", "reserve", "resist", "resolve", "resort", "respect",
    "respond", "result", "retail", "retire", "return", "reveal", "review",
    "reward", "rhythm", "ribbon", "riddle", "rival", "rocket", "rotten",
    "rough", "round", "routine", "royal", "runner", "rural", "sacred",
    "saddle", "safari", "safety", "salary", "sample", "savage", "scale",
    "scandal", "scarce", "scared", "scarf", "scene", "scheme", "scholar",
    "school", "science", "screen", "script", "search", "season", "second",
    "secret", "section", "secure", "select", "senior", "sensor", "series",
    "session", "settle", "severe", "shadow", "shallow", "shape", "share",
    "sharp", "sheet", "shelter", "shield", "shine", "shock", "shore", "short",
    "should", "shower", "signal", "silent", "silver", "similar", "simple",
    "simply", "sincere", "single", "sister", "sixteen", "sketch", "skill",
    "skirt", "sleeve", "slice", "slide", "slight", "slope", "smart", "smooth",
    "snack", "social", "society", "socket", "solar", "soldier", "solid",
    "solution", "somehow", "someone", "sonic", "sorrow", "sorry", "source",
    "south", "space", "spare", "spark", "speaker", "special", "species",
    "specific", "spectrum", "speech", "speed", "spell", "spend", "sphere",
    "spicy", "spider", "spirit", "split", "spoke", "sponsor", "sport",
    "spread", "spring", "square", "stable", "staff", "stage", "stain",
    "stairs", "stamp", "stand", "staple", "stare", "start", "static",
    "station", "statue", "status", "steady", "steam", "steel", "steep",
    "stellar", "stereo", "stick", "still", "stock", "stone", "stood",
    "store", "storm", "story", "stove", "straight", "strange", "strategy",
    "stream", "street", "strength", "stress", "stretch", "strict", "strike",
    "string", "strip", "strong", "structure", "struggle", "student", "studio",
    "study", "stuff", "stupid", "style",
    # 7+ letters (the hardest fallback pool)
    "subject", "submit", "substance", "suburban", "succeed", "success",
    "sudden", "suffer", "sugar", "suggest", "summer", "summit", "sunset",
    "superior", "supply", "support", "suppose", "surface", "surgery",
    "surprise", "survey", "survive", "sustain", "swallow", "swear", "sweep",
    "sweet", "swift", "swing", "switch", "symbol", "symptom", "system",
    "tablet", "tactics", "talent", "target", "taste", "tavern", "teacher",
    "technique", "technology", "temple", "tender", "tennis", "tension",
    "terrain", "terrible", "territory", "terror", "thank", "theme", "theory",
    "therapy", "there", "thick", "thing", "think", "third", "thirty",
    "though", "thought", "thousand", "thread", "threat", "three", "thrive",
    "through", "throw", "thumb", "thunder", "ticket", "tight", "timber",
    "tissue", "title", "today", "token", "tomorrow", "tongue", "tonight",
    "topic", "tornado", "torture", "total", "touch", "tough", "toward",
    "toxic", "trace", "track", "tractor", "trade", "traffic", "tragedy",
    "trail", "train", "traitor", "transfer", "transform", "transport",
    "trash", "travel", "treasure", "treat", "trend", "trial", "triangle",
    "tribe", "tribute", "trick", "tried", "trigger", "trio", "triumph",
    "troop", "tropical", "trouble", "trousers", "truck", "truly", "trumpet",
    "trust", "truth", "tunnel", "turkey", "turtle", "tutor", "twice",
    "twist", "twister", "typical", "tyrant", "ultra", "unable", "uncle",
    "underground", "understand", "uneven", "unfair", "unique", "united",
    "universal", "unknown", "unless", "unusual", "update", "upgrade",
    "uphold", "upper", "upset", "upstairs", "upward", "urban", "urge",
    "usage", "useful", "useless", "usual", "utility", "utter", "vacant",
    "vacuum", "vague", "valid", "valley", "value", "vanish", "vapour",
    "various", "vector", "vegetable", "vehicle", "velvet", "vendor", "venture",
    "verbal", "verify", "versus", "vertical", "vessel", "veteran", "viable",
    "vibrant", "victim", "victory", "video", "viewpoint", "village", "violate",
    "violent", "virtue", "visible", "vision", "visitor", "visual", "vital",
    "vivid", "vocal", "volume", "volunteer", "voucher", "voyage", "wagon",
    "wander", "warmth", "warning", "warrior", "waste", "watch", "water",
    "wealth", "weapon", "weather", "welcome", "welfare", "wonderful",
    "workshop", "world", "worry", "worthy", "wound", "wrist", "writer",
    "yellow", "yield", "young", "youth", "zealous", "zebra", "zigzag",
    "zipper"
    # __FALLBACK_END__
]


def get_source_words():
    try:
        return fetch_words()
    except Exception as e:
        print(f"  ! network unavailable ({e}). Using bundled fallback corpus.")
        return FALLBACK_WORDS


def build_tiers(words):
    scored = [(w.lower(), word_score(w)) for w in words if is_playable(w.lower())]
    scored.sort(key=lambda pair: (pair[1], pair[0]))
    n = len(scored)
    print(f"  -> {n} playable words after filtering")

    tiers = []
    meta_tiers = []
    for t in range(TIER_COUNT):
        lo = (n * t) // TIER_COUNT
        hi = (n * (t + 1)) // TIER_COUNT
        band = scored[lo:hi]
        if len(band) <= WORDS_PER_TIER:
            sample = list(band)
        else:
            sample = random.sample(band, WORDS_PER_TIER)
        # Shuffle the sample so each tier feels varied, not sorted-by-length
        random.shuffle(sample)
        vals = [w.upper() for w, _s in sample]
        tiers.append(vals)
        meta_tiers.append({
            "words": len(vals),
            "minLen": min(len(w) for w in vals),
            "maxLen": max(len(w) for w in vals),
            "avgScore": round(sum(s for _w, s in sample) / len(sample), 2),
            "scoreRange": [round(min(s for _w, s in sample), 1), round(max(s for _w, s in sample), 1)],
        })
    return tiers, meta_tiers


def main():
    words = get_source_words()
    tiers, meta_tiers = build_tiers(words)

    dataset = {
        "meta": {
            "generated": time.strftime("%Y-%m-%d"),
            "tiers": TIER_COUNT,
            "wordsPerTier": WORDS_PER_TIER,
            "minLen": MIN_LEN,
            "maxLen": MAX_LEN,
            "totalWords": sum(len(t) for t in tiers),
            "difficulty": meta_tiers,
        },
        "tiers": tiers,
    }

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(dataset, f)
    print(f"\nWrote {OUT_PATH}: {dataset['meta']['totalWords']} words across {TIER_COUNT} tiers.")
    for i, mt in enumerate(meta_tiers, start=1):
        print(f"  tier {i:>2}: {mt['words']:<3} words  len {mt['minLen']}-{mt['maxLen']}  "
              f"avgScore {mt['avgScore']:<7} range {mt['scoreRange']}")


if __name__ == "__main__":
    main()