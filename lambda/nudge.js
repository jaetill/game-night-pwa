// Lambda: POST /nudge  — sends Postmark reminder to non-responders
//         POST /invite — provisions a Cognito user + sends Postmark invite
//
// Auth: dual-mode (apiKeyAuthorizer). Caller's userId is in
//       event.requestContext.authorizer.userId.
//
// /invite implicitly acts as a portal invite scoped to game-night:
//   - if no Cognito user exists for the email, AdminCreateUser is called
//     (Cognito sends the temp-password welcome email from `jaetill.com`)
//   - the user is added to the `game-night-users` group (idempotent)
//   - a separate Postmark "you're invited to game night" email is sent
//
// Environment variables required:
//   FROM_EMAIL          — Verified sender address (e.g. gamenight@jaetill.com)
//   COGNITO_USER_POOL_ID — us-east-2_xneeJzaDJ
//   S3_BUCKET           — jaetill-game-nights
//   APP_URL             — https://gamenights.jaetill.com/
//
// Secrets (AWS Secrets Manager):
//   shared/postmark-api-key — contains POSTMARK_API_KEY

'use strict';

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  ListUsersCommand,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
} = require('@aws-sdk/client-cognito-identity-provider');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const https  = require('https');
const crypto = require('node:crypto');

const REQUIRED_GROUP = 'game-night-users';

const s3      = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-east-2' });
const smClient = new SecretsManagerClient({ region: 'us-east-2' });

let _secrets;
async function getSecrets() {
  if (!_secrets) {
    const res = await smClient.send(new GetSecretValueCommand({ SecretId: 'shared/postmark-api-key' }));
    _secrets = JSON.parse(res.SecretString);
  }
  return _secrets;
}

const BUCKET       = process.env.S3_BUCKET            || 'jaetill-game-nights';
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || 'us-east-2_xneeJzaDJ';
const FROM_EMAIL   = process.env.FROM_EMAIL;
const APP_URL      = process.env.APP_URL               || 'https://gamenights.jaetill.com/';

const ALLOWED_ORIGINS = new Set([
  'https://gamenights.jaetill.com',
  'https://jaetill.github.io',
]);

function corsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  return {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGINS.has(origin) ? origin : 'https://gamenights.jaetill.com',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Content-Type':                 'application/json',
  };
}

