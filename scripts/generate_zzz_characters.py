import requests
from bs4 import BeautifulSoup
import json
import re

def scrape_zenless_api():
    # Fandom's MediaWiki API URL
    api_url = "https://zenless-zone-zero.fandom.com/api.php"
    
    # Parameters to fetch the parsed HTML of the 'Agent' page specifically
    params = {
        "action": "parse",
        "page": "Agent",
        "format": "json"
    }
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"
    }

    try:
        print("Fetching page data via MediaWiki API...")
        # Standard requests.get is fine here since the API endpoint allows bots
        response = requests.get(api_url, params=params, headers=headers)
        response.raise_for_status()
        
        # Extract the raw HTML string from the API's JSON response
        json_data = response.json()
        raw_html = json_data['parse']['text']['*']
        
    except Exception as e:
        print(f"Error fetching the API: {e}")
        return

    # Feed the extracted HTML directly into BeautifulSoup
    soup = BeautifulSoup(raw_html, 'html.parser')
    zenlessdle_db = {}
    
    # The table selector remains exactly the same as our diagnostic test
    character_rows = soup.select("table.article-table tbody tr") 
    
    for row in character_rows:
        cols = row.find_all(["td", "th"])
        
        if not cols or len(cols) < 8: 
            continue
            
        try:
            name = cols[1].text.strip()
            
            if not name or name.lower() == "name":
                continue
            
            # --- Extracting Rarity ---
            rarity = "Unknown"
            if cols[2].find("img"):
                rarity = cols[2].find("img").get("alt", "Unknown").replace(" Icon", "").strip()
                
            # --- Extracting Release Version ---
            version_text = cols[7].text.strip()
            version_match = re.search(r'Version (\d+\.\d+)', version_text)
            release_version = version_match.group(1) if version_match else "1.0"
            
            # --- Extracting Image ---
            image_url = ""
            if cols[0].find("img"):
                img_tag = cols[0].find("img")
                image_url = img_tag.get("data-src") or img_tag.get("src", "")
                
                if image_url:
                    image_url = image_url.split("/revision/")[0]
                
            character_data = {
                "name": name,
                "element": cols[3].text.strip(),
                "specialty": cols[4].text.strip(),
                "rarity": rarity,
                "faction": cols[6].text.strip(),
                "gender": "Unknown", 
                "weapon": "Unknown", 
                "releaseVersion": release_version,
                "image": image_url
            }

            zenlessdle_db[name] = character_data

        except Exception as e:
            print(f"Skipping row '{name}' due to error: {e}")
            continue

    with open("zenlessdle_characters.json", "w", encoding="utf-8") as f:
        json.dump(zenlessdle_db, f, indent=2, ensure_ascii=False)
    
    print(f"Successfully scraped {len(zenlessdle_db)} characters via API into zenlessdle_characters.json!")

if __name__ == "__main__":
    scrape_zenless_api()