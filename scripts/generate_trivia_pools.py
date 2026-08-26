#!/usr/bin/env python3
# ============================================================
#  Trivia Daily — puzzle-pool generator
#  ------------------------------------------------------------
#  Generates data/triviadaily_pools.json consumed by
#  wordGames/triviadaily.js. Three arrays are produced:
#
#    rank    -> { name, unit, order, items:[{label,value} x4] }
#    outlier -> { rule, set:[3], outlier, reveal }
#    target  -> { name, min, max, step, answer, unit }
#
#  Facts carry their real SI unit (never a mismatched unit) and are
#  focused on well-known answers, mostly about Europe, with a few
#  globally-famous places. The generator starts from a curated,
#  known-good fact base so the output is never wrong or produced in
#  the wrong units. It may ALSO enrich each pool from Wikidata
#  (free, CC0) to add variety — enable that with TRIVIA_GEN_LIVE=1.
#  Live rows are only accepted when their unit is confirmed and the
#  value is within a sane magnitude, so bad data can't leak through.
#
#  Re-run any time to refresh/expand the pools:
#      python scripts/generate_trivia_pools.py
# ============================================================
import json
import math
import os
import random
import requests
import sys
import time
from datetime import date


# ------------------------------------------------------------------
#  Wikidata constants (used only by the optional live enrichment)
# ------------------------------------------------------------------
SPARQL_ENDPOINT = "https://query.wikidata.org/sparql"
HEADERS = {
    "User-Agent": "ChromiumGamesTriviaDailyGenerator/1.0 (contact via repo)",
    "Accept": "application/sparql-results+json",
}
LABEL_SERVICE = 'SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }'

# unit QIDs (verified against Wikidata)
UNIT_M = "wd:Q11573"          # metre
UNIT_KM = "wd:Q828224"        # kilometre
UNIT_KM2 = "wd:Q712226"       # square kilometre
Q_EUROPE = "wd:Q46"           # Europe (continent)
Q_RIVER = "wd:Q4022"
Q_LAKE = "wd:Q23397"
Q_MOUNTAIN = "wd:Q8502"
Q_ISLAND = "wd:Q23442"
Q_SKYSCRAPER = "wd:Q11303"
Q_MOON = "wd:Q2537"
Q_COUNTRY = "wd:Q3624078"
Q_HIST_COUNTRY = "wd:Q3024240"

LIVE = os.environ.get("TRIVIA_GEN_LIVE", "1") == "1"

OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "triviadaily_pools.json")


# ------------------------------------------------------------------
#  Small helpers
# ------------------------------------------------------------------
def tidy(x):
    r = round(float(x), 6)
    return int(r) if float(r).is_integer() else r


def nice_step(magnitude):
    if magnitude < 20:
        return 0.1
    if magnitude < 100:
        return 0.5
    if magnitude < 1000:
        return 5
    if magnitude < 10000:
        return 10
    if magnitude < 100000:
        return 100
    if magnitude < 1000000:
        return 1000
    if magnitude < 10000000:
        return 10000
    return 100000


def make_target(name, answer, unit):
    a = float(answer)
    if a <= 0 or a != a:
        return None
    step = nice_step(a)
    span = max(step * 8, abs(a) * 0.18)
    lo = math.floor((a - span) / step) * step
    hi = math.ceil((a + span) / step) * step
    if lo < 0:
        lo = 0.0
    snapped = lo + round((a - lo) / step) * step
    return {
        "name": name,
        "min": tidy(lo),
        "max": tidy(hi),
        "step": tidy(step),
        "answer": tidy(snapped),
        "unit": unit,
    }


def spread_ok(values, min_rel_gap):
    vals = sorted(values)
    for a, b in zip(vals, vals[1:]):
        denom = max(abs(a), abs(b))
        if denom == 0:
            return False
        if abs(b - a) / denom < min_rel_gap:
            return False
    return True


