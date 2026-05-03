// Lambda: GET /get-token?key=<key> — issues a short-lived presigned GET URL
//
// Auth: dual-mode (apiKeyAuthorizer). Caller's userId is in
//       event.requestContext.authorizer.userId.
//
// Allowed keys (anything else returns 403 — prevents IDOR on other users'
// collections):
//   - gameNights.json                — shared event list, all users may read
//   - collections/{userId}.json      — caller's own BGG collection
//
// IAM: s3:GetObject on the bucket (used to *sign* the URL; the signed URL
//      itself is what the caller fetches — Lambda does not stream the body).
//
// Environment variables:
//   S3_BUCKET — jaetill-game-nights (default)

'use strict';

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const BUCKET = process.env.S3_BUCKET || 'jaetill-game-nights';
const REGION = process.env.AWS_REGION || 'us-east-2';
const client = new S3Client({ region: REGION });

const ALLOWED_ORIGINS = new Set([
  'https://gamenights.jaetill.com',
  'https://jaetill.github.io',
]);

function corsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  return {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGINS.has(origin) ? origin : 'https://gamenights.jaetill.com',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-API-Key',
    'Content-Type':                 'application/json',
  };
}

function respond(status, body, headers) {
  return { statusCode: status, headers, body: JSON.stringify(body) };
}

function isKeyAllowed(key, callerId) {
  if (key === 'gameNights.json') return true;
  if (key === `collections/${callerId}.json`) return true;
  return false;
}

exports.handler = async (event) => {
  const CORS = corsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { ...CORS, 'Access-Control-Allow-Methods': 'GET,OPTIONS' }, body: '' };
  }

  const callerId = event.requestContext?.authorizer?.userId;
  if (!callerId) return respond(401, { error: 'Unauthorized' }, CORS);

  const key = event.queryStringParameters?.key || 'gameNights.json';
  if (!isKeyAllowed(key, callerId)) {
    return respond(403, { error: 'Forbidden key' }, CORS);
  }

  try {
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
    const url = await getSignedUrl(client, command, { expiresIn: 60 });
    return respond(200, { url }, CORS);
  } catch (err) {
    console.error('Presign failed:', err);
    return respond(500, { error: err.message }, CORS);
  }
};
