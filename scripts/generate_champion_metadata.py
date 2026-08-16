#!/usr/bin/env python3
"""
generate_champion_metadata.py

Reads the local Meraki champions JSON snapshot (wordGames/data/champions.json),
infer gender, species, position, region and releaseYear for each champion using
heuristics, and writes a cleaned metadata JSON suitable to be used as the
CHAMPION_DETAILS-like mapping in loldle.js.

Usage:
  python scripts/generate_champion_metadata.py \
      --input ../data/champions.json \
      --output ../data/champion_details.json

The script is intentionally dependency-free (only Python stdlib) and works on
Windows. Adjust input/output paths as needed.

Heuristics used:
- Gender: counts of pronouns and a small phrase lookup (he/his/him vs she/her etc.).
- Species: substring keyword matching in lore/blurb/title/faction.
- Region: uses `faction` when available; otherwise keyword matching in lore/blurb/title.
- Position: maps the Meraki positions list to human-friendly single or comma-joined string.
- releaseYear: parsed from releaseDate or release fields when available.

A small MANUAL_OVERRIDES dict is provided to fix known edge cases. Extend it as needed.
"""

from __future__ import annotations
import json
import re
import argparse
from pathlib import Path
from typing import Dict, Any


# --- Manual overrides (add or edit to correct heuristics) ---
# Keys should match the champion 'key' or name used by Meraki (e.g. "Aatrox", "Akali")
MANUAL_OVERRIDES: Dict[str, Dict[str, Any]] = {
    # Examples (customize as needed):
    "Bard": {"gender": "Other", "species": "Celestial"},
    "Thresh": {"gender": "Male", "species": "Undead, Spirit", "region": "Shadow Isles"},
    "Kindred": {"gender": "Other", "species": "Spirit"},
    "Fiddlesticks": {"gender": "Other", "species": "Demon, Spirit"},
    "Blitzcrank": {"gender": "Other", "species": "Golem"},
}


GENDER_KEYWORDS = {
    "female": [r"\bshe\b", r"\bher\b", r"\bhers\b", r"\bmrs?\b", r"\bgirl\b", r"\bwoman\b", r"\bdaughter\b", r"\bmother\b"],
    "male": [r"\bhe\b", r"\bhim\b", r"\bhis\b", r"\bmr\b", r"\bboy\b", r"\bman\b", r"\bson\b", r"\bfather\b"],
    "other": [r"\bthey\b", r"\bthem\b", r"\btheir\b", r"\bthemself\b", r"\bother\b"],
}

SPECIES_KEYWORDS = {
    "Vastaya": ["vastaya", "vastayan"],
    "Yordle": ["yordle"],
    "Human": ["human", "woman", "man", "girl", "boy", "prince", "princess"],
    "Void": ["voidborn", "void", "voidborn "],
    "Undead": ["undead", "wight", "ghost", "spirit", " revenant"],
    "Spirit": ["spirit", "god", "celestial", "wanderer"],
    "Dragon": ["dragon", "drac", "wyrm"],
    "Darkin": ["darkin"],
    "Demon": ["demon", "devil"],
    "Sentinel": ["sentinel"],
    "Mech": ["mech", "mecha", "robot", "golem"],
    "Targon": ["targon", "celestial"],
    "Ascended": ["ascended"],
    "Undying": ["undying"],
}

REGION_KEYWORDS = {
    "Demacia": ["demacia"],
    "Noxus": ["noxus"],
    "Ionia": ["ionia"],
    "Freljord": ["freljord"],
    "Piltover/Zaun": ["piltover", "zaun"],
    "Bilgewater": ["bilgewater"],
    "Shurima": ["shurima"],
    "Targon": ["targon"],
    "Shadow Isles": ["shadow isles", "shadow isle", "shadow isle", "shadow"],
    "The Void": ["the void", "void"],
    "Bandle City": ["bandle", "bandle city"],
    "Ixtal": ["ixtal"],
}

POSITION_MAP = {
    "top": "Top",
    "middle": "Middle",
    "mid": "Middle",
    "bottom": "Bottom",
    "adc": "Bottom",
    "jungle": "Jungle",
    "support": "Support",
}


# Utility helpers

def normalize_text(*parts: str) -> str:
    s = " ".join(p for p in parts if p)
    return re.sub(r"\s+", " ", s.strip()).lower()


def detect_gender(text: str) -> str:
    if not text:
        return "Unknown"
    counts = {"male": 0, "female": 0, "other": 0}
    for k, patterns in GENDER_KEYWORDS.items():
        for pat in patterns:
            matches = re.findall(pat, text, flags=re.IGNORECASE)
            counts[k] += len(matches)
    # crude tie-breaking rules
    if counts["female"] > counts["male"] and counts["female"] > 0:
        return "Female"
    if counts["male"] > counts["female"] and counts["male"] > 0:
        return "Male"
    if counts["other"] > 0:
        return "Other"
    # fallbacks: check single-word title pronouns ("The Minotaur") -> Unknown
    return "Unknown"