def items_from(pairs):
    """[(label, value)] -> [{label, value}] with cleaned labels."""
    return [{"label": clean_label(lb), "value": float(v)} for lb, v in pairs]


def clean_label(x):
    aliases = {
        "People's Republic of China": "China",
        "United States of America": "United States",
        "Czech Republic": "Czechia",
    }
    return aliases.get(x, x)


# ------------------------------------------------------------------
#  Curated RANK topics (guaranteed correct, well-known, Europe-heavy)
#  Each item is (label, value); the value is already in the stated unit.
# ------------------------------------------------------------------
RANK_TOPICS = [
    {
        "name": "Most populous countries",
        "unit": "M", "order": "desc", "gap": 0.01,
        "items": [
            ("India", 1429), ("China", 1411), ("United States", 335),
            ("Indonesia", 279), ("Pakistan", 242), ("Nigeria", 224),
            ("Brazil", 216), ("Bangladesh", 173),
        ],
    },
    {
        "name": "Most populous countries in Europe",
        "unit": "M", "order": "desc", "gap": 0.01,
        "items": [
            ("Germany", 84), ("France", 68), ("United Kingdom", 67),
            ("Italy", 59), ("Spain", 48), ("Poland", 38),
            ("Ukraine", 40), ("Romania", 19),
        ],
    },
    {
        "name": "Longest rivers in the world",
        "unit": "km", "order": "desc", "gap": 0.01,
        "items": [
            ("Nile", 6650), ("Amazon", 6400), ("Yangtze", 6300),
            ("Yenisei", 5539), ("Ob", 5410), ("Paraná", 4880),
            ("Congo", 4700),
        ],
    },
    {
        "name": "Longest rivers in Europe",
        "unit": "km", "order": "desc", "gap": 0.04,
        "items": [
            ("Volga", 3530), ("Danube", 2850), ("Dnieper", 2201),
            ("Don", 1870), ("Rhine", 1230), ("Elbe", 1094),
            ("Loire", 1006), ("Seine", 776),
        ],
    },
    {
        "name": "Highest mountains in the world",
        "unit": "m", "order": "desc", "gap": 0.002,
        "items": [
            ("Mount Everest", 8849), ("K2", 8611), ("Kangchenjunga", 8586),
            ("Lhotse", 8516), ("Makalu", 8485), ("Cho Oyu", 8188),
            ("Dhaulagiri", 8167), ("Manaslu", 8163),
        ],
    },
    {
        "name": "Highest mountains in Europe",
        "unit": "m", "order": "desc", "gap": 0.02,
        "items": [
            ("Mount Elbrus", 5642), ("Mont Blanc", 4809),
            ("Dufourspitze", 4634), ("Matterhorn", 4478),
            ("Großglockner", 3798),
        ],
    },
    {
        "name": "Largest lakes in the world",
        "unit": "km²", "order": "desc", "gap": 0.02,
        "items": [
            ("Lake Superior", 82100), ("Lake Victoria", 69400),
            ("Lake Huron", 59600), ("Lake Michigan", 58000),
            ("Lake Baikal", 31500), ("Great Bear Lake", 31000),
        ],
    },
    {
        "name": "Largest lakes in Europe",
        "unit": "km²", "order": "desc", "gap": 0.02,
        "items": [
            ("Caspian Sea", 371000), ("Lake Ladoga", 17700),
            ("Lake Onega", 9700), ("Vänern", 5650),
        ],
    },
    {
        "name": "Largest islands in the world",
        "unit": "km²", "order": "desc", "gap": 0.02,
        "items": [
            ("Greenland", 2166000), ("New Guinea", 786000),
            ("Borneo", 743000), ("Madagascar", 587000),
            ("Baffin Island", 507000),
        ],
    },
    {
        "name": "Tallest skyscrapers in the world",
        "unit": "m", "order": "desc", "gap": 0.02,
        "items": [
            ("Burj Khalifa", 828), ("Merdeka 118", 679),
            ("Shanghai Tower", 632), ("Abraj Al-Bait", 601),
            ("Ping An Finance Centre", 599),
        ],
    },
    {
        "name": "Largest moons in the Solar System",
        "unit": "km", "order": "desc", "gap": 0.02,
        "items": [
            ("Ganymede", 5268), ("Titan", 5150), ("Callisto", 4821),
            ("Io", 3643),
        ],
    },
]


