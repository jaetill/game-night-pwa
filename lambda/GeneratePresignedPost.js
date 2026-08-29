// Lambda: POST /upload-token — replace gameNights.json with the caller's
// validated array of events. Despite the historical name, this Lambda does
// NOT issue a presigned POST URL — it accepts the JSON body, validates the
// changes against the existing data, and writes via the Lambda's S3 role.
//
// Auth: dual-mode (apiKeyAuthorizer). Caller's userId is in
//       event.requestContext.authorizer.userId.
//
// Validation (validateChanges) — returns { error } or { accepted }:
//   - new event must set hostUserId === caller; unknown events with a
//     DIFFERENT host are silently dropped (they are resurrection attempts
//     from clients whose localStorage predates a deletion)
//   - hostUserId on existing events is immutable
//   - HOST_ONLY fields can only be changed by the event's host
//   - selectedGames keys can only be added/removed by the host
//   - deleting = writing a tombstone { id, hostUserId, deleted: true,
//     lastModified }. Only the host can flip deleted on or off. Tombstones
//     omitted by a client are carried forward server-side so deletions
//     keep propagating to every client's merge.
//   - omission of a live event by its host is converted into a tombstone
//     (legacy-client deletion path); omission by anyone else is rejected
//
// Concurrency: read-modify-write is guarded with S3 conditional writes
// (ETag If-Match). On a lost race (412) the Lambda reloads, revalidates and
// retries once before giving up.
//
// IAM:
//   s3:GetObject + s3:PutObject on jaetill-game-nights/gameNights.json
//
// Environment variables:
//   S3_BUCKET — jaetill-game-nights (default)
//
// NOTE: invite-email-on-add was removed from this Lambda. The frontend
// canonically sends invites via POST /invite (nudgeNonResponders Lambda)
// when the host clicks the Invite button.

'use strict';

const { Sentry } = require('./lib/sentry');
const logger = require('./lib/logger');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { identityFields } = require('./lib/identity');
const push = require('./lib/push');

const BUCKET = process.env.S3_BUCKET || 'jaetill-game-nights';
const KEY    = 'gameNights.json';
const REGION = process.env.AWS_REGION || 'us-east-2';
let s3       = new S3Client({ region: REGION });

const ALLOWED_ORIGINS = new Set([
  'https://gamenights.jaetill.com',
  'https://jaetill.github.io',
]);

// Note: `invited` is NOT host-only. Non-hosts need to remove their own email
// from `invited` when they RSVP/decline — without this, the upload was rejected
// 403 and the entire save silently failed (storage.js used to swallow the error).
const HOST_ONLY = ['date', 'time', 'location', 'description', 'snacks'];

// ── Helpers ────────────────────────────────────────────────────────────────

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

function makeTombstone(night) {
  return {
    id:           night.id,
    hostUserId:   night.hostUserId,
    deleted:      true,
    lastModified: Date.now(),
  };
}

/**
 * Validate the incoming array against current data.
 * Returns { error: string } on a rule violation, or { accepted: night[] }
 * with the array that should actually be written (resurrection attempts
 * dropped, missing tombstones carried forward, host omissions tombstoned).
 * Exported for unit tests.
 */
function validateChanges(current, incoming, userId) {
  const currentById = new Map(current.map(n => [String(n.id), n]));
  const accepted = [];

  for (const night of incoming) {
    const existing = currentById.get(String(night.id));

    if (!existing) {
      if (night.hostUserId !== userId) {
        // Not an attack per se: clients whose localStorage predates a
        // (pre-tombstone) deletion re-upload the deleted night forever.
        // Dropping it silently self-heals those clients.
        continue;
      }
      accepted.push(night);
      continue;
    }

    if (night.hostUserId !== existing.hostUserId) {
      return { error: `Cannot change hostUserId on night ${night.id}` };
    }

    const isHost     = existing.hostUserId === userId;
    const wasDeleted = existing.deleted === true;
    const isDeleted  = night.deleted === true;

    if (wasDeleted !== isDeleted && !isHost) {
      return { error: `Only the host can ${isDeleted ? 'delete' : 'restore'} night ${night.id}` };
    }

    if (isDeleted) {
      // Tombstones carry no other state worth validating.
      accepted.push(night);
      continue;
    }

    for (const field of HOST_ONLY) {
      if (JSON.stringify(night[field]) !== JSON.stringify(existing[field]) && !isHost) {
        return { error: `Only the host can change "${field}" on night ${night.id}` };
      }
    }

    const existingKeys = Object.keys(existing.selectedGames || {}).sort().join(',');
    const newKeys      = Object.keys(night.selectedGames   || {}).sort().join(',');
    if (existingKeys !== newKeys && !isHost) {
      return { error: `Only the host can add or remove games on night ${night.id}` };
    }

    accepted.push(night);
  }

  const incomingIds = new Set(incoming.map(n => String(n.id)));
  for (const night of current) {
    if (incomingIds.has(String(night.id))) continue;

    if (night.deleted === true) {
      // A client (e.g. an older bundle) dropped the tombstone — carry it
      // forward so the deletion keeps propagating.
      accepted.push(night);
    } else if (night.hostUserId === userId) {
      // Legacy deletion path: old clients delete by omission. Convert to a
      // tombstone so other clients learn about it instead of resurrecting.
      accepted.push(makeTombstone(night));
    } else {
      return { error: `Only the host can delete night ${night.id}` };
    }
  }

  return { accepted };
}
exports._validateChanges = validateChanges;

