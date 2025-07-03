import { loadGameNights, fetchOwnedGames } from './data/index.js';
import { renderApp } from './components/render.js';
import { setupEventListeners } from './events/events.js';

import { Amplify, Auth, Hub } from 'aws-amplify';
import amplifyConfig from './config.js';

console.log('🔍 Bootstrapping app…');

// Initialize Amplify
Amplify.configure(amplifyConfig);

// Optional: listen for auth events
Hub.listen('auth', ({ payload }) => {
  console.log(`[Hub] Auth event: ${payload.event}`, payload);
});

async function init() {
  try {
    const user = await Auth.currentAuthenticatedUser();
    console.log('✅ Authenticated user:', user);

    const nights = await loadGameNights();
    await fetchOwnedGames(user.username);

    renderApp({ nights, currentUser: user });
    setupEventListeners();
  } catch (err) {
    console.error('❌ Failed to initialize app:', err);
    // If something went wrong here, session-check.js should’ve already redirected
  }
}

window.addEventListener('DOMContentLoaded', init);
