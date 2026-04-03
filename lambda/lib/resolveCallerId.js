// Shared helper: extract the caller's userId from whichever auth path was used.
//
// Path 1 — API key (Lambda authorizer):
//   event.requestContext.authorizer.userId is set by apiKeyAuthorizer.js.
//
// Path 2 — Cognito JWT (browser app, existing behaviour):
//   event.headers.Authorization carries a Bearer token; we decode the payload
//   without signature verification (API Gateway already verified it via the
//   Cognito authorizer before the Lambda is invoked).
//
// Returns a userId string, or null if neither path resolves.
// Callers should treat null as 401 Unauthorized.

'use strict';

function resolveCallerId(event) {
  // Path 1: Lambda authorizer injected userId into the request context.
  const fromAuthorizer = event.requestContext?.authorizer?.userId;
  if (fromAuthorizer) return fromAuthorizer;

  // Path 2: Cognito JWT in Authorization header.
  const rawAuth = event.headers?.Authorization || event.headers?.authorization || '';
  const token   = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7) : rawAuth;
  if (!token) return null;

  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString(),
    );
    return payload['cognito:username'] || payload.sub || null;
  } catch {
    return null;
  }
}

module.exports = { resolveCallerId };
