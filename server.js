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

const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url);
  const pathname = parsed.pathname;

  if (pathname === '/api/itunes-search' || pathname === '/.netlify/functions/itunes-search') {
    proxyItunes(req, res);
    return;
  }

  serveStatic(res, pathname);
});

server.listen(PORT, () => {
  console.log(`Development server running at http://localhost:${PORT}`);
  console.log('Use /api/itunes-search?term=... to proxy iTunes search requests.');
});
