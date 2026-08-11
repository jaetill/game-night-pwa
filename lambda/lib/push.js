// lib/push.js — Web Push helper shared by pushSubscriptions, rsvpLink, and
// GeneratePresignedPost.
//
// Subscriptions are stored per-user in S3 at
//   push-subscriptions/{userId}.json  →  [ PushSubscription, ... ]
// (multi-device: one array entry per browser/device endpoint).
//
// VAPID keys live in Secrets Manager (game-night/prod/push-vapid:
// { publicKey, privateKey, subject }), fetched once per cold start and
// cached in module scope — same pattern as the Postmark key in nudge.js.
//
// Delivery failures with HTTP 404/410 mean the subscription is gone
// (user revoked permission or reinstalled the PWA); those entries are
// pruned from S3 so we stop pushing into the void.

'use strict';

const webpushLib = require('web-push');
const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const logger = require('./logger');

const BUCKET      = process.env.S3_BUCKET || 'jaetill-game-nights';
const SUBS_PREFIX = 'push-subscriptions/';
const VAPID_SECRET_ID = 'game-night/prod/push-vapid';

let smClient = new SecretsManagerClient({ region: 'us-east-2' });
let webpush  = webpushLib;
let _vapid   = null;

async function getVapid() {
  if (!_vapid) {
    const res = await smClient.send(new GetSecretValueCommand({ SecretId: VAPID_SECRET_ID }));
    _vapid = JSON.parse(res.SecretString);
  }
  return _vapid;
}

function subsKey(userId) {
  // userIds are Cognito usernames (UUIDs) or, for the email-invite edge
  // case, email addresses — encode so the key is always S3-path-safe.
  return `${SUBS_PREFIX}${encodeURIComponent(String(userId))}.json`;
}

async function loadSubscriptions(s3, userId) {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: subsKey(userId) }));
    const text = await res.Body.transformToString();
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    // AccessDenied covers the no-ListBucket-on-missing-key behavior, same
    // as _loadCurrentNightsWithMeta in GeneratePresignedPost.
    if (err.name === 'NoSuchKey' || err.name === 'AccessDenied') return [];
    throw err;
  }
}

async function saveSubscriptions(s3, userId, subs) {
  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         subsKey(userId),
    Body:        JSON.stringify(subs),
    ContentType: 'application/json',
  }));
}

function isValidSubscription(sub) {
  return sub && typeof sub === 'object'
    && typeof sub.endpoint === 'string'
    && sub.endpoint.startsWith('https://')
    && sub.endpoint.length <= 2048
    && sub.keys && typeof sub.keys.p256dh === 'string' && typeof sub.keys.auth === 'string';
}

async function addSubscription(s3, userId, sub) {
  const subs = await loadSubscriptions(s3, userId);
  const without = subs.filter(s => s.endpoint !== sub.endpoint);
  without.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
  await saveSubscriptions(s3, userId, without);
  return without.length;
}

async function removeSubscription(s3, userId, endpoint) {
  const subs = await loadSubscriptions(s3, userId);
  const without = subs.filter(s => s.endpoint !== endpoint);
  if (without.length !== subs.length) await saveSubscriptions(s3, userId, without);
  return without.length;
}

/**
 * Send a push notification to every device the user has subscribed.
 * Never throws for delivery failures — callers treat push as best-effort.
 * @param payload — { title, body, url?, tag? }
 * @returns { sent, pruned }
 */
async function notifyUser(s3, userId, payload) {
  let subs;
  try { subs = await loadSubscriptions(s3, userId); }
  catch (e) {
    logger.warn('push.load_subs_failed', { error: e.message });
    return { sent: 0, pruned: 0 };
  }
  if (subs.length === 0) return { sent: 0, pruned: 0 };

  let vapid;
  try { vapid = await getVapid(); }
  catch (e) {
    logger.warn('push.vapid_unavailable', { error: e.message });
    return { sent: 0, pruned: 0 };
  }

  const body = JSON.stringify(payload);
  const options = {
    TTL: 24 * 60 * 60,
    vapidDetails: {
      subject:    vapid.subject || 'mailto:jason@jaetill.com',
      publicKey:  vapid.publicKey,
      privateKey: vapid.privateKey,
    },
  };

  let sent = 0;
  const dead = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(sub, body, options);
      sent++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) dead.push(sub.endpoint);
      else logger.warn('push.send_failed', { status: err.statusCode, error: err.message });
    }
  }

  if (dead.length > 0) {
    try {
      const alive = subs.filter(s => !dead.includes(s.endpoint));
      await saveSubscriptions(s3, userId, alive);
    } catch (e) {
      logger.warn('push.prune_failed', { error: e.message });
    }
  }

  return { sent, pruned: dead.length };
}

module.exports = {
  loadSubscriptions,
  addSubscription,
  removeSubscription,
  isValidSubscription,
  notifyUser,
  _setForTest({ smClient: sm, webpush: wp } = {}) {
    if (sm) { smClient = sm; _vapid = null; }
    if (wp) webpush = wp;
  },
  _resetForTest() {
    smClient = new SecretsManagerClient({ region: 'us-east-2' });
    webpush  = webpushLib;
    _vapid   = null;
  },
};
