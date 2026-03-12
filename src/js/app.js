import { loadGameNights, fetchOwnedGames } from './data/index.js';
import { renderApp } from './components/render.js';
import { setCurrentUser } from './auth/userStore.js';
import { loadProfile } from './auth/profile.js';
import { toastError } from './ui/toast.js';

import { Amplify, Auth, Hub } from 'aws-amplify';
import amplifyConfig from './config.js';

Amplify.configure(amplifyConfig);

Hub.listen('auth', ({ payload }) => {
  console.log(`[Auth] ${payload.event}`);
});

async function init() {
  try {
    const cognitoUser = await Auth.currentAuthenticatedUser();

    // Store identity so all components can call getCurrentUser()
    setCurrentUser({
      userId:      cognitoUser.username,
      name:        cognitoUser.attributes?.name || cognitoUser.username,
      email:       cognitoUser.attributes?.email || '',
      bggUsername: '',
    });

    // Load profile (BGG username, contact info) — may sync from Cognito attributes
    await loadProfile();

    const [nights] = await Promise.all([
      loadGameNights(),
      fetchOwnedGames(cognitoUser.username),
    ]);

    renderApp({ nights, currentUser: { userId: cognitoUser.username, name: cognitoUser.attributes?.name || cognitoUser.username } });
  } catch (err) {
    console.error('Init failed:', err);
    toastError('Something went wrong loading the app.');
  }
}

window.addEventListener('DOMContentLoaded', init);
