# lambda/lib/

Shared modules for the 8 Lambda functions per platform ADR-0009.

## Files

- `sentry.js` — Sentry AWS Serverless SDK init. Wrap handlers with `Sentry.wrapHandler(...)` to capture errors.
- `logger.js` — structured JSON logger. Outputs OTEL-compatible fields to CloudWatch Logs.

## Per-Lambda integration

**Status:** all 8 handlers wrapped on 2026-05-09. The pattern below is preserved for reference and for any future Lambdas.

Each handler is updated to:

```javascript
const { Sentry } = require('./lib/sentry');   // initializes Sentry on cold start
const logger = require('./lib/logger');

exports.handler = Sentry.wrapHandler(async (event, context) => {
  logger.info('handler.invoked', { request_id: context.awsRequestId });

  try {
    // ... existing handler body unchanged ...
    const result = await /* existing logic */;

    logger.info('handler.complete', {
      request_id: context.awsRequestId,
      status: result?.statusCode,
    });
    return result;
  } catch (err) {
    logger.error('handler.error', {
      request_id: context.awsRequestId,
      error: err.message,
    });
    throw err;   // Sentry captures via wrapHandler
  }
});
```

For `bggProxy.mjs` (ESM), use `import` instead of `require`.

## Environment variables required (per Lambda)

- `SENTRY_DSN` — Sentry DSN for this project
- `DEPLOY_ENV` — `dev` / `staging` / `prod` (defaults to `production`)
- `RELEASE_VERSION` — Git tag or SHA (defaults to `unknown`)
- `LOG_LEVEL` — `DEBUG` / `INFO` / `WARN` / `ERROR` (defaults to `INFO`)

## After integrating

Run `cd lambda && npm install` to fetch `@sentry/aws-serverless`. Then redeploy each function via the [deploy runbook](../../docs/runbooks/deploy.md).

## Verification

`tests/lambdaHandlers.test.js` is a load-time smoke test that ensures every handler module still parses, that `Sentry.init` runs cleanly with empty DSN, and that `exports.handler` (or ESM `handler`) remains a function. Runs as part of `npm test`.
