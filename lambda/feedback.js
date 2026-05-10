// Lambda: POST /feedback — accepts user-submitted feedback, files a GitHub Issue.
//
// No auth required (public endpoint); rate-limited per IP. Honeypot field
// drops bot submissions silently. GitHub token is fetched from Secrets Manager
// (cached on warm Lambda instance, same pattern as nudge.js + Postmark).
//
// Environment variables:
//   GITHUB_REPO_OWNER  — defaults to "jaetill"
//   GITHUB_REPO_NAME   — defaults to "game-night-pwa"
//   GITHUB_SECRET_ID   — defaults to "game-night/prod/github-token"
//
// Secrets Manager value at GITHUB_SECRET_ID must be a JSON object:
//   { "GITHUB_TOKEN": "ghp_..." }
//
// IAM: see lambda/iam/feedback-inline.json — logs + secretsmanager:GetSecretValue.

'use strict';

const { Sentry } = require('./lib/sentry');
const logger = require('./lib/logger');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

// @octokit/rest is ESM-only since v18+; CJS cannot `require()` it directly.
// We dynamic-import it lazily inside getOctokit() so the rest of the module
// can stay CommonJS (consistent with the other 7 handlers). Tests bypass this
// path entirely by passing a mock class via createHandler({ Octokit }).

const REGION = process.env.AWS_REGION || 'us-east-2';
const REPO_OWNER = process.env.GITHUB_REPO_OWNER || 'jaetill';
const REPO_NAME = process.env.GITHUB_REPO_NAME || 'game-night-pwa';
const SECRET_ID = process.env.GITHUB_SECRET_ID || 'game-night/prod/github-token';

const ALLOWED_ORIGINS = new Set([
  'https://gamenights.jaetill.com',
  'https://jaetill.github.io',
  'http://localhost:5173',
]);

// ── In-memory rate limit (per warm Lambda instance) ─────────────────────────
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const LIMIT = 10;
const RATE_LIMITS_MAX_KEYS = 10_000; // bound memory: at ~80 bytes per entry, ~1 MB

function makeRateLimiter() {
  const buckets = new Map();
  return function checkRateLimit(ip) {
    const now = Date.now();
    const existing = buckets.get(ip);

    if (!existing || now - existing.windowStart >= WINDOW_MS) {
      if (buckets.size >= RATE_LIMITS_MAX_KEYS) {
        for (const [k, e] of buckets.entries()) {
          if (now - e.windowStart >= WINDOW_MS) buckets.delete(k);
        }
      }
      buckets.set(ip, { count: 1, windowStart: now });
      return { allowed: true };
    }

    if (existing.count >= LIMIT) {
      return {
        allowed: false,
        retryAfter: Math.ceil((WINDOW_MS - (now - existing.windowStart)) / 1000),
      };
    }

    existing.count += 1;
    return { allowed: true };
  };
}

// ── Validation (inline; no schema lib for low dep weight) ───────────────────
const ALLOWED_TYPES = new Set(['bug', 'feature', 'other']);

function validate(input) {
  if (!input || typeof input !== 'object') return 'body must be an object';
  if (!ALLOWED_TYPES.has(input.type)) return 'type must be one of: bug, feature, other';
  if (typeof input.description !== 'string') return 'description must be a string';
  if (input.description.length < 10 || input.description.length > 2000) {
    return 'description must be 10-2000 characters';
  }
  if (input.email !== undefined) {
    if (typeof input.email !== 'string' || !input.email.includes('@') || input.email.length > 254) {
      return 'email must be a valid email address';
    }
  }
  if (input.page_url !== undefined && (typeof input.page_url !== 'string' || input.page_url.length > 2048)) {
    return 'page_url must be a string under 2048 chars';
  }
  if (input.user_agent !== undefined && (typeof input.user_agent !== 'string' || input.user_agent.length > 512)) {
    return 'user_agent must be a string under 512 chars';
  }
  return null;
}

// ── CORS / response helpers ─────────────────────────────────────────────────
function corsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://gamenights.jaetill.com',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Content-Type': 'application/json',
  };
}

function respond(status, body, headers) {
  return { statusCode: status, headers, body: JSON.stringify(body) };
}

// ── Handler factory (testable via dependency injection) ─────────────────────
//
// Production: createHandler() with no args wires up a real SecretsManagerClient
// and constructs Octokit on first GitHub call. Tests can pass in mocks for
// either or both, plus a clock for deterministic rate-limit windows. The rate
// limit Map is also per-handler-instance so tests don't leak state.

