import { loadGameNights, fetchOwnedGames } from './data/index.js';
import { renderApp } from './components/render.js';
import { setupEventListeners } from './events/events.js';

import { Amplify } from 'aws-amplify';
import * as Auth from '@aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';

// 🔍 Sanity check
console.log('Auth methods:', Object.keys(Auth));

Hub.listen('auth', ({ payload }) => {
  console.log(`[📡 Hub] Auth event: ${payload.event}`, payload);
});

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
  console.log('📤 Calling signInWithRedirect...');
  Auth.signInWithRedirect({ provider: 'COGNITO' })
    .catch(err => console.error('❌ signInWithRedirect failed:', err));
};

async function init() {
  console.log('🚀 App starting...');

  document.getElementById('login-button').addEventListener('click', handleLogin);

  try {
    const user = await Auth.currentAuthenticatedUser();
    console.log('✅ User loaded:', user);

    const username = user.username || 'default';
    const nights = await loadGameNights();
    await fetchOwnedGames(username);

    renderApp({ nights, currentUser: user });
    setupEventListeners();
  } catch (err) {
    console.warn('⚠️ Not signed in, launching redirect...');
    handleLogin(); // Triggers signInWithRedirect
  }
}

window.addEventListener('DOMContentLoaded', init);