exports.handler = async (event) => {
  const secrets = await getSecrets();
  const POSTMARK_KEY = secrets.POSTMARK_API_KEY;
  const CORS = corsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: { ...CORS, 'Access-Control-Allow-Methods': 'POST,OPTIONS' }, body: '' };
  }

  const callerId = event.requestContext?.authorizer?.userId;
  if (!callerId) return respond(401, { error: 'Unauthorized' }, CORS);

  // ── Parse body ──
  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return respond(400, { error: 'Invalid JSON' }, CORS); }

  const { nightId, action, email: inviteEmail } = body;
  if (!nightId) return respond(400, { error: 'nightId required' }, CORS);

  // ── Load game nights from S3 ──
  let nights;
  try {
    const obj  = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: 'gameNights.json' }));
    const text = await obj.Body.transformToString();
    nights = JSON.parse(text);
  } catch (e) {
    console.error('S3 load failed', e);
    return respond(500, { error: 'Could not load game nights' }, CORS);
  }

  const night = nights.find(n => n.id === nightId);
  if (!night) return respond(404, { error: 'Game night not found' }, CORS);

  // ── Verify caller is the host ──
  if (night.hostUserId !== callerId) return respond(403, { error: 'Only the host can do this' }, CORS);

  // ── Invite action: provision Cognito user + send invite email ─────────────
  if (action === 'invite') {
    if (!inviteEmail || !inviteEmail.includes('@')) {
      return respond(400, { error: 'Valid email required for invite' }, CORS);
    }
    const inviteEmailLc = inviteEmail.toLowerCase();

    // Get host display name
    let hostName = callerId;
    try {
      const u = await cognito.send(new AdminGetUserCommand({ UserPoolId: USER_POOL_ID, Username: callerId }));
      const attr = u.UserAttributes?.find(a => a.Name === 'name');
      if (attr?.Value) hostName = attr.Value;
    } catch { /* non-fatal */ }

    // Add email to night.invited[] so renderRSVP's gate
    // (`night.invited.includes(email)`) recognises the new user. Idempotent —
    // skipped if already present. The frontend host-controls flow already
    // updates invited[] client-side, but MCP's invite_to_event tool doesn't,
    // and /invite is the canonical "this person is invited" event regardless
    // of caller.
    let inviteListChanged = false;
    if (!night.invited?.some(e => typeof e === 'string' && e.toLowerCase() === inviteEmailLc)) {
      night.invited = Array.isArray(night.invited) ? night.invited : [];
      night.invited.push(inviteEmail);
      night.lastModified = Date.now();
      inviteListChanged = true;
      try {
        await s3.send(new PutObjectCommand({
          Bucket:      BUCKET,
          Key:         'gameNights.json',
          Body:        JSON.stringify(nights),
          ContentType: 'application/json',
        }));
      } catch (e) {
        console.error('Failed to persist invited[] update:', e.message);
        return respond(500, { error: 'Could not update invited list' }, CORS);
      }
    }

    // Provision Cognito account + group membership.
    // If the user already exists, AdminCreateUser is skipped — but we still
    // ensure they're in `game-night-users` so a meal-planner-only user can
    // RSVP to a game night they're invited to.
    let provisioned = 'existing';
    try {
      provisioned = await ensureGameNightUser(inviteEmail);
    } catch (e) {
      console.error(`Cognito provisioning failed for ${inviteEmail}:`, e.message);
      // Fall through — still send the Postmark invite. If provisioning failed
      // for a transient reason, the host can retry; if the email was malformed
      // for Cognito's standards, the friend will see a Sign-In page where they
      // can request access.
    }

    const dateStr = formatDate(night.date);
    const ctx = { hostName, dateStr, timeStr: night.time || '', location: night.location || '', description: night.description || '', isNewAccount: provisioned === 'created' };
    const name = inviteEmail.split('@')[0];

    try {
      await postmark(POSTMARK_KEY, {
        To:            inviteEmail,
        From:          FROM_EMAIL,
        Subject:       `You're invited to game night${dateStr ? ` on ${dateStr}` : ''}!`,
        TextBody:      buildInviteText({ ...ctx, name }),
        HtmlBody:      buildInviteHtml({ ...ctx, name }),
        MessageStream: 'outbound',
      });
      return respond(200, { sent: 1, provisioned, inviteListChanged }, CORS);
    } catch (e) {
      console.error(`Postmark invite failed for ${inviteEmail}:`, e.message);
      return respond(500, { error: `Failed to send invite: ${e.message}` }, CORS);
    }
  }

  // ── Compute non-responders ──
  const rsvpdIds   = new Set((night.rsvps    || []).map(r => r.userId));
  const declinedIds = new Set(night.declined || []);
  const nonResponders = (night.invited || []).filter(id => !rsvpdIds.has(id) && !declinedIds.has(id));

  if (nonResponders.length === 0) {
    return respond(200, { sent: 0, message: 'Everyone has already responded' }, CORS);
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
    return respond(200, { sent: 0, message: 'No email addresses could be resolved' }, CORS);
  }

  // ── Build email content ──
  const dateStr = formatDate(night.date);
  const ctx     = { hostName, dateStr, timeStr: night.time || '', location: night.location || '', description: night.description || '' };

  // ── Send via Postmark ──
  let sent = 0;
  const errors = [];
  for (const { email, name } of targets) {
    try {
      await postmark(POSTMARK_KEY, {
        To:            email,
        From:          FROM_EMAIL,
        Subject:       `Reminder: Game night${dateStr ? ` on ${dateStr}` : ''}`,
        TextBody:      buildText({ ...ctx, name }),
        HtmlBody:      buildHtml({ ...ctx, name }),
        MessageStream: 'outbound',
      });
      sent++;
    } catch (e) {
      console.error(`Postmark failed for ${email}:`, e.message);
      errors.push({ email, error: e.message });
    }
  }

  return respond(200, { sent, total: targets.length, errors }, CORS);
};

// ── Helpers ───────────────────────────────────────────────

/**
 * Find or create a Cognito user for `email` and ensure they're in the
 * `game-night-users` group.
 *   - existing user → returns 'existing'  (Cognito does NOT send a welcome
 *                                          email; user already has credentials)
 *   - new user      → returns 'created'   (Cognito's invite-message template
 *                                          fires, substituting {####} with the
 *                                          generated temporary password)
 *
 * Pool config requires AdminCreateUser to include an explicit
 * TemporaryPassword (the pool's choice-based auth flow does not auto-generate
 * one). Password meets the pool's policy: 8+ chars, upper+lower+digit+symbol.
 */
