import { loadGameNights, fetchOwnedGames } from './data/index.js';
import { renderApp } from './components/render.js';
import { setupEventListeners } from './events/events.js';

import { Amplify } from 'aws-amplify';
import * as Auth from '@aws-amplify/auth'; // ✅ Modular Auth import
import { Hub } from 'aws-amplify/utils';   // ✅ Modular Hub import



// 🔊 Log all auth-related events from Amplify
Hub.listen('auth', ({ payload }) => {
  console.log(`[📡 Hub] Auth event: ${payload.event}`, payload);
});

// 🔧 Configure Amplify
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

// 🌐 Trigger hosted UI login
const handleLogin = () => {
  console.log('📤 Federated sign-in triggered');
  Auth.federatedSignIn();
};

// 🚀 App initialization
async function init() {
  console.log('🚦 App loaded, checking authentication...');
  document.getElementById('login-button').addEventListener('click', handleLogin);

  try {
    const user = await Auth.currentAuthenticatedUser();
    console.log('✅ User authenticated:', user);

    const username = user.username || 'default';
    const nights = await loadGameNights();
    await fetchOwnedGames(username);

    renderApp({ nights, currentUser: user });
    setupEventListeners();
  } catch (err) {
    console.warn('⚠️ Not signed in—redirecting to login:', err);
    handleLogin();
  }
}

window.addEventListener('DOMContentLoaded', init);
