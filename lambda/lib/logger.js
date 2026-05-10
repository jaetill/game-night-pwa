/**
 * Structured JSON logger for Lambdas per platform ADR-0009 §1.
 * Uses console.log (CloudWatch parses JSON natively); no external deps required.
 *
 * OTEL semantic-convention field names where applicable.
 *
 * Usage:
 *   const logger = require('./lib/logger');
 *   logger.info('event.received', { request_id: context.awsRequestId });
 *   logger.error('handler.failed', { error: err.message });
 */

const SERVICE_NAME = process.env.AWS_LAMBDA_FUNCTION_NAME || 'unknown';
const SERVICE_VERSION = process.env.AWS_LAMBDA_FUNCTION_VERSION || 'unknown';
const ENV = process.env.DEPLOY_ENV || 'production';
const LOG_LEVEL = (process.env.LOG_LEVEL || 'INFO').toUpperCase();

const LEVELS = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40, FATAL: 50 };
const minLevel = LEVELS[LOG_LEVEL] || LEVELS.INFO;

// Top-level field names that should always be redacted. Names match what the
// codebase actually uses (e.g. `tempPassword`, not `temporaryPassword` — see
// nudge.js); add more as new fields appear.
const PII_FIELDS = [
  'email',
  'inviteEmail',
  'signInEmail',
  'contactEmail',
  'displayName',
  'name',
  'phone',
  'address',
  'bggUsername',
  'password',
  'tempPassword',
  'temporaryPassword',
  'token',
  'apiKey',
  'authorization',
];

// Regex patterns scrubbed inside string values (e.g. an email embedded in an
// upstream error message that ends up in `error: e.message`). Keep these tight
// to avoid mangling unrelated text.
const VALUE_SCRUBBERS = [
  // Emails
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[REDACTED_EMAIL]'],
  // Bearer tokens / JWT-shaped strings (3 base64url segments)
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]'],
];

function scrubString(value) {
  let out = value;
  for (const [pattern, replacement] of VALUE_SCRUBBERS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function scrubFields(record) {
  for (const [key, value] of Object.entries(record)) {
    if (PII_FIELDS.includes(key) && value !== undefined) {
      record[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      record[key] = scrubString(value);
    }
  }
  return record;
}

function emit(level, msg, fields) {
  if (LEVELS[level] < minLevel) return;
  const record = {
    timestamp: new Date().toISOString(),
    severity_text: level,
    severity_number: LEVELS[level],
    message: msg,
    'service.name': SERVICE_NAME,
    'service.version': SERVICE_VERSION,
    'deployment.environment': ENV,
    ...fields,
  };
  // Scrub PII per ADR-0006: redact named fields, scrub email/JWT patterns
  // inside string values (catches upstream errors that echo input back).
  scrubFields(record);
  console.log(JSON.stringify(record));
}

module.exports = {
  debug: (msg, fields = {}) => emit('DEBUG', msg, fields),
  info: (msg, fields = {}) => emit('INFO', msg, fields),
  warn: (msg, fields = {}) => emit('WARN', msg, fields),
  error: (msg, fields = {}) => emit('ERROR', msg, fields),
  fatal: (msg, fields = {}) => emit('FATAL', msg, fields),
};