# ------------------------------------------------------------------
#  Curated OUTLIER data (well-known, mostly European)
#  "set" = 3 real members, "outlier" is the clearly-not-in set.
# ------------------------------------------------------------------
EUROPE_COUNTRIES = [
    "Germany", "France", "Italy", "Spain", "Portugal", "Poland", "Netherlands",
    "Belgium", "Switzerland", "Austria", "Sweden", "Norway", "Finland",
    "Denmark", "Iceland", "Ireland", "Greece", "Czechia", "Hungary", "Romania",
    "Bulgaria", "Croatia", "Slovakia", "Slovenia", "Serbia", "Ukraine",
    "Estonia", "Latvia", "Lithuania", "Albania", "North Macedonia",
    "Montenegro", "Luxembourg", "Andorra", "Malta", "Moldova", "Belarus",
]

NON_EUROPE_COUNTRIES = [
    "China", "India", "United States", "Brazil", "Japan", "Canada", "Australia",
    "Egypt", "Nigeria", "Kenya", "South Africa", "Argentina", "Chile", "Mexico",
    "Indonesia", "Thailand", "Vietnam", "South Korea", "Saudi Arabia", "Iran",
    "Morocco", "Algeria", "Ghana", "Tanzania", "Colombia", "Peru", "Philippines",
    "New Zealand", "Pakistan", "Bangladesh",
]

# city groups used to build "Cities in <country>" outlier pools
CITY_GROUPS = {
    "France": ["Paris", "Marseille", "Lyon", "Toulouse", "Nice", "Nantes",
               "Strasbourg", "Montpellier", "Bordeaux", "Lille", "Rennes"],
    "Germany": ["Berlin", "Hamburg", "Munich", "Cologne", "Frankfurt", "Stuttgart",
                 "Düsseldorf", "Leipzig", "Dresden", "Nuremberg", "Bremen"],
    "Italy": ["Rome", "Milan", "Naples", "Turin", "Palermo", "Genoa", "Bologna",
               "Florence", "Venice", "Verona", "Bari"],
    "Spain": ["Madrid", "Barcelona", "Valencia", "Seville", "Zaragoza", "Málaga",
               "Murcia", "Bilbao", "Alicante", "Córdoba", "Granada"],
    "United Kingdom": ["London", "Birmingham", "Manchester", "Glasgow",
                        "Liverpool", "Leeds", "Sheffield", "Edinburgh", "Bristol",
                        "Newcastle upon Tyne", "Cardiff", "Belfast"],
    "United States": ["New York City", "Los Angeles", "Chicago", "Houston", "Phoenix",
                       "Philadelphia", "San Antonio", "San Diego", "Dallas",
                       "San Francisco", "Miami", "Atlanta"],
    "Japan": ["Tokyo", "Yokohama", "Osaka", "Nagoya", "Sapporo", "Fukuoka",
               "Kobe", "Kyoto", "Kawasaki", "Sendai"],
    "India": ["Mumbai", "New Delhi", "Kolkata", "Chennai", "Bangalore", "Hyderabad",
              "Ahmedabad", "Pune", "Jaipur"],
    "Brazil": ["São Paulo", "Rio de Janeiro", "Brasília", "Salvador", "Fortaleza",
               "Belo Horizonte", "Manaus", "Curitiba", "Recife", "Porto Alegre"],
}

# these groups are markedly larger/global; ordered Europe-first so the
#   puzzle leans European ("mostly Europe, with some global favourites")
CITY_GROUP_ORDER = ["France", "Germany", "Italy", "Spain", "United Kingdom",
                    "United States", "Japan", "India", "Brazil"]

