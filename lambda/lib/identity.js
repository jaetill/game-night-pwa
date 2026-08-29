// Shared helpers for logging *who* touched the app, without putting PII in
// CloudWatch.
//
// Why this exists: until now every log line was anonymous. `upload.saved`
// recorded that a write happened but not who made it; `rsvp_link.saved`
// recorded the choice but not the invitee. When a user reported "I RSVP'd"
// and the data disagreed, there was no way to confirm or refute it — the
// only honest answer was "no idea". These helpers make every mutation
// attributable.
//
// PII rules (platform ADR-0006, enforced by lib/logger.js):
//   - lib/logger.js redacts any field literally named `email` and scrubs
//     email-shaped substrings out of ALL string values. So logging a raw
//     address is both against the standard and useless — it comes out as
//     [REDACTED_EMAIL].
//   - `user_id` (a Cognito username or UUID) is pseudonymous and survives the
//     scrubber intact. It is the primary identity field.
//   - `email_hash` is a truncated SHA-256 of the normalized address. It also
//     survives the scrubber (hex, no @), lets you grep a specific person's
//     activity, and is not reversible from the log alone.
//
// Deliberately NOT logged anywhere: display names. `name` is in the logger's
// PII_FIELDS list, so it would be redacted anyway.

'use strict';

const crypto = require('crypto');

// 12 hex chars = 48 bits. Enough to be collision-free across a friend-group
// address book by many orders of magnitude, short enough to eyeball in a log.
const HASH_LENGTH = 12;

/**
 * Stable, non-reversible handle for an email address.
 *
 * Normalizes (trim + lowercase) first so the same person hashes identically
 * whether the address arrived from Cognito, an invite body, or an RSVP token.
 *
 * Returns undefined for anything that isn't a usable address — callers can
 * spread the result into a log record and have the field simply not appear.
 */
function emailHash(email) {
  if (typeof email !== 'string') return undefined;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return undefined;
  return crypto.createHash('sha256').update(normalized).digest('hex').slice(0, HASH_LENGTH);
}

/**
 * Build the identity fields for a log record from whatever is known.
 *
 * Guards against the footgun this codebase already has: several call sites
 * fall back to using the raw email AS the userId when Cognito has no matching
 * user (see resolveInvitee in rsvpLink.js). Passing that straight through as
 * `user_id` would leak an address into logs and then get scrubbed to
 * [REDACTED_EMAIL], losing the attribution we came for. So an email-shaped
 * userId is dropped from `user_id` and represented by `email_hash` instead.
 *
 * @param {object}  input
 * @param {string}  [input.userId]  Cognito username/UUID, or an email fallback
 * @param {string}  [input.email]   Raw address, if known
 * @returns {{user_id?: string, email_hash?: string}}
 */
function identityFields({ userId, email } = {}) {
  const fields = {};
  const userIdIsEmail = typeof userId === 'string' && userId.includes('@');

  if (userId && !userIdIsEmail) fields.user_id = userId;

  const hash = emailHash(email || (userIdIsEmail ? userId : undefined));
  if (hash) fields.email_hash = hash;

  return fields;
}

/**
 * Human-readable route from an API Gateway method ARN, for the authorizer —
 * which sees `methodArn` but not `event.resource`.
 *
 *   arn:aws:execute-api:us-east-2:123:abc/prod/POST/upload-token
 *   →  "POST /upload-token"
 *
 * Returns undefined rather than throwing on an unexpected shape; a log field
 * is never worth failing an auth decision over.
 */
function routeFromMethodArn(methodArn) {
  if (typeof methodArn !== 'string') return undefined;
  const parts = methodArn.split('/');
  if (parts.length < 3) return undefined;
  const verb = parts[2];
  const path = parts.slice(3).join('/');
  return path ? `${verb} /${path}` : verb;
}

module.exports = { emailHash, identityFields, routeFromMethodArn, HASH_LENGTH };
