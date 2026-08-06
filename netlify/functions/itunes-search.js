exports.handler = async function(event) {
  const { term, media = 'music', entity = 'song', limit = '6', country = 'US' } = event.queryStringParameters || {};

  if (!term || !term.trim()) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Query parameter "term" is required.' })
    };
  }

  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=${encodeURIComponent(media)}&entity=${encodeURIComponent(entity)}&limit=${encodeURIComponent(limit)}&country=${encodeURIComponent(country)}`;

  try {
    const response = await fetch(url);
    const resultText = await response.text();
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    };

    return {
      statusCode: response.ok ? 200 : response.status,
      headers,
      body: resultText
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: error.message || 'Failed to fetch iTunes results.' })
    };
  }
};