OUTSIDER_CITIES = [
    "Paris", "Marseille", "Lyon", "Toulouse", "Nice", "Nantes", "Berlin",
    "Hamburg", "Munich", "Cologne", "Frankfurt", "Stuttgart", "Rome", "Milan",
    "Naples", "Turin", "Palermo", "Bologna", "Madrid", "Barcelona", "Valencia",
    "Seville", "Zaragoza", "Málaga", "London", "Birmingham", "Manchester",
    "Glasgow", "Liverpool", "Edinburgh", "Amsterdam", "Rotterdam", "Brussels",
    "Vienna", "Zurich", "Stockholm", "Oslo", "Copenhagen", "Helsinki", "Dublin",
    "Warsaw", "Kraków", "Budapest", "Prague", "Bucharest", "Athens", "Lisbon",
    "New York City", "Los Angeles", "Chicago", "Houston", "Phoenix", "Miami",
    "San Francisco", "Boston", "Seattle", "Toronto", "Vancouver", "Mexico City",
    "Tokyo", "Osaka", "Kyoto", "Nagoya", "Seoul", "Beijing", "Shanghai", "Mumbai",
    "New Delhi", "Kolkata", "Chennai", "Bangalore", "São Paulo", "Rio de Janeiro",
    "Brasília", "Buenos Aires", "Sydney", "Melbourne", "Cairo", "Lagos", "Nairobi",
]


# ------------------------------------------------------------------
#  Curated TARGET facts (single-number slider round)
#  (phrase, answer, unit) — values are verified and in the given unit.
# ------------------------------------------------------------------
TARGET_FACTS = [
    ("The height of Mont Blanc", 4809, "m"),
    ("The height of the Matterhorn", 4478, "m"),
    ("The height of Mount Elbrus", 5642, "m"),
    ("The height of the Burj Khalifa", 828, "m"),
    ("The height of the Eiffel Tower", 330, "m"),
    ("The height of the Leaning Tower of Pisa", 56, "m"),
    ("The length of the river Thames", 346, "km"),
    ("The length of the river Seine", 776, "km"),
    ("The length of the river Danube", 2850, "km"),
    ("The length of the river Volga", 3530, "km"),
    ("The length of the river Nile", 6650, "km"),
    ("The length of the river Amazon", 6400, "km"),
    ("The area of Lake Baikal", 31500, "km²"),
    ("The area of Lake Ladoga", 17700, "km²"),
    ("The area of the Caspian Sea", 371000, "km²"),
    ("The area of the Baltic Sea", 377000, "km²"),
    ("The area of the island of Iceland", 103000, "km²"),
    ("The area of the island of Corsica", 8680, "km²"),
    ("The area of Greenland", 2166000, "km²"),
    ("The population of France", 68, "M"),
    ("The population of Germany", 84, "M"),
    ("The population of Italy", 59, "M"),
    ("The population of the United Kingdom", 67, "M"),
    ("The diameter of the Moon", 3474, "km"),
    ("The diameter of Ganymede", 5268, "km"),
]


