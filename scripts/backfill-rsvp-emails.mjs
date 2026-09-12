#!/usr/bin/env node
// One-time backfill: stamp `email` onto every rsvps[] entry in gameNights.json
// whose userId is a Cognito user, so the app's Recent guests list can match
// email invites to signed-in users (see src/js/utils/userDirectory.js).
//
// Usage (needs jaetill-dev AWS creds in the environment):
//   node scripts/backfill-rsvp-emails.mjs            # dry run — prints the plan
//   node scripts/backfill-rsvp-emails.mjs --write    # writes back with If-Match
//
// Idempotent: entries that already carry an email are left alone. Entries
// whose userId is email-shaped (never signed in) or has no Cognito user are
// skipped, not guessed.

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { CognitoIdentityProviderClient, AdminGetUserCommand } from '@aws-sdk/client-cognito-identity-provider';

const BUCKET = 'jaetill-game-nights';
const KEY    = 'gameNights.json';
const POOL   = 'us-east-2_xneeJzaDJ';
const WRITE  = process.argv.includes('--write');

const s3      = new S3Client({ region: 'us-east-2' });
const cognito = new CognitoIdentityProviderClient({ region: 'us-east-2' });

const res    = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }));
const etag   = res.ETag;
const nights = JSON.parse(await res.Body.transformToString());

const cache = new Map(); // userId → email | null
async function emailFor(userId) {
  if (cache.has(userId)) return cache.get(userId);
  let email = null;
  try {
    const u = await cognito.send(new AdminGetUserCommand({ UserPoolId: POOL, Username: userId }));
    email = u.UserAttributes?.find(a => a.Name === 'email')?.Value?.toLowerCase() ?? null;
  } catch { /* no such user */ }
  cache.set(userId, email);
  return email;
}

let stamped = 0, skipped = 0, already = 0;
for (const night of nights) {
  if (night.deleted) continue;
  let touched = false;
  for (const r of night.rsvps || []) {
    if (typeof r.email === 'string' && r.email.includes('@')) { already++; continue; }
    if (!r.userId || r.userId.includes('@')) { skipped++; continue; }
    const email = await emailFor(r.userId);
    if (!email) { skipped++; console.log(`  skip ${night.date} ${r.userId} (no Cognito user)`); continue; }
    r.email = email;
    stamped++;
    touched = true;
    console.log(`  stamp ${night.date} ${r.name ?? r.userId} → ${email}`);
  }
  if (touched) night.lastModified = Date.now();
}
console.log(`\n${stamped} stamped, ${already} already had email, ${skipped} skipped`);

if (!WRITE) { console.log('dry run — pass --write to save'); process.exit(0); }
if (stamped === 0) { console.log('nothing to write'); process.exit(0); }

await s3.send(new PutObjectCommand({
  Bucket: BUCKET, Key: KEY,
  Body: JSON.stringify(nights),
  ContentType: 'application/json',
  ...(etag ? { IfMatch: etag } : {}),
}));
console.log('written');
