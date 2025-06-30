import { loadGameNights, fetchOwnedGames } from './data/index.js';
import { renderApp } from './components/render.js';
import { setupEventListeners } from './events/events.js';
import { Amplify } from 'aws-amplify';
//import  Auth  from '@aws-amplify/auth';


//Amplify.addPluggable(Auth);

// 🔧 Configure Amplify Auth (you can also hardcode config inline if not using aws-exports.js)
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
// This configuration sets up Amplify Auth with the necessary parameters for your Cognito User Pool and OAuth settings.
// This function handles the login process by redirecting to the hosted UI
// and is called when the user clicks the login button.
// If you are using aws-exports.js, you can import it directly
// and pass it to Amplify.configure() instead of hardcoding the config.

const handleLogin = () => {
  Auth.federatedSignIn(); // This takes the user to the hosted UI
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
    Auth.federatedSignIn(); // Redirects to hosted UI
  }
}

window.addEventListener('DOMContentLoaded', init);
