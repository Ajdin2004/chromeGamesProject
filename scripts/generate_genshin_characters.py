import requests
from bs4 import BeautifulSoup
import json
import time
import re

def scrape_genshin_characters():
    api_url = "https://genshin-impact.fandom.com/api.php"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
    }
    
    # A starter roster. The API 'redirects=1' flag handles aliases (e.g., Kazuha -> Kaedehara Kazuha)
    character_names = [
        "Diluc", "Jean", "Raiden Shogun", "Zhongli", "Nahida", 
        "Furina", "Neuvillette", "Arlecchino", "Hu Tao", "Kazuha"
    ]

    genshindle_db = {}
    print(f"Starting native Genshindle scraper for {len(character_names)} characters...")
    
    for name in character_names:
        print(f"Scraping data for {name}...")
        
        params = {
            "action": "parse",
            "page": name,
            "prop": "text|categories",
            "format": "json",
            "redirects": 1 # Crucial for handling aliases and wiki redirects automatically
        }
        
        try:
            response = requests.get(api_url, params=params, headers=headers)
            data = response.json()
            
            if "error" in data:
                print(f"  [!] Skipping {name}: Page not found.")
                continue
                
            parse_data = data['parse']
            raw_html = parse_data['text']['*']
            soup = BeautifulSoup(raw_html, 'html.parser')
            infobox = soup.find("aside", class_="portable-infobox")
            
            if not infobox:
                print(f"  [!] No infobox found for {name}.")
                continue
            
            # --- Robust Data Extractor ---
            def get_infobox_value(data_source_list):
                # 1. Target the exact backend data-source attribute directly
                for source in data_source_list:
                    div = infobox.find(attrs={"data-source": source})
                    if div:
                        val = div.find(class_="pi-data-value")
                        return val if val else div
                        
                # 2. Fallback to scanning visible label text if data-source fails
                for row in infobox.find_all(class_="pi-data"):
                    label = row.find(class_="pi-data-label")
                    if label:
                        label_text = label.text.strip().lower()
                        for source in data_source_list:
                            if source.lower() in label_text:
                                return row.find(class_="pi-data-value")
                return None

            # 1. Element
            element_div = get_infobox_value(["element"])
            element = "Unknown"
            if element_div:
                a_tag = element_div.find("a")
                element = a_tag.text.strip() if a_tag else element_div.text.strip()
                element = re.sub(r'\[.*?\]', '', element)

            # 2. Weapon
            weapon_div = get_infobox_value(["weapon"])
            weapon = "Unknown"
            if weapon_div:
                a_tag = weapon_div.find("a")
                weapon = a_tag.text.strip() if a_tag else weapon_div.text.strip()
                weapon = re.sub(r'\[.*?\]', '', weapon)

            # 3. Rarity (Checking img alt tags first, falling back to text)
            rarity_div = get_infobox_value(["rarity"])
            rarity = "Unknown"
            if rarity_div:
                img = rarity_div.find("img")
                if img and "alt" in img.attrs:
                    rarity = img["alt"].replace(" Stars", "★").replace(" Star", "★").strip()
                if rarity == "Unknown" or not rarity:
                    if "5" in rarity_div.text: rarity = "5★"
                    elif "4" in rarity_div.text: rarity = "4★"

            # 4. Region (Replaces subjective Faction)
            region_div = get_infobox_value(["region"])
            region = "Unknown"
            if region_div:
                a_tag = region_div.find("a")
                region = a_tag.text.strip() if a_tag else region_div.text.strip()
                region = re.sub(r'\[.*?\]', '', region)

            # 5. Model Type (Replaces subjective Role)
            model_div = get_infobox_value(["model"])
            model = "Unknown"
            if model_div:
                a_tag = model_div.find("a")
                model = a_tag.text.strip() if a_tag else model_div.text.strip()
                model = re.sub(r'\[.*?\]', '', model)

            # 6. Gender (Try infobox first, fallback to hidden categories)
            gender = "Unknown"
            gender_div = get_infobox_value(["sex", "gender"])
            if gender_div:
                gender = re.sub(r'\[.*?\]', '', gender_div.text).strip()
                
            if gender == "Unknown":
                categories = parse_data.get("categories", [])
                for cat in categories:
                    cat_name = cat.get("*", "").replace("_", " ").lower()
                    if "female characters" in cat_name:
                        gender = "Female"
                        break
                    elif "male characters" in cat_name:
                        gender = "Male"
                        break

            # 7. Release Version
            release_version = "Unknown"
            release_div = get_infobox_value(["version", "release", "released"])
            if release_div:
                version_link = release_div.find("a", string=re.compile(r'\d+\.\d+'))
                if version_link:
                    match = re.search(r'(\d+\.\d+)', version_link.text)
                    if match:
                        release_version = match.group(1)
                
                if release_version == "Unknown":
                    match = re.search(r'(\d+\.\d+)', release_div.text)
                    if match:
                        release_version = match.group(1)

            # 8. Image
            image_url = ""
            img_tag = infobox.find("img", class_="pi-image-thumbnail")
            if img_tag:
                image_url = img_tag.get("src", "").split("/revision/")[0]
                
            # Formatting the final dictionary using the exact resolved page title
            resolved_name = parse_data.get("title", name)
            genshindle_db[resolved_name] = {
                "name": resolved_name,
                "element": element,
                "weapon": weapon,
                "rarity": rarity,
                "region": region,
                "modelType": model,
                "gender": gender, 
                "releaseVersion": release_version,
                "image": image_url
            }
            
            time.sleep(0.5) 
            
        except Exception as e:
            print(f"  [!] Error on {name}: {e}")
            
    with open("genshindle_characters.json", "w", encoding="utf-8") as f:
        json.dump(genshindle_db, f, indent=2, ensure_ascii=False)
        
    print("\nData mining complete. Saved database to genshindle_characters.json!")

if __name__ == "__main__":
    scrape_genshin_characters()