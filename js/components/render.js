import { renderGameNights } from './renderGameNights.js';
import { renderGlobalHostPanel } from './renderGlobalHostPanel.js';
import { getCurrentUser } from '../auth/auth.js';

export function renderApp({ nights, currentUser }) {
  const root = document.getElementById('app');
  if (!root) {
    console.error('No #app element found in DOM.');
    return;
  }

  root.innerHTML = '';
  renderRoleToggle(root);

  const listContainer = document.createElement('ul');
  listContainer.id = 'gameNightList';
  root.appendChild(listContainer);

  renderGameNights(nights, currentUser);

  renderGlobalHostPanel();

}

// This function initializes the app by rendering the game nights and admin panel if applicable
// It checks for the existence of the root element and appends the game night list to it

function renderRoleToggle(root) {
  const wrapper = document.createElement('div');
  wrapper.style.marginBottom = '1em';

  const label = document.createElement('label');
  label.textContent = 'Viewing as: ';

  const select = document.createElement('select');
  ['user', 'admin'].forEach(role => {
    const option = document.createElement('option');
    option.value = role;
    option.textContent = role;
    select.appendChild(option);
  });

  select.value = localStorage.getItem('devRole') || 'admin';

  select.addEventListener('change', () => {
    localStorage.setItem('devRole', select.value);
    location.reload(); // Reload to rehydrate currentUser with new role
  });

  label.appendChild(select);
  wrapper.appendChild(label);
  root.prepend(wrapper);
}