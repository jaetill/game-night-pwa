import { getIdToken } from '../auth.js';

/**
 * Wraps fetch() with an Authorization header containing the current
 * Cognito ID token. All API Gateway calls must go through this.
 */
export async function authFetch(url, options = {}) {
  const token = getIdToken();
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: token,
    },
  });
}
