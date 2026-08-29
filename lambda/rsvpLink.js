// Lambda: GET /rsvp?token=...&choice=... — one-click RSVP from email links.
//
// PUBLIC route (no authorizer): authentication is the HMAC-signed token
// minted by nudge.js when the invite/nudge email went out. The token pins
// {nightId, invitee, exp} — a recipient can only RSVP themselves, only to
// the night they were invited to, and only until the token expires
// (verifyRsvpToken in lib/rsvpToken.js, constant-time HMAC check).
//
// choice ∈ playing | if_needed | declined
//
// The write path mirrors GeneratePresignedPost: read gameNights.json with
// ETag, mutate, conditional PutObject (If-Match), one retry on a lost race.
// Repeat clicks are idempotent — the previous RSVP/decline for the user is
// replaced, not duplicated.
//
// After a successful save the host gets a Web Push notification (lib/push,
// best-effort). Responses are small HTML pages, not JSON — the recipient
// lands here from their mail app in a full browser tab.
//
// IAM:
//   s3:GetObject + s3:PutObject on jaetill-game-nights/gameNights.json
//   s3:GetObject + s3:PutObject on jaetill-game-nights/push-subscriptions/*
//   cognito-idp:ListUsers + AdminGetUser on the shared pool
//   secretsmanager:GetSecretValue on game-night/prod/rsvp-link + push-vapid
//
// Environment variables:
//   S3_BUCKET            — jaetill-game-nights (default)
//   COGNITO_USER_POOL_ID — us-east-2_xneeJzaDJ (default)
//   APP_URL              — https://gamenights.jaetill.com/ (default)

'use strict';

