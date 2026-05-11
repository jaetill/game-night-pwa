// Shared helper: extract the caller's userId from the request context.
//
// Trust model: this helper trusts ONLY `event.requestContext.authorizer.userId`,
// which is populated by the dual-mode `apiKeyAuthorizer` Lambda after it has
// verified either an API key (against SSM) or a Cognito JWT (against the
// pool's JWKS). API Gateway invokes the authorizer before the downstream
// Lambda runs, so by the time we reach this helper the auth has already
// happened — we just need to read the result.
//
// Returns a userId string, or null if the authorizer didn't run / didn't
// populate userId. Callers should treat null as 401 Unauthorized.
//
// Previously this helper had a fallback path that decoded the JWT payload
// directly from the Authorization header without signature verification.
// That fallback was safe under the current deployment (API Gateway always
// runs the authorizer first) but it was a footgun if the helper were ever
// reused outside an authorizer context — the unverified payload would be
// trusted as truth. Removed per security-review finding on PR #3.

'use strict';

function resolveCallerId(event) {
  return event?.requestContext?.authorizer?.userId || null;
}

module.exports = { resolveCallerId };
