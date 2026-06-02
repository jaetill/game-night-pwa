// Lambda: GET /search-games?q=<query> — searches the caller's BGG collection by title
//
// Auth: dual-mode (apiKeyAuthorizer). Caller's userId is in
//       event.requestContext.authorizer.userId.
//
// Environment variables required:
//   S3_BUCKET — jaetill-game-nights
//
// S3 paths:
//   collections/{userId}.json — read-only

'use strict';

const { Sentry } = require('./lib/sentry');
const logger = require('./lib/logger');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

const REGION = process.env.AWS_REGION || 'us-east-2';
let s3 = new S3Client({ region: REGION });

const BUCKET = process.env.S3_BUCKET || 'jaetill-game-nights';

const ALLOWED_ORIGINS = new Set([
  'https://gamenights.jaetill.com',
  'https://jaetill.github.io',
]);

// ── Helpers ───────────────────────────────────────────────

function corsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  return {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGINS.has(origin) ? origin : 'https://gamenights.jaetill.com',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Content-Type':                 'application/json',
  };
}

function respond(status, body, headers) {
  return { statusCode: status, headers, body: JSON.stringify(body) };
}

/** Lowercase, strip punctuation, collapse whitespace. */
function normalize(str) {
  return str.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Levenshtein distance — used as a typo fallback when contains-match finds
 * fewer than MAX_RESULTS games.
 */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const prev = Array.from({ length: n + 1 }, (_, i) => i);
  const curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev.splice(0, n + 1, ...curr);
  }
  return prev[n];
}

const MAX_RESULTS = 5;

// Exported for unit tests — production handler calls with module-level s3 client.
// Returns [] when the key is absent or the role lacks s3:ListBucket (S3 returns
// AccessDenied instead of NoSuchKey when ListBucket is missing from the role).
async function _loadCollection(callerId, client) {
  try {
    const obj  = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: `collections/${callerId}.json` }));
    const text = await obj.Body.transformToString();
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.name === 'NoSuchKey') return [];
    if (err.name === 'AccessDenied' && err.message?.includes('s3:ListBucket')) return [];
    throw err;
  }
}
exports._loadCollection = _loadCollection;

// ── Handler ───────────────────────────────────────────────

exports.handler = Sentry.wrapHandler(async (event, context) => {
  logger.info('handler.invoked', {
    request_id: context?.awsRequestId,
    method: event.httpMethod,
    resource: event.resource,
  });

  const CORS = corsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,OPTIONS' }, body: '' };
  }

  const callerId = event.requestContext?.authorizer?.userId;
  if (!callerId) return respond(401, { error: 'Unauthorized' }, CORS);

  // ── Query param ──
  const q = (event.queryStringParameters?.q || '').trim();
  if (!q) return respond(400, { error: 'q parameter is required' }, CORS);

  // ── Load BGG collection from S3 ──
  let games;
  try {
    games = await _loadCollection(callerId, s3);
  } catch (e) {
    logger.error('s3.load_failed', { request_id: context?.awsRequestId, key: `collections/${callerId}.json`, error: e.message });
    Sentry.captureException(e);
    return respond(500, { error: 'Could not load game collection' }, CORS);
  }

  const normQ = normalize(q);

  // ── Pass 1: contains matches ──
  const containsMatches = games.filter(g => normalize(g.title).includes(normQ));

  // ── Pass 2: Levenshtein fallback for typos if not enough contains results ──
  let results = containsMatches;
  if (containsMatches.length < MAX_RESULTS) {
    const containsIds = new Set(containsMatches.map(g => g.id));
    // Threshold: allow 1 error per 4 characters, min 1
    const threshold = Math.max(1, Math.floor(normQ.length / 4));

    const fuzzyMatches = games
      .filter(g => !containsIds.has(g.id))
      .map(g => ({ game: g, dist: levenshtein(normQ, normalize(g.title).slice(0, normQ.length + threshold)) }))
      .filter(({ dist }) => dist <= threshold)
      .sort((a, b) => a.dist - b.dist)
      .map(({ game }) => game);

    results = [...containsMatches, ...fuzzyMatches];
  }

  // ── Shape and cap output ──
  const shaped = results.slice(0, MAX_RESULTS).map(g => ({
    bggId:      g.id,
    title:      g.title,
    thumbnail:  g.thumbnail  || '',
    minPlayers: g.minPlayers || 1,
    maxPlayers: g.maxPlayers || 99,
  }));

  return respond(200, { results: shaped }, CORS);
});

exports._setForTest = function({ s3: s3arg } = {}) {
  if (s3arg) s3 = s3arg;
};
exports._resetForTest = function() {
  s3 = new S3Client({ region: REGION });
};
