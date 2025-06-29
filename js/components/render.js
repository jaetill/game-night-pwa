import { renderGameNights } from './renderGameNights.js';
import { renderGlobalHostPanel } from './renderGlobalHostPanel.js';
import { getCurrentUser, setCurrentUser } from '../auth/userStore.js';

export function renderApp({ nights, currentUser }) {
  const root = document.getElementById('app');
  if (!root) {
    console.error('No #app element found in DOM.');
    return;
  }

  root.innerHTML = '';
  renderUserSelector(root);

  const listContainer = document.createElement('ul');
  listContainer.id = 'gameNightList';
  root.appendChild(listContainer);

  renderGameNights(nights, currentUser);

  renderGlobalHostPanel();

}

// This function initializes the app by rendering the game nights and admin panel if applicable
// It checks for the existence of the root element and appends the game night list to it

// renderUserSelector.js


export function renderUserSelector(root) {
  const wrapper = document.createElement('div');
  wrapper.style.marginBottom = '1em';

  const label = document.createElement('label');
  label.textContent = '👤 Active User: ';

  const input = document.createElement('input');
  input.placeholder = 'e.g. jaetill';
  input.value = getCurrentUser()?.userId || '';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Switch';

  saveBtn.onclick = () => {
    const userId = input.value.trim();
    if (userId) {
      setCurrentUser({ userId, name: userId });
      location.reload(); // refresh with new context
    }
  };

  wrapper.appendChild(label);
  wrapper.appendChild(input);
  wrapper.appendChild(saveBtn);
  root.prepend(wrapper);
}