def detect_species(text: str) -> str:
    if not text:
        return "Unknown"
    found = []
    low = text.lower()
    for species, needles in SPECIES_KEYWORDS.items():
        for n in needles:
            if n in low:
                found.append(species)
                break
    if found:
        # prioritize specific species over generic Human
        # remove duplicate 'Human' if other species found
        if len(found) > 1 and 'Human' in found:
            found = [f for f in found if f != 'Human']
        return ', '.join(sorted(dict.fromkeys(found)))
    return 'Human'  # reasonable default


def detect_region(obj: Dict[str, Any]) -> str:
    # prefer faction field from meraki if present and not empty/unaffiliated
    faction = obj.get('faction') or obj.get('region') or ''
    if faction and isinstance(faction, str):
        f = faction.strip()
        if f and f.lower() != 'unaffiliated':
            return f.title()
    # otherwise search lore/blurb/title
    text = normalize_text(obj.get('lore', ''), obj.get('blurb', ''), obj.get('title', ''))
    for region, needles in REGION_KEYWORDS.items():
        for n in needles:
            if n in text:
                return region
    return 'Runeterra'


def map_positions(positions) -> str:
    if not positions:
        return 'Unknown'
    if isinstance(positions, str):
        positions = [positions]
    mapped = []
    for p in positions:
        if not p: continue
        key = str(p).lower()
        for k, v in POSITION_MAP.items():
            if k == key or k in key:
                mapped.append(v)
                break
        else:
            mapped.append(str(p).title())
    # dedupe preserving order
    seen = []
    out = []
    for x in mapped:
        if x not in seen:
            seen.append(x); out.append(x)
    return ', '.join(out)


def parse_release_year(obj: Dict[str, Any]) -> str:
    for f in ('releaseDate', 'release', 'released'):
        v = obj.get(f)
        if isinstance(v, str) and v:
            m = re.search(r"(\d{4})", v)
            if m:
                return m.group(1)
    return 'Unknown'


def main(input_path: Path, output_path: Path, include_overrides: bool = True):
    if not input_path.exists():
        raise SystemExit(f"Input file not found: {input_path}")

    with input_path.open('r', encoding='utf-8') as fh:
        data = json.load(fh)

    # Meraki has champions keyed by name (e.g., "Aatrox") mapping to object
    result: Dict[str, Dict[str, Any]] = {}

    for key, c in data.items():
        name = c.get('name') or key
        text = normalize_text(c.get('lore', ''), c.get('blurb', ''), c.get('title', ''), name)

        meta = {}

        # Manual override first if requested
        if include_overrides and key in MANUAL_OVERRIDES:
            meta.update(MANUAL_OVERRIDES[key])

        # Gender
        if 'gender' not in meta or not meta.get('gender'):
            meta['gender'] = detect_gender(text)

        # Position
        if 'position' not in meta or not meta.get('position'):
            meta['position'] = map_positions(c.get('positions') or c.get('role') or [])

        # Species
        if 'species' not in meta or not meta.get('species'):
            meta['species'] = detect_species(text)

        # Region
        if 'region' not in meta or not meta.get('region'):
            meta['region'] = detect_region(c)

        # releaseYear
        if 'releaseYear' not in meta or not meta.get('releaseYear'):
            meta['releaseYear'] = parse_release_year(c)

        # Clean minor formatting
        meta['position'] = meta['position'] or 'Unknown'
        meta['species'] = meta['species'] or 'Unknown'
        meta['region'] = meta['region'] or 'Runeterra'
        meta['gender'] = meta['gender'] or 'Unknown'

        result[key] = meta

    # Sort keys alphabetically for readability
    ordered = {k: result[k] for k in sorted(result.keys(), key=lambda s: s.lower())}

    out_dir = output_path.parent
    out_dir.mkdir(parents=True, exist_ok=True)
    with output_path.open('w', encoding='utf-8') as fh:
        json.dump(ordered, fh, indent=2, ensure_ascii=False)

    print(f"Wrote {len(ordered)} entries to {output_path}")


if __name__ == '__main__':
    p = argparse.ArgumentParser(description='Generate champion metadata from Meraki snapshot')
    p.add_argument('--input', '-i', default=str(Path(__file__).parent.parent / 'data' / 'champions.json'))
    p.add_argument('--output', '-o', default=str(Path(__file__).parent.parent / 'data' / 'champion_details.json'))
    p.add_argument('--no-overrides', dest='include_overrides', action='store_false', help='Do not apply the built-in manual overrides')
    args = p.parse_args()

    main(Path(args.input), Path(args.output), include_overrides=args.include_overrides)
