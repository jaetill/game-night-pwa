import { Auth } from 'aws-amplify';

/**
 * Wraps fetch() with an Authorization header containing the current
 * Cognito ID token. All API Gateway calls must go through this.
 */
export async function authFetch(url, options = {}) {
  const session = await Auth.currentSession();
  const token   = session.getIdToken().getJwtToken();

  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: token,
    },
  });
}
