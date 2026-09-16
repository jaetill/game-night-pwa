// renderRSVP / renderAttendeeGroups against the unified guests[] model
// (ADR-0021): responding never removes anyone; cancel returns to pending;
// the +guests stepper creates real plus-one entries; a declined sponsor's
// anonymous plus-ones go with them; attending guests get "Bring a friend".

// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';

const saveGameNights = vi.fn(async () => {});
vi.mock('../src/js/data/index.js', () => ({ saveGameNights: (...a) => saveGameNights(...a), ownedGames: [] }));
vi.mock('../src/js/components/renderGameNights.js', () => ({ renderGameNights: vi.fn() }));
vi.mock('../src/js/utils/invite.js', () => ({
  sendInviteEmail: vi.fn(async () => null),
  addPlaceholder: (night, email, invitedBy) => {
    if (night.guests.some(g => g.email === email)) return false;
    night.guests.push({ id: `ph-${email}`, userId: null, name: null, email, invitedBy, invitedAt: 1, response: null });
    return true;
  },
}));
let currentUser = { userId: 'deb', name: 'Deb', email: 'deb@example.com' };
vi.mock('../src/js/auth/userStore.js', () => ({ getCurrentUser: () => currentUser }));

const { renderRSVP, renderAttendeeGroups } = await import('../src/js/components/renderRSVP.js');
const { newGuest } = await import('../src/js/data/guests.js');

const flush = () => new Promise(r => setTimeout(r, 0));
const click = (root, text) => {
  const el = [...root.querySelectorAll('button')].find(b => b.textContent.trim() === text);
  if (!el) throw new Error(`no button "${text}" in: ${root.textContent}`);
  el.click();
  return flush();
};

function night(guests) {
  return {
    id: 'n1', hostUserId: 'host', date: '2026-09-26', time: '18:00', location: 'X',
    selectedGames: { g1: { title: 'Catan', maxPlayers: 4, signedUpPlayers: [], interestedPlayers: [] } },
    guests,
    lastModified: 1,
  };
}
const host = () => newGuest({ id: 'h', userId: 'host', name: 'Host', invitedBy: 'host', invitedAt: 1, response: { type: 'playing', at: 1 } });
const deb  = (response = null) => newGuest({ id: 'd', userId: 'deb', name: 'Deb', email: 'deb@example.com', invitedBy: 'host', invitedAt: 1, response });

beforeEach(() => { saveGameNights.mockClear(); currentUser = { userId: 'deb', name: 'Deb', email: 'deb@example.com' }; });

describe('renderRSVP — responding', () => {
  it('shows the buttons only to an unanswered guest, and sets response without removing the entry', async () => {
    const n = night([host(), deb()]);
    const el = renderRSVP(n, [n], currentUser);
    await click(el, 'Reserve a seat');
    expect(n.guests.map(g => g.userId)).toEqual(['host', 'deb']);
    expect(n.guests[1].response.type).toBe('playing');
    expect(saveGameNights).toHaveBeenCalledTimes(1);
    // Answered → no buttons.
    expect(renderRSVP(n, [n], currentUser).querySelectorAll('button')).toHaveLength(0);
  });

  it('matches an email-only invite to the signed-in user and fills in the userId', async () => {
    const n = night([host(), newGuest({ id: 'e', email: 'Deb@Example.com', invitedBy: 'host', invitedAt: 1 })]);
    const el = renderRSVP(n, [n], currentUser);
    await click(el, 'Just hang out');
    expect(n.guests).toHaveLength(2);
    expect(n.guests[1]).toMatchObject({ id: 'e', userId: 'deb', name: 'Deb', response: { type: 'spectating' } });
  });

  it('shows nothing to someone who is not on the list', () => {
    const n = night([host()]);
    expect(renderRSVP(n, [n], currentUser).querySelectorAll('button')).toHaveLength(0);
  });

  it('declining keeps the entry, frees seats, and drops my anonymous plus-ones', async () => {
    const n = night([host(), deb(), newGuest({ id: 'p1', invitedBy: 'deb', invitedAt: 1, response: { type: 'if_needed', at: 1 } })]);
    n.selectedGames.g1.signedUpPlayers.push({ userId: 'deb', name: 'Deb' }, { userId: 'p1', name: "Deb's guest" });
    const el = renderRSVP(n, [n], currentUser);
    await click(el, "Can't make it");
    expect(n.guests.map(g => g.id)).toEqual(['h', 'd']);
    expect(n.guests[1].response.type).toBe('declined');
    expect(n.selectedGames.g1.signedUpPlayers).toEqual([]);
  });
});

