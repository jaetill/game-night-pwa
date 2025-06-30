import { renderSelectedGames } from './renderSelectedGames.js';
import { renderRSVP } from './renderRSVP.js';
import { renderSuggestions } from './renderSuggestions.js';
import { renderHostGameControls, renderHostActions } from './renderGameNightHostControls.js';
import { isHost, getUserNightRole } from '../auth/permissions.js';
/**
 * Renders a list of game nights with RSVP, suggestions, and admin controls.
 * @param {Array} nights - Array of game night objects.
 * @param {Object} currentUser - The current user object.
 */


export function renderGameNights(nights, currentUser) {
  //Testing block until invites come online
  //TODO: remove this block when invites are implemented
  nights.forEach(night => {
    night.invited = night.invited || [];

    const isHostUser = night.hostUserId === currentUser.userId;
    const isRsvpd = night.rsvps?.some(r => r.userId === currentUser.userId);
    const alreadyInvited = night.invited.includes(currentUser.userId);

    if (!isHostUser && !isRsvpd && !alreadyInvited) {
      night.invited.push(currentUser.userId); // 🔧 stub: treat current user as invited
    }
  });




  const container = document.getElementById('gameNightList');
  container.innerHTML = '';

  nights.forEach(night => {
    const li = document.createElement('li');
    li.className = 'game-card';

    const header = document.createElement('h3');
    header.textContent = `${night.date} @ ${night.time}`;
    li.appendChild(header);

    const hostInfo = document.createElement('p');
    hostInfo.textContent = `Host: ${night.hostUserId}`;

    const badgeText = getUserNightRole(night, currentUser);
    if (badgeText) {
      const badge = document.createElement('span');
      badge.className = `user-role-badge ${badgeText}`; // Note: adds class for per-role styling
      badge.textContent = badgeText;
      hostInfo.appendChild(badge);
    }

    li.appendChild(hostInfo);



    const snacks = document.createElement('p');
    snacks.textContent = `Snacks: ${night.snacks || 'None'}`;
    li.appendChild(snacks);

    const rsvpUI = renderRSVP(night, nights);
    li.appendChild(rsvpUI);

    const suggestionsUI = renderSuggestions(night, nights);
    li.appendChild(suggestionsUI);

    if (Object.keys(night.selectedGames).length > 0) {
      const selectedGamesUI = renderSelectedGames(night, currentUser, nights);
      li.appendChild(selectedGamesUI);
    }

    if (isHost(currentUser, night)) {
      li.appendChild(renderHostGameControls(night, nights));
      li.appendChild(renderHostActions(night, nights));
    }

    container.appendChild(li);
 }); 
}
