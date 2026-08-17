import requests
import json
import time
import random

def generate_random_movies_db():
    API_KEY = "" # Swap this with your active key
    BASE_URL = "http://www.omdbapi.com/"
    TARGET_COUNT = 800

    # Seed words to find a wide variety of recognizable movies
    seed_words = [
        "Star", "Love", "Man", "Night", "Day", "Life", "City", "World", 
        "Dark", "Blue", "Red", "Black", "White", "Dead", "Good", "Bad",
        "Time", "House", "Family", "War", "Game", "Fire", "Ice", "King",
        "Girl", "Boy", "Last", "First", "Blood", "Ghost", "Secret", "Lost",
        "Iron", "American", "Space", "Magic", "Legend", "Shadow", "Dream"
    ]
    
    movie_ids = set()
    print("Phase 1: Gathering random popular movie IDs...")

    # Shuffle the seeds so the resulting database is different every time you run it
    random.shuffle(seed_words)

    for word in seed_words:
        # Stop fetching if we've hit our 800 movie goal
        if len(movie_ids) >= TARGET_COUNT:
            break
            
        print(f"  Scraping search page for keyword: '{word}'")
        
        # Fetch the first 2 pages of search results for each word (up to 20 movies per word)
        for page in range(1, 3):
            params = {
                "s": word, 
                "type": "movie", 
                "page": page, 
                "apikey": API_KEY
            }
            try:
                res = requests.get(BASE_URL, params=params)
                data = res.json()
                
                if data.get("Response") == "True":
                    for item in data["Search"]:
                        movie_ids.add(item["imdbID"])
                        # Break immediately if we hit the target count mid-page
                        if len(movie_ids) >= TARGET_COUNT:
                            break
                            
                time.sleep(0.1) # Polite delay to avoid API rate limits
                
            except Exception as e:
                print(f"  [!] Search error on word '{word}': {e}")

    # Convert the set back to a list and ensure it's exactly the target count
    movie_ids = list(movie_ids)[:TARGET_COUNT]
    print(f"\nSuccessfully gathered {len(movie_ids)} unique movie IDs.")
    print("Phase 2: Fetching detailed movie data...\n")

    movie_db = {}
    
    for index, imdb_id in enumerate(movie_ids, start=1):
        params = {
            "i": imdb_id, 
            "apikey": API_KEY
        }
        
        try:
            res = requests.get(BASE_URL, params=params)
            data = res.json()
            
            if data.get("Response") == "True":
                title = data.get("Title", "Unknown")
                print(f"[{index}/{TARGET_COUNT}] Extracting: {title}")
                
                movie_db[title] = {
                    "title": title,
                    "director": data.get("Director", "Unknown"),
                    "poster": data.get("Poster", ""),
                    "imdbRating": data.get("imdbRating", "Unknown"),
                    "releaseVersion": data.get("Year", "Unknown"), # Mapped to releaseVersion for consistency
                    "genre": data.get("Genre", "Unknown")
                }
                
            time.sleep(0.2) # Delay to respect the 1,000 daily API limit
            
        except Exception as e:
            print(f"  [!] Detail fetch error for {imdb_id}: {e}")

    # Export the final randomized database
    output_filename = "moviedle_data.json"
    with open(output_filename, "w", encoding="utf-8") as f:
        json.dump(movie_db, f, indent=2, ensure_ascii=False)

    print(f"\nDone! Saved {len(movie_db)} random playable movies to {output_filename}")

if __name__ == "__main__":
    generate_random_movies_db()