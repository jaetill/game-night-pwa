// Lambda: GET /rsvp?token=...&choice=... — one-click RSVP + no-login game
// picker from email links.
//
// PUBLIC route (no authorizer): authentication is the HMAC-signed token
// minted by nudge.js when the invite/nudge email went out. The token pins
// {nightId, invitee, exp} — a recipient can only act as themselves, only on
// the night they were invited to, and only until the token expires
// (verifyRsvpToken in lib/rsvpToken.js, constant-time HMAC check).
//
// choice ∈
//   playing | if_needed | declined      — RSVP (original one-click buttons)
//   games                                — view the picker page, no write
//   join | leave | interested | uninterested  (+ &game=<gameId>)
//   side | unside                        (+ &desc=<text> for side)
//
// Every choice except `games` and `declined` lands on the picker page: the
// night's games with Join / Leave / Interested buttons, the food plan, and
// (when the host allows it) a "bringing a side" form. `declined` and invalid
// tokens get a small static page. The picker reads the LIVE gameNights.json
// on every request, so games the host adds after the email went out still
// show up.
//
// Join semantics match the app: joining a game requires a 'playing' RSVP, so
// `join` upgrades an if_needed/any_game/spectating RSVP to playing (and
// creates one if the recipient never RSVP'd). Capacity is enforced against
// maxPlayers. Interest is allowed with any RSVP. Everything is idempotent.
//
// The write path mirrors GeneratePresignedPost: read gameNights.json with
// ETag, mutate, conditional PutObject (If-Match), one retry on a lost race.
//
// After a successful RSVP save the host gets a Web Push notification
// (lib/push, best-effort). Responses are HTML pages, not JSON — the
// recipient lands here from their mail app in a full browser tab.
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

const MAX_SIDE_DESC = 120;

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

// RSVP choices — the three one-click buttons in the email.
const RSVP_CHOICES = {
  playing:   { verb: 'is in',               emoji: '🎉', headline: "You're in!",                          detail: 'A seat is reserved for you. Pick a game below if you like.' },
  if_needed: { verb: 'will play if needed', emoji: '👍', headline: "Got it — you're on the maybe list.", detail: "The host knows you'll play if a game needs one more. You can still flag games you're interested in." },
  declined:  { verb: "can't make it",       emoji: '😢', headline: "Sorry you can't make it.",           detail: 'The host has been let know. Maybe next time!' },
};

// Picker-page choices (view + per-game + side-dish actions).
const GAME_CHOICES = new Set(['games', 'join', 'leave', 'interested', 'uninterested', 'side', 'unside']);

function isValidChoice(choice) {
  return Object.prototype.hasOwnProperty.call(RSVP_CHOICES, choice) || GAME_CHOICES.has(choice);
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Static pages ──────────────────────────────────────────────────────────

const PAGE_STYLE = 'font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 20px;color:#1e293b;';
const BTN        = 'display:inline-block;padding:8px 14px;border-radius:6px;text-decoration:none;font-weight:600;font-size:13px;';

function htmlResponse(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    body,
  };
}

