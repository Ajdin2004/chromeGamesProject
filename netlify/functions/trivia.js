/* ============================================================
   Trivia Orbs — Netlify Function (Open Trivia DB proxy)
   ------------------------------------------------------------
   GET /api/trivia?mode=daily
     -> 10 sanitized daily questions (answers stripped, key sent
        base64-obfuscated as a casual-cheat deterrent; real
        anti-cheat would need the future DB layer).
   GET /api/trivia?mode=endless&amount=&category=&difficulty=
     -> standard OpenTDB-style questions (fully decoded).

   Notes:
   - Uses encode=base64 upstream and decodes server-side, so the
     client never deals with HTML entities.
   - Responses cached in module scope (per UTC day for the daily
     set) to stay well inside OpenTDB's 1-request-per-5s limit.
   - Session tokens intentionally omitted: they'd add an extra
     upstream call per cold start and raise rate-limit pressure;
     the daily cache already prevents repeat-heavy traffic.
   ============================================================ */

var OPENTDB_URL = 'https://opentdb.com/api.php';
var DAILY_COUNT = 10;
var DAILY_POOL = 14;

var dailyCache = { date: null, payload: null };

function isValidDateKey(s) {
  return typeof s === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s);
}

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

function hashSeed(str) {
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleSeeded(arr, rng) {
  var out = arr.slice();
  for (var i = out.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}

function decodeB64(s) {
  return Buffer.from(String(s), 'base64').toString('utf8');
}

/** Fetch from OpenTDB; retries once after 5s on rate-limit (code 5).
 *  All calls are serialized through a queue with >=5.2s spacing so
 *  concurrent requests never trip OpenTDB's per-IP rate limit. */
var upstreamQueue = Promise.resolve();
var lastUpstreamAt = 0;

function callOpentdb(params) {
  var run = async function () {
    var qs = new URLSearchParams(Object.assign({ type: 'multiple', encode: 'base64' }, params));
    var wait = lastUpstreamAt + 5200 - Date.now();
    if (wait > 0) await sleep(wait);

    var data = await attempt(qs);
    if (data && data.response_code === 5) {
      await sleep(5200);
      lastUpstreamAt = Date.now();
      data = await attempt(qs);
    }
    if (!data || data.response_code !== 0 || !Array.isArray(data.results) || !data.results.length) {
      throw new Error('OpenTDB unavailable (response_code ' + (data ? data.response_code : 'n/a') + ')');
    }
    lastUpstreamAt = Date.now();
    return data.results.map(decodeQuestion);
  };
  var p = upstreamQueue.then(run, run);
  upstreamQueue = p.catch(function () {});
  return p;
}

async function attempt(qs) {
  try {
    var res = await fetch(OPENTDB_URL + '?' + qs.toString());
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

function decodeQuestion(q) {
  return {
    category: decodeB64(q.category),
    type: q.type,
    difficulty: q.difficulty ? decodeB64(q.difficulty) : 'medium',
    question: decodeB64(q.question),
    correct_answer: decodeB64(q.correct_answer),
    incorrect_answers: (q.incorrect_answers || []).map(decodeB64)
  };
}

/** Daily set keyed by the player's LOCAL date (sent by the client) so the
 *  puzzle rotates at local midnight; falls back to UTC day if not supplied. */
async function getDailySet(requestedDate) {
  var date = isValidDateKey(requestedDate) ? requestedDate : utcToday();
  if (dailyCache.date === date && dailyCache.payload) return dailyCache.payload;

  var pool = await callOpentdb({ amount: String(DAILY_POOL) });
  if (pool.length < DAILY_COUNT) throw new Error('Not enough questions returned');

  var rng = mulberry32(hashSeed('triviaorbs-' + date));
  var picks = shuffleSeeded(pool.map(function (_, i) { return i; }), rng).slice(0, DAILY_COUNT);

  var payload = {
    date: date,
    questions: picks.map(function (idx, i) {
      var q = pool[idx];
      return {
        category: q.category,
        difficulty: q.difficulty,
        question: q.question,
        options: shuffleSeeded([q.correct_answer].concat(q.incorrect_answers), mulberry32(hashSeed(date + ':' + i))),
        // Obfuscated (NOT secure) so the raw answer isn't sitting in DevTools.
        answer_key: Buffer.from(q.correct_answer, 'utf8').toString('base64')
      };
    })
  };
  dailyCache.date = date;
  dailyCache.payload = payload;
  return payload;
}

exports.handler = async function (event) {
  var params = (event && event.queryStringParameters) || {};
  try {
    if ((params.mode || 'endless') === 'daily') {
      return json(200, await getDailySet(params.date));
    }
    // Endless / practice passthrough
    var amount = parseInt(params.amount, 10);
    if (!amount || amount < 1) amount = 10;
    if (amount > 30) amount = 30;
    var q = { amount: String(amount) };
    if (params.category && parseInt(params.category, 10) > 0) q.category = String(parseInt(params.category, 10));
    if (params.difficulty && ['easy', 'medium', 'hard'].indexOf(params.difficulty) !== -1) q.difficulty = params.difficulty;
    var results = await callOpentdb(q);
    return json(200, { response_code: 0, results: results });
  } catch (err) {
    return json(502, { error: err.message || 'Failed to fetch trivia questions.' });
  }
};
