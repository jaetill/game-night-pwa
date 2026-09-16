import { syncAndRender } from '../utils/index.js';
import { saveGameNights } from '../data/index.js';
import { tombstoneNight } from '../data/storage.js';
import { getCurrentUser } from '../auth/userStore.js';
import { btn, input } from '../ui/elements.js';
import { toastSuccess, toastError, toastInfo } from '../ui/toast.js';
import { DEBUG_MODE, API_BASE } from '../config.js';
import { authFetch } from '../utils/authFetch.js';
import { injectPreviewData, clearPreviewData, hasPreviewData } from '../utils/previewData.js';
import { resolveGuestKey, guestLabel } from '../utils/userDirectory.js';
import { getGroups, saveGroup } from '../auth/groups.js';
import { pendingGuests, removeGuests } from '../data/guests.js';
import { sendInviteEmail, addPlaceholder } from '../utils/invite.js';

import { renderGameNights } from './renderGameNights.js';
import { renderGameNightForm } from './renderGameNightForm.js';
import { openGameSelectionModal } from './gameSelectionModal.js';

export function renderHostGameControls(night, nights) {
  const container = document.createElement('div');
  container.className = 'space-y-3';
  const currentUser = getCurrentUser();

  // ── Add game ─────────────────────────────────────────────
  const addGameBtn = btn('＋ Add game', 'secondary');
  addGameBtn.onclick = () => {
    openGameSelectionModal({
      night,
      onSelect: game => {
        night.selectedGames = night.selectedGames || {};
        if (!night.selectedGames[game.id]) {
          night.selectedGames[game.id] = {
            maxPlayers:        game.maxPlayers || 4,
            title:             game.title,
            thumbnail:         game.thumbnail || '',
            signedUpPlayers:   [],
            interestedPlayers: [],
          };
          toastSuccess(`${game.title} added!`);
        }
        syncAndRender(nights);
      }
    });
  };
  container.appendChild(addGameBtn);

  // ── Invite by email ──────────────────────────────────────
  const inviteRow = document.createElement('div');
  inviteRow.className = 'flex gap-2 items-center';

  const inviteInput = input('Invite by email…');
  inviteInput.type = 'email';
  inviteInput.className = 'field flex-1 text-sm';

  // Save BEFORE calling /invite: the Lambda then finds our placeholder in
  // S3 (matched by email) and resolves it in place, so client and server
  // agree on the entry's id. Firing /invite first let the Lambda create
  // a second id that our own upload then overwrote.
  // Returns 'added' | 'none' | 'failed'. On failure the placeholders are
  // withdrawn so they are not silently uploaded (without an email) later.
  async function inviteAll(values, successMsg) {
    const added = values.filter(v => addPlaceholder(night, v, currentUser?.userId));
    if (added.length === 0) return 'none';
    night.lastModified = Date.now();
    try {
      await syncAndRender(nights);
    } catch {
      removeGuests(night, g => !g.response && added.includes(g.email || g.userId));
      toastError('Could not save the guest list. Try again.');
      return 'failed';
    }
    toastSuccess(successMsg(added));
    added.forEach(v => sendInviteEmail(night, v));
    return 'added';
  }

  const inviteBtn = btn('Invite', 'secondary');
  inviteBtn.onclick = async () => {
    const email = inviteInput.value.trim().toLowerCase();
    if (!email) return;
    if (!email.includes('@')) {
      toastError('Please enter a valid email address.');
      return;
    }

    const result = await inviteAll([email], () => `${email} invited!`);
    if (result === 'added') {
      inviteInput.value = '';
    } else if (result === 'none') {
      toastInfo(`${email} is already invited.`);
      inviteInput.value = '';
    }
  };

  inviteInput.addEventListener('keydown', e => { if (e.key === 'Enter') inviteBtn.click(); });

  inviteRow.appendChild(inviteInput);
  inviteRow.appendChild(inviteBtn);
  container.appendChild(inviteRow);

  // ── Pending guests (removable) ────────────────────────────
  // Only people who haven't answered are removable here — someone who has
  // responded is handled through their own RSVP.
  const removableGuests = pendingGuests(night.guests);

  if (removableGuests.length > 0) {
    const guestList = document.createElement('div');
    guestList.className = 'flex flex-wrap gap-2';

    removableGuests.forEach(g => {
      const display = guestLabel(g);
      const tag = document.createElement('span');
      tag.className = 'flex items-center gap-1 text-xs bg-gray-100 text-gray-700 rounded-full px-2 py-1';

      const label = document.createElement('span');
      label.textContent = display;
      if (g.email && display !== g.email) label.title = g.email;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = '×';
      removeBtn.className = 'text-gray-400 hover:text-red-500 font-bold leading-none';
      removeBtn.title = `Remove ${display}`;
      removeBtn.onclick = () => {
        removeGuests(night, x => x.id === g.id);
        night.lastModified = Date.now();
        syncAndRender(nights);
        toastInfo(`${display} removed.`);
      };

      tag.appendChild(label);
      tag.appendChild(removeBtn);
      guestList.appendChild(tag);
    });

    container.appendChild(guestList);
  }

  // ── Shared state used by both Saved groups and Recent guests ──
  // Every key a guest entry is known by (userId and email), plus emails
  // collapsed through resolveGuestKey so a group email and the same
  // person's signed-in userId count as one guest.
  const alreadyOnNight = new Set(
    (night.guests || []).flatMap(g => [g.userId, g.email, g.email && resolveGuestKey(g.email)].filter(Boolean))
  );

  // ── Saved groups ──────────────────────────────────────────
  const groups = getGroups().filter(g => g.emails.length > 0);
  if (groups.length > 0) {
    const groupSection = document.createElement('div');
    groupSection.className = 'border border-gray-200 rounded-xl overflow-hidden';

    const groupHeader = document.createElement('button');
    groupHeader.type = 'button';
    groupHeader.className = 'w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100';
    groupHeader.innerHTML = `<span>Saved groups</span><span class="text-gray-400 text-xs">▼</span>`;

    const groupBody = document.createElement('div');
    groupBody.className = 'hidden p-3 space-y-2';

    groupHeader.onclick = () => {
      const collapsed = groupBody.classList.toggle('hidden');
      groupHeader.querySelector('span:last-child').textContent = collapsed ? '▼' : '▲';
    };

    groups.forEach(group => {
      const newEmails = group.emails.filter(e => !alreadyOnNight.has(e) && !alreadyOnNight.has(resolveGuestKey(e)));

      const row = document.createElement('div');
      row.className = 'flex items-center justify-between gap-2';

      const label = document.createElement('span');
      label.className = 'text-sm text-gray-700';
      label.textContent = `${group.name}`;

      const countBadge = document.createElement('span');
      countBadge.className = 'text-xs text-gray-400';
      countBadge.textContent = newEmails.length === 0
        ? 'already invited'
        : `${newEmails.length} new`;

      const addGroupBtn = btn('Add all', 'secondary');
      addGroupBtn.className += ' text-xs';
      addGroupBtn.disabled = newEmails.length === 0;
      addGroupBtn.onclick = () => inviteAll(newEmails, added => `${added.length} from "${group.name}" invited — sending emails…`);

      const left = document.createElement('div');
      left.className = 'flex items-center gap-2 min-w-0';
      left.appendChild(label);
      left.appendChild(countBadge);

      row.appendChild(left);
      row.appendChild(addGroupBtn);
      groupBody.appendChild(row);
    });

    groupSection.appendChild(groupHeader);
    groupSection.appendChild(groupBody);
    container.appendChild(groupSection);
  }

  // ── Recent guests ─────────────────────────────────────────
  // Everyone who has been on one of my other nights, keyed by userId when
  // known (else email). Anonymous plus-ones are skipped — nothing to invite.
  const guestMap = new Map(); // value → { value, label }
  for (const n of nights) {
    if (n.id === night.id || n.hostUserId !== currentUser?.userId) continue;
    for (const g of (n.guests || [])) {
      const key = g.userId || (g.email ? resolveGuestKey(g.email) : null);
      if (!key || key === currentUser?.userId) continue;
      if (alreadyOnNight.has(key) || guestMap.has(key)) continue;
      guestMap.set(key, { value: key, label: key.includes('@') ? key : guestLabel({ ...g, userId: key }) });
    }
  }

  const guests = [...guestMap.values()];
  if (guests.length > 0) {
    const section = document.createElement('div');
    section.className = 'border border-gray-200 rounded-xl overflow-hidden';

    // Header toggle
    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100';
    header.innerHTML = `<span>Recent guests</span><span class="text-gray-400 text-xs">▼</span>`;

    const body = document.createElement('div');
    body.className = 'hidden p-3 space-y-2';

    header.onclick = () => {
      const collapsed = body.classList.toggle('hidden');
      header.querySelector('span:last-child').textContent = collapsed ? '▼' : '▲';
    };

    // Select all / Uncheck all
    const bulkRow = document.createElement('div');
    bulkRow.className = 'flex gap-3 mb-1';
    const selectAllBtn = document.createElement('button');
    selectAllBtn.type = 'button';
    selectAllBtn.textContent = 'Select all';
    selectAllBtn.className = 'text-xs text-amber-700 hover:underline';
    const uncheckAllBtn = document.createElement('button');
    uncheckAllBtn.type = 'button';
    uncheckAllBtn.textContent = 'Uncheck all';
    uncheckAllBtn.className = 'text-xs text-gray-400 hover:underline';
    bulkRow.appendChild(selectAllBtn);
    bulkRow.appendChild(uncheckAllBtn);
    body.appendChild(bulkRow);

    // Checkboxes
    const checkboxes = [];
    guests.forEach(guest => {
      const row = document.createElement('label');
      row.className = 'flex items-center gap-2 text-sm text-gray-700 cursor-pointer';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = guest.value;
      cb.className = 'rounded';
      checkboxes.push(cb);

      row.appendChild(cb);
      row.appendChild(document.createTextNode(guest.label));
      body.appendChild(row);
    });

    selectAllBtn.onclick  = () => checkboxes.forEach(cb => cb.checked = true);
    uncheckAllBtn.onclick = () => checkboxes.forEach(cb => cb.checked = false);

    // Add selected button
    const addBtn = btn('Add selected', 'secondary');
    addBtn.className += ' text-xs mt-2';
    addBtn.onclick = () => {
      const selected = checkboxes.filter(cb => cb.checked).map(cb => cb.value);
      if (selected.length === 0) return;

      // Recent guests are stored as userIds — the Lambda resolves the email.
      inviteAll(selected, added => `${added.length} guest${added.length > 1 ? 's' : ''} invited — sending emails…`);
    };

    body.appendChild(addBtn);

    // Save checked guests as a new group
    const saveAsGroupBtn = document.createElement('button');
    saveAsGroupBtn.type = 'button';
    saveAsGroupBtn.textContent = 'Save as group…';
    saveAsGroupBtn.className = 'text-xs text-amber-700 hover:underline mt-1';
    saveAsGroupBtn.onclick = async () => {
      const selected = checkboxes.filter(cb => cb.checked).map(cb => cb.value).filter(v => v.includes('@'));
      if (selected.length === 0) {
        toastError('Check at least one email address to save as a group.');
        return;
      }
      const name = prompt('Group name (e.g. "Regular Group"):');
      if (!name?.trim()) return;
      try {
        await saveGroup(name.trim(), selected);
        toastSuccess(`Group "${name.trim()}" saved.`);
      } catch {
        toastError('Could not save group.');
      }
    };
    body.appendChild(saveAsGroupBtn);

    section.appendChild(header);
    section.appendChild(body);
    container.appendChild(section);
  }

  return container;
}

