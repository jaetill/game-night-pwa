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

export const DEBUG_MODE = false;
