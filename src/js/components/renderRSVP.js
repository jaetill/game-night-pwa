import { withdrawFromAllGames } from '../utils/index.js';
import { getCurrentUser } from '../auth/userStore.js';
import { saveGameNights } from '../data/index.js';
import {
  findGuest, claimGuest, newGuest, respond, playerKey, pendingGuests, declinedGuests, guestsOfType,
  plusOnesOf, isPlusOne, removeGuests, isAttending,
} from '../data/guests.js';
import { DEBUG_MODE } from '../config.js';
import { getDisplayName, guestLabel } from '../utils/userDirectory.js';
import { sendInviteEmail, addPlaceholder } from '../utils/invite.js';
import { btn, input } from '../ui/elements.js';
import { toastSuccess, toastError, toastInfo } from '../ui/toast.js';

import { renderGameNights } from './renderGameNights.js';

// Attendance is night.guests[] (ADR-0021). The current user's own entry is
// found by userId (or by the email their invite went to, on first contact —
// findGuest fills the userId in). Responding sets `response`; it never
// removes anyone from the list.

function myEntry(night, currentUser) {
  // Read-only lookup for rendering; the write paths claim the entry.
  return findGuest(night.guests, { userId: currentUser.userId, email: currentUser.email });
}

/** Remove the sponsor's anonymous plus-ones and free any seats they held. */
function dropMyPlusOnes(night, sponsorUserId) {
  const dropped = removeGuests(night, g => isPlusOne(g) && g.invitedBy === sponsorUserId);
  for (const d of dropped) withdrawFromAllGames(night, { userId: playerKey(d) });
  return dropped.length;
}

export function renderRSVP(night, nights, currentUser) {
  const wrapper = document.createElement('div');
  currentUser = currentUser || getCurrentUser();
  if (!currentUser) return wrapper;

  const me = myEntry(night, currentUser);
  const isHost = night.hostUserId === currentUser.userId;

  const section = document.createElement('div');
  section.className = 'space-y-3';

  // ── Action buttons — shown to anyone on the list who hasn't answered ──
  // (the host is implicitly on the list; the form adds them as playing)
  if ((me || isHost) && !me?.response) {
    const actions = document.createElement('div');
    actions.className = 'flex flex-wrap gap-2';

    async function answer(type, btnEl, label, toast) {
      btnEl.disabled = true;
      btnEl.textContent = 'Saving…';
      try {
        // Claim fills in userId/name on an email-only invite (first contact).
        let entry = claimGuest(night.guests, { userId: currentUser.userId, email: currentUser.email, name: currentUser.name });
        if (!entry && isHost) {
          entry = newGuest({ userId: currentUser.userId, name: currentUser.name, email: currentUser.email, invitedBy: currentUser.userId });
          night.guests.push(entry);
        }
        respond(entry, type);
        if (type === 'declined') {
          withdrawFromAllGames(night, currentUser);
          dropMyPlusOnes(night, currentUser.userId);
        }
        night.lastModified = Date.now();
        await saveGameNights(nights);
        renderGameNights(nights, currentUser);
        toast(label);
      } catch {
        toastError('Could not save RSVP. Try again.');
        btnEl.disabled = false;
        btnEl.textContent = label;
      }
    }

    const playingBtn = btn('Reserve a seat', 'primary');
    playingBtn.onclick = () => answer('playing', playingBtn, 'Reserve a seat', toastSuccess);

    const anyGameBtn = btn('Put me in a game', 'secondary');
    anyGameBtn.onclick = () => answer('any_game', anyGameBtn, 'Put me in a game', toastSuccess);

    const ifNeededBtn = btn("I'll play if needed", 'secondary');
    ifNeededBtn.onclick = () => answer('if_needed', ifNeededBtn, "I'll play if needed", toastSuccess);

    const specBtn = btn('Just hang out', 'secondary');
    specBtn.onclick = () => answer('spectating', specBtn, 'Just hang out', toastSuccess);

    const declineBtn = btn("Can't make it", 'ghost');
    declineBtn.onclick = () => answer('declined', declineBtn, "Can't make it", () => toastInfo('Marked as not attending.'));

    actions.appendChild(playingBtn);
    actions.appendChild(anyGameBtn);
    actions.appendChild(ifNeededBtn);
    actions.appendChild(specBtn);
    actions.appendChild(declineBtn);
    section.appendChild(actions);
  }

  wrapper.appendChild(section);
  return wrapper;
}

