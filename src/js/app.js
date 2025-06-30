import { loadGameNights, fetchOwnedGames } from './data/index.js';
import { renderApp } from './components/render.js';
import { setupEventListeners } from './events/events.js';

import { Amplify } from 'aws-amplify';
import * as Auth from '@aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';

console.log('🔍 Auth module keys:', Object.keys(Auth)); // Show available methods

// 🔊 Listen to Amplify Auth events
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

const handleLogin = () => {
  console.log('📤 Initiating federated sign-in...');
  Auth.federatedSignIn({ provider: 'COGNITO' }).catch(err =>
    console.error('❌ Federated sign-in failed:', err)
  );
};

async function init() {
  console.log('🚀 App initializing...');

  try {
    console.log('🔄 Attempting to complete OAuth redirect...');
    await Auth.handleRedirect();

    const user = await Auth.currentAuthenticatedUser();
    console.log('✅ User authenticated:', user);

    document.getElementById('login-button').addEventListener('click', handleLogin);

    const username = user.username || 'default';
    const nights = await loadGameNights();
    await fetchOwnedGames(username);

    renderApp({ nights, currentUser: user });
    setupEventListeners();
  } catch (err) {
    console.warn('⚠️ No active user found or redirect failed:', err);
    Auth.federatedSignIn(); // Start login flow again
  }
}

window.addEventListener('DOMContentLoaded', init);
