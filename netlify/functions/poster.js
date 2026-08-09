// Game poster lookup.
// Primary: RAWG API (requires RAWG_API_KEY env var on Netlify)
// Fallback: Wikipedia API (free, no key required)
// Usage: /.netlify/functions/poster?title=Minecraft
exports.handler = async (event) => {
    const title = event.queryStringParameters.title;

    if (!title) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Title parameter is required' })
        };
    }

    // --- Primary: RAWG API (requires API key) ---
    const apiKey = process.env.RAWG_API_KEY;

    if (apiKey) {
        try {
            const rawgUrl = `https://api.rawg.io/api/games?key=${apiKey}&search=${encodeURIComponent(title)}&page_size=1`;
            const response = await fetch(rawgUrl);

            if (response.ok) {
                const data = await response.json();
                if (data.results && data.results.length > 0 && data.results[0].background_image) {
                    return {
                        statusCode: 200,
                        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                        body: JSON.stringify({ posterUrl: data.results[0].background_image })
                    };
                }
            }
        } catch (err) {
            console.error('Error fetching RAWG poster:', err);
        }
    }

    // --- Fallback: Wikipedia API (free, no key required) ---
    try {
        const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&format=json&pithumbsize=600&origin=*`;
        const response = await fetch(wikiUrl);

        if (response.ok) {
            const data = await response.json();
            const pages = data.query && data.query.pages ? data.query.pages : {};

            for (const pageId in pages) {
                const page = pages[pageId];
                if (page.thumbnail && page.thumbnail.source) {
                    return {
                        statusCode: 200,
                        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                        body: JSON.stringify({ posterUrl: page.thumbnail.source })
                    };
                }
            }
        }
    } catch (err) {
        console.error('Error fetching Wikipedia poster:', err);
    }

    return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ posterUrl: null, message: 'No poster found' })
    };
};