// Tests for POST /invite with { userId } — the "Recent guests" path.
//
// Recent-guest checkboxes store Cognito userIds, not emails. The old handler
// only accepted { email }, so the frontend's "Add selected" button silently
// sent no email at all. The handler now resolves the member's email via
// AdminGetUser and sends the invite (no provisioning — the user exists).

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nudge = require('../lambda/nudge.js');

const NIGHT = {
  id: 'night-1',
  hostUserId: 'host-user',
  invited: [],
  rsvps: [],
  declined: [],
  date: '2026-06-01',
  time: '7:00 PM',
  location: "Alice's Place",
  description: '',
};

function makeEvent(body) {
  return {
    httpMethod: 'POST',
    resource: '/invite',
    headers: { origin: 'https://gamenights.jaetill.com' },
    requestContext: { authorizer: { userId: 'host-user' } },
    body: JSON.stringify(body),
  };
}

describe('handler invite — by userId (Recent guests)', () => {
  let mockSm, mockS3, mockCognito, postmarkCalls, s3Writes, groupAdds;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    postmarkCalls = [];
    s3Writes = [];
    groupAdds = [];

    mockSm = {
      send: vi.fn(async () => ({ SecretString: JSON.stringify({ POSTMARK_API_KEY: 'test-key' }) })),
    };

    mockS3 = {
      send: vi.fn(async (cmd) => {
        if (cmd.input?.Body !== undefined) { s3Writes.push(JSON.parse(cmd.input.Body)); return {}; }
        return { Body: { transformToString: async () => JSON.stringify([{ ...NIGHT, invited: [...NIGHT.invited] }]) } };
      }),
    };

    mockCognito = {
      send: vi.fn(async (cmd) => {
        if (cmd.input?.GroupName) { groupAdds.push(cmd.input); return {}; }
        // AdminGetUser — host lookup vs invitee lookup by Username
        if (cmd.input?.Username === 'guest-uuid-1') {
          return { UserAttributes: [
            { Name: 'email', Value: 'guest1@example.com' },
            { Name: 'name',  Value: 'Guest One' },
          ] };
        }
        return { UserAttributes: [{ Name: 'name', Value: 'Alice' }] };
      }),
    };

    nudge._setForTest({
      smClient: mockSm,
      s3: mockS3,
      cognito: mockCognito,
      postmark: async (_key, msg) => { postmarkCalls.push(msg); return {}; },
    });
  });

  afterEach(() => {
    nudge._resetForTest();
    vi.restoreAllMocks();
  });

  it('resolves the email via AdminGetUser and sends the invite', async () => {
    const res = await nudge.handler(
      makeEvent({ nightId: 'night-1', action: 'invite', userId: 'guest-uuid-1' }),
      { awsRequestId: 't-uid-1' },
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.sent).toBe(1);
    expect(body.provisioned).toBe('existing'); // never provisions for userId invites
    expect(postmarkCalls).toHaveLength(1);
    expect(postmarkCalls[0].To).toBe('guest1@example.com');
    expect(postmarkCalls[0].TextBody).toContain('Guest One');
    // No credentials block — existing member
    expect(postmarkCalls[0].TextBody).not.toContain('Temporary password');
  });

  it('writes a pending guest entry keyed by userId (ADR-0021) and returns it', async () => {
    const res = await nudge.handler(
      makeEvent({ nightId: 'night-1', action: 'invite', userId: 'guest-uuid-1' }),
      { awsRequestId: 't-uid-2' },
    );
    expect(s3Writes).toHaveLength(1);
    const night = s3Writes[0][0];
    expect(night.invited).toBeUndefined(); // legacy arrays dropped on write
    const g = night.guests.find(x => x.userId === 'guest-uuid-1');
    expect(g).toMatchObject({ email: 'guest1@example.com', name: 'Guest One', invitedBy: 'host-user', response: null });
    expect(JSON.parse(res.body).guest).toMatchObject({ id: g.id, userId: 'guest-uuid-1' });
  });

  it('ensures group membership with game-night-users only', async () => {
    await nudge.handler(
      makeEvent({ nightId: 'night-1', action: 'invite', userId: 'guest-uuid-1' }),
      { awsRequestId: 't-uid-3' },
    );
    expect(groupAdds).toHaveLength(1);
    expect(groupAdds[0].GroupName).toBe('game-night-users');
    expect(groupAdds[0].Username).toBe('guest-uuid-1');
  });

  it('returns 404 for an unknown userId', async () => {
    mockCognito.send = vi.fn(async (cmd) => {
      if (cmd.input?.Username === 'nope') throw new Error('UserNotFoundException');
      return { UserAttributes: [{ Name: 'name', Value: 'Alice' }] };
    });
    const res = await nudge.handler(
      makeEvent({ nightId: 'night-1', action: 'invite', userId: 'nope' }),
      { awsRequestId: 't-uid-4' },
    );
    expect(res.statusCode).toBe(404);
    expect(postmarkCalls).toHaveLength(0);
  });

  it('still rejects a request with neither valid email nor userId', async () => {
    const res = await nudge.handler(
      makeEvent({ nightId: 'night-1', action: 'invite' }),
      { awsRequestId: 't-uid-5' },
    );
    expect(res.statusCode).toBe(400);
  });

  it('re-issues a temp password for a never-signed-in member and includes credentials', async () => {
    const passwordResets = [];
    mockCognito.send = vi.fn(async (cmd) => {
      if (cmd.input?.Permanent !== undefined) { passwordResets.push(cmd.input); return {}; }
      if (cmd.input?.GroupName) { groupAdds.push(cmd.input); return {}; }
      if (cmd.input?.Username === 'guest-uuid-1') {
        return {
          UserStatus: 'FORCE_CHANGE_PASSWORD',
          UserAttributes: [
            { Name: 'email', Value: 'guest1@example.com' },
            { Name: 'name',  Value: 'Guest One' },
          ],
        };
      }
      return { UserAttributes: [{ Name: 'name', Value: 'Alice' }] };
    });

    const res = await nudge.handler(
      makeEvent({ nightId: 'night-1', action: 'invite', userId: 'guest-uuid-1' }),
      { awsRequestId: 't-uid-6' },
    );

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).provisioned).toBe('reset');
    expect(passwordResets).toHaveLength(1);
    expect(passwordResets[0].Username).toBe('guest-uuid-1');
    expect(passwordResets[0].Permanent).toBe(false);
    // Email carries the fresh credentials
    expect(postmarkCalls[0].TextBody).toContain('Temporary password');
    expect(postmarkCalls[0].TextBody).toContain(passwordResets[0].Password);
  });

  it('email re-invite of a never-signed-in user also resets the temp password', async () => {
    const passwordResets = [];
    mockCognito.send = vi.fn(async (cmd) => {
      if (cmd.input?.Permanent !== undefined) { passwordResets.push(cmd.input); return {}; }
      if (cmd.input?.GroupName) { return {}; }
      if (cmd.input?.Filter) {
        return { Users: [{ Username: 'stale-uuid', UserStatus: 'FORCE_CHANGE_PASSWORD' }] };
      }
      return { UserAttributes: [{ Name: 'name', Value: 'Alice' }] };
    });

    const res = await nudge.handler(
      makeEvent({ nightId: 'night-1', action: 'invite', email: 'stale@example.com' }),
      { awsRequestId: 't-uid-7' },
    );

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).provisioned).toBe('reset');
    expect(passwordResets).toHaveLength(1);
    expect(passwordResets[0].Username).toBe('stale-uuid');
    expect(postmarkCalls[0].TextBody).toContain('Temporary password');
  });
});

