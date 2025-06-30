import { loadGameNights, fetchOwnedGames } from './data/index.js';
import { renderApp } from './components/render.js';
import { setupEventListeners } from './events/events.js';
import { Amplify } from 'aws-amplify';
import * as Auth from '@aws-amplify/auth'; // 👈 Crucial for initializing the Auth module


console.log('Auth module:', Auth);

// Configure Amplify (includes Auth + OAuth)
Amplify.configure({
  Auth: {
    region: 'us-east-2',
    userPoolId: 'us-east-2_xneeJzaDJ',
    userPoolWebClientId: '7rk583gdoculg0fupv594s53r9',
    oauth: {
      domain: 'us-east-2xneejzadj.auth.us-east-2.amazoncognito.com',
      scope: ['openid', 'email', 'profile'],
      redirectSignIn: 'https://jaetill.github.io/game-night-pwa/',
      redirectSignOut: 'https://jaetill.github.io/game-night-pwa/',
      responseType: 'code'
    }
  }
});

const handleLogin = () => {
  Auth.federatedSignIn();
};

async function init() {
  try {
    const session = await fetchAuthSession();
    const user = session.tokens?.idToken?.payload?.username
      ? { username: session.tokens.idToken.payload.username }
      : null;

    document.getElementById('login-button').addEventListener('click', handleLogin);

    if (!user) throw new Error('No user');

    const nights = await loadGameNights();
    await fetchOwnedGames(user.username);

    renderApp({ nights, currentUser: user });
    setupEventListeners();
  } catch (err) {
    console.warn('User not signed in. Redirecting to login...');
    Auth.federatedSignIn();
  }
}

window.addEventListener('DOMContentLoaded', init);