const RSVP_TYPE_LABEL = {
  playing:    'is in',
  any_game:   'wants to be put in a game',
  if_needed:  'will play if needed',
  spectating: 'is coming to hang out',
};

/**
 * Diff the actor's RSVP changes between the previously-stored nights and the
 * accepted upload, and describe them as host-notification events.
 * Only the ACTOR's own additions/removals are reported (non-hosts can't
 * legally change anyone else's RSVP — validateChanges enforces that), and
 * the host is never notified about their own edits.
 * Exported for unit tests.
 */
/**
 * Ids of nights whose serialized content differs between the stored array and
 * the array about to be written (plus any night that appeared or vanished).
 *
 * Cheap and deliberately shallow — this is a log field, not business logic.
 * Night ids are UUIDs, so nothing here is PII.
 *
 * Exported for unit tests.
 */
function changedNightIds(current, accepted) {
  const beforeById = new Map((current || []).map(n => [String(n.id), JSON.stringify(n)]));
  const changed = [];

  for (const night of accepted || []) {
    const id = String(night.id);
    const before = beforeById.get(id);
    if (before === undefined || before !== JSON.stringify(night)) changed.push(id);
    beforeById.delete(id);
  }
  // Anything left in beforeById was dropped from the payload entirely.
  for (const id of beforeById.keys()) changed.push(id);

  return changed;
}
exports._changedNightIds = changedNightIds;

function diffRsvpEvents(current, accepted, actorId) {
  const currentById = new Map(current.map(n => [String(n.id), n]));
  const events = [];

  for (const night of accepted) {
    if (night.deleted === true) continue;
    const before = currentById.get(String(night.id));
    if (!before || before.deleted === true) continue;           // new night — actor is its host
    if (night.hostUserId === actorId) continue;                 // host's own edit

    const beforeRsvps = new Map((before.rsvps || []).map(r => [r.userId, r]));
    const afterRsvps  = new Map((night.rsvps  || []).map(r => [r.userId, r]));
    const beforeDecl  = new Set(before.declined || []);
    const afterDecl   = new Set(night.declined  || []);

    const mine = afterRsvps.get(actorId);
    if (mine && !beforeRsvps.has(actorId)) {
      events.push({ hostUserId: night.hostUserId, nightId: night.id, date: night.date,
        body: `${mine.name || actorId} ${RSVP_TYPE_LABEL[mine.type] || 'responded'}` });
    } else if (!mine && beforeRsvps.has(actorId) && !afterDecl.has(actorId)) {
      const prev = beforeRsvps.get(actorId);
      events.push({ hostUserId: night.hostUserId, nightId: night.id, date: night.date,
        body: `${prev.name || actorId} cancelled their RSVP` });
    }
    if (afterDecl.has(actorId) && !beforeDecl.has(actorId)) {
      const prev = beforeRsvps.get(actorId);
      events.push({ hostUserId: night.hostUserId, nightId: night.id, date: night.date,
        body: `${prev?.name || actorId} can't make it` });
    }
  }

  return events;
}
exports._diffRsvpEvents = diffRsvpEvents;

