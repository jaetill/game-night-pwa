import { loadGameNights, fetchOwnedGames } from './data/index.js';
import { renderApp } from './components/render.js';
import { setupEventListeners } from './events/events.js';
import { Amplify } from 'aws-amplify';
import * as Auth from 'aws-amplify/auth';

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
      responseType: 'code',
    },
  },
});

const handleLogin = () => {
  Auth.federatedSignIn();
};

async function init() {
  try {
    const user = await Auth.currentAuthenticatedUser();
    document.getElementById('login-button').addEventListener('click', handleLogin);

    const username = user.username || 'default';
    const nights = await loadGameNights();
    await fetchOwnedGames(username);

    renderApp({ nights, currentUser: user });
    setupEventListeners();
  } catch (err) {
    console.warn('User not signed in. Redirecting to login...');
    Auth.federatedSignIn();
  }
}

window.addEventListener('DOMContentLoaded', init);
