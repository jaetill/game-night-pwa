// Wires up header buttons. Auth gate itself lives in app.js — by the time this
// runs we already know the user is authenticated and in `game-night-users`.

import { logout } from '../auth.js';
import { openProfileModal } from '../components/renderProfileModal.js';

const authButton    = document.getElementById('auth-button');
const profileButton = document.getElementById('profile-button');

if (authButton) {
  authButton.textContent = 'Log Out';
  authButton.onclick = () => logout();
}
if (profileButton) {
  profileButton.onclick = () => openProfileModal();
}
