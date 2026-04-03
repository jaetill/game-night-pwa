// Lambda: REQUEST-type authorizer for API key authentication.
//
// Reads X-API-Key from request headers and resolves it to a userId via SSM
// Parameter Store. Returns an IAM policy that downstream Lambdas see as
// event.requestContext.authorizer.userId.
//
// This runs alongside the existing Cognito JWT authorizer — they are assigned
// to different routes in API Gateway. Existing browser-facing routes keep their
// Cognito authorizer untouched.
//
// Environment variables:
//   SSM_PREFIX   — SSM path prefix (default: /game-night/api-keys/)
//                  Parameters are stored as:
//                    /game-night/api-keys/{apiKey} → userId (SecureString)
//
// IAM requirements for this Lambda's execution role:
//   ssm:GetParameter on arn:aws:ssm:{region}:{account}:parameter/game-night/api-keys/*
//
// API Gateway authorizer settings:
//   Type:                  REQUEST
//   Identity sources:      method.request.header.X-API-Key
//   Result TTL in seconds: 300  (API Gateway caches the policy per unique key)

'use strict';

const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');

const ssm        = new SSMClient({ region: process.env.AWS_REGION || 'us-east-2' });
const SSM_PREFIX = process.env.SSM_PREFIX || '/game-night/api-keys/';

// Module-level cache supplements API Gateway's result TTL. Within a warm
// execution environment the cache avoids repeated SSM calls for the same key.
const cache       = new Map(); // apiKey → { userId, expiresAt }
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

exports.handler = async (event) => {
  // Headers arrive lowercase from API Gateway HTTP API; mixed-case from REST API.
  const apiKey = event.headers?.['x-api-key'] || event.headers?.['X-API-Key'];

  if (!apiKey) return deny(event.methodArn);

  // ── Cache check ───────────────────────────────────────────────────────────
  const hit = cache.get(apiKey);
  if (hit && hit.expiresAt > Date.now()) {
    return allow(hit.userId, event.methodArn);
  }

  // ── SSM lookup ────────────────────────────────────────────────────────────
  let userId;
  try {
    const result = await ssm.send(new GetParameterCommand({
      Name:            `${SSM_PREFIX}${apiKey}`,
      WithDecryption:  true,
    }));
    userId = result.Parameter.Value;
  } catch (e) {
    if (e.name === 'ParameterNotFound') {
      console.log('Unknown API key — denying');
      return deny(event.methodArn);
    }
    // Unexpected SSM error: fail closed (deny, don't throw).
    console.error('SSM error during key lookup', e.name, e.message);
    return deny(event.methodArn);
  }

  if (!userId) {
    console.log('SSM param value empty — denying');
    return deny(event.methodArn);
  }

  cache.set(apiKey, { userId, expiresAt: Date.now() + CACHE_TTL_MS });
  return allow(userId, event.methodArn);
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a wildcard ARN covering all methods/routes in the same stage.
 * This ensures the cached authorization result is reused across routes,
 * not just the specific method that triggered the authorizer.
 *
 * Input:  arn:aws:execute-api:{region}:{acct}:{apiId}/{stage}/GET/search-games
 * Output: arn:aws:execute-api:{region}:{acct}:{apiId}/{stage}/*
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
