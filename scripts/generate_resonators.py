import json
import re
import urllib.parse
import requests

API_URL = "https://wutheringwaves.fandom.com/api.php"
BASE_URL = "https://wutheringwaves.fandom.com"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

def get_all_resonator_names():
    """Fetch all character page titles from the Wiki category."""
    resonators = []
    params = {
        "action": "query",
        "list": "categorymembers",
        "cmtitle": "Category:Playable_Resonators",
        "cmlimit": "max",
        "format": "json",
    }

    try:
        res = requests.get(API_URL, headers=HEADERS, params=params, timeout=10)
        data = res.json()
        members = data.get("query", {}).get("categorymembers", [])
        for item in members:
            # Filter out sub-categories or special namespace pages
            if item["ns"] == 0:
                title = item["title"]
                # Skip duplicate variants like Rover-Havoc if you only want base characters
                resonators.append(title)
    except Exception as e:
        print(f"Error fetching resonator list: {e}", flush=True)

    return resonators

def parse_infobox_from_wikitext(wikitext):
    """Fallback wikitext extractor for key infobox parameters."""
    data = {}
    lines = wikitext.split("\n")
    for line in lines:
        if "=" in line and line.strip().startswith("|"):
            parts = line.strip()[1:].split("=", 1)
            key = parts[0].strip().lower()
            val = parts[1].strip()
            data[key] = val
    return data

def scrape_resonator_details(title):
    """Uses MediaWiki API parse action to pull page content reliably."""
    params = {
        "action": "parse",
        "page": title,
        "prop": "wikitext|text|images",
        "format": "json",
        "redirects": True
    }

    try:
        res = requests.get(API_URL, headers=HEADERS, params=params, timeout=10)
        res_json = res.json()
        
        if "error" in res_json or "parse" not in res_json:
            return None

        parse_data = res_json["parse"]
        wikitext = parse_data.get("wikitext", {}).get("*", "")
        parsed_fields = parse_infobox_from_wikitext(wikitext)

        # Base Name
        clean_name = title.split("(")[0].strip()

        # Extract values with default fallbacks
        rarity_raw = parsed_fields.get("rarity", "5★")
        rarity = "5★" if "5" in rarity_raw else "4★" if "4" in rarity_raw else "5★"

        element = parsed_fields.get("attribute", parsed_fields.get("element", "Unknown"))
        element = re.sub(r"[\[\]\{\}]", "", element).strip()  # Clean Wiki markup

        weapon = parsed_fields.get("weapon", "Unknown")
        weapon = re.sub(r"[\[\]\{\}]", "", weapon).strip()

        role = parsed_fields.get("class", parsed_fields.get("role", "Main DPS"))
        role = re.sub(r"[\[\]\{\}]", "", role).strip()

        faction = parsed_fields.get("faction", parsed_fields.get("affiliation", "Unknown"))
        faction = re.sub(r"[\[\]\{\}]", "", faction).strip()

        gender = parsed_fields.get("gender", "Female" if "female" in wikitext.lower() else "Male")
        gender = re.sub(r"[\[\]\{\}]", "", gender).strip()

        release_version = parsed_fields.get("version", parsed_fields.get("release", "1.0"))
        release_version = re.sub(r"[\[\]\{\}]", "", release_version).strip()

        # Extract Image URL
        image_name = parsed_fields.get("image", "")
        image_url = ""
        if image_name:
            image_name = image_name.replace("File:", "").replace("Image:", "").strip()
            image_url = f"{BASE_URL}/wiki/Special:FilePath/{urllib.parse.quote(image_name)}"
        else:
            image_url = f"{BASE_URL}/wiki/Special:FilePath/Resonator_{urllib.parse.quote(clean_name)}.png"

        return {
            "name": clean_name,
            "element": element if element else "Unknown",
            "weapon": weapon if weapon else "Unknown",
            "rarity": rarity,
            "role": role if role else "Main DPS",
            "faction": faction if faction else "Unknown",
            "gender": gender if gender else "Unknown",
            "releaseVersion": release_version if release_version else "1.0",
            "image": image_url
        }

    except Exception as e:
        print(f"Error parsing {title}: {e}", flush=True)
        return None

def main():
    print("Fetching Resonator list...", flush=True)
    resonator_titles = get_all_resonator_names()
    print(f"Found {len(resonator_titles)} Resonators. Starting scrape...\n", flush=True)

    data = {}
    for idx, title in enumerate(resonator_titles, 1):
        print(f"[{idx}/{len(resonator_titles)}] Scraping {title}...", flush=True)
        details = scrape_resonator_details(title)
        
        # Save if details exist
        if details:
            key = details["name"]
            data[key] = details

    output_filename = "wuwa_resonators.json"
    with open(output_filename, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"\nDone! Scraped {len(data)} Resonators saved to '{output_filename}'.", flush=True)

if __name__ == "__main__":
    main()