import { withdrawFromAllGames } from '../utils/index.js';
import { getCurrentUser } from '../auth/userStore.js';
import { saveGameNights } from '../data/index.js';
import { renderGameNights } from './renderGameNights.js';
import { sanitizeNight } from '../data/storage.js';
import { DEBUG_MODE } from '../config.js';
import { getDisplayName } from '../utils/userDirectory.js';
import { btn } from '../ui/elements.js';
import { toastSuccess, toastError } from '../ui/toast.js';

export function renderRSVP(night, nights, currentUser) {
  const wrapper = document.createElement('div');
  currentUser = currentUser || getCurrentUser();
  if (!currentUser) return wrapper;

  const { userId, email } = currentUser;
  const alreadyRSVPd    = night.rsvps?.some(r => r.userId === userId);
  const alreadyDeclined = night.declined?.includes(userId);
  const isInvited       = night.invited?.includes(userId) ||
                          (email && night.invited?.includes(email.toLowerCase()));

  const section = document.createElement('div');
  section.className = 'space-y-3';

  // ── Action buttons ───────────────────────────────────────
  if (isInvited && !alreadyRSVPd && !alreadyDeclined) {
    const actions = document.createElement('div');
    actions.className = 'flex flex-wrap gap-2';

    async function doRSVP(type, btnEl, label) {
      btnEl.disabled = true;
      btnEl.textContent = 'Saving…';
      try {
        night.rsvps = Array.isArray(night.rsvps) ? night.rsvps : [];
        night.rsvps.push({ userId, name: currentUser.name || currentUser.userId, type });
        if (email) night.invited = (night.invited || []).filter(e => e !== email.toLowerCase());
        night.lastModified = Date.now();
        sanitizeNight(night);
        await saveGameNights(nights);
        renderGameNights(nights, currentUser);
        toastSuccess(label);
      } catch {
        toastError('Could not save RSVP. Try again.');
        btnEl.disabled = false;
        btnEl.textContent = label;
      }
    }

    const playingBtn = btn("Reserve a seat", 'primary');
    playingBtn.onclick = () => doRSVP('playing', playingBtn, "Reserve a seat");

    const flexBtn = btn("Fill in gaps", 'secondary');
    flexBtn.onclick = () => doRSVP('flexible', flexBtn, "Fill in gaps");

    const specBtn = btn('Just hang out', 'secondary');
    specBtn.onclick = () => doRSVP('spectating', specBtn, 'Just hang out');

    const declineBtn = btn("Can't make it", 'ghost');
    declineBtn.onclick = async () => {
      declineBtn.disabled = true;
      try {
        night.declined = Array.isArray(night.declined) ? night.declined : [];
        night.declined.push(userId);
        if (email) night.invited = (night.invited || []).filter(e => e !== email.toLowerCase());
        night.lastModified = Date.now();
        sanitizeNight(night);
        await saveGameNights(nights);
        renderGameNights(nights, currentUser);
        toastInfo("Marked as not attending.");
      } catch {
        toastError('Could not save. Try again.');
        declineBtn.disabled = false;
      }
    };

    actions.appendChild(playingBtn);
    actions.appendChild(flexBtn);
    actions.appendChild(specBtn);
    actions.appendChild(declineBtn);
    section.appendChild(actions);
  }

  // ── Attendee list ────────────────────────────────────────
  if (Array.isArray(night.rsvps) && night.rsvps.length > 0) {
    const groups = [
      { type: 'playing',    heading: 'Reserved a seat' },
      { type: 'flexible',   heading: 'Filling in gaps' },
      { type: 'spectating', heading: 'Just hanging out' },
    ];

    function makeCancelBtn() {
      const cancelBtn = btn('Cancel RSVP', 'danger');
      cancelBtn.className += ' text-xs py-0.5 px-2';
      cancelBtn.onclick = async () => {
        cancelBtn.disabled = true;
        try {
          night.rsvps = night.rsvps.filter(r => r.userId !== userId);
          withdrawFromAllGames(night, currentUser);
          night.lastModified = Date.now();
          sanitizeNight(night);
          await saveGameNights(nights);
          renderGameNights(nights, currentUser);
          toastInfo('RSVP cancelled.');
        } catch {
          toastError('Could not cancel. Try again.');
          cancelBtn.disabled = false;
        }
      };
      return cancelBtn;
    }

    for (const { type, heading } of groups) {
      const members = night.rsvps.filter(r => (r.type ?? 'playing') === type);
      if (members.length === 0) continue;

      const groupLabel = document.createElement('span');
      groupLabel.className = 'section-label';
      groupLabel.textContent = heading;
      section.appendChild(groupLabel);

      const list = document.createElement('ul');
      list.className = 'space-y-1 pl-3';

      members.forEach(rsvp => {
        const item = document.createElement('li');
        item.className = 'flex items-center justify-between text-sm';

        const name = document.createElement('span');
        name.className = 'text-gray-700';
        name.textContent = rsvp.name || getDisplayName(rsvp.userId);
        item.appendChild(name);

        if (rsvp.userId === userId) item.appendChild(makeCancelBtn());

        list.appendChild(item);
      });

      section.appendChild(list);
    }
  }

  // ── Pending invites ──────────────────────────────────────
  // An entry is still pending if it hasn't been acted on.
  // Entries can be userIds or email addresses — check both forms.
  const pending = (night.invited || []).filter(id =>
    !night.rsvps?.some(r => r.userId === id) &&
    !night.declined?.includes(id)
  );

  if (pending.length > 0) {
    const label = document.createElement('span');
    label.className = 'section-label';
    label.textContent = 'Awaiting reply';
    section.appendChild(label);

    const pendingDiv = document.createElement('div');
    pendingDiv.className = 'flex flex-wrap gap-1';
    pending.forEach(id => {
      const chip = document.createElement('span');
      chip.className = 'text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full';
      chip.textContent = getDisplayName(id);
      pendingDiv.appendChild(chip);

      if (DEBUG_MODE) {
        const removeBtn = btn('×', 'ghost');
        removeBtn.className += ' text-xs py-0 px-1';
        removeBtn.onclick = () => {
          night.invited = night.invited.filter(uid => uid !== id);
          night.lastModified = Date.now();
          renderGameNights(nights, currentUser);
        };
        chip.appendChild(removeBtn);
      }
    });
    section.appendChild(pendingDiv);
  }

  wrapper.appendChild(section);
  return wrapper;
}