describe('handler invite — who may invite (ADR-0021)', () => {
  let postmarkCalls, s3Writes, nightGuests;
  const asUser = (userId, body) => ({
    httpMethod: 'POST', resource: '/invite',
    headers: { origin: 'https://gamenights.jaetill.com' },
    requestContext: { authorizer: { userId } },
    body: JSON.stringify(body),
  });

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    postmarkCalls = []; s3Writes = [];
    nightGuests = [
      { id: 'g-yes', userId: 'yes-uuid', name: 'Yes', email: 'yes@example.com', invitedBy: 'host-user', invitedAt: 1, response: { type: 'playing', at: 1 } },
      { id: 'g-pen', userId: 'pen-uuid', name: 'Pen', email: 'pen@example.com', invitedBy: 'host-user', invitedAt: 1, response: null },
    ];
    nudge._setForTest({
      smClient: { send: vi.fn(async () => ({ SecretString: JSON.stringify({ POSTMARK_API_KEY: 'k' }) })) },
      s3: { send: vi.fn(async (cmd) => {
        if (cmd.input?.Body !== undefined) { s3Writes.push(JSON.parse(cmd.input.Body)); return {}; }
        return { ETag: '"v1"', Body: { transformToString: async () => JSON.stringify([{ ...NIGHT, guests: nightGuests }]) } };
      }) },
      cognito: { send: vi.fn(async (cmd) => {
        if (cmd.input?.GroupName) return {};
        if (cmd.input?.Filter) return { Users: [{ Username: 'new-uuid', UserStatus: 'CONFIRMED' }] };
        return { UserAttributes: [{ Name: 'name', Value: 'Someone' }, { Name: 'email', Value: 'x@example.com' }] };
      }) },
      postmark: async (_key, msg) => { postmarkCalls.push(msg); return {}; },
    });
  });
  afterEach(() => { nudge._resetForTest(); vi.restoreAllMocks(); });

  it('lets an attending guest invite, attributing the entry to them', async () => {
    const res = await nudge.handler(asUser('yes-uuid', { nightId: 'night-1', action: 'invite', email: 'friend@example.com' }), { awsRequestId: 'w1' });
    expect(res.statusCode).toBe(200);
    const g = s3Writes[0][0].guests.find(x => x.email === 'friend@example.com');
    expect(g).toMatchObject({ userId: 'new-uuid', invitedBy: 'yes-uuid', response: null });
    expect(postmarkCalls).toHaveLength(1);
  });

  it('refuses a pending guest and a stranger', async () => {
    for (const who of ['pen-uuid', 'stranger']) {
      const res = await nudge.handler(asUser(who, { nightId: 'night-1', action: 'invite', email: 'friend@example.com' }), { awsRequestId: 'w2' });
      expect(res.statusCode).toBe(403);
    }
    expect(s3Writes).toHaveLength(0);
    expect(postmarkCalls).toHaveLength(0);
  });

  it('nudging stays host-only', async () => {
    const res = await nudge.handler(asUser('yes-uuid', { nightId: 'night-1', action: 'nudge' }), { awsRequestId: 'w3' });
    expect(res.statusCode).toBe(403);
  });
});
