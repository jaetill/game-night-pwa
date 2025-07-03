import { Amplify, Auth } from 'aws-amplify';
import amplifyConfig from '../config.js'; // See suggestion below 👇

Amplify.configure(amplifyConfig);

const authButton = document.getElementById('auth-button');

try {
  await Auth.currentAuthenticatedUser();
  authButton.textContent = 'Log Out';
  authButton.onclick = async () => {
    try {
      await Auth.signOut();
      window.location.href = 'login.html';
    } catch (error) {
      console.error('❌ Sign-out error:', error);
    }
  };
} catch {
  window.location.href = 'login.html';
}