function createHandler(deps = {}) {
  const smClient = deps.smClient || new SecretsManagerClient({ region: REGION });
  const checkRateLimit = deps.checkRateLimit || makeRateLimiter();

  let _secrets;
  async function getSecrets() {
    if (!_secrets) {
      const res = await smClient.send(new GetSecretValueCommand({ SecretId: SECRET_ID }));
      _secrets = JSON.parse(res.SecretString);
    }
    return _secrets;
  }

  // Tests inject a mock class via deps.Octokit; production lazily resolves
  // the real ESM-only Octokit on first GitHub call.
  let _octokitClass = deps.Octokit;
  let _octokit;
  async function getOctokit() {
    if (!_octokit) {
      if (!_octokitClass) {
        const mod = await import('@octokit/rest');
        _octokitClass = mod.Octokit;
      }
      const { GITHUB_TOKEN } = await getSecrets();
      if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN missing from Secrets Manager value');
      _octokit = new _octokitClass({ auth: GITHUB_TOKEN });
    }
    return _octokit;
  }

  return Sentry.wrapHandler(async (event, context) => {
    logger.info('handler.invoked', {
      request_id: context?.awsRequestId,
      method: event.httpMethod,
      resource: event.resource,
    });

    const CORS = corsHeaders(event);

    if (event.httpMethod === 'OPTIONS') {
      return { statusCode: 200, headers: CORS, body: '' };
    }

    if (event.httpMethod !== 'POST') {
      return respond(405, { error: 'method_not_allowed' }, CORS);
    }

    // Rate limit by source IP. Only trust API Gateway's identity.sourceIp,
    // which AWS populates from the TCP-level peer and the caller cannot
    // spoof. X-Forwarded-For is client-controlled and was previously used
    // as a fallback — that fallback was dead in production (sourceIp is
    // always set under API Gateway v1 Lambda proxy) but trivially bypassed
    // the limiter if this handler were ever invoked outside that context
    // (ALB, local dev, test harness). Removed.
    const ip = event.requestContext?.identity?.sourceIp || 'unknown';

    const rl = checkRateLimit(ip);
    if (!rl.allowed) {
      logger.info('feedback.rate_limited', { request_id: context?.awsRequestId });
      return respond(429,
        { error: 'rate_limited', retry_after_seconds: rl.retryAfter },
        { ...CORS, 'Retry-After': String(rl.retryAfter) },
      );
    }

    // Parse body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return respond(400, { error: 'invalid_json' }, CORS);
    }

    // Honeypot — bots fill hidden `website` field; humans don't.
    // Drop silently with a fake-success ID so the bot doesn't retry.
    if (typeof body.website === 'string' && body.website.length > 0) {
      logger.warn('feedback.honeypot_triggered', { request_id: context?.awsRequestId, ip });
      return respond(201, { id: `FB-DROPPED-${Date.now()}`, status: 'received' }, CORS);
    }

    // Validate
    const violation = validate(body);
    if (violation) {
      return respond(400, { error: 'validation_error', detail: violation }, CORS);
    }

    // Build the GitHub issue
    const titleBody = body.description.length > 60
      ? body.description.slice(0, 60).trim() + '...'
      : body.description;
    const issueTitle = `[${body.type}] ${titleBody}`;
    const issueBody = [
      '## Description', body.description, '',
      '## Context',
      body.page_url ? `- Page: ${body.page_url}` : null,
      body.user_agent ? `- UA: \`${body.user_agent}\`` : null,
      body.email ? `- Email: ${body.email}` : null,
      `- Source IP: ${ip}`,
      `- Lambda request: ${context?.awsRequestId || 'unknown'}`,
      '',
      '## Triage',
      'Will be classified by `triage-bot` agent on next scheduled scan.',
    ].filter(Boolean).join('\n');

    // File the issue
    let octokit;
    try {
      octokit = await getOctokit();
    } catch (err) {
      logger.error('feedback.secrets_failed', { request_id: context?.awsRequestId, error: err.message });
      Sentry.captureException(err);
      return respond(500, { error: 'configuration_error' }, CORS);
    }

    try {
      const result = await octokit.rest.issues.create({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        title: issueTitle,
        body: issueBody,
        labels: ['feedback:user-submitted', `type:${body.type}`],
      });
      const id = `FB-${new Date().getFullYear()}-${String(result.data.number).padStart(6, '0')}`;
      logger.info('feedback.received', {
        request_id: context?.awsRequestId,
        id,
        type: body.type,
        issue_number: result.data.number,
      });
      return respond(201, {
        id,
        status: 'received',
        issue_url: result.data.html_url,
      }, CORS);
    } catch (err) {
      logger.error('feedback.github_failed', {
        request_id: context?.awsRequestId,
        error: err.message,
        status: err.status,
      });
      Sentry.captureException(err);
      return respond(502, { error: 'github_issue_creation_failed' }, CORS);
    }
  });
}

// Production handler — Lambda runtime invokes this.
exports.handler = createHandler();

// Test hooks
exports._createHandler = createHandler;
exports._validate = validate;
exports._makeRateLimiter = makeRateLimiter;
