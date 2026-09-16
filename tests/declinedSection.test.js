// Host-facing "Can't make it" section + summary count.
//
// Why: a decline used to be invisible in the app — the person just dropped
// out of "Awaiting reply", which reads exactly like "never responded". Jason
// couldn't trust the pending number for headcount. These tests pin the new
// section and the "· N can't make it" stat.

// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/js/data/index.js', () => ({ saveGameNights: vi.fn(), ownedGames: [] }));
vi.mock('../src/js/components/renderGameNights.js', () => ({ renderGameNights: vi.fn() }));
vi.mock('../src/js/auth/userStore.js', () => ({ getCurrentUser: () => ({ userId: 'host', name: 'Host' }) }));

const { renderAttendeeGroups } = await import('../src/js/components/renderRSVP.js');
const { renderGameNightSummary } = await import('../src/js/components/renderGameNightSummary.js');
const { sanitizeNight } = await import('../src/js/data/storage.js');

// Fixtures are written in the legacy shape and pushed through sanitizeNight,
// exactly as loaded data is — ADR-0021 folds them into guests[].
function night(over = {}) {
  return sanitizeNight({
    id: 'n1', hostUserId: 'host', date: '2026-09-26', time: '19:00', location: 'X',
    invited: ['pend-1', 'pend-2'],
    rsvps: [{ userId: 'host', name: 'Host', type: 'playing' }, { userId: 'deb', name: 'Deb', type: 'any_game' }],
    declined: ['phil'],
    selectedGames: {},
    ...over,
  });
}

describe('renderAttendeeGroups — declined section', () => {
  it('lists declined guests under "Can\'t make it", separate from Awaiting reply', () => {
    const el = renderAttendeeGroups(night(), [night()], { userId: 'host', name: 'Host' });
    const text = el.textContent;
    expect(text).toContain('Awaiting reply');
    expect(text).toContain("Can't make it");
    expect(text).toContain('phil');
    // The declined chip is not in the pending group.
    const labels = [...el.querySelectorAll('.section-label')].map(l => l.textContent);
    expect(labels.indexOf('Awaiting reply')).toBeLessThan(labels.indexOf("Can't make it"));
  });

  it('omits the section when nobody declined', () => {
    const el = renderAttendeeGroups(night({ declined: [] }), [], { userId: 'host', name: 'Host' });
    expect(el.textContent).not.toContain("Can't make it");
  });

  it('still shows pending and declined when there are no RSVPs at all', () => {
    const el = renderAttendeeGroups(night({ rsvps: [] }), [], { userId: 'host', name: 'Host' });
    expect(el.textContent).toContain('Awaiting reply');
    expect(el.textContent).toContain("Can't make it");
  });

  it('does not list someone as declined if they later RSVP\'d', () => {
    const n = night({ declined: ['deb'] });
    const el = renderAttendeeGroups(n, [n], { userId: 'host', name: 'Host' });
    expect(el.textContent).not.toContain("Can't make it");
  });
});

describe('renderGameNightSummary — counts', () => {
  it('shows going, pending, and can\'t-make-it counts', () => {
    const el = renderGameNightSummary(night(), { userId: 'host', name: 'Host' });
    const text = el.textContent.replace(/\s+/g, ' ');
    expect(text).toContain('2 going');
    expect(text).toContain('2 pending');
    expect(text).toContain("1 can't make it");
  });

  it('hides the can\'t-make-it stat at zero', () => {
    const el = renderGameNightSummary(night({ declined: [] }), { userId: 'host', name: 'Host' });
    expect(el.textContent).not.toContain("can't make it");
  });
});