export function renderHostActions(night, nights) {
  const container = document.createElement('div');
  container.className = 'flex flex-wrap gap-2 pt-2';

  const editBtn = btn('Edit event', 'secondary');
  editBtn.onclick = () => {
    renderGameNightForm({
      night,
      onSave: async updated => {
        const idx = nights.findIndex(n => n.id === updated.id);
        if (idx !== -1) nights[idx] = updated;
        await saveGameNights(nights);
        renderGameNights(nights, getCurrentUser());
        toastSuccess('Event updated!');
      }
    });
  };

  const cancelBtn = btn('Cancel event', 'danger');
  cancelBtn.onclick = async () => {
    if (!confirm('Cancel this game night? This cannot be undone.')) return;
    cancelBtn.disabled = true;
    try {
      // Tombstone instead of removing — other clients still have this night
      // in localStorage, and a tombstone is the only way their merge learns
      // about the deletion instead of resurrecting the night.
      const idx = nights.findIndex(n => n.id === night.id);
      if (idx !== -1) nights[idx] = tombstoneNight(night);
      await saveGameNights(nights);
      renderGameNights(nights, getCurrentUser());
      toastInfo('Event cancelled.');
    } catch (err) {
      toastError('Could not cancel event.');
      cancelBtn.disabled = false;
    }
  };

  // ── Nudge non-responders ─────────────────────────────────
  // Anonymous plus-ones have nowhere to send a nudge; count only reachable people.
  const nonResponders = pendingGuests(night.guests).filter(g => g.userId || g.email);

  const nudgeBtn = btn(`Nudge non-responders (${nonResponders.length})`, 'secondary');
  nudgeBtn.disabled = nonResponders.length === 0;
  if (nonResponders.length === 0) nudgeBtn.title = 'Everyone has responded';

  nudgeBtn.onclick = async () => {
    nudgeBtn.disabled = true;
    nudgeBtn.textContent = 'Sending…';
    try {
      const res = await authFetch(`${API_BASE}/nudge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nightId: night.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      toastSuccess(`Nudge sent to ${data.sent} ${data.sent === 1 ? 'person' : 'people'}!`);
    } catch (e) {
      console.error('Nudge failed:', e);
      toastError('Could not send nudge. Try again.');
    } finally {
      nudgeBtn.disabled = nonResponders.length === 0;
      nudgeBtn.textContent = `Nudge non-responders (${nonResponders.length})`;
    }
  };

  container.appendChild(nudgeBtn);
  container.appendChild(editBtn);
  container.appendChild(cancelBtn);

  if (DEBUG_MODE) {
    const previewBtn = btn(
      hasPreviewData(night) ? '🧹 Clear preview' : '👥 Preview with fake guests',
      'ghost'
    );
    previewBtn.className += ' text-xs w-full';
    previewBtn.onclick = () => {
      if (hasPreviewData(night)) {
        clearPreviewData(night);
        toastInfo('Preview data cleared.');
      } else {
        injectPreviewData(night);
        toastSuccess('Preview data injected — not saved to cloud.');
      }
      // Render only — the old syncAndRender call uploaded the fake guests to
      // the cloud, contradicting the toast.
      renderGameNights(nights, getCurrentUser());
    };
    container.appendChild(previewBtn);
  }

  return container;
}
