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

const PII_FIELDS = ['email', 'displayName', 'phone', 'password', 'temporaryPassword'];

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
  // Scrub PII fields per ADR-0006
  for (const piiField of PII_FIELDS) {
    if (record[piiField] !== undefined) {
      record[piiField] = '[REDACTED]';
    }
  }
  console.log(JSON.stringify(record));
}

module.exports = {
  debug: (msg, fields = {}) => emit('DEBUG', msg, fields),
  info: (msg, fields = {}) => emit('INFO', msg, fields),
  warn: (msg, fields = {}) => emit('WARN', msg, fields),
  error: (msg, fields = {}) => emit('ERROR', msg, fields),
  fatal: (msg, fields = {}) => emit('FATAL', msg, fields),
};
