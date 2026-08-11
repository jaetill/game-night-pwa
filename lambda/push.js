// Lambda: POST /push — manage the caller's Web Push subscriptions.
//
// Body shapes:
//   { action: 'subscribe',   subscription: { endpoint, keys: { p256dh, auth } } }
//   { action: 'unsubscribe', endpoint }
//
// Auth: dual-mode (apiKeyAuthorizer). Caller's userId is in
//       event.requestContext.authorizer.userId. Subscriptions are always
//       stored under the CALLER's userId — the body never names a user, so
//       one user cannot write another user's subscription list.
//
// Storage: S3 push-subscriptions/{userId}.json (see lib/push.js).
//
// IAM:
//   s3:GetObject + s3:PutObject on jaetill-game-nights/push-subscriptions/*
//
// Environment variables:
//   S3_BUCKET — jaetill-game-nights (default)

'use strict';

const { Sentry } = require('./lib/sentry');
const logger = require('./lib/logger');
const { S3Client } = require('@aws-sdk/client-s3');
const push = require('./lib/push');

const REGION = process.env.AWS_REGION || 'us-east-2';
let s3 = new S3Client({ region: REGION });

const ALLOWED_ORIGINS = new Set([
  'https://gamenights.jaetill.com',
  'https://jaetill.github.io',
]);

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

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return respond(400, { error: 'Invalid JSON' }, CORS); }

  try {
    if (body.action === 'subscribe') {
      if (!push.isValidSubscription(body.subscription)) {
        return respond(400, { error: 'Invalid subscription' }, CORS);
      }
      const count = await push.addSubscription(s3, userId, body.subscription);
      logger.info('push.subscribed', { request_id: context?.awsRequestId, devices: count });
      return respond(200, { ok: true, devices: count }, CORS);
    }

    if (body.action === 'unsubscribe') {
      if (typeof body.endpoint !== 'string') {
        return respond(400, { error: 'endpoint required' }, CORS);
      }
      const count = await push.removeSubscription(s3, userId, body.endpoint);
      logger.info('push.unsubscribed', { request_id: context?.awsRequestId, devices: count });
      return respond(200, { ok: true, devices: count }, CORS);
    }

    return respond(400, { error: 'action must be subscribe or unsubscribe' }, CORS);
  } catch (err) {
    logger.error('push.storage_failed', { request_id: context?.awsRequestId, error: err.message });
    Sentry.captureException(err);
    return respond(500, { error: 'storage_error' }, CORS);
  }
});

exports._setForTest = function({ s3: s3arg } = {}) {
  if (s3arg) s3 = s3arg;
};
exports._resetForTest = function() {
  s3 = new S3Client({ region: REGION });
};
