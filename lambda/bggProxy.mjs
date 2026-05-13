// Lambda: GET/POST /bgg + GET/POST /profiles
//
// Routes (event.resource):
//   /profiles  GET  → return caller's profile JSON (or {} if not yet saved)
//   /profiles  POST → upsert caller's profile (whitelist of safe fields)
//   /bgg       GET  → return caller's BGG collection (404 if none)
//   /bgg       POST → replace caller's BGG collection
//
// Auth: dual-mode (apiKeyAuthorizer). Caller's userId is in
//       event.requestContext.authorizer.userId. The userId in /bgg POST/GET
//       payloads MUST match the authenticated userId — guards against IDOR
//       on other users' collections.
//
// IAM:
//   s3:GetObject + s3:PutObject on profiles/* and collections/*
//
// Note on naming: this Lambda predates the BGG integration and now also
// serves /profiles. The historical name is preserved to avoid disturbing
// API Gateway integrations.

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import sentryModule from './lib/sentry.js';
import logger from './lib/logger.js';

const { Sentry } = sentryModule;

const BUCKET = process.env.S3_BUCKET || 'jaetill-game-nights';
const REGION = process.env.AWS_REGION || 'us-east-2';
const s3     = new S3Client({ region: REGION });

const ALLOWED_ORIGINS = new Set([
  'https://gamenights.jaetill.com',
  'https://jaetill.github.io',
]);

function corsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  return {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGINS.has(origin) ? origin : 'https://gamenights.jaetill.com',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-API-Key',
    'Content-Type':                 'application/json',
  };
}

async function s3Get(key, notFoundValue) {
  try {
    const res    = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const chunks = [];
    for await (const chunk of res.Body) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf-8');
  } catch (err) {
    if (err.name === 'NoSuchKey') return notFoundValue;
    throw err;
  }
}

async function s3Put(key, data) {
  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        JSON.stringify(data),
    ContentType: 'application/json',
  }));
}

export const handler = Sentry.wrapHandler(async (event, context) => {
  logger.info('handler.invoked', {
    request_id: context?.awsRequestId,
    method: event.httpMethod,
    resource: event.resource,
  });

  const method   = event.httpMethod;
  const resource = event.resource; // '/bgg' or '/profiles'
  const CORS     = corsHeaders(event);

  if (method === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  const callerId = event.requestContext?.authorizer?.userId;
  if (!callerId) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  // ── /profiles ──────────────────────────────────────────────────────────
  if (resource === '/profiles') {
    if (method === 'GET') {
      try {
        const raw  = await s3Get(`profiles/${callerId}.json`, null);
        const body = raw ?? JSON.stringify({});
        return { statusCode: 200, headers: CORS, body };
      } catch (err) {
        logger.error('s3.profile_read_failed', { request_id: context?.awsRequestId, user_id: callerId, error: err.message });
        Sentry.captureException(err);
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'storage_error' }) };
      }
    }

    if (method === 'POST') {
      let profile;
      try {
        profile = JSON.parse(event.body || '{}');
      } catch {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
      }
      // Strip HTML angle brackets from any free-text field. The frontend now
      // escapes user-supplied strings on render, but this keeps any payload
      // from ever sitting in S3 and surfacing through a future template that
      // forgets to escape. Email format is validated separately at the
      // input level so it never contains angle brackets.
      const clean = (v) => typeof v === 'string' ? v.replace(/[<>]/g, '') : v;
      const { displayName, bggUsername, contactEmail, phone, address } = profile;
      try {
        await s3Put(`profiles/${callerId}.json`, {
          displayName:  clean(displayName),
          bggUsername:  clean(bggUsername),
          contactEmail: clean(contactEmail),
          phone:        clean(phone),
          address:      clean(address),
        });
        return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
      } catch (err) {
        logger.error('s3.profile_write_failed', { request_id: context?.awsRequestId, user_id: callerId, error: err.message });
        Sentry.captureException(err);
        return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'storage_error' }) };
      }
    }
  }

  // ── /bgg ───────────────────────────────────────────────────────────────
  if (method === 'GET') {
    const userId = event.queryStringParameters?.userId;
    if (!userId) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing userId' }) };
    }
    if (userId !== callerId) {
      return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Forbidden' }) };
    }
    try {
      const raw = await s3Get(`collections/${callerId}.json`, null);
      if (raw === null) return { statusCode: 404, headers: CORS, body: JSON.stringify([]) };
      return { statusCode: 200, headers: CORS, body: raw };
    } catch (err) {
      logger.error('s3.collection_read_failed', { request_id: context?.awsRequestId, user_id: callerId, error: err.message });
      Sentry.captureException(err);
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'storage_error' }) };
    }
  }

  if (method === 'POST') {
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    const { userId, games } = body;
    if (!userId || !Array.isArray(games)) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Missing userId or games' }) };
    }
    if (userId !== callerId) {
      return { statusCode: 403, headers: CORS, body: JSON.stringify({ error: 'Forbidden' }) };
    }
    try {
      await s3Put(`collections/${callerId}.json`, games);
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ saved: games.length }) };
    } catch (err) {
      logger.error('s3.collection_write_failed', { request_id: context?.awsRequestId, user_id: callerId, error: err.message });
      Sentry.captureException(err);
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: 'storage_error' }) };
    }
  }

  return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
});
