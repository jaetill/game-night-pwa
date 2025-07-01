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
      scope: ['openid', 'email', 'profile'],
      redirectSignIn: 'https://jaetill.github.io/game-night-pwa/login',
      redirectSignOut: 'https://jaetill.github.io/game-night-pwa/logout',
      responseType: 'code'
    }
  }
});

const isCallback = /[?&]code=/.test(window.location.search);
const hasError  = /[?&]error=/.test(window.location.search);

//const handleLogin = () => {
  //console.log('📤 federatedSignIn() → redirecting to Cognito Hosted UI');

  // 🧼 Clean up framework query params (e.g. Remix)
  //const url = new URL(window.location.href);
  //if (url.searchParams.has('_data')) {
    //url.searchParams.delete('_data');
    //window.history.replaceState({}, document.title, url.pathname);
  //}

  //Auth.federatedSignIn();
//};
const handleLogin = () => {
  console.log('🔁 Redirecting to launch-login.html to sanitize context');
  window.location.href = '/game-night-pwa/launch-login.html';
};



async function init() {
  console.log('🚦 init()', { isCallback });

  const loginBtn = document.getElementById('login-button');
  if (loginBtn) {
    loginBtn.addEventListener('click', handleLogin);
  }

  // 🚫 Bail out early if redirected here with an error
  if (hasError) {
    const params = new URLSearchParams(window.location.search);
    console.error('🚨 OAuth error:', params.get('error'), params.get('error_description'));
    if (loginBtn) loginBtn.style.display = 'inline-block';
    return;
  }

  // ✅ If we're on a code=… callback, settle the session
  if (isCallback) {
    console.log('⏳ Detected OAuth callback – exchanging code for tokens…');
    try {
      const user = await Auth.currentAuthenticatedUser();
      console.log('✅ Session restored from callback:', user);

      // 🎯 Redirect to main app after login
      window.location.href = '/game-night-pwa/';
      return;
    } catch (err) {
      console.error('❌ Callback handling failed:', err);
      if (loginBtn) loginBtn.style.display = 'inline-block';
      return;
    }
  }

  // 🔁 Regular app load: check if already signed in
  try {
    const user = await Auth.currentAuthenticatedUser();
    console.log('✅ Already authenticated:', user);

    const nights = await loadGameNights();
    await fetchOwnedGames(user.username);
    renderApp({ nights, currentUser: user });
    setupEventListeners();
  } catch (err) {
    console.warn('⚠️ Not authenticated yet:', err);
    // Show login button if it exists
    if (loginBtn) loginBtn.style.display = 'inline-block';
  }
}

window.addEventListener('DOMContentLoaded', init);
