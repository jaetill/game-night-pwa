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

const { Sentry } = require('./lib/sentry');
const logger = require('./lib/logger');
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

exports.handler = Sentry.wrapHandler(async (event, context) => {
  logger.info('handler.invoked', {
    request_id: context?.awsRequestId,
    method: event.httpMethod,
    resource: event.resource,
  });

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
    logger.error('s3.load_failed', { request_id: context?.awsRequestId, key: 'gameNights.json', error: e.message });
    Sentry.captureException(e);
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
        logger.error('s3.put_failed', { request_id: context?.awsRequestId, key: 'gameNights.json', error: e.message });
        Sentry.captureException(e);
        return respond(500, { error: 'Could not update invited list' }, CORS);
      }
    }

    // Provision Cognito account + group membership.
    // If the user already exists, AdminCreateUser is skipped — but we still
    // ensure they're in `game-night-users` so a meal-planner-only user can
    // RSVP to a game night they're invited to.
    let provisioned = { result: 'existing', tempPassword: null };
    try {
      provisioned = await ensureGameNightUser(inviteEmail);
    } catch (e) {
      logger.error('cognito.provisioning_failed', { request_id: context?.awsRequestId, error: e.message });
      Sentry.captureException(e);
      // Fall through — still send the Postmark invite. If provisioning failed
      // for a transient reason, the host can retry; if the email was malformed
      // for Cognito's standards, the friend will see a Sign-In page where they
      // can request access.
    }

    const dateStr = formatDate(night.date);
    const ctx = {
      hostName, dateStr,
      timeStr:      night.time     || '',
      location:     night.location || '',
      description:  night.description || '',
      isNewAccount: provisioned.result === 'created',
      signInEmail:  inviteEmail.toLowerCase(),
      tempPassword: provisioned.tempPassword,
    };
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
      logger.info('invite.sent', { request_id: context?.awsRequestId, provisioned: provisioned.result });
      return respond(200, { sent: 1, provisioned: provisioned.result, inviteListChanged }, CORS);
    } catch (e) {
      logger.error('postmark.invite_failed', { request_id: context?.awsRequestId, error: e.message });
      Sentry.captureException(e);
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
      logger.error('postmark.nudge_failed', { request_id: context?.awsRequestId, error: e.message });
      Sentry.captureException(e);
      errors.push({ email, error: e.message });
    }
  }

  logger.info('nudge.complete', { request_id: context?.awsRequestId, sent, total: targets.length, errors: errors.length });
  return respond(200, { sent, total: targets.length, errors }, CORS);
});

// ── Helpers ───────────────────────────────────────────────

/**
 * Find or create a Cognito user for `email` and ensure they're in the
 * `game-night-users` group.
 *
 * Returns:
 *   { result: 'existing', tempPassword: null }  — caller already has creds
 *   { result: 'created',  tempPassword: '...' } — caller must email it
 *
 * The Username field is a UUID. (The pool's AliasAttributes=['email'] config
 * forbids email-format Usernames — Cognito rejects with "Username cannot be
 * of email format, since user pool is configured for email alias." So even
 * though the Hosted UI shows a non-customizable "Username" label, we can't
 * make Username=email; instead we make sure the credentials block in our
 * Postmark email shows the user the literal email + temp password to type.)
 *
 * Cognito's default welcome email (sender: no-reply@verificationemail.com) is
 * suppressed via MessageAction:'SUPPRESS'. The caller is expected to deliver
 * the returned tempPassword via Postmark, which is from jason@jaetill.com and
 * passes DKIM/SPF/DMARC — better deliverability than Cognito's default and
 * means the invitee gets one email instead of two.
 *
 * Pool config requires AdminCreateUser to include an explicit
 * TemporaryPassword (the pool's choice-based auth flow does not auto-generate
 * one). The generated password meets the pool's policy: 8+ chars,
 * upper+lower+digit+symbol.
 */
async function ensureGameNightUser(email) {
  const emailLc = email.toLowerCase();
  const list = await cognito.send(new ListUsersCommand({
    UserPoolId: USER_POOL_ID,
    Filter:     `email = "${emailLc}"`,
    Limit:      1,
  }));

  if (list.Users && list.Users.length > 0) {
    await cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: USER_POOL_ID,
      Username:   list.Users[0].Username,
      GroupName:  REQUIRED_GROUP,
    }));
    return { result: 'existing', tempPassword: null };
  }

  const username     = crypto.randomUUID();
  const tempPassword = generateTempPassword();
  await cognito.send(new AdminCreateUserCommand({
    UserPoolId:        USER_POOL_ID,
    Username:          username,
    TemporaryPassword: tempPassword,
    UserAttributes: [
      { Name: 'email',          Value: emailLc },
      { Name: 'email_verified', Value: 'true' },
    ],
    MessageAction:     'SUPPRESS',
  }));
  await cognito.send(new AdminAddUserToGroupCommand({
    UserPoolId: USER_POOL_ID,
    Username:   username,
    GroupName:  REQUIRED_GROUP,
  }));

  return { result: 'created', tempPassword };
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