function htmlPage(status, { emoji, headline, detail }) {
  const body = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Game Night RSVP</title>
</head>
<body style="${PAGE_STYLE}text-align:center;padding-top:48px;">
  <div style="font-size:56px;margin-bottom:12px;">${emoji}</div>
  <h1 style="font-size:22px;margin:0 0 10px;">${headline}</h1>
  <p style="color:#64748b;margin:0 0 28px;">${detail}</p>
  <a href="${APP_URL}"
     style="${BTN}background:#d97706;color:#fff;padding:12px 26px;">
    Open Game Night →
  </a>
</body>
</html>`;
  return htmlResponse(status, body);
}

const INVALID_PAGE = {
  emoji: '⏳',
  headline: 'This link has expired',
  detail: 'No worries — you can still RSVP in the app.',
};

const ERROR_PAGE = { emoji: '😵', headline: 'Something went wrong', detail: 'Please RSVP in the app instead.' };

// ── Picker page ───────────────────────────────────────────────────────────

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
  } catch { return dateStr; }
}

/**
 * Render the picker page for `night` as seen by `who`. `token` is echoed
 * into every action link. `banner` is an optional {tone, text} flash line.
 * Exported for unit tests (pure — no I/O).
 */
function renderPickerPage(night, who, token, banner) {
  const t   = encodeURIComponent(token);
  const url = (choice, extra = '') => `?token=${t}&choice=${choice}${extra}`;

  const myRsvp = (night.rsvps || []).find(r => r.userId === who.userId);
  const rsvpLabel = {
    playing:    "You're in",
    any_game:   "You're in (put me in a game)",
    if_needed:  "You'll play if needed",
    spectating: "You're hanging out",
  }[myRsvp?.type ?? 'playing'];
  const declined = (night.declined || []).includes(who.userId);

  const when = [formatDate(night.date), night.time].filter(Boolean).join(' · ');

  const bannerHtml = banner ? `
  <div style="border-radius:8px;padding:10px 14px;margin:0 0 18px;font-size:14px;${
    banner.tone === 'warn'
      ? 'background:#fef3c7;color:#92400e;border:1px solid #fcd34d;'
      : 'background:#dcfce7;color:#166534;border:1px solid #86efac;'
  }">${escapeHtml(banner.text)}</div>` : '';

  const statusHtml = declined
    ? `<p style="color:#64748b;font-size:14px;margin:0 0 18px;">You said you can't make it.
       <a href="${url('playing')}" style="color:#d97706;font-weight:600;">Changed your mind?</a></p>`
    : myRsvp
      ? `<p style="color:#64748b;font-size:14px;margin:0 0 18px;">${escapeHtml(rsvpLabel)}.
         <a href="${url('declined')}" style="color:#94a3b8;">Can't make it after all?</a></p>`
      : `<p style="font-size:14px;margin:0 0 18px;">
           <a href="${url('playing')}" style="${BTN}background:#16a34a;color:#fff;margin-right:6px;">I'm in 🎲</a>
           <a href="${url('if_needed')}" style="${BTN}background:#d97706;color:#fff;margin-right:6px;">If needed</a>
           <a href="${url('declined')}" style="${BTN}background:#64748b;color:#fff;">Can't make it</a>
         </p>`;

  // Games ────────────────────────────────────────────────────────────────
  const games = Object.entries(night.selectedGames || {}).filter(([, g]) => g && g.title);
  let gamesHtml;
  if (games.length === 0) {
    gamesHtml = `<p style="color:#94a3b8;font-size:14px;font-style:italic;">No games on the table yet — check back closer to the night.</p>`;
  } else {
    gamesHtml = games.map(([gameId, g]) => {
      const signedUp   = Array.isArray(g.signedUpPlayers)   ? g.signedUpPlayers   : [];
      const interested = Array.isArray(g.interestedPlayers) ? g.interestedPlayers : [];
      const max        = Number(g.maxPlayers) || 4;
      const full       = signedUp.length >= max;
      const inGame     = signedUp.some(p => p.userId === who.userId);
      const isInt      = interested.some(p => p.userId === who.userId);
      const gid        = encodeURIComponent(gameId);

      const names = signedUp.map(p => escapeHtml(p.name || p.userId)).join(', ');
      const intNames = interested.map(p => escapeHtml(p.name || p.userId)).join(', ');

      let actions = '';
      if (declined) {
        actions = '';
      } else if (inGame) {
        actions = `<a href="${url('leave', `&game=${gid}`)}" style="${BTN}background:#f1f5f9;color:#475569;">Leave</a>`;
      } else {
        actions = full
          ? `<span style="${BTN}background:#f1f5f9;color:#94a3b8;">Full</span>`
          : `<a href="${url('join', `&game=${gid}`)}" style="${BTN}background:#4f46e5;color:#fff;">Join</a>`;
        actions += isInt
          ? ` <a href="${url('uninterested', `&game=${gid}`)}" style="${BTN}background:#fff;color:#d97706;border:1px solid #d97706;">★ Interested</a>`
          : ` <a href="${url('interested', `&game=${gid}`)}" style="${BTN}background:#fff;color:#64748b;border:1px solid #cbd5e1;">☆ Interested</a>`;
      }

      const thumb = g.thumbnail
        ? `<img src="${escapeHtml(g.thumbnail)}" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:8px;flex-shrink:0;">`
        : '';

      return `
  <div style="display:flex;gap:12px;padding:12px;background:#f8fafc;border-radius:12px;margin-bottom:10px;">
    ${thumb}
    <div style="flex:1;min-width:0;">
      <div style="font-weight:600;font-size:15px;">${escapeHtml(g.title)}${inGame ? ' <span style="color:#16a34a;font-size:12px;">✓ you\'re in</span>' : ''}</div>
      <div style="font-size:12px;color:${full ? '#dc2626' : '#64748b'};margin:2px 0 4px;">${signedUp.length}/${max} players${interested.length ? ` · ${interested.length} interested` : ''}</div>
      ${names ? `<div style="font-size:12px;color:#475569;">Playing: ${names}</div>` : ''}
      ${intNames ? `<div style="font-size:12px;color:#94a3b8;font-style:italic;">Interested: ${intNames}</div>` : ''}
      ${actions ? `<div style="margin-top:8px;">${actions}</div>` : ''}
    </div>
  </div>`;
    }).join('');
  }

  // Food ─────────────────────────────────────────────────────────────────
  let foodHtml = '';
  if (night.food) {
    const sides  = Array.isArray(night.sides) ? night.sides : [];
    const mySide = sides.find(s => s.userId === who.userId);
    const sideList = sides.length
      ? `<ul style="margin:8px 0 0;padding-left:18px;font-size:13px;color:#475569;">${
          sides.map(s => `<li>${escapeHtml(s.name || s.userId)}: ${escapeHtml(s.description)}</li>`).join('')
        }</ul>`
      : '';
    let sideForm = '';
    if (night.allowSides && !declined) {
      sideForm = mySide
        ? `<p style="font-size:13px;margin:10px 0 0;">You're bringing <strong>${escapeHtml(mySide.description)}</strong>.
             <a href="${url('unside')}" style="color:#94a3b8;">Remove</a></p>`
        : `<form method="get" action="" style="margin-top:10px;display:flex;gap:6px;">
             <input type="hidden" name="token" value="${escapeHtml(token)}">
             <input type="hidden" name="choice" value="side">
             <input type="text" name="desc" maxlength="${MAX_SIDE_DESC}" placeholder="Bringing a side? e.g. cornbread" required
                    style="flex:1;padding:8px 10px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;">
             <button type="submit" style="${BTN}background:#d97706;color:#fff;border:0;cursor:pointer;">Add</button>
           </form>`;
    }
    foodHtml = `
  <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin:28px 0 8px;">Food</h2>
  <div style="padding:12px;background:#fffbeb;border-radius:12px;">
    <div style="font-size:14px;">${escapeHtml(night.food)}</div>
    <div style="font-size:12px;color:#94a3b8;margin-top:4px;">Feel free to bring your own meal if you prefer — no obligation to eat with the group.</div>
    ${sideList}
    ${sideForm}
  </div>`;
  }

  const body = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Game Night — ${escapeHtml(when || 'Pick your games')}</title>