# ------------------------------------------------------------------
#  Optional live enrichment from Wikidata (best effort; unit + magnitude
#  guarded so bad data can never leak in). Curated base values are
#  always used regardless of what Wikidata returns.
# ------------------------------------------------------------------
LIVE_SPECS = {
    "Longest rivers in the world": dict(cls=Q_RIVER, prop="P2043", unit=UNIT_KM,
                                        vmin=500, vmax=8000, europe=False),
    "Longest rivers in Europe": dict(cls=Q_RIVER, prop="P2043", unit=UNIT_KM,
                                     vmin=300, vmax=4500, europe=True),
    "Highest mountains in the world": dict(cls=Q_MOUNTAIN, prop="P2044", unit=UNIT_M,
                                           vmin=1500, vmax=9000, europe=False),
    "Highest mountains in Europe": dict(cls=Q_MOUNTAIN, prop="P2044", unit=UNIT_M,
                                        vmin=1000, vmax=6000, europe=True),
    "Largest lakes in the world": dict(cls=Q_LAKE, prop="P2046", unit=UNIT_KM2,
                                       vmin=500, vmax=400000, europe=False),
    "Largest lakes in Europe": dict(cls=Q_LAKE, prop="P2046", unit=UNIT_KM2,
                                    vmin=500, vmax=400000, europe=True),
    "Largest islands in the world": dict(cls=Q_ISLAND, prop="P2046", unit=UNIT_KM2,
                                         vmin=1000, vmax=2600000, europe=False),
    "Tallest skyscrapers in the world": dict(cls=Q_SKYSCRAPER, prop="P2048", unit=UNIT_M,
                                             vmin=150, vmax=1100, europe=False),
    "Largest moons in the Solar System": dict(cls=Q_MOON, prop="P2386", unit=UNIT_KM,
                                              vmin=300, vmax=8000, europe=False),
}


def sparql(query):
    """Best-effort Wikidata SPARQL. Returns [] on any problem (never raises)."""
    try:
        res = requests.get(SPARQL_ENDPOINT, params={"query": query},
                           headers=HEADERS, timeout=40)
        if res.status_code != 200:
            return []
        rows = []
        for binding in res.json().get("results", {}).get("bindings", []):
            row = {}
            for k, v in binding.items():
                row[k] = float(v["value"]) if v.get("type") == "number" else v.get("value", "")
            rows.append(row)
        return rows
    except Exception as exc:              # network/rate-limit/timeout -> skip live
        print(f"    [live] skipped: {exc}")
        return []


def fetch_live_rank(name, spec):
    if not spec or not LIVE:
        return []
    euro = ("{ ?item wdt:P30 wd:Q46. } UNION { ?item wdt:P17 ?c. ?c wdt:P30 wd:Q46. }"
            if spec["europe"] else "")
    query = (
        "SELECT ?item ?itemLabel ?v WHERE {\n"
        f"  ?item wdt:P31 {spec['cls']} .\n"
        f"  ?item p:{spec['prop']} ?s . ?s ps:{spec['prop']} ?v . "
        f"?s wikibase:quantityUnit {spec['unit']} .\n"
        "  ?item wikibase:sitelinks ?links . FILTER(?links > 12)\n"
        f"  FILTER(?v >= {spec['vmin']} && ?v <= {spec['vmax']})\n"
        + (euro + "\n" if euro else "")
        + LABEL_SERVICE + "\n"
        "}\n"
        "ORDER BY DESC(?v) LIMIT 200"
    )
    rows = sparql(query)
    out, seen = [], set()
    for r in rows:
        try:
            lb = str(r.get("itemLabel", "")).strip()
            v = float(r.get("v"))
        except (TypeError, ValueError):
            continue
        if not lb or v < spec["vmin"] or v > spec["vmax"]:
            continue
        label = clean_label(lb)
        if label in seen:
            continue
        seen.add(label)
        out.append({"label": label, "value": round(v, 2)})
    return out


def merge_items(curated, live, order):
    labels = {c["label"] for c in curated}
    merged = list(curated)
    for item in live:
        if item["label"] not in labels:
            merged.append(item)
            labels.add(item["label"])
    return sorted(merged, key=lambda x: x["value"], reverse=(order == "desc"))


