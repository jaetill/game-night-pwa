// Lambda: POST /create-event — creates a new game night event
//
// Auth: Cognito JWT (Bearer token in Authorization header)
//
// Environment variables required:
//   S3_BUCKET            — jaetill-game-nights
//
// S3 paths:
//   gameNights.json — read, append new event, write back

'use strict';

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });

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

// ── Handler ───────────────────────────────────────────────

exports.handler = async (event) => {
  const CORS = corsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST,OPTIONS' }, body: '' };
  }

  // ── Auth: decode Cognito JWT to get caller userId ──
  const rawAuth = event.headers?.Authorization || event.headers?.authorization || '';
  const token   = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7) : rawAuth;
  if (!token) return respond(401, { error: 'Unauthorized' }, CORS);

  let callerId;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    callerId = payload['cognito:username'] || payload.sub;
  } catch {
    return respond(401, { error: 'Invalid token' }, CORS);
  }

  // ── Parse body ──
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return respond(400, { error: 'Invalid JSON' }, CORS); }

  const { date, time, location, description, selectedGames, invited } = body;
  if (!date) return respond(400, { error: 'date is required' }, CORS);

  // ── Load gameNights.json from S3 ──
  let nights = [];
  try {
    const obj  = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: 'gameNights.json' }));
    const text = await obj.Body.transformToString();
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) nights = parsed;
  } catch (e) {
    if (e.name !== 'NoSuchKey') {
      console.error('S3 load failed', e);
      return respond(500, { error: 'Could not load game nights' }, CORS);
    }
    // No file yet — start fresh
  }

  // ── Convert selectedGames array → object keyed by game id ──
  // Input: [{ id|bggId, title, maxPlayers, ... }]
  // Stored: { [id]: { maxPlayers, signedUpPlayers, interestedPlayers } }
  const gamesMap = {};
  if (Array.isArray(selectedGames)) {
    for (const g of selectedGames) {
      const key = g.id || g.bggId;
      if (key) {
        gamesMap[key] = {
          maxPlayers:        g.maxPlayers || 99,
          signedUpPlayers:   [],
          interestedPlayers: [],
        };
      }
    }
  }

  // ── Build new event ──
  const newEvent = {
    id:            Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    date:          date,
    time:          time          || '',
    location:      location      || '',
    description:   description   || '',
    selectedGames: gamesMap,
    invited:       Array.isArray(invited) ? invited : [],
    rsvps:         [],
    declined:      [],
    suggestions:   [],
    hostUserId:    callerId,
    lastModified:  Date.now(),
  };

  nights.push(newEvent);

  // ── Write updated array back to S3 ──
  try {
    await s3.send(new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         'gameNights.json',
      Body:        JSON.stringify(nights),
      ContentType: 'application/json',
    }));
  } catch (e) {
    console.error('S3 write failed', e);
    return respond(500, { error: 'Could not save game night' }, CORS);
  }

  return respond(201, { id: newEvent.id, event: newEvent }, CORS);
};
