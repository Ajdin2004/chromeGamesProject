exports.handler = async (event) => {
    // Get game title from request query parameters: /.netlify/functions/poster?title=Minecraft
    const title = event.queryStringParameters.title;
    const apiKey = process.env.RAWG_API_KEY;

    if (!title) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Title parameter is required' })
        };
    }

    if (!apiKey) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'RAWG API key is not configured on Netlify' })
        };
    }

    try {
        const rawgUrl = `https://api.rawg.io/api/games?key=${apiKey}&search=${encodeURIComponent(title)}&page_size=1`;
        const response = await fetch(rawgUrl);

        if (!response.ok) {
            throw new Error(`RAWG API returned status ${response.status}`);
        }

        const data = await response.json();

        if (data.results && data.results.length > 0 && data.results[0].background_image) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ posterUrl: data.results[0].background_image })
            };
        }

        return {
            statusCode: 404,
            body: JSON.stringify({ posterUrl: null, message: 'No poster found' })
        };
    } catch (err) {
        console.error('Error fetching RAWG poster:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch poster' })
        };
    }
};