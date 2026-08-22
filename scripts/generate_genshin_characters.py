import requests
import json
import time

def build_enriched_db():
    base_url = "https://genshin.jmp.blue/characters"
    # genshin-db hosts serverless functions for datamined variables
    db_api_url = "https://genshin-db-api.vercel.app/api/v5/characters" 
    
    print("Fetching the master list...")
    slugs = requests.get(base_url).json()
    
    # Manually map subjective roles here
    role_overrides = {
        "Hu Tao": "Main-DPS",
        "Jean": "Support",
        "Zhongli": "Support"
    }
    
    final_data = {}
    
    for slug in slugs:
        core_resp = requests.get(f"{base_url}/{slug}")
        if core_resp.status_code != 200: continue
            
        core_data = core_resp.json()
        name = core_data.get("name", slug.title())
        
        char_dict = {
            "name": name,
            "element": core_data.get("vision", "Unknown"),
            "weapon": core_data.get("weapon", "Unknown"),
            "rarity": f"{core_data.get('rarity', '?')}★",
            "role": role_overrides.get(name, "Unknown"), # Pull from your local dictionary
            "region": core_data.get("nation", "Unknown"),
            "gender": "Unknown",
            "releaseVersion": "Unknown",
            "image": f"{base_url}/{slug}/icon"
        }
        
        # Cross-reference with genshin-db for missing variables
        db_resp = requests.get(f"{db_api_url}?query={name}")
        if db_resp.status_code == 200 and db_resp.text:
            db_data = db_resp.json()
            
            # Map release version
            char_dict["releaseVersion"] = db_data.get("version", "Unknown")
            
            # Translate datamined body types to Gender
            body_type = db_data.get("body", "").upper()
            if body_type in ["MALE", "BOY"]:
                char_dict["gender"] = "Male"
            elif body_type in ["FEMALE", "GIRL", "LADY"]:
                char_dict["gender"] = "Female"
                
        final_data[name] = char_dict
        print(f"  -> Successfully enriched {name}")
        time.sleep(0.3)
        
    with open("genshin_characters_final.json", "w", encoding="utf-8") as f:
        json.dump(final_data, f, indent=2, ensure_ascii=False)
        
    print("\nDatabase complete! Saved to genshin_characters_final.json")

if __name__ == "__main__":
    build_enriched_db()