function buildInviteText({ name, hostName, dateStr, timeStr, location, description, isNewAccount, signInEmail, tempPassword }) {
  const lines = [
    `Hi${name ? ` ${name}` : ''}!`,
    '',
    `${hostName} has invited you to game night` +
      (dateStr  ? ` on ${dateStr}`  : '') +
      (timeStr  ? ` at ${timeStr}`  : '') +
      (location ? ` at ${location}` : '') + '.',
  ];
  if (description) lines.push('', description);
  lines.push('', `RSVP at: ${APP_URL}`);
  if (isNewAccount && tempPassword) {
    lines.push(
      '',
      `--- First-time sign-in ---`,
      `When you click the link, you'll be prompted to sign in. Use:`,
      `  Username: ${signInEmail}`,
      `  Temporary password: ${tempPassword}`,
      ``,
      `You'll set your own password on first sign-in. The temporary password expires in 7 days.`,
    );
  }
  lines.push('', `If you don't know what this is about, you can safely ignore this message.`);
  return lines.join('\n');
}

function buildInviteHtml({ name, hostName, dateStr, timeStr, location, description, isNewAccount, signInEmail, tempPassword }) {
  const when = [dateStr && `<strong>${dateStr}</strong>`, timeStr && `at <strong>${timeStr}</strong>`].filter(Boolean).join(' ');
  const credentialBlock = (isNewAccount && tempPassword) ? `
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-top:20px;">
    <p style="margin:0 0 10px;font-size:14px;font-weight:600;color:#1e293b;">First time signing in? Use these credentials:</p>
    <table style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;border-collapse:collapse;">
      <tr><td style="padding:2px 12px 2px 0;color:#64748b;">Username</td><td style="padding:2px 0;color:#1e293b;"><strong>${escapeHtml(signInEmail)}</strong></td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#64748b;">Temp password</td><td style="padding:2px 0;color:#1e293b;"><strong>${escapeHtml(tempPassword)}</strong></td></tr>
    </table>
    <p style="margin:10px 0 0;font-size:12px;color:#64748b;">You'll set your own password on first sign-in. The temporary password expires in 7 days.</p>
  </div>` : '';
  return `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px 16px;color:#1e293b;">
  <h2 style="margin:0 0 16px;font-size:20px;">🎲 You're invited to game night!</h2>
  <p>Hi${name ? ` ${name}` : ''}!</p>
  <p><strong>${escapeHtml(hostName)}</strong> has invited you to game night${when ? ` ${when}` : ''}${location ? ` at <strong>${escapeHtml(location)}</strong>` : ''}.</p>
  ${description ? `<p style="color:#64748b;font-style:italic;">${escapeHtml(description)}</p>` : ''}
  <p>Let ${escapeHtml(hostName)} know if you can make it:</p>
  <p>
    <a href="${APP_URL}"
       style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600;">
      View invitation →
    </a>
  </p>
  ${credentialBlock}
  <p style="margin-top:28px;font-size:12px;color:#94a3b8;">
    If you don't know what this is about, you can safely ignore this message.
  </p>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g, '&#39;');
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
  const when = [dateStr && `<strong>${escapeHtml(dateStr)}</strong>`, timeStr && `at <strong>${escapeHtml(timeStr)}</strong>`].filter(Boolean).join(' ');
  return `<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px 16px;color:#1e293b;">
  <h2 style="margin:0 0 16px;font-size:20px;">🎲 Game night reminder</h2>
  <p>Hi${name ? ` ${escapeHtml(name)}` : ''}!</p>
  <p><strong>${escapeHtml(hostName)}</strong> wanted to remind you about game night${when ? ` ${when}` : ''}${location ? ` at <strong>${escapeHtml(location)}</strong>` : ''}.</p>
  ${description ? `<p style="color:#64748b;font-style:italic;">${escapeHtml(description)}</p>` : ''}
  <p>Haven't replied yet? Let ${escapeHtml(hostName)} know if you can make it:</p>
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

// Test seam — not part of the public API.
exports._buildHtml = buildHtml;
exports._escapeHtml = escapeHtml;
