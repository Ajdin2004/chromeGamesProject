import json
import urllib.request
import urllib.parse
import time

# Datamuse API endpoints
DATAMUSE_URL = "https://api.datamuse.com/words"

def fetch_json(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode())
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return []

def get_candidate_words(target_count=356):
    candidates = []
    
    # Query common topics/themes to gather 7-letter words
    topics = ['nature', 'science', 'ocean', 'space', 'music', 'emotion', 'journey', 'weather', 'city', 'time']
    
    for topic in topics:
        if len(candidates) >= target_count:
            break
            
        print(f"Querying topic: '{topic}'...")
        # Get related 7-letter words matching pattern '???????' (7 letters)
        url = f"{DATAMUSE_URL}?ml={topic}&sp=???????&md=d&max=356"
        results = fetch_json(url)
        
        for item in results:
            word = item.get("word", "").upper()
            
            # Ensure strictly 7 alphabetic characters and contains definitions
            if len(word) == 7 and word.isalpha() and "defs" in item:
                if word not in [c['word'] for c in candidates]:
                    candidates.append({
                        "word": word,
                        "raw_defs": item.get("defs", [])
                    })
                    if len(candidates) >= target_count:
                        break
        
        # Gentle delay between requests
        time.sleep(0.2)
        
    return candidates

def format_definition(raw_defs):
    if not raw_defs:
        return "A mystery 7-letter word."
    
    # Take the first definition and strip the part-of-speech prefix (e.g., 'n\t')
    first_def = raw_defs[0].split('\t')[-1]
    
    # Clean up and capitalize
    clue = first_def.strip().capitalize()
    if not clue.endswith('.'):
        clue += '.'
    return clue

def fetch_related_words(target_word, count=5):
    # Fetch words related in meaning
    rel_url = f"{DATAMUSE_URL}?ml={target_word.lower()}&max=30"
    results = fetch_json(rel_url)
    
    related_set = set()
    for item in results:
        w = item.get("word", "").upper()
        # Accept valid 5-to-7 letter single words excluding the target itself
        if 5 <= len(w) <= 7 and w.isalpha() and w != target_word:
            related_set.add(w)
        if len(related_set) >= count:
            break
            
    return list(related_set)

def generate_356_riddles():
    print("Fetching candidate 7-letter words...")
    candidates = get_candidate_words(356)
    
    print(f"Found {len(candidates)} candidates. Generating complete riddle dataset...")
    dataset = []
    
    for idx, item in enumerate(candidates, start=1):
        word = item["word"]
        clue = format_definition(item["raw_defs"])
        related = fetch_related_words(word, count=5)
        
        dataset.append({
            "word": word,
            "clue": clue,
            "related": related
        })
        
        print(f"[{idx}/356] Processed: {word}")
        time.sleep(0.1) # Respectful request rate
        
    # Write to JSON file
    output_filename = "riddle_entries_356.json"
    with open(output_filename, "w", encoding="utf-8") as f:
        json.dump(dataset, f, indent=4)
        
    print(f"\nSuccessfully generated {len(dataset)} 7-letter riddles saved to '{output_filename}'!")

if __name__ == "__main__":
    generate_356_riddles()