const { Sentry } = require('./lib/sentry');
const logger = require('./lib/logger');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { CognitoIdentityProviderClient, AdminGetUserCommand, ListUsersCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { verifyRsvpToken } = require('./lib/rsvpToken');
const { identityFields } = require('./lib/identity');
const push = require('./lib/push');

const BUCKET       = process.env.S3_BUCKET || 'jaetill-game-nights';
const KEY          = 'gameNights.json';
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || 'us-east-2_xneeJzaDJ';
const APP_URL      = process.env.APP_URL || 'https://gamenights.jaetill.com/';
const REGION       = process.env.AWS_REGION || 'us-east-2';

let s3       = new S3Client({ region: REGION });
let cognito  = new CognitoIdentityProviderClient({ region: REGION });
let smClient = new SecretsManagerClient({ region: 'us-east-2' });

let _secret = null;
async function getLinkSecret() {
  if (!_secret) {
    const res = await smClient.send(new GetSecretValueCommand({ SecretId: 'game-night/prod/rsvp-link' }));
    _secret = JSON.parse(res.SecretString).secret;
  }
  return _secret;
}

const CHOICES = {
  playing:   { verb: 'is in',                emoji: '🎉', headline: "You're in!",            detail: 'A seat is reserved for you. Pick a game in the app when you get a chance.' },
  if_needed: { verb: 'will play if needed',  emoji: '👍', headline: "Got it — you're on the maybe list.", detail: "The host knows you'll play if a game needs one more." },
  declined:  { verb: "can't make it",        emoji: '😢', headline: "Sorry you can't make it.", detail: 'The host has been let know. Maybe next time!' },
};

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function htmlPage(status, { emoji, headline, detail }) {
  const body = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Game Night RSVP</title>
</head>
<body style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:48px 20px;color:#1e293b;text-align:center;">
  <div style="font-size:56px;margin-bottom:12px;">${emoji}</div>
  <h1 style="font-size:22px;margin:0 0 10px;">${headline}</h1>
  <p style="color:#64748b;margin:0 0 28px;">${detail}</p>
  <a href="${APP_URL}"
     style="display:inline-block;background:#d97706;color:#fff;padding:12px 26px;border-radius:8px;text-decoration:none;font-weight:600;">
    Open Game Night →
  </a>
</body>
</html>`;
  return {
    statusCode: status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    body,
  };
}

const INVALID_PAGE = {
  emoji: '⏳',
  headline: 'This link has expired',
  detail: 'No worries — you can still RSVP in the app.',
};

async function loadNightsWithMeta() {
  try {
    const res    = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }));
    const text   = await res.Body.transformToString();
    const parsed = JSON.parse(text);
    return { nights: Array.isArray(parsed) ? parsed : [], etag: res.ETag };
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.name === 'AccessDenied') return { nights: [], etag: undefined };
    throw err;
  }
}

/**
 * Resolve an invite key (email or Cognito username) to
 * { userId, name, email?, matched }.
 *
 * Falls back to the raw key when Cognito has no matching user — the app's
 * invited[]/rsvps[] handling tolerates email-shaped ids.
 *
 * `matched` reports whether Cognito actually resolved the invitee, so the
 * caller can log it. An unmatched RSVP still saves, but it lands in rsvps[]
 * under an email-shaped userId that will never equal the userId the app sees
 * once that person signs in — worth being able to spot in the logs.
 */
async function resolveInvitee(invitee) {
  const isEmail = invitee.includes('@');
  try {
    if (isEmail) {
      const emailLc = invitee.toLowerCase().replace(/"/g, '');
      const list = await cognito.send(new ListUsersCommand({
        UserPoolId: USER_POOL_ID,
        Filter:     `email = "${emailLc}"`,
        Limit:      1,
      }));
      if (list.Users && list.Users.length > 0) {
        const u = list.Users[0];
        const nameAttr = u.Attributes?.find(a => a.Name === 'name');
        return { userId: u.Username, name: nameAttr?.Value || emailLc.split('@')[0], email: emailLc, matched: true };
      }
      return { userId: emailLc, name: emailLc.split('@')[0], email: emailLc, matched: false };
    }
    const u = await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: invitee }));
    const nameAttr = u.UserAttributes?.find(a => a.Name === 'name');
    const emailAttr = u.UserAttributes?.find(a => a.Name === 'email');
    return { userId: invitee, name: nameAttr?.Value || emailAttr?.Value?.split('@')[0] || invitee, email: emailAttr?.Value, matched: true };
  } catch {
    return { userId: invitee, name: isEmail ? invitee.split('@')[0] : invitee, email: isEmail ? invitee : undefined, matched: false };
  }
}

/**
 * Apply a one-click choice to a night in place. Idempotent: strips any prior
 * RSVP/decline by this user first. Exported for unit tests.
 */
function applyChoice(night, { userId, name, email, invitee }, choice) {
  night.rsvps    = (Array.isArray(night.rsvps) ? night.rsvps : []).filter(r => r.userId !== userId);
  night.declined = (Array.isArray(night.declined) ? night.declined : []).filter(id => id !== userId);

  // Same behavior as the in-app RSVP: responding removes you from invited[].
  const dropKeys = new Set([userId, invitee, invitee.toLowerCase(), email, email?.toLowerCase()].filter(Boolean));
  night.invited = (night.invited || []).filter(k => !dropKeys.has(k));

  if (choice === 'declined') night.declined.push(userId);
  else night.rsvps.push({ userId, name, type: choice });

  night.lastModified = Date.now();
}
exports._applyChoice = applyChoice;

exports.handler = Sentry.wrapHandler(async (event, context) => {
  logger.info('handler.invoked', {
    request_id: context?.awsRequestId,
    method: event.httpMethod,
    resource: event.resource,
  });

  const token  = event.queryStringParameters?.token;
  const choice = event.queryStringParameters?.choice;
  if (!token || !CHOICES[choice]) return htmlPage(400, INVALID_PAGE);

  let secret;
  try { secret = await getLinkSecret(); }
  catch (err) {
    logger.error('secrets.load_failed', { request_id: context?.awsRequestId, error: err.message });
    Sentry.captureException(err);
    return htmlPage(500, { emoji: '😵', headline: 'Something went wrong', detail: 'Please RSVP in the app instead.' });
  }

  const payload = verifyRsvpToken(token, secret);
  if (!payload || !payload.nightId || typeof payload.invitee !== 'string') {
    logger.warn('rsvp_link.invalid_token', { request_id: context?.awsRequestId });
    return htmlPage(400, INVALID_PAGE);
  }

  const who = await resolveInvitee(payload.invitee);

  // Logged BEFORE the write. A click that fails partway (S3 down, night
  // deleted, lost race) still leaves a record that this person tried — which
  // is exactly the case where someone says "I RSVP'd" and the data disagrees.
  const whoFields = identityFields(who);
  logger.info('rsvp_link.attempt', {
    request_id: context?.awsRequestId,
    night_id:   payload.nightId,
    choice,
    resolved:   who.matched,
    ...whoFields,
  });

  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let nights, etag;
    try { ({ nights, etag } = await loadNightsWithMeta()); }
    catch (err) {
      logger.error('s3.load_failed', { request_id: context?.awsRequestId, key: KEY, error: err.message });
      Sentry.captureException(err);
      return htmlPage(500, { emoji: '😵', headline: 'Something went wrong', detail: 'Please RSVP in the app instead.' });
    }

    const night = nights.find(n => String(n.id) === String(payload.nightId));
    if (!night || night.deleted === true) {
      return htmlPage(404, { emoji: '🗓️', headline: 'This game night is no longer on', detail: 'It may have been cancelled. Check the app for upcoming nights.' });
    }

    applyChoice(night, { ...who, invitee: payload.invitee }, choice);

    try {
      await s3.send(new PutObjectCommand({
        Bucket:      BUCKET,
        Key:         KEY,
        Body:        JSON.stringify(nights),
        ContentType: 'application/json',
        ...(etag ? { IfMatch: etag } : { IfNoneMatch: '*' }),
      }));
    } catch (err) {
      const isRace = err?.name === 'PreconditionFailed'
        || err?.$metadata?.httpStatusCode === 412
        || err?.name === 'ConditionalRequestConflict';
      if (isRace && attempt < MAX_ATTEMPTS) continue;
      logger.error('s3.put_failed', { request_id: context?.awsRequestId, key: KEY, error: err.message });
      Sentry.captureException(err);
      return htmlPage(500, { emoji: '😵', headline: 'Something went wrong', detail: 'Please RSVP in the app instead.' });
    }

    logger.info('rsvp_link.saved', {
      request_id: context?.awsRequestId,
      night_id:   night.id,
      choice,
      attempt,
      ...whoFields,
    });

    // Best-effort host notification — never blocks the response.
    if (night.hostUserId && night.hostUserId !== who.userId) {
      try {
        await push.notifyUser(s3, night.hostUserId, {
          title: '🎲 Game Night RSVP',
          body:  `${who.name} ${CHOICES[choice].verb}${night.date ? ` (${night.date})` : ''}`,
          url:   APP_URL,
          tag:   `rsvp-${night.id}`,
        });
      } catch (e) {
        logger.warn('push.notify_failed', { request_id: context?.awsRequestId, error: e.message });
      }
    }

    const page = CHOICES[choice];
    return htmlPage(200, { emoji: page.emoji, headline: escapeHtml(page.headline), detail: escapeHtml(page.detail) });
  }
});

exports._setForTest = function({ s3: s3arg, cognito: cog, smClient: sm } = {}) {
  if (s3arg) s3 = s3arg;
  if (cog)   cognito = cog;
  if (sm)    { smClient = sm; _secret = null; }
};
exports._resetForTest = function() {
  s3       = new S3Client({ region: REGION });
  cognito  = new CognitoIdentityProviderClient({ region: REGION });
  smClient = new SecretsManagerClient({ region: 'us-east-2' });
  _secret  = null;
};