</head>
<body style="${PAGE_STYLE}">
  <h1 style="font-size:22px;margin:0 0 4px;">🎲 Game night${when ? ` · ${escapeHtml(when)}` : ''}</h1>
  ${night.location ? `<p style="color:#64748b;font-size:14px;margin:0 0 14px;">${escapeHtml(night.location)}</p>` : '<div style="height:10px;"></div>'}
  ${bannerHtml}
  <p style="font-size:14px;margin:0 0 4px;">Hi ${escapeHtml(who.name)}!</p>
  ${statusHtml}
  ${night.description ? `<p style="color:#64748b;font-style:italic;font-size:14px;margin:0 0 18px;">${escapeHtml(night.description)}</p>` : ''}
  <h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin:0 0 8px;">Games</h2>
  ${gamesHtml}
  ${foodHtml}
  <p style="margin-top:28px;font-size:12px;color:#94a3b8;">
    Changes save instantly — no sign-in needed. Want the full app?
    <a href="${APP_URL}" style="color:#d97706;">Open Game Night →</a>
  </p>
</body>
</html>`;
  return body;
}

// ── Data access ───────────────────────────────────────────────────────────

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

// ── Mutations (pure, exported for unit tests) ─────────────────────────────

/**
 * Apply a one-click RSVP choice to a night in place. Idempotent: strips any
 * prior RSVP/decline by this user first. Declining also withdraws the user
 * from every game and their side (same as the app's cancel path).
 */
function applyChoice(night, { userId, name, email, invitee }, choice) {
  night.rsvps    = (Array.isArray(night.rsvps) ? night.rsvps : []).filter(r => r.userId !== userId);
  night.declined = (Array.isArray(night.declined) ? night.declined : []).filter(id => id !== userId);

  // Same behavior as the in-app RSVP: responding removes you from invited[].
  const dropKeys = new Set([userId, invitee, invitee?.toLowerCase(), email, email?.toLowerCase()].filter(Boolean));
  night.invited = (night.invited || []).filter(k => !dropKeys.has(k));

  if (choice === 'declined') {
    night.declined.push(userId);
    withdrawFromAllGames(night, userId);
    night.sides = (Array.isArray(night.sides) ? night.sides : []).filter(s => s.userId !== userId);
  } else {
    night.rsvps.push({ userId, name, type: choice });
  }

  night.lastModified = Date.now();
}

function withdrawFromAllGames(night, userId) {
  for (const g of Object.values(night.selectedGames || {})) {
    if (!g) continue;
    g.signedUpPlayers   = (Array.isArray(g.signedUpPlayers)   ? g.signedUpPlayers   : []).filter(p => p.userId !== userId);
    g.interestedPlayers = (Array.isArray(g.interestedPlayers) ? g.interestedPlayers : []).filter(p => p.userId !== userId);
  }
}

/**
 * Apply a picker-page action. Returns { ok, changed, banner }. Never throws
 * on bad input — a stale link (game removed, seat filled) just yields a
 * warn banner and no write.
 */
function applyGameAction(night, who, choice, { gameId, desc } = {}) {
  const { userId, name } = who;
  const declined = (night.declined || []).includes(userId);
  const note = (tone, text) => ({ ok: true, changed: false, banner: { tone, text } });

  if (choice === 'games') return { ok: true, changed: false, banner: null };

  if (declined) return note('warn', "You've said you can't make it — tap \"Changed your mind?\" first.");

  if (choice === 'side' || choice === 'unside') {
    if (!night.food || !night.allowSides) return note('warn', "The host isn't taking sides for this night.");
    const hadSide = Array.isArray(night.sides) && night.sides.some(s => s.userId === userId);
    night.sides = (Array.isArray(night.sides) ? night.sides : []).filter(s => s.userId !== userId);
    if (choice === 'side') {
      const clean = String(desc ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_SIDE_DESC);
      if (!clean) return note('warn', 'Tell us what you\'re bringing.');
      night.sides.push({ userId, name, description: clean });
      night.lastModified = Date.now();
      return { ok: true, changed: true, banner: { tone: 'ok', text: `Thanks — you're bringing ${clean}.` } };
    }
    if (!hadSide) return note('ok', "You weren't signed up for a side.");
    night.lastModified = Date.now();
    return { ok: true, changed: true, banner: { tone: 'ok', text: 'Side removed.' } };
  }

  const game = gameId && night.selectedGames && Object.prototype.hasOwnProperty.call(night.selectedGames, gameId)
    ? night.selectedGames[gameId] : null;
  if (!game) return note('warn', "That game isn't on the list any more.");
  const title = game.title || 'that game';
  game.signedUpPlayers   = Array.isArray(game.signedUpPlayers)   ? game.signedUpPlayers   : [];
  game.interestedPlayers = Array.isArray(game.interestedPlayers) ? game.interestedPlayers : [];
  const max = Number(game.maxPlayers) || 4;

  switch (choice) {
    case 'join': {
      if (game.signedUpPlayers.some(p => p.userId === userId)) return note('ok', `You're already in ${title}.`);
      if (game.signedUpPlayers.length >= max) return note('warn', `${title} is full — you can mark yourself interested in case a seat opens.`);
      // Joining requires a 'playing' RSVP (app rule). Upgrade or create.
      night.rsvps = Array.isArray(night.rsvps) ? night.rsvps : [];
      const mine = night.rsvps.find(r => r.userId === userId);
      if (mine) mine.type = 'playing';
      else night.rsvps.push({ userId, name, type: 'playing' });
      game.signedUpPlayers.push({ userId, name });
      game.interestedPlayers = game.interestedPlayers.filter(p => p.userId !== userId);
      night.lastModified = Date.now();
      return { ok: true, changed: true, banner: { tone: 'ok', text: `You're in ${title}!` } };
    }
    case 'leave': {
      if (!game.signedUpPlayers.some(p => p.userId === userId)) return note('ok', `You weren't in ${title}.`);
      game.signedUpPlayers = game.signedUpPlayers.filter(p => p.userId !== userId);
      night.lastModified = Date.now();
      return { ok: true, changed: true, banner: { tone: 'ok', text: `Left ${title}.` } };
    }
    case 'interested': {
      if (game.signedUpPlayers.some(p => p.userId === userId)) return note('ok', `You're already playing ${title}.`);
      if (game.interestedPlayers.some(p => p.userId === userId)) return note('ok', `Already marked interested in ${title}.`);
      game.interestedPlayers.push({ userId, name });
      night.lastModified = Date.now();
      return { ok: true, changed: true, banner: { tone: 'ok', text: `Marked interested in ${title}.` } };
    }
    case 'uninterested': {
      if (!game.interestedPlayers.some(p => p.userId === userId)) return note('ok', `You weren't marked interested in ${title}.`);
      game.interestedPlayers = game.interestedPlayers.filter(p => p.userId !== userId);
      night.lastModified = Date.now();
      return { ok: true, changed: true, banner: { tone: 'ok', text: `No longer interested in ${title}.` } };
    }
    default:
      return note('warn', 'Unknown action.');
  }
}

