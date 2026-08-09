const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = path.resolve(__dirname);
const PORT = process.env.PORT || 8888;

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
};

function sendResponse(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function serveStatic(res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.join(ROOT, pathname);
  const normalized = path.normalize(filePath);

  if (!normalized.startsWith(ROOT)) {
    return sendResponse(res, 403, 'Forbidden');
  }

  fs.stat(normalized, (err, stats) => {
    if (err || !stats.isFile()) {
      return sendResponse(res, 404, 'Not Found');
    }

    const ext = path.extname(normalized).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    fs.readFile(normalized, (err2, data) => {
      if (err2) {
        return sendResponse(res, 500, 'Server error');
      }
      sendResponse(res, 200, data, { 'Content-Type': contentType });
    });
  });
}

function parseQueryParams(requestUrl) {
  const parsed = url.parse(requestUrl, true);
  return parsed.query;
}

async function proxyItunes(req, res) {
  const query = parseQueryParams(req.url);
  const { term, media = 'music', entity = 'song', limit = '6', country = 'US' } = query;

  if (!term || !term.trim()) {
    return sendResponse(res, 400, JSON.stringify({ error: 'Query parameter "term" is required.' }), {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
  }

  const targetUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=${encodeURIComponent(media)}&entity=${encodeURIComponent(entity)}&limit=${encodeURIComponent(limit)}&country=${encodeURIComponent(country)}`;

  https.get(targetUrl, (itunesRes) => {
    let body = '';
    itunesRes.setEncoding('utf8');
    itunesRes.on('data', (chunk) => { body += chunk; });
    itunesRes.on('end', () => {
      sendResponse(res, itunesRes.statusCode || 200, body, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
    });
  }).on('error', (error) => {
    sendResponse(res, 500, JSON.stringify({ error: error.message || 'Failed to fetch iTunes results.' }), {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
  });
}

// Proxy movie poster lookups to the iTunes Search API (free, no key)
async function proxyMoviePoster(req, res) {
  const query = parseQueryParams(req.url);
  const { title } = query;

  if (!title || !title.trim()) {
    return sendResponse(res, 400, JSON.stringify({ error: 'Title parameter is required.' }), {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
  }

  const targetUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(title)}&media=movie&entity=movie&limit=1&country=US`;

  https.get(targetUrl, (itunesRes) => {
    let body = '';
    itunesRes.setEncoding('utf8');
    itunesRes.on('data', (chunk) => { body += chunk; });
    itunesRes.on('end', () => {
      try {
        const data = JSON.parse(body);
        const results = data.results || [];

        if (results.length > 0 && results[0].artworkUrl100) {
          const posterUrl = results[0].artworkUrl100.replace('100x100', '600x600');
          return sendResponse(res, 200, JSON.stringify({ posterUrl }), {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
        }

        return sendResponse(res, 404, JSON.stringify({ posterUrl: null, message: 'No poster found' }), {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
      } catch (parseErr) {
        return sendResponse(res, 500, JSON.stringify({ error: 'Failed to parse iTunes response.' }), {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
      }
    });
  }).on('error', (error) => {
    sendResponse(res, 500, JSON.stringify({ error: error.message || 'Failed to fetch movie poster.' }), {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
  });
}

// Proxy game poster lookups to RAWG (if API key present) then Wikipedia (free fallback)
async function proxyGamePoster(req, res) {
  const query = parseQueryParams(req.url);
  const { title } = query;

  if (!title || !title.trim()) {
    return sendResponse(res, 400, JSON.stringify({ error: 'Title parameter is required.' }), {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
  }

  // Try Wikipedia first for local dev (no API key needed)
  const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&format=json&pithumbsize=600&origin=*`;

  https.get(wikiUrl, (wikiRes) => {
    let body = '';
    wikiRes.setEncoding('utf8');
    wikiRes.on('data', (chunk) => { body += chunk; });
    wikiRes.on('end', () => {
      try {
        const data = JSON.parse(body);
        const pages = data.query && data.query.pages ? data.query.pages : {};

        for (const pageId in pages) {
          const page = pages[pageId];
          if (page.thumbnail && page.thumbnail.source) {
            return sendResponse(res, 200, JSON.stringify({ posterUrl: page.thumbnail.source }), {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            });
          }
        }

        return sendResponse(res, 404, JSON.stringify({ posterUrl: null, message: 'No poster found' }), {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
      } catch (parseErr) {
        return sendResponse(res, 500, JSON.stringify({ error: 'Failed to parse Wikipedia response.' }), {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
      }
    });
  }).on('error', (error) => {
    sendResponse(res, 500, JSON.stringify({ error: error.message || 'Failed to fetch game poster.' }), {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
  });
}

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  const pathname = parsed.pathname;

  if (pathname === '/api/itunes-search' || pathname === '/.netlify/functions/itunes-search') {
    proxyItunes(req, res);
    return;
  }

  if (pathname === '/api/movie-poster' || pathname === '/.netlify/functions/movie-poster') {
    proxyMoviePoster(req, res);
    return;
  }

  if (pathname === '/api/poster' || pathname === '/.netlify/functions/poster') {
    proxyGamePoster(req, res);
    return;
  }

  serveStatic(res, pathname);
});

server.listen(PORT, () => {
  console.log(`Development server running at http://localhost:${PORT}`);
  console.log('Use /api/itunes-search?term=... to proxy iTunes search requests.');
  console.log('Use /api/movie-poster?title=... to proxy movie poster requests.');
  console.log('Use /api/poster?title=... to proxy game poster requests.');
});