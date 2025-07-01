import { Amplify, Auth } from 'aws-amplify';

Amplify.configure({
  Auth: {
    region: 'us-east-2',
    userPoolId: 'us-east-2_xneeJzaDJ',
    userPoolWebClientId: '7rk583gdoculg0fupv594s53r9',
    oauth: {
      domain: 'us-east-2xneejzadj.auth.us-east-2.amazoncognito.com',
      scope: ['openid', 'email', 'profile'],
      redirectSignIn: 'https://jaetill.github.io/game-night-pwa/login',
      redirectSignOut: 'https://jaetill.github.io/game-night-pwa/logout',
      responseType: 'code'
    }
  }
});

Auth.federatedSignIn();