async function ensureGameNightUser(email) {
  const list = await cognito.send(new ListUsersCommand({
    UserPoolId: USER_POOL_ID,
    Filter:     `email = "${email}"`,
    Limit:      1,
  }));

  let username;
  let result = 'existing';

  if (list.Users && list.Users.length > 0) {
    username = list.Users[0].Username;
  } else {
    const created = await cognito.send(new AdminCreateUserCommand({
      UserPoolId:             USER_POOL_ID,
      Username:               crypto.randomUUID(),
      TemporaryPassword:      generateTempPassword(),
      UserAttributes: [
        { Name: 'email',          Value: email },
        { Name: 'email_verified', Value: 'true' },
      ],
      DesiredDeliveryMediums: ['EMAIL'],
    }));
    username = created.User.Username;
    result   = 'created';
  }

  await cognito.send(new AdminAddUserToGroupCommand({
    UserPoolId: USER_POOL_ID,
    Username:   username,
    GroupName:  REQUIRED_GROUP,
  }));

  return result;
}

/**
 * 18-character temp password meeting the pool's policy. The password is
 * delivered to the user via Cognito's invite-message template ({#### }
 * substitution); we never log it, never store it, and never return it.
 */
function generateTempPassword() {
  const upper  = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower  = 'abcdefghijkmnpqrstuvwxyz';
  const digit  = '23456789';
  const symbol = '!@#$%^&*';
  const all    = upper + lower + digit + symbol;
  const pick   = (chars) => chars[crypto.randomInt(0, chars.length)];

  // Force one of each class; fill remainder; shuffle deterministically-randomly
  const chars = [pick(upper), pick(lower), pick(digit), pick(symbol)];
  for (let i = chars.length; i < 18; i++) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function respond(status, body, headers) {
  return { statusCode: status, headers, body: JSON.stringify(body) };
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch { return dateStr; }
}

function buildInviteText({ name, hostName, dateStr, timeStr, location, description, isNewAccount }) {
  const lines = [
    `Hi${name ? ` ${name}` : ''}!`,
    '',
    `${hostName} has invited you to game night` +
      (dateStr  ? ` on ${dateStr}`  : '') +
      (timeStr  ? ` at ${timeStr}`  : '') +
      (location ? ` at ${location}` : '') + '.',
  ];
  if (description) lines.push('', description);
  lines.push('', `Let ${hostName} know if you can make it:`, APP_URL);
  if (isNewAccount) {
    lines.push(
      '',
      `First time? An email titled "You have been invited to jaetill.com" is on its way separately — it has your temporary password. Use it to sign in once, set your real password, and you'll come right back here to RSVP.`,
    );
  }
  lines.push('', `If you don't know what this is about, you can safely ignore this message.`);
  return lines.join('\n');
}

function buildInviteHtml({ name, hostName, dateStr, timeStr, location, description, isNewAccount }) {
  const when = [dateStr && `<strong>${dateStr}</strong>`, timeStr && `at <strong>${timeStr}</strong>`].filter(Boolean).join(' ');
  const firstTime = isNewAccount
    ? `<p style="font-size:13px;color:#64748b;">First time? Look for a separate email titled <em>"You have been invited to jaetill.com"</em> — it has your temporary password. Sign in once, set a real password, and you'll come right back here to RSVP.</p>`
    : '';
  return `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px 16px;color:#1e293b;">
  <h2 style="margin:0 0 16px;font-size:20px;">🎲 You're invited to game night!</h2>
  <p>Hi${name ? ` ${name}` : ''}!</p>
  <p><strong>${hostName}</strong> has invited you to game night${when ? ` ${when}` : ''}${location ? ` at <strong>${location}</strong>` : ''}.</p>
  ${description ? `<p style="color:#64748b;font-style:italic;">${description}</p>` : ''}
  <p>Let ${hostName} know if you can make it:</p>
  <p>
    <a href="${APP_URL}"
       style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600;">
      View invitation →
    </a>
  </p>
  ${firstTime}
  <p style="margin-top:28px;font-size:12px;color:#94a3b8;">
    If you don't know what this is about, you can safely ignore this message.
  </p>
</body>
</html>`;
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

function postmark(apiKey, msg) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(msg);
    const req  = https.request({
      hostname: 'api.postmarkapp.com',
      path:     '/email',
      method:   'POST',
      headers:  {
        'Accept':                    'application/json',
        'Content-Type':              'application/json',
        'X-Postmark-Server-Token':   apiKey,
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
