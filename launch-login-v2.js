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
const codeChallenge = 'test'; // placeholder for now
const codeChallengeMethod = 'S256';

const url = `https://${domain}/oauth2/authorize?` +
  `client_id=${clientId}` +
  `&redirect_uri=${redirectUri}` +
  `&response_type=code` +
  `&scope=${scope}` +
  `&state=${state}` +
  `&code_challenge=${codeChallenge}` +
  `&code_challenge_method=${codeChallengeMethod}`;

console.log('🔗 Redirecting to:', url);
window.location.href = url;
