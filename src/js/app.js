import { loadGameNights, fetchOwnedGames } from './data/index.js';
import { renderApp } from './components/render.js';
import { setupEventListeners } from './events/events.js';

import { Amplify, Auth, Hub } from 'aws-amplify';

console.log('🔍 Starting app…', { search: window.location.search });

// Hub logger
Hub.listen('auth', ({ payload }) => {
  console.log(`[Hub]`, payload.event, payload);
});

// Amplify config
Amplify.configure({
  Auth: {
    region: 'us-east-2',
    userPoolId: 'us-east-2_xneeJzaDJ',
    userPoolWebClientId: '7rk583gdoculg0fupv594s53r9',
    oauth: {
      domain: 'us-east-2xneejzadj.auth.us-east-2.amazoncognito.com',
      scope: ['openid','email','profile'],
      redirectSignIn: 'https://jaetill.github.io/game-night-pwa/login',
      redirectSignOut: 'https://jaetill.github.io/game-night-pwa/logout',
      responseType: 'code'
    }
  }
});

const isCallback = /[?&]code=/.test(window.location.search);

const handleLogin = () => {
  console.log('📤 federatedSignIn() → redirecting to Cognito Hosted UI');

  // Remove framework-specific query params before redirect
  if (window.location.search.includes('_data=')) {
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
  }


  Auth.federatedSignIn();
};

async function init() {
  console.log('🚦 init()', { isCallback });
  document.getElementById('login-button')
          .addEventListener('click', handleLogin);

  // 1) If we’re on a code=… callback URL, try to settle the session
  if (isCallback) {
    console.log('⏳ Detected OAuth callback – exchanging code for tokens…');
    try {
      const user = await Auth.currentAuthenticatedUser();
      window.location.href = '/game-night-pwa/';
      console.log('✅ Session restored from callback:', user);

    } catch (err) {
      console.error('❌ Callback handling failed, redirecting again:', err);
      handleLogin();
      return;
    }
  }

  // 2) Regular path: check if already signed in
  try {
    const user = await Auth.currentAuthenticatedUser();
    console.log('✅ Already authenticated:', user);

    const nights = await loadGameNights();
    await fetchOwnedGames(user.username);
    renderApp({ nights, currentUser: user });
    setupEventListeners();
  } catch (err) {
    console.warn('⚠️ Not authenticated yet:', err);
    // Only redirect if we’re not in a callback
    if (!isCallback) {
      handleLogin();
    }
  }
}

window.addEventListener('DOMContentLoaded', init);
