// Lambda: REQUEST-type API Gateway authorizer — dual-mode auth.
//
// Accepts EITHER of:
//   1. X-API-Key header  → SSM Parameter Store lookup
//                          /game-night/api-keys/{key} → userId (SecureString)
//   2. Authorization header (Cognito ID token, with or without "Bearer ")
//      → JWKS-verified by aws-jwt-verify (signature, exp, iss, aud)
//      → must be issued for the game-night App Client
//      → must include `cognito:groups` containing `game-night-users`
//
// On success returns an Allow policy with `userId` in the authorizer context,
// which downstream Lambdas read from event.requestContext.authorizer.userId.
//
// IDENTITY SOURCE NOTE
// API Gateway's REQUEST authorizer treats identitySource as both the cache key
// and the precondition for invoking the authorizer at all — all listed sources
// must be present and non-empty, else API Gateway returns 401 *before* invoking
// us. We can't require BOTH X-API-Key AND Authorization (only one is sent per
// request), nor can we leave identitySource empty (API Gateway rejects that).
// The workaround: use `method.request.header.Host` as a no-op precondition
// (always present on HTTP/1.x requests, identical for all callers) and set
// authorizerResultTtlInSeconds=0 so the shared cache key never produces a
// cross-user cache hit. Caching is still effective at two lower layers:
//   - aws-jwt-verify caches JWKS keys per user pool (one HTTPS call per Lambda
//     instance lifetime).
//   - Module-scoped Map caches API key → userId for 5 min per warm Lambda.
//
// IAM requirements:
//   ssm:GetParameter on arn:aws:ssm:us-east-2:*:parameter/game-night/api-keys/*

'use strict';

const { Sentry } = require('./lib/sentry');
const logger = require('./lib/logger');
const { CognitoJwtVerifier } = require('aws-jwt-verify');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');

// ── Configuration ──────────────────────────────────────────────────────────
const USER_POOL_ID    = 'us-east-2_xneeJzaDJ';
const APP_CLIENT_ID   = '34et7dk67ngqep1oqef49te0ic';
const REQUIRED_GROUP  = 'game-night-users';
const SSM_PREFIX      = process.env.SSM_PREFIX || '/game-night/api-keys/';
const REGION          = process.env.AWS_REGION || 'us-east-2';

// ── Clients ────────────────────────────────────────────────────────────────
const ssm = new SSMClient({ region: REGION });

const idTokenVerifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse:   'id',
  clientId:   APP_CLIENT_ID,
});

// ── Module-scoped API key cache ───────────────────────────────────────────
const apiKeyCache    = new Map();
const API_KEY_TTL_MS = 5 * 60 * 1000;

// ── Handler ────────────────────────────────────────────────────────────────
//
// NOTE: Sentry.wrapHandler is applied here too, but tracesSampleRate is 0.1
// (per lib/sentry.js) so per-request overhead is bounded. The authorizer
// returns Allow/Deny policies, not HTTP responses — keep that contract intact.
exports.handler = Sentry.wrapHandler(async (event, context) => {
  const headers = lowercaseHeaders(event.headers || {});

  // Path 1: API key (preferred — cheaper, used by MCP server)
  const apiKey = headers['x-api-key'];
  if (apiKey) {
    return await authenticateApiKey(apiKey, event.methodArn, context);
  }

  // Path 2: Cognito JWT (browser frontend)
  const auth = headers['authorization'];
  if (auth) {
    return await authenticateJwt(auth, event.methodArn, context);
  }

  logger.info('auth.no_credentials', { request_id: context?.awsRequestId });
  return deny(event.methodArn);
});

// ── Auth paths ─────────────────────────────────────────────────────────────

async function authenticateApiKey(apiKey, methodArn, context) {
  const hit = apiKeyCache.get(apiKey);
  if (hit && hit.expiresAt > Date.now()) {
    return allow(hit.userId, methodArn);
  }

  let userId;
  try {
    const result = await ssm.send(new GetParameterCommand({
      Name:           `${SSM_PREFIX}${apiKey}`,
      WithDecryption: true,
    }));
    userId = result.Parameter?.Value;
  } catch (e) {
    if (e.name === 'ParameterNotFound') {
      logger.info('auth.unknown_api_key', { request_id: context?.awsRequestId });
    } else {
      logger.error('ssm.lookup_failed', { request_id: context?.awsRequestId, error_name: e.name, error: e.message });
      Sentry.captureException(e);
    }
    return deny(methodArn);
  }

  if (!userId) return deny(methodArn);

  apiKeyCache.set(apiKey, { userId, expiresAt: Date.now() + API_KEY_TTL_MS });
  return allow(userId, methodArn);
}

async function authenticateJwt(authHeader, methodArn, context) {
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (!token) return deny(methodArn);

  let payload;
  try {
    payload = await idTokenVerifier.verify(token);
  } catch (e) {
    logger.info('auth.jwt_invalid', { request_id: context?.awsRequestId, error: e.message });
    return deny(methodArn);
  }

  const groups = payload['cognito:groups'] || [];
  if (!groups.includes(REQUIRED_GROUP)) {
    logger.info('auth.group_missing', { request_id: context?.awsRequestId, required_group: REQUIRED_GROUP });
    return deny(methodArn);
  }

  const userId = payload['cognito:username'] || payload.sub;
  return allow(userId, methodArn);
}

// ── Policy builders ────────────────────────────────────────────────────────

/**
 * Wildcard ARN scoped to the API stage. The cached policy can then be reused
 * across routes within the same stage rather than tied to a specific method.
 *
 *   arn:aws:execute-api:{r}:{a}:{api}/{stage}/GET/get-token
 *   →  arn:aws:execute-api:{r}:{a}:{api}/{stage}/*
 */
function stageWildcard(methodArn) {
  const parts = methodArn.split('/');
  return `${parts[0]}/${parts[1]}/*`;
}

function buildPolicy(effect, principalId, methodArn, context = {}) {
  return {
    principalId,
    policyDocument: {
      Version:   '2012-10-17',
      Statement: [{
        Action:   'execute-api:Invoke',
        Effect:   effect,
        Resource: stageWildcard(methodArn),
      }],
    },
    context,
  };
}

function allow(userId, methodArn) {
  return buildPolicy('Allow', userId, methodArn, { userId });
}

function deny(methodArn) {
  return buildPolicy('Deny', 'unauthorized', methodArn);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function lowercaseHeaders(h) {
  const out = {};
  for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = v;
  return out;
}
