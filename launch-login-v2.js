import { Amplify, Auth } from 'aws-amplify';

console.log('🧼 Resetting and reapplying Amplify config');

// Step 1: Clear previous config (just in case)
Amplify.configure({});

// Step 2: Apply fresh config
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

console.log('🚀 Calling Auth.federatedSignIn()…');

Auth.federatedSignIn({ customState: 'launch' })
  .then(() => {
    console.log('✅ federatedSignIn() triggered successfully');
  })
  .catch(err => {
    console.error('❌ federatedSignIn() threw an error:', err);
  });