// Exported for unit tests — production handler calls with module-level s3 client.
// Returns { nights: [], etag: undefined } when the key is absent or the IAM role
// lacks s3:ListBucket (S3 returns AccessDenied in that case rather than
// NoSuchKey per AWS docs).
async function _loadCurrentNightsWithMeta(client) {
  try {
    const res    = await client.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }));
    const chunks = [];
    for await (const chunk of res.Body) chunks.push(chunk);
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
    return { nights: Array.isArray(parsed) ? parsed : [], etag: res.ETag };
  } catch (err) {
    if (err.name === 'NoSuchKey') return { nights: [], etag: undefined };
    if (err.name === 'AccessDenied' && err.message?.includes('s3:ListBucket')) {
      return { nights: [], etag: undefined };
    }
    throw err;
  }
}
exports._loadCurrentNightsWithMeta = _loadCurrentNightsWithMeta;

// Back-compat helper (kept for existing tests): array only.
async function _loadCurrentNights(client) {
  return (await _loadCurrentNightsWithMeta(client)).nights;
}
exports._loadCurrentNights = _loadCurrentNights;

function isPreconditionFailure(err) {
  return err?.name === 'PreconditionFailed'
    || err?.$metadata?.httpStatusCode === 412
    || err?.name === 'ConditionalRequestConflict'; // concurrent conditional writes
}

// ── Handler ────────────────────────────────────────────────────────────────

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

  let incoming;
  try {
    incoming = JSON.parse(event.body || '[]');
    if (!Array.isArray(incoming)) throw new Error('not array');
  } catch {
    return respond(400, { error: 'Body must be a JSON array' }, CORS);
  }

  // Read → validate → conditional write. One retry on a lost write race.
  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let current, etag;
    try {
      ({ nights: current, etag } = await _loadCurrentNightsWithMeta(s3));
    } catch (err) {
      logger.error('s3.load_failed', { request_id: context?.awsRequestId, key: KEY, error: err.message });
      Sentry.captureException(err);
      return respond(500, { error: 'Failed to load current data' }, CORS);
    }

    const { error, accepted } = validateChanges(current, incoming, userId);
    if (error) {
      logger.warn('upload.rejected', { request_id: context?.awsRequestId, user_id: userId, violation: error });
      return respond(403, { error }, CORS);
    }

    try {
      await s3.send(new PutObjectCommand({
        Bucket:      BUCKET,
        Key:         KEY,
        Body:        JSON.stringify(accepted),
        ContentType: 'application/json',
        // Conditional write: only replace the exact version we validated
        // against. Prevents two concurrent saves from silently dropping
        // each other's changes (last-writer-wins on the whole file).
        ...(etag ? { IfMatch: etag } : { IfNoneMatch: '*' }),
      }));
      logger.info('upload.saved', {
        request_id:   context?.awsRequestId,
        count:        accepted.length,
        attempt,
        // Which nights this write actually altered. A save that reports
        // success while changing nothing is the signature of a client whose
        // in-memory mutation never made it into the payload.
        changed_night_ids: changedNightIds(current, accepted),
        ...identityFields({ userId }),
      });

      // Best-effort Web Push to hosts about the actor's RSVP changes.
      // Failures never affect the save response.
      try {
        const events = diffRsvpEvents(current, accepted, userId);
        for (const ev of events) {
          await push.notifyUser(s3, ev.hostUserId, {
            title: '🎲 Game Night RSVP',
            body:  `${ev.body}${ev.date ? ` (${ev.date})` : ''}`,
            url:   'https://gamenights.jaetill.com/',
            tag:   `rsvp-${ev.nightId}`,
          });
        }
      } catch (e) {
        logger.warn('push.notify_failed', { request_id: context?.awsRequestId, error: e.message });
      }

      return respond(200, { saved: accepted.length }, CORS);
    } catch (err) {
      if (isPreconditionFailure(err) && attempt < MAX_ATTEMPTS) {
        logger.warn('upload.write_race', { request_id: context?.awsRequestId, attempt });
        continue; // reload latest, revalidate, retry
      }
      if (isPreconditionFailure(err)) {
        // Lost the race twice — tell the client to re-sync rather than
        // clobbering someone else's save.
        return respond(409, { error: 'conflict_retry' }, CORS);
      }
      logger.error('s3.put_failed', { request_id: context?.awsRequestId, key: KEY, error: err.message });
      Sentry.captureException(err);
      // Generic message — detail is logged above for ops. AWS SDK error
      // strings can embed bucket/key/request-id; keep that out of the
      // response body (issue #45).
      return respond(500, { error: 'storage_error' }, CORS);
    }
  }
});

exports._setForTest = function({ s3: s3arg } = {}) {
  if (s3arg) s3 = s3arg;
};
exports._resetForTest = function() {
  s3 = new S3Client({ region: REGION });
};