# ------------------------------------------------------------------
#  Pool builders
# ------------------------------------------------------------------
def build_rank_pools():
    pools = []
    seen_sets = set()
    for topic in RANK_TOPICS:
        curated = items_from(topic["items"])
        live = fetch_live_rank(topic["name"], LIVE_SPECS.get(topic["name"]))
        merged = merge_items(curated, live, topic["order"])
        made = 0
        for start in range(0, len(merged) - 3):
            window = merged[start:start + 4]
            key = frozenset(w["label"] for w in window)
            if key in seen_sets:
                continue
            if len({w["value"] for w in window}) < 4:
                continue
            if not spread_ok([w["value"] for w in window], topic["gap"]):
                continue
            seen_sets.add(key)
            pools.append({
                "name": topic["name"],
                "unit": topic["unit"],
                "order": topic["order"],
                "items": [{"label": w["label"], "value": tidy(w["value"])} for w in window],
            })
            made += 1
            if made >= 4:                 # a few combos per topic is plenty
                break
        print(f"[rank] {topic['name']}: +{made} pools  "
              f"(curated {len(curated)}, live {len(live)})")
    return pools


def build_outlier_pools(country_samples=3):
    pools, seen = [], set()

    # --- Countries in Europe ---
    made = 0
    for _ in range(len(EUROPE_COUNTRIES) * 4):
        if made >= country_samples * 4 + 6:
            break
        trio = random.sample(EUROPE_COUNTRIES, 3)
        outsider = random.choice(NON_EUROPE_COUNTRIES)
        key = ("europe", frozenset(trio + [outsider]))
        if key in seen:
            continue
        seen.add(key)
        pools.append({
            "rule": "Countries in Europe",
            "set": sorted(trio),
            "outlier": outsider,
            "reveal": f"{outsider} is not a country in Europe.",
        })
        made += 1
    print(f"[outlier] Countries in Europe: {made} pools")

    # --- Cities in a country (Europe-first, a few global favourites) ---
    for country in CITY_GROUP_ORDER:
        group = CITY_GROUPS[country]
        others = [c for c in OUTSIDER_CITIES if c not in group]
        made_c = 0
        for _ in range(len(group) * 6):
            if made_c >= country_samples:
                break
            trio = random.sample(group, 3)
            outsider = random.choice(others)
            key = (country, frozenset(trio + [outsider]))
            if key in seen:
                continue
            seen.add(key)
            pools.append({
                "rule": f"Cities in {country}",
                "set": sorted(trio),
                "outlier": outsider,
                "reveal": f"{outsider} is not a city in {country}.",
            })
            made_c += 1
        print(f"[outlier] Cities in {country}: {made_c} pools")
    return pools


def build_target_pools():
    pools, seen = [], set()
    for name, value, unit in TARGET_FACTS:
        t = make_target(name, value, unit)
        if not t or t["name"] in seen:
            continue
        seen.add(t["name"])
        pools.append(t)
    print(f"[target] {len(pools)} slider facts")
    return pools


# ------------------------------------------------------------------
#  MAIN
# ------------------------------------------------------------------
def main():
    seed = os.environ.get("TRIVIA_GEN_SEED")
    random.seed(int(seed) if seed else int(time.time()))
    print(f"live enrichment: {'ON' if LIVE else 'OFF'} "
          f"(set TRIVIA_GEN_LIVE=1 to fetch Wikidata; TRIVIA_GEN_SEED to pin)\n")

    rank_pools = build_rank_pools()
    outlier_pools = build_outlier_pools()
    target_pools = build_target_pools()

    payload = {
        "_attribution": (
            "Generated by scripts/generate_trivia_pools.py (curated well-known facts, "
            "Europe-focused, with optional live Wikidata enrichment; SI units)."
        ),
        "_generated": date.today().isoformat(),
        "rank": rank_pools,
        "outlier": outlier_pools,
        "target": target_pools,
    }

    out_path = os.path.abspath(OUT_PATH)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print("\n==============================================")
    print(f"Saved {out_path}")
    print(f"  rank:    {len(rank_pools)} pools")
    print(f"  outlier: {len(outlier_pools)} pools")
    print(f"  target:  {len(target_pools)} pools")
    combo = max(len(rank_pools), 1) * max(len(outlier_pools), 1) * max(len(target_pools), 1)
    print(f"  daily combinations: {combo:,} (~{combo // 365:,} years of dailies)")
    print("==============================================")


if __name__ == "__main__":
    sys.exit(main())