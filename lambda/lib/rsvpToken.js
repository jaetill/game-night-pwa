// lib/rsvpToken.js — HMAC-signed tokens for one-click RSVP links in emails.
//
// Token format: base64url(JSON payload) + "." + base64url(HMAC-SHA256(body)).
// Payload: { nightId, invitee, exp } where `invitee` is the invite key as it
// appears in night.invited[] (email address or Cognito userId) and `exp` is
// epoch millis after which the token is rejected.
//
// The secret lives in Secrets Manager (game-night/prod/rsvp-link). Signing
// happens in nudge.js when emails go out; verification in rsvpLink.js when
// a recipient clicks. Verification is constant-time (timingSafeEqual).

'use strict';

const crypto = require('node:crypto');

function signRsvpToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac  = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verifyRsvpToken(token, secret) {
  if (typeof token !== 'string' || token.length > 2048) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, mac] = parts;

  const expected = crypto.createHmac('sha256', secret).update(body).digest();
  let given;
  try { given = Buffer.from(mac, 'base64url'); } catch { return null; }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;

  let payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')); } catch { return null; }
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.exp === 'number' && Date.now() > payload.exp) return null;
  return payload;
}

module.exports = { signRsvpToken, verifyRsvpToken };