exports._applyChoice     = applyChoice;
exports._applyGameAction = applyGameAction;
exports._renderPickerPage = renderPickerPage;

// ── Handler ───────────────────────────────────────────────────────────────

exports.handler = Sentry.wrapHandler(async (event, context) => {
  logger.info('handler.invoked', {
    request_id: context?.awsRequestId,
    method: event.httpMethod,
    resource: event.resource,
  });

  const qs     = event.queryStringParameters || {};
  const token  = qs.token;
  const choice = qs.choice;
  if (!token || !isValidChoice(choice)) return htmlPage(400, INVALID_PAGE);

  let secret;
  try { secret = await getLinkSecret(); }
  catch (err) {
    logger.error('secrets.load_failed', { request_id: context?.awsRequestId, error: err.message });
    Sentry.captureException(err);
    return htmlPage(500, ERROR_PAGE);
  }

  const payload = verifyRsvpToken(token, secret);
  if (!payload || !payload.nightId || typeof payload.invitee !== 'string') {
    logger.warn('rsvp_link.invalid_token', { request_id: context?.awsRequestId });
    return htmlPage(400, INVALID_PAGE);
  }

  const who = await resolveInvitee(payload.invitee);
  const isRsvp = Object.prototype.hasOwnProperty.call(RSVP_CHOICES, choice);

  // Logged BEFORE the write. A click that fails partway (S3 down, night
  // deleted, lost race) still leaves a record that this person tried — which
  // is exactly the case where someone says "I RSVP'd" and the data disagrees.
  const whoFields = identityFields(who);
  logger.info('rsvp_link.attempt', {
    request_id: context?.awsRequestId,
    night_id:   payload.nightId,
    choice,
    game_id:    qs.game,
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
      return htmlPage(500, ERROR_PAGE);
    }

    const night = nights.find(n => String(n.id) === String(payload.nightId));
    if (!night || night.deleted === true) {
      return htmlPage(404, { emoji: '🗓️', headline: 'This game night is no longer on', detail: 'It may have been cancelled. Check the app for upcoming nights.' });
    }

    let banner  = null;
    let changed = false;
    if (isRsvp) {
      applyChoice(night, { ...who, invitee: payload.invitee }, choice);
      changed = true;
      banner  = { tone: 'ok', text: RSVP_CHOICES[choice].headline + ' ' + RSVP_CHOICES[choice].detail };
    } else {
      const result = applyGameAction(night, who, choice, { gameId: qs.game, desc: qs.desc });
      changed = result.changed;
      banner  = result.banner;
    }

    if (changed) {
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
        return htmlPage(500, ERROR_PAGE);
      }
      logger.info('rsvp_link.saved', {
        request_id: context?.awsRequestId,
        night_id:   night.id,
        choice,
        game_id:    qs.game,
        attempt,
        ...whoFields,
      });
    } else {
      logger.info('rsvp_link.noop', {
        request_id: context?.awsRequestId,
        night_id:   night.id,
        choice,
        game_id:    qs.game,
        ...whoFields,
      });
    }

    // Best-effort host notification on RSVP changes and game joins — never
    // blocks the response.
    if (changed && night.hostUserId && night.hostUserId !== who.userId) {
      const bodyText = isRsvp
        ? `${who.name} ${RSVP_CHOICES[choice].verb}${night.date ? ` (${night.date})` : ''}`
        : `${who.name}: ${banner?.text ?? choice}`;
      try {
        await push.notifyUser(s3, night.hostUserId, {
          title: '🎲 Game Night RSVP',
          body:  bodyText,
          url:   APP_URL,
          tag:   `rsvp-${night.id}`,
        });
      } catch (e) {
        logger.warn('push.notify_failed', { request_id: context?.awsRequestId, error: e.message });
      }
    }

    if (choice === 'declined') {
      const page = RSVP_CHOICES.declined;
      return htmlPage(200, { emoji: page.emoji, headline: escapeHtml(page.headline), detail: escapeHtml(page.detail) });
    }
    return htmlResponse(200, renderPickerPage(night, who, token, banner));
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
