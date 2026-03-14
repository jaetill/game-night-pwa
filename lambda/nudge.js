// Lambda: POST /nudge
// Sends a Postmark reminder email to everyone on a game night who hasn't responded.
//
// Environment variables required:
//   POSTMARK_API_KEY    — Postmark server token
//   FROM_EMAIL          — Verified sender address (e.g. gamenight@jaetill.com)
//   COGNITO_USER_POOL_ID — us-east-2_xneeJzaDJ
//   S3_BUCKET           — jaetill-game-nights
//   APP_URL             — https://jaetill.github.io/game-night-pwa/

'use strict';

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { CognitoIdentityProviderClient, AdminGetUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
const https = require('https');

const s3      = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-east-2' });

const BUCKET       = process.env.S3_BUCKET            || 'jaetill-game-nights';
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || 'us-east-2_xneeJzaDJ';
const FROM_EMAIL   = process.env.FROM_EMAIL;
const POSTMARK_KEY = process.env.POSTMARK_API_KEY;
const APP_URL      = process.env.APP_URL               || 'https://jaetill.github.io/game-night-pwa/';

const CORS = {
  'Access-Control-Allow-Origin':  'https://jaetill.github.io',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Content-Type':                 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST,OPTIONS' }, body: '' };
  }

  // ── Auth: decode Cognito JWT to get caller userId ──
  const rawAuth = event.headers?.Authorization || event.headers?.authorization || '';
  const token   = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7) : rawAuth;
  if (!token) return respond(401, { error: 'Unauthorized' });

  let callerId;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    callerId = payload['cognito:username'] || payload.sub;
  } catch {
    return respond(401, { error: 'Invalid token' });
  }

  // ── Parse body ──
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return respond(400, { error: 'Invalid JSON' }); }

  const { nightId } = body;
  if (!nightId) return respond(400, { error: 'nightId required' });

  // ── Load game nights from S3 ──
  let nights;
  try {
    const obj  = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: 'gameNights.json' }));
    const text = await obj.Body.transformToString();
    nights = JSON.parse(text);
  } catch (e) {
    console.error('S3 load failed', e);
    return respond(500, { error: 'Could not load game nights' });
  }

  const night = nights.find(n => n.id === nightId);
  if (!night) return respond(404, { error: 'Game night not found' });

  // ── Verify caller is the host ──
  if (night.hostUserId !== callerId) return respond(403, { error: 'Only the host can nudge' });

  // ── Compute non-responders ──
  const rsvpdIds   = new Set((night.rsvps    || []).map(r => r.userId));
  const declinedIds = new Set(night.declined || []);
  const nonResponders = (night.invited || []).filter(id => !rsvpdIds.has(id) && !declinedIds.has(id));

  if (nonResponders.length === 0) {
    return respond(200, { sent: 0, message: 'Everyone has already responded' });
  }

  // ── Get host display name from Cognito ──
  let hostName = callerId;
  try {
    const u = await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: callerId }));
    const attr = u.UserAttributes?.find(a => a.Name === 'name');
    if (attr?.Value) hostName = attr.Value;
  } catch { /* non-fatal */ }

  // ── Resolve email addresses for each non-responder ──
  const targets = [];
  for (const id of nonResponders) {
    if (id.includes('@')) {
      targets.push({ email: id, name: id.split('@')[0] });
    } else {
      try {
        const u        = await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: id }));
        const emailAttr = u.UserAttributes?.find(a => a.Name === 'email');
        const nameAttr  = u.UserAttributes?.find(a => a.Name === 'name');
        if (emailAttr?.Value) targets.push({ email: emailAttr.Value, name: nameAttr?.Value || id });
      } catch { /* user not found — skip */ }
    }
  }

  if (targets.length === 0) {
    return respond(200, { sent: 0, message: 'No email addresses could be resolved' });
  }

  // ── Build email content ──
  const dateStr = formatDate(night.date);
  const ctx     = { hostName, dateStr, timeStr: night.time || '', location: night.location || '', description: night.description || '' };

  // ── Send via Postmark ──
  let sent = 0;
  const errors = [];
  for (const { email, name } of targets) {
    try {
      await postmark({
        To:       email,
        From:     FROM_EMAIL,
        Subject:  `Reminder: Game night${dateStr ? ` on ${dateStr}` : ''}`,
        TextBody: buildText({ ...ctx, name }),
        HtmlBody: buildHtml({ ...ctx, name }),
      });
      sent++;
    } catch (e) {
      console.error(`Postmark failed for ${email}:`, e.message);
      errors.push({ email, error: e.message });
    }
  }

  return respond(200, { sent, total: targets.length, errors });
};

// ── Helpers ───────────────────────────────────────────────

function respond(status, body) {
  return { statusCode: status, headers: CORS, body: JSON.stringify(body) };
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch { return dateStr; }
}

function buildText({ name, hostName, dateStr, timeStr, location, description }) {
  const lines = [
    `Hi${name ? ` ${name}` : ''}!`,
    '',
    `${hostName} wanted to remind you about game night` +
      (dateStr   ? ` on ${dateStr}`   : '') +
      (timeStr   ? ` at ${timeStr}`   : '') +
      (location  ? ` at ${location}`  : '') + '.',
  ];
  if (description) lines.push('', description);
  lines.push(
    '',
    `Haven't responded yet? Head over to the app to let them know if you can make it:`,
    APP_URL,
    '',
    `If you've already replied, you can ignore this message.`,
  );
  return lines.join('\n');
}

function buildHtml({ name, hostName, dateStr, timeStr, location, description }) {
  const when = [dateStr && `<strong>${dateStr}</strong>`, timeStr && `at <strong>${timeStr}</strong>`].filter(Boolean).join(' ');
  return `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px 16px;color:#1e293b;">
  <h2 style="margin:0 0 16px;font-size:20px;">🎲 Game night reminder</h2>
  <p>Hi${name ? ` ${name}` : ''}!</p>
  <p><strong>${hostName}</strong> wanted to remind you about game night${when ? ` ${when}` : ''}${location ? ` at <strong>${location}</strong>` : ''}.</p>
  ${description ? `<p style="color:#64748b;font-style:italic;">${description}</p>` : ''}
  <p>Haven't replied yet? Let ${hostName} know if you can make it:</p>
  <p>
    <a href="${APP_URL}"
       style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600;">
      Open Game Night →
    </a>
  </p>
  <p style="margin-top:28px;font-size:12px;color:#94a3b8;">
    If you've already replied, you can ignore this message.
  </p>
</body>
</html>`;
}

function postmark(msg) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(msg);
    const req  = https.request({
      hostname: 'api.postmarkapp.com',
      path:     '/email',
      method:   'POST',
      headers:  {
        'Accept':                    'application/json',
        'Content-Type':              'application/json',
        'X-Postmark-Server-Token':   POSTMARK_KEY,
        'Content-Length':            Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(data));
        else reject(new Error(`Postmark ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
