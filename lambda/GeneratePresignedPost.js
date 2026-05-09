// Lambda: POST /upload-token — replace gameNights.json with the caller's
// validated array of events. Despite the historical name, this Lambda does
// NOT issue a presigned POST URL — it accepts the JSON body, validates the
// changes against the existing data, and writes via the Lambda's S3 role.
//
// Auth: dual-mode (apiKeyAuthorizer). Caller's userId is in
//       event.requestContext.authorizer.userId.
//
// Validation (validateChanges):
//   - new event must set hostUserId === caller
//   - hostUserId on existing events is immutable
//   - HOST_ONLY fields can only be changed by the event's host
//   - selectedGames keys can only be added/removed by the host
//   - deletion of an existing event requires the caller to be its host
//
// IAM:
//   s3:GetObject + s3:PutObject on jaetill-game-nights/gameNights.json
//
// Environment variables:
//   S3_BUCKET — jaetill-game-nights (default)
//
// NOTE: invite-email-on-add was removed from this Lambda. The frontend
// canonically sends invites via POST /invite (nudgeNonResponders Lambda)
// when the host clicks the Invite button — that path has the correct App
// URL templates. Sending here as well caused duplicate emails with broken
// links pointing at /login.html and /signup.html (removed during the
// Hosted-UI migration).

'use strict';

const { Sentry } = require('./lib/sentry');
const logger = require('./lib/logger');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const BUCKET = process.env.S3_BUCKET || 'jaetill-game-nights';
const KEY    = 'gameNights.json';
const REGION = process.env.AWS_REGION || 'us-east-2';
const s3     = new S3Client({ region: REGION });

const ALLOWED_ORIGINS = new Set([
  'https://gamenights.jaetill.com',
  'https://jaetill.github.io',
]);

// Note: `invited` is NOT host-only. Non-hosts need to remove their own email
// from `invited` when they RSVP/decline — without this, the upload was rejected
// 403 and the entire save silently failed (storage.js used to swallow the error).
const HOST_ONLY = ['date', 'time', 'location', 'description', 'snacks'];

// ── Helpers ────────────────────────────────────────────────────────────────

function corsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  return {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGINS.has(origin) ? origin : 'https://gamenights.jaetill.com',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-API-Key',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Content-Type':                 'application/json',
  };
}

function respond(status, body, headers) {
  return { statusCode: status, headers, body: JSON.stringify(body) };
}

function validateChanges(current, incoming, userId) {
  const currentById = new Map(current.map(n => [String(n.id), n]));

  for (const night of incoming) {
    const existing = currentById.get(String(night.id));

    if (!existing) {
      if (night.hostUserId !== userId) {
        return `New night must set hostUserId to your own userId`;
      }
      continue;
    }

    if (night.hostUserId !== existing.hostUserId) {
      return `Cannot change hostUserId on night ${night.id}`;
    }

    const isHost = existing.hostUserId === userId;

    for (const field of HOST_ONLY) {
      if (JSON.stringify(night[field]) !== JSON.stringify(existing[field]) && !isHost) {
        return `Only the host can change "${field}" on night ${night.id}`;
      }
    }

    const existingKeys = Object.keys(existing.selectedGames || {}).sort().join(',');
    const newKeys      = Object.keys(night.selectedGames   || {}).sort().join(',');
    if (existingKeys !== newKeys && !isHost) {
      return `Only the host can add or remove games on night ${night.id}`;
    }
  }

  const incomingIds = new Set(incoming.map(n => String(n.id)));
  for (const night of current) {
    if (!incomingIds.has(String(night.id)) && night.hostUserId !== userId) {
      return `Only the host can delete night ${night.id}`;
    }
  }

  return null;
}

// ── Handler ────────────────────────────────────────────────────────────────

exports.handler = Sentry.wrapHandler(async (event, context) => {
  logger.info('handler.invoked', {
    request_id: context?.awsRequestId,
    method: event.httpMethod,
    resource: event.resource,
  });

  const CORS = corsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  const userId = event.requestContext?.authorizer?.userId;
  if (!userId) return respond(401, { error: 'Unauthorized' }, CORS);

  let incoming;
  try {
    incoming = JSON.parse(event.body || '[]');
    if (!Array.isArray(incoming)) throw new Error('not array');
  } catch {
    return respond(400, { error: 'Body must be a JSON array' }, CORS);
  }

  let current = [];
  try {
    const res    = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }));
    const chunks = [];
    for await (const chunk of res.Body) chunks.push(chunk);
    current = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
    if (!Array.isArray(current)) current = [];
  } catch (err) {
    if (err.name !== 'NoSuchKey') {
      logger.error('s3.load_failed', { request_id: context?.awsRequestId, key: KEY, error: err.message });
      Sentry.captureException(err);
      return respond(500, { error: 'Failed to load current data' }, CORS);
    }
  }

  const violation = validateChanges(current, incoming, userId);
  if (violation) {
    logger.warn('upload.rejected', { request_id: context?.awsRequestId, user_id: userId, violation });
    return respond(403, { error: violation }, CORS);
  }

  try {
    await s3.send(new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         KEY,
      Body:        JSON.stringify(incoming),
      ContentType: 'application/json',
    }));
  } catch (err) {
    logger.error('s3.put_failed', { request_id: context?.awsRequestId, key: KEY, error: err.message });
    Sentry.captureException(err);
    return respond(500, { error: err.message }, CORS);
  }

  logger.info('upload.saved', { request_id: context?.awsRequestId, count: incoming.length });
  return respond(200, { saved: incoming.length }, CORS);
});