export function renderAttendeeGroups(night, nights, currentUser) {
  currentUser = currentUser || getCurrentUser();
  const userId = currentUser?.userId;
  const wrapper = document.createElement('div');
  wrapper.className = 'space-y-3';

  const guests = night.guests = Array.isArray(night.guests) ? night.guests : [];

  // 'playing' people not yet in any game
  const assignedKeys = new Set(
    Object.values(night.selectedGames || {}).flatMap(g => (g.signedUpPlayers || []).map(p => p.userId))
  );
  const unassignedPlaying = guestsOfType(guests, 'playing').filter(g => !assignedKeys.has(playerKey(g)));

  const groups = [
    { members: unassignedPlaying,                 heading: "Hasn't picked a game yet" },
    { members: guestsOfType(guests, 'any_game'),   heading: 'Put me in a game' },
    { members: guestsOfType(guests, 'if_needed'),  heading: "I'll play if needed" },
    { members: guestsOfType(guests, 'spectating'), heading: 'Just hanging out' },
  ];

  function makeCancelBtn() {
    const cancelBtn = btn('Cancel RSVP', 'danger');
    cancelBtn.className += ' text-xs py-0.5 px-2';
    cancelBtn.onclick = async () => {
      cancelBtn.disabled = true;
      try {
        // Back to "not answered" — still on the list.
        const me = findGuest(night.guests, { userId });
        if (me) respond(me, null);
        withdrawFromAllGames(night, currentUser);
        dropMyPlusOnes(night, userId);
        night.lastModified = Date.now();
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

  // "+guests" stepper: each click adds/removes an anonymous plus-one entry
  // sponsored by the current user (ADR-0021 sub-decision 3).
  function makeGuestStepper() {
    const stepper = document.createElement('div');
    stepper.className = 'flex items-center gap-1 ml-2';

    const label = document.createElement('span');
    label.className = 'text-xs text-gray-400';
    label.textContent = '+guests:';

    const minusBtn = document.createElement('button');
    minusBtn.type = 'button';
    minusBtn.className = 'w-5 h-5 rounded text-xs bg-gray-200 hover:bg-gray-300 font-bold leading-none';
    minusBtn.textContent = '−';

    const countEl = document.createElement('span');
    countEl.className = 'text-xs w-4 text-center font-medium';
    countEl.textContent = plusOnesOf(guests, userId).length;

    const plusBtn = document.createElement('button');
    plusBtn.type = 'button';
    plusBtn.className = 'w-5 h-5 rounded text-xs bg-gray-200 hover:bg-gray-300 font-bold leading-none';
    plusBtn.textContent = '+';

    async function commit() {
      minusBtn.disabled = true;
      plusBtn.disabled  = true;
      try {
        night.lastModified = Date.now();
        await saveGameNights(nights);
        renderGameNights(nights, currentUser);
      } catch {
        toastError('Could not update guests.');
        minusBtn.disabled = false;
        plusBtn.disabled  = false;
      }
    }

    minusBtn.onclick = () => {
      const mine = plusOnesOf(night.guests, userId);
      if (mine.length === 0) return;
      const last = mine[mine.length - 1];
      withdrawFromAllGames(night, { userId: playerKey(last) });
      removeGuests(night, g => g.id === last.id);
      commit();
    };
    plusBtn.onclick = () => {
      night.guests.push(newGuest({ invitedBy: userId, response: { type: 'if_needed' } }));
      commit();
    };

    stepper.appendChild(label);
    stepper.appendChild(minusBtn);
    stepper.appendChild(countEl);
    stepper.appendChild(plusBtn);
    return stepper;
  }

  // "Bring a friend" — an attending guest may invite someone by email
  // (ADR-0021 permission rule 2). The Lambda writes the entry attributed to
  // the sponsor and sends the invite; the placeholder shows immediately.
  function makeBringFriendRow() {
    const row = document.createElement('div');
    row.className = 'flex gap-2 items-center mt-1';
    const emailInput = input('Bring a friend — their email…');
    emailInput.type = 'email';
    emailInput.className = 'field flex-1 text-sm';
    const addBtn = btn('Invite', 'secondary');
    addBtn.className += ' text-xs';
    addBtn.onclick = async () => {
      const email = emailInput.value.trim().toLowerCase();
      if (!email || !email.includes('@')) { toastError('Please enter a valid email address.'); return; }
      if (!addPlaceholder(night, email, userId)) { toastInfo(`${email} is already on the list.`); emailInput.value = ''; return; }
      addBtn.disabled = true;
      try {
        night.lastModified = Date.now();
        await saveGameNights(nights);
        sendInviteEmail(night, email);
        renderGameNights(nights, currentUser);
        toastSuccess(`${email} invited!`);
      } catch {
        removeGuests(night, g => !g.userId && g.email === email && g.invitedBy === userId && !g.response);
        toastError('Could not save. Try again.');
        addBtn.disabled = false;
      }
    };
    emailInput.addEventListener('keydown', e => { if (e.key === 'Enter') addBtn.click(); });
    row.appendChild(emailInput);
    row.appendChild(addBtn);
    return row;
  }

  for (const { members, heading } of groups) {
    if (members.length === 0) continue;

    const groupLabel = document.createElement('span');
    groupLabel.className = 'section-label';
    groupLabel.textContent = heading;
    wrapper.appendChild(groupLabel);

    const list = document.createElement('ul');
    list.className = 'space-y-1 pl-3';

    members.forEach(g => {
      const item = document.createElement('li');
      item.className = 'flex items-center justify-between text-sm';

      const left = document.createElement('div');
      left.className = 'flex items-center';

      const name = document.createElement('span');
      name.className = isPlusOne(g) ? 'text-gray-400 italic' : 'text-gray-700';
      name.textContent = guestLabel(g);
      left.appendChild(name);

      const isMe = g.userId === userId;
      if (isMe && isAttending(guests, userId)) left.appendChild(makeGuestStepper());
      item.appendChild(left);

      if (isMe) item.appendChild(makeCancelBtn());

      list.appendChild(item);
    });

    wrapper.appendChild(list);
  }

  if (userId && night.hostUserId !== userId && isAttending(guests, userId)) {
    wrapper.appendChild(makeBringFriendRow());
  }

  // ── Pending invites ───────────────────────────────────────
  const pending = pendingGuests(guests);

  if (pending.length > 0) {
    const label = document.createElement('span');
    label.className = 'section-label';
    label.textContent = 'Awaiting reply';
    wrapper.appendChild(label);

    const pendingDiv = document.createElement('div');
    pendingDiv.className = 'flex flex-wrap gap-1';
    pending.forEach(g => {
      const chip = document.createElement('span');
      chip.className = 'text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full';
      chip.textContent = guestLabel(g);
      if (g.invitedBy && g.invitedBy !== night.hostUserId) chip.title = `Invited by ${getDisplayName(g.invitedBy)}`;
      pendingDiv.appendChild(chip);

      if (DEBUG_MODE) {
        const removeBtn = btn('×', 'ghost');
        removeBtn.className += ' text-xs py-0 px-1';
        removeBtn.onclick = () => {
          removeGuests(night, x => x.id === g.id);
          night.lastModified = Date.now();
          renderGameNights(nights, currentUser);
        };
        chip.appendChild(removeBtn);
      }
    });
    wrapper.appendChild(pendingDiv);
  }

  // ── Declined ──────────────────────────────────────────────
  // Without this, a decline is invisible to the host: the person just
  // vanishes from "Awaiting reply", which reads the same as "never got the
  // invite" — and the host can't trust the pending count for headcount.
  const declined = declinedGuests(guests);
  if (declined.length > 0) {
    const label = document.createElement('span');
    label.className = 'section-label';
    label.textContent = "Can't make it";
    wrapper.appendChild(label);

    const declinedDiv = document.createElement('div');
    declinedDiv.className = 'flex flex-wrap gap-1';
    declined.forEach(g => {
      const chip = document.createElement('span');
      chip.className = 'text-xs bg-red-50 text-red-400 px-2 py-0.5 rounded-full line-through';
      chip.textContent = guestLabel(g);
      chip.title = 'Declined';
      declinedDiv.appendChild(chip);
    });
    wrapper.appendChild(declinedDiv);
  }

  return wrapper;
}
