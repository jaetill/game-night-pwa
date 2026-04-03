// Lambda: GET /groups    — returns the caller's saved invitation groups
//         POST /groups   — upserts a named group { name, emails[] }
//         DELETE /groups — removes a group by name { name }
//
// Auth: Cognito JWT in Authorization header (same pattern as nudge.js)
// S3:   reads and writes profiles/{userId}.json in BUCKET
//       preserves all existing profile fields; only updates the `groups` key
//
// IAM role needs:
//   s3:GetObject  on arn:aws:s3:::jaetill-game-nights/profiles/*
//   s3:PutObject  on arn:aws:s3:::jaetill-game-nights/profiles/*
//
// Environment variables:
//   S3_BUCKET — jaetill-game-nights (default)

'use strict';

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3     = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
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

async function readProfile(userId) {
  try {
    const obj  = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: `profiles/${userId}.json` }));
    const text = await obj.Body.transformToString();
    return JSON.parse(text);
  } catch (e) {
    if (e.name === 'NoSuchKey') return {};
    throw e;
  }
}

async function writeProfile(userId, profile) {
  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         `profiles/${userId}.json`,
    Body:        JSON.stringify(profile),
    ContentType: 'application/json',
  }));
}

// ── Route handlers ────────────────────────────────────────

async function handleGet(userId, CORS) {
  const profile = await readProfile(userId);
  return respond(200, { groups: profile.groups || [] }, CORS);
}

async function handlePost(userId, body, CORS) {
  const { name, emails } = body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return respond(400, { error: 'name is required' }, CORS);
  }
  if (!Array.isArray(emails)) {
    return respond(400, { error: 'emails must be an array' }, CORS);
  }

  const cleanName   = name.trim();
  const validEmails = emails.filter(e => typeof e === 'string' && e.includes('@'));

  const profile = await readProfile(userId);
  const groups  = profile.groups || [];
  const idx     = groups.findIndex(g => g.name === cleanName);
  const group   = { name: cleanName, emails: validEmails };

  if (idx !== -1) groups[idx] = group;
  else            groups.push(group);

  await writeProfile(userId, { ...profile, groups });
  return respond(200, { groups }, CORS);
}

async function handleDelete(userId, body, CORS) {
  const { name } = body;
  if (!name || typeof name !== 'string') {
    return respond(400, { error: 'name is required' }, CORS);
  }

  const profile = await readProfile(userId);
  const groups  = (profile.groups || []).filter(g => g.name !== name);
  await writeProfile(userId, { ...profile, groups });
  return respond(200, { groups }, CORS);
}

// ── Main handler ──────────────────────────────────────────

exports.handler = async (event) => {
  const CORS = corsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS' },
      body: '',
    };
  }

  // ── Auth: decode Cognito JWT to get caller userId ──
  const rawAuth = event.headers?.Authorization || event.headers?.authorization || '';
  const token   = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7) : rawAuth;
  if (!token) return respond(401, { error: 'Unauthorized' }, CORS);

  let userId;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    userId = payload['cognito:username'] || payload.sub;
  } catch {
    return respond(401, { error: 'Invalid token' }, CORS);
  }

  try {
    if (event.httpMethod === 'GET') {
      return await handleGet(userId, CORS);
    }

    // POST and DELETE both need a JSON body
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return respond(400, { error: 'Invalid JSON' }, CORS); }

    if (event.httpMethod === 'POST')   return await handlePost(userId, body, CORS);
    if (event.httpMethod === 'DELETE') return await handleDelete(userId, body, CORS);

    return respond(405, { error: 'Method not allowed' }, CORS);
  } catch (e) {
    console.error('groups handler error:', e);
    return respond(500, { error: 'Internal server error' }, CORS);
  }
};
