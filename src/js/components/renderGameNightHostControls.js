import { openGameSelectionModal } from './gameSelectionModal.js';
import { syncAndRender } from '../utils/index.js';
import { saveGameNights } from '../data/index.js';
import { renderGameNightForm } from './renderGameNightForm.js';
import { getCurrentUser } from '../auth/userStore.js';
import { renderGameNights } from './renderGameNights.js';
import { btn, input } from '../ui/elements.js';
import { toastSuccess, toastError, toastInfo } from '../ui/toast.js';
import { DEBUG_MODE } from '../config.js';
import { injectPreviewData, clearPreviewData, hasPreviewData } from '../utils/previewData.js';
import { getDisplayName } from '../utils/userDirectory.js';
import { authFetch } from '../utils/authFetch.js';

const API_BASE = 'https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod';

export function renderHostGameControls(night, nights) {
  const container = document.createElement('div');
  container.className = 'space-y-3';

  // ── Add game ─────────────────────────────────────────────
  const addGameBtn = btn('＋ Add game', 'secondary');
  addGameBtn.onclick = () => {
    openGameSelectionModal({
      night,
      onSelect: game => {
        night.selectedGames = night.selectedGames || {};
        if (!night.selectedGames[game.id]) {
          night.selectedGames[game.id] = {
            maxPlayers: game.maxPlayers || 4,
            signedUpPlayers: [],
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

  const inviteBtn = btn('Invite', 'secondary');
  inviteBtn.onclick = () => {
    const email = inviteInput.value.trim().toLowerCase();
    if (!email) return;
    if (!email.includes('@')) {
      toastError('Please enter a valid email address.');
      return;
    }

    night.invited = night.invited || [];
    const already = night.rsvps?.some(r => r.userId === email) ||
                    night.invited.includes(email);
    if (!already) {
      night.invited.push(email);
      night.lastModified = Date.now();
      inviteInput.value = '';
      syncAndRender(nights);
      toastSuccess(`${email} invited!`);
      // Send invite email (fire-and-forget — don't block on failure)
      authFetch(`${API_BASE}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nightId: night.id, action: 'invite', email }),
      }).then(async res => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.warn('Invite email failed:', err.error || res.status);
        }
      }).catch(e => console.warn('Invite email error:', e.message));
    } else {
      toastInfo(`${email} is already invited.`);
      inviteInput.value = '';
    }
  };

  inviteInput.addEventListener('keydown', e => { if (e.key === 'Enter') inviteBtn.click(); });

  inviteRow.appendChild(inviteInput);
  inviteRow.appendChild(inviteBtn);
  container.appendChild(inviteRow);

  // ── Recent guests ─────────────────────────────────────────
  const currentUser = getCurrentUser();
  const alreadyOnNight = new Set([
    ...(night.invited || []),
    ...(night.rsvps   || []).map(r => r.userId),
  ]);

  const guestMap = new Map(); // value → { value, label }
  for (const n of nights) {
    if (n.id === night.id || n.hostUserId !== currentUser?.userId) continue;
    for (const email of (n.invited || [])) {
      if (email.includes('@') && !alreadyOnNight.has(email) && !guestMap.has(email)) {
        guestMap.set(email, { value: email, label: email });
      }
    }
    for (const rsvp of (n.rsvps || [])) {
      if (rsvp.userId === currentUser?.userId) continue;
      if (!alreadyOnNight.has(rsvp.userId) && !guestMap.has(rsvp.userId)) {
        guestMap.set(rsvp.userId, {
          value: rsvp.userId,
          label: rsvp.name || getDisplayName(rsvp.userId),
        });
      }
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

      night.invited = night.invited || [];
      const added = [];
      for (const val of selected) {
        if (!night.invited.includes(val)) {
          night.invited.push(val);
          added.push(val);
        }
      }
      if (added.length > 0) {
        night.lastModified = Date.now();
        syncAndRender(nights);
        toastSuccess(`${added.length} guest${added.length > 1 ? 's' : ''} invited!`);
      }
    };

    body.appendChild(addBtn);
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
      const updated = nights.filter(n => n.id !== night.id);
      syncAndRender(updated);
      await saveGameNights(updated);
      toastInfo('Event cancelled.');
    } catch (err) {
      toastError('Could not cancel event.');
      cancelBtn.disabled = false;
    }
  };

  // ── Nudge non-responders ─────────────────────────────────
  const rsvpdIds    = new Set((night.rsvps    || []).map(r => r.userId));
  const declinedIds = new Set(night.declined  || []);
  const nonResponders = (night.invited || []).filter(id => !rsvpdIds.has(id) && !declinedIds.has(id));

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
      syncAndRender(nights);
    };
    container.appendChild(previewBtn);
  }

  return container;
}