describe('renderAttendeeGroups — attending view', () => {
  it('cancel RSVP returns me to pending instead of deleting me', async () => {
    const n = night([host(), deb({ type: 'playing', at: 1 })]);
    const el = renderAttendeeGroups(n, [n], currentUser);
    await click(el, 'Cancel RSVP');
    expect(n.guests.find(g => g.userId === 'deb').response).toBeNull();
    expect(renderAttendeeGroups(n, [n], currentUser).textContent).toContain('Awaiting reply');
  });

  it('+guests adds and removes anonymous plus-one entries sponsored by me', async () => {
    const n = night([host(), deb({ type: 'playing', at: 1 })]);
    let el = renderAttendeeGroups(n, [n], currentUser);
    await click(el, '+');
    expect(n.guests.filter(g => !g.userId && g.invitedBy === 'deb')).toHaveLength(1);
    expect(n.guests.at(-1).response.type).toBe('if_needed');

    el = renderAttendeeGroups(n, [n], currentUser);
    expect(el.textContent).toContain("Deb's guest");
    await click(el, '−');
    expect(n.guests.filter(g => !g.userId)).toHaveLength(0);
  });

  it('shows the plus-one under "I\'ll play if needed" and never offers the stepper to a pending guest', () => {
    const n = night([host(), deb(), newGuest({ id: 'p1', invitedBy: 'host', invitedAt: 1, response: { type: 'if_needed', at: 1 } })]);
    const el = renderAttendeeGroups(n, [n], currentUser);
    expect(el.textContent).toContain("I'll play if needed");
    expect([...el.querySelectorAll('button')].map(b => b.textContent.trim())).not.toContain('+');
  });

  it('offers "Bring a friend" to an attending non-host guest and adds a placeholder attributed to them', async () => {
    const n = night([host(), deb({ type: 'any_game', at: 1 })]);
    const el = renderAttendeeGroups(n, [n], currentUser);
    const input = el.querySelector('input[type="email"]');
    expect(input).not.toBeNull();
    input.value = 'friend@example.com';
    await click(el, 'Invite');
    expect(n.guests.at(-1)).toMatchObject({ email: 'friend@example.com', invitedBy: 'deb', response: null });
    expect(saveGameNights).toHaveBeenCalled();
  });

  it('does not offer "Bring a friend" to the host (they have host controls) or a pending guest', () => {
    currentUser = { userId: 'host', name: 'Host' };
    expect(renderAttendeeGroups(night([host()]), [], currentUser).querySelector('input[type="email"]')).toBeNull();
    currentUser = { userId: 'deb', name: 'Deb' };
    expect(renderAttendeeGroups(night([host(), deb()]), [], currentUser).querySelector('input[type="email"]')).toBeNull();
  });

  it('labels a pending chip with who invited them when it was not the host', () => {
    const n = night([host(), deb({ type: 'playing', at: 1 }), newGuest({ id: 'f', email: 'f@x.com', invitedBy: 'deb', invitedAt: 1 })]);
    const el = renderAttendeeGroups(n, [n], currentUser);
    const chip = [...el.querySelectorAll('span')].find(s => s.textContent === 'f@x.com');
    expect(chip.title).toBe('Invited by Deb');
  });
});
