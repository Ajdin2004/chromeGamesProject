// Movie poster lookup using the free iTunes Search API (no API key required)
// Usage: /.netlify/functions/movie-poster?title=Avatar
exports.handler = async (event) => {
    const title = event.queryStringParameters.title;

    if (!title) {
        return {
            statusCode: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Title parameter is required' })
        };
    }

    try {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(title)}&media=movie&entity=movie&limit=1&country=US`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`iTunes API returned status ${response.status}`);
        }

        const data = await response.json();

        if (data.results && data.results.length > 0 && data.results[0].artworkUrl100) {
            // Scale up artwork from 100x100 to 600x600 for better quality
            const posterUrl = data.results[0].artworkUrl100.replace('100x100', '600x600');
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ posterUrl })
            };
        }

        return {
            statusCode: 404,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ posterUrl: null, message: 'No poster found' })
        };
    } catch (err) {
        console.error('Error fetching movie poster:', err);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Failed to fetch poster' })
        };
    }
};