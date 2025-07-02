import { Amplify, Auth } from 'aws-amplify';

Amplify.configure({
  Auth: {
    region: 'us-east-2',
    userPoolId: 'us-east-2_xneeJzaDJ',
    userPoolWebClientId: '7rk583gdoculg0fupv594s53r9',
    oauth: {
      domain: 'us-east-2xneejzadj.auth.us-east-2.amazoncognito.com',
      scope: ['openid', 'email', 'profile'],
      redirectSignIn: 'https://jaetill.github.io/game-night-pwa/login.html',
      redirectSignOut: 'https://jaetill.github.io/game-night-pwa/logout.html',
      responseType: 'code'
    }
  }
});

// Force a clean redirect by explicitly passing the redirect URI
Auth.federatedSignIn({
  customState: 'launch',
  redirectSignIn: 'https://jaetill.github.io/game-night-pwa/login'
});
