// Songless lyrics proxy.
// Primary: LRCLIB (free, no key, returns plainLyrics + syncedLyrics)
// Fallback: lyrics.ovh (free, no key, plain lyrics only)
// Usage: /api/lyrics?artist=Coldplay&title=Yellow
//
// Both lyrics are cached in-memory per request so repeated lookups for the
// same song never hit the upstream rate limits, and a small day-scoped cache
// protects against bursts.

const LRC_BASE = 'https://lrclib.net/api/get';
const OVH_CORE = 'https://api.lyrics.ovh/v1';

/** Simple in-memory cache: key -> { payload, expiresAt } */
const cache = new Map();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

function json(status, payload) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=7200'
    },
    body: JSON.stringify(payload)
  };
}

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.payload;
}

function cacheSet(key, payload) {
  cache.set(key, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
}

async function safeFetch(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) { data = null; }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err };
  } finally {
    clearTimeout(timer);
  }
}

/** Query LRCLIB's /api/get returning synced (and plain) lyrics if present. */
async function fromLrclib(artist, title) {
  const url = `${LRC_BASE}?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
  const { ok, status, data } = await safeFetch(url);
  if (!ok || !data || !data.plainLyrics) {
    return { found: false, source: 'lrclib' };
  }
  return {
    found: true,
    source: 'lrclib',
    plainLyrics: data.plainLyrics,
    syncedLyrics: data.syncedLyrics || null,
    instrumental: !!data.instrumental
  };
}

/** Query lyrics.ovh (plain text fallback). */
async function fromLyricsOvh(artist, title) {
  const url = `${OVH_CORE}/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`;
  const { ok, status, data } = await safeFetch(url);
  if (!ok || !data || !data.lyrics) {
    return { found: false, source: 'lyrics.ovh' };
  }
  return {
    found: true,
    source: 'lyrics.ovh',
    plainLyrics: data.lyrics,
    syncedLyrics: null,
    instrumental: false
  };
}

exports.handler = async function (event) {
  const params = (event && event.queryStringParameters) || {};
  const artist = (params.artist || '').trim();
  const title = (params.title || '').trim();

  if (!artist || !title) {
    return json(400, { error: 'Query parameters "artist" and "title" are required.' });
  }

  // Cache keyed on normalized artist+title so case/spacing differences don't explode the map.
  const key = `${artist.toUpperCase()}|${title.toUpperCase()}`;
  const cached = cacheGet(key);
  if (cached) return json(200, cached);

  let result = await fromLrclib(artist, title);
  if (!result.found) result = await fromLyricsOvh(artist, title);

  if (!result.found) {
    // Cache negative results briefly to avoid hammering upstream on a known-missing track.
    const miss = { found: false, plainLyrics: null, syncedLyrics: null, source: 'none' };
    cacheSet(key, miss);
    return json(200, miss);
  }

  const payload = {
    found: true,
    source: result.source,
    plainLyrics: result.plainLyrics,
    syncedLyrics: result.syncedLyrics,
    instrumental: result.instrumental
  };
  cacheSet(key, payload);
  return json(200, payload);
};