/**
 * Sentry init shared across Lambda functions per platform ADR-0009.
 *
 * To activate per-Lambda (deferred from initial integration to avoid touching all
 * 8 handlers in a single PR):
 *
 *   const { Sentry } = require('./lib/sentry');
 *   exports.handler = Sentry.wrapHandler(async (event, context) => {
 *     // existing handler logic
 *   });
 *
 * Set SENTRY_DSN, DEPLOY_ENV, and RELEASE_VERSION env vars on the Lambda.
 */

const Sentry = require('@sentry/aws-serverless');

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.DEPLOY_ENV || 'production',
  release: process.env.RELEASE_VERSION || 'unknown',
  tracesSampleRate: 0.1,
  // PII scrubbing per ADR-0006
  beforeSend(event) {
    if (event.user) {
      delete event.user.email;
      delete event.user.username;
    }
    return event;
  },
});

module.exports = { Sentry };
