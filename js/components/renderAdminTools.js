import { renderAdminGameControls } from './renderAdminPartials.js';
import { renderAdminActions } from './renderAdminPartials.js';

export function renderAdminTools(night, nights) {
  const wrapper = document.createElement('div');
  wrapper.appendChild(renderAdminGameControls(night));
  wrapper.appendChild(renderAdminActions(night, nights));
  return wrapper;
}
// This function combines the admin controls and actions into a single UI component
// It allows admins to manage game selections and perform actions like editing or canceling game nights