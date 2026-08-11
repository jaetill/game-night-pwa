// Cognito Hosted UI config. All values here are non-secret —
// the App Client has no client secret (PKCE-only public client).

const PROD_ORIGIN = 'https://gamenights.jaetill.com';
const DEV_ORIGIN  = 'http://localhost:5173';

const origin = import.meta.env.DEV ? DEV_ORIGIN : PROD_ORIGIN;

export const COGNITO = {
  region:      'us-east-2',
  userPoolId:  'us-east-2_xneeJzaDJ',
  domain:      'just.jaetill.com',
  clientId:    '34et7dk67ngqep1oqef49te0ic',
  redirectUri: `${origin}/callback.html`,
  logoutUri:   `${origin}/`,
  scopes:      ['openid', 'email', 'profile', 'aws.cognito.signin.user.admin'],
};

// Single source of truth for the API Gateway base URL. Every module (and the
// feedback widget) imports this — the old per-module copies plus a
// VITE_API_URL env var (whose value included a route path) caused the
// feedback widget to post to a nonexistent endpoint.
export const API_BASE = 'https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod';

// VAPID public key for Web Push (non-secret by design — the browser sends
// it to the push service on subscribe; the private half lives in Secrets
// Manager `game-night/prod/push-vapid`).
export const VAPID_PUBLIC_KEY = 'BE9VkZO4RO4hT3bGhViNJvZXSKHOzU48AG7_cUGQmB9ho8RLuwaAJu3SY7T_IJzcVViDq9G__acPZOhafGa3ydo';

export const DEBUG_MODE = false;
