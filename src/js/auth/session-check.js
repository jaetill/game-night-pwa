import { Amplify, Auth } from 'aws-amplify';
import amplifyConfig from '../config.js';
import { openProfileModal } from '../components/renderProfileModal.js';

Amplify.configure(amplifyConfig);

const authButton    = document.getElementById('auth-button');
const profileButton = document.getElementById('profile-button');

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

  if (profileButton) profileButton.onclick = () => openProfileModal();
} catch {
  window.location.href = 'login.html';
}
