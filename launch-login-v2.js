import { Amplify, Auth } from 'aws-amplify';

Amplify.configure({
  Auth: {
    region: 'us-east-2',
    userPoolId: 'us-east-2_xneeJzaDJ',
    userPoolWebClientId: '34et7dk67ngqep1oqef49te0ic',
    oauth: {
      domain: 'us-east-2xneejzadj.auth.us-east-2.amazoncognito.com',
      scope: ['openid', 'email', 'profile'],
      redirectSignIn: 'https://jaetill.github.io/game-night-pwa/login.html',
      redirectSignOut: 'https://jaetill.github.io/game-night-pwa/logout.html',
      responseType: 'code',
    },
  },
});

// 🎯 Redirect to Cognito Hosted UI with a clean PKCE flow
//Auth.federatedSignIn({
  //customState: 'launch',
//}).catch(err => {
  //console.error('❌ federatedSignIn failed:', err);
//});

const domain = 'us-east-2xneejzadj.auth.us-east-2.amazoncognito.com';
const clientId = '34et7dk67ngqep1oqef49te0ic';
const redirectUri = encodeURIComponent('https://jaetill.github.io/game-night-pwa/login.html');
const scope = encodeURIComponent('openid email profile');
const state = encodeURIComponent('launch');

const codeVerifier = crypto.randomUUID(); // Store this for token exchange
const encoder = new TextEncoder();
const data = encoder.encode(codeVerifier);
const hash = await crypto.subtle.digest('SHA-256', data);
const base64Url = btoa(String.fromCharCode(...new Uint8Array(hash)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const loginUrl = `https://${domain}/oauth2/authorize?` +
  `client_id=${clientId}&redirect_uri=${redirectUri}` +
  `&response_type=code&scope=${scope}` +
  `&state=${state}&code_challenge=${base64Url}&code_challenge_method=S256`;

window.sessionStorage.setItem('pkce_code_verifier', codeVerifier);
window.location.href = loginUrl;

