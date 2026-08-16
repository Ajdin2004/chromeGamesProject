import requests
from bs4 import BeautifulSoup
import json
import time
import re

# ---------- MANUAL FALLBACK FOR GENDER (expand as needed) ----------
KNOWN_GENDER = {
    "Acheron": "Female",
    "Firefly": "Female",
    "Kafka": "Female",
    "March 7th": "Female",
    "Dan Heng": "Male",
    "Black Swan": "Female",
    "Boothill": "Male",
    "Aventurine": "Male",
    "Sparkle": "Female",
    # Add more characters as you encounter them
}
# -------------------------------------------------------------------

def get_all_playable_characters():
    """
    Fetch all page titles from the 'Playable_Characters' category.
    Falls back to 'Playable_Character' if the first is empty.
    Returns a list of character names (strings).
    """
    api_url = "https://honkai-star-rail.fandom.com/api.php"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
    }
    
    categories_to_try = ["Playable_Characters", "Playable_Character"]
    all_names = []
    
    for cat in categories_to_try:
        params = {
            "action": "query",
            "list": "categorymembers",
            "cmtitle": f"Category:{cat}",
            "cmlimit": "max",
            "format": "json"
        }
        response = requests.get(api_url, params=params, headers=headers)
        data = response.json()
        members = data.get("query", {}).get("categorymembers", [])
        # Filter out pages that are not in main namespace (ns=0) and are not redirects
        names = [m["title"] for m in members if m.get("ns") == 0 and not m.get("redirect", False)]
        if names:
            all_names = names
            break
        time.sleep(0.5)  # be gentle
    
    # Remove duplicates (just in case)
    all_names = list(dict.fromkeys(all_names))
    print(f"Found {len(all_names)} playable characters.")
    return all_names

def scrape_character_data(name):
    """
    Scrape a single character page and return a dict with all fields.
    """
    api_url = "https://honkai-star-rail.fandom.com/api.php"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
    }
    
    params = {
        "action": "parse",
        "page": name,
        "prop": "text|categories",
        "format": "json"
    }
    
    try:
        response = requests.get(api_url, params=params, headers=headers)
        data = response.json()
        if "error" in data:
            print(f"  [!] Error for {name}: {data['error']['info']}")
            return None
        
        parse_data = data['parse']
        raw_html = parse_data['text']['*']
        soup = BeautifulSoup(raw_html, 'html.parser')
        infobox = soup.find("aside", class_="portable-infobox")
        
        if not infobox:
            print(f"  [!] No infobox for {name}.")
            return None
        
        def get_value_container(label_keywords):
            for row in infobox.find_all("div", class_="pi-data"):
                label = row.find("h3", class_="pi-data-label")
                if label and any(keyword.lower() in label.text.lower() for keyword in label_keywords):
                    return row.find("div", class_="pi-data-value")
            return None

        # Element
        element_div = get_value_container(["Combat Type", "Element"])
        element = "Unknown"
        if element_div:
            img = element_div.find("img")
            raw_element = img.get("title", img.get("alt")) if img and ("title" in img.attrs or "alt" in img.attrs) else element_div.text
            element = raw_element.replace("Type", "").strip()

        # Path
        path_div = get_value_container(["Path"])
        path = "Unknown"
        if path_div:
            img = path_div.find("img")
            raw_path = img.get("title", img.get("alt")) if img and ("title" in img.attrs or "alt" in img.attrs) else path_div.text
            path = raw_path.replace("Path", "").strip()

        # Rarity
        rarity_div = get_value_container(["Rarity"])
        rarity = "Unknown"
        if rarity_div:
            img = rarity_div.find("img")
            if img and "alt" in img.attrs:
                rarity = img["alt"].replace(" Stars", "★").replace(" Star", "★").strip()

        # Gender – try infobox first, then fallback
        gender = "Unknown"
        gender_div = get_value_container(["Gender", "Sex", "Gender Identity"])
        if gender_div:
            gender = gender_div.text.strip()
        else:
            gender = KNOWN_GENDER.get(name, "Unknown")

        # Release Version – prioritise "Released_in_Version" then "Introduced_in_Version"
        release_version = "Unknown"
        categories = parse_data.get("categories", [])
        for cat in categories:
            cat_name = cat.get("*", "")
            match = re.search(r'Released_in_Version_(\d+\.\d+(?:\.\d+)?)', cat_name)
            if match:
                release_version = match.group(1)
                break
        if release_version == "Unknown":
            for cat in categories:
                cat_name = cat.get("*", "")
                match = re.search(r'Introduced_in_Version_(\d+\.\d+(?:\.\d+)?)', cat_name)
                if match:
                    release_version = match.group(1)
                    break

        # Faction
        faction_div = get_value_container(["Faction"])
        faction = "Unknown"
        if faction_div:
            raw_faction = faction_div.text.strip()
            profile_match = re.search(r'^(.*?)\s*\(on profile\)', raw_faction, re.IGNORECASE)
            if profile_match:
                faction = profile_match.group(1).strip()
            else:
                a_tag = faction_div.find("a")
                faction = a_tag.text.strip() if a_tag else raw_faction

        # Image
        image_url = ""
        img_tag = infobox.find("img", class_="pi-image-thumbnail")
        if img_tag:
            image_url = img_tag.get("src", "").split("/revision/")[0]

        return {
            "name": name,
            "element": element,
            "path": path,
            "rarity": rarity,
            "faction": faction,
            "gender": gender,
            "releaseVersion": release_version,
            "image": image_url
        }
    except Exception as e:
        print(f"  [!] Exception for {name}: {e}")
        return None

def scrape_all_characters():
    character_names = get_all_playable_characters()
    starrail_db = {}
    
    for idx, name in enumerate(character_names, 1):
        print(f"[{idx}/{len(character_names)}] Scraping {name}...")
        char_data = scrape_character_data(name)
        if char_data:
            starrail_db[name] = char_data
        time.sleep(0.5)  # be polite to the server
    
    with open("hsr_characters_clean.json", "w", encoding="utf-8") as f:
        json.dump(starrail_db, f, indent=2, ensure_ascii=False)
    
    print(f"\n✅ Done! Saved data for {len(starrail_db)} characters to hsr_characters_clean.json")

if __name__ == "__main__":
    scrape_all_characters()