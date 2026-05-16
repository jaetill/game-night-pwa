// E2E: portal-user invite via POST /invite — verifies the invite email
// lands in the inbox (not spam) within seconds of the API call.
//
// This is the platform test-inbox's first real consumer (ADR-0014).
// The bug it's chasing: invitees receive no usable email after an admin
// invite. Note: game-night-pwa SUPPRESSES Cognito's default welcome email
// (lambda/nudge.js — MessageAction:'SUPPRESS') and instead sends a custom
// Postmark invite from jason@jaetill.com. So the test waits on the
// Postmark email, not a Cognito one. Diagnostic value:
//   - waitForEmail times out          → Postmark didn't send (Lambda error path)
//   - lastWasInSpam() === true        → deliverability problem on jaetill.com
//   - subject/body assertions fail    → Postmark template changed; update regex
//
// A future enhancement (separate PR) will add a PostmarkInviteParser to
// extract temp password + sign-in URL from the email body and complete
// the Cognito "set permanent password" flow via Playwright, covering the
// end-to-end registration question. This PR limits scope to the
// delivery + spam diagnostic that was the original bug suspicion.
//
// Wiring note: we use the pure `inboxFixture` from `@platform/test-inbox`
// against game-night-pwa's own `@playwright/test` install. Importing
// `@platform/test-inbox/playwright` directly trips Playwright's
// "Requiring @playwright/test second time" guard when the package is
// file:-linked. See test-inbox README for the rationale.
//
// One-time setup required before this test can run (see CLAUDE.md
// "Email E2E setup" section):
//   1. Gmail OAuth — create OAuth client for jaetill@gmail.com with
//      gmail.readonly + gmail.modify scopes; mint a refresh token; push
//      to AWS Secrets Manager at platform/test-inbox/gmail-tester.
//   2. Cognito host token — sign in as a Cognito user who is the host
//      of a long-lived test game night; capture the ID token and the
//      nightId.
//   3. Run with the env vars listed in REQUIRED_ENV set.
//
// The test SKIPS rather than failing when any required env var is missing.

import { test as base, expect } from '@playwright/test';
import { inboxFixture, cleanupCognitoTestUsers } from '@platform/test-inbox';

const REQUIRED_ENV = [
  'GMAIL_TESTER_EMAIL',
  'GMAIL_TESTER_CLIENT_ID',
  'GMAIL_TESTER_CLIENT_SECRET',
  'GMAIL_TESTER_REFRESH_TOKEN',
  'GAME_NIGHT_API_BASE',           // e.g. https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod
  'GAME_NIGHT_HOST_AUTH_TOKEN',    // Cognito ID token for the test host
  'GAME_NIGHT_TEST_NIGHT_ID',      // long-lived game night where the host token owns
];

const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
const SHOULD_SKIP = missingEnv.length > 0;

const COGNITO_USER_POOL_ID = process.env.GAME_NIGHT_COGNITO_POOL_ID || 'us-east-2_xneeJzaDJ';
const COGNITO_REGION = process.env.GAME_NIGHT_COGNITO_REGION || 'us-east-2';
const BASE_EMAIL = process.env.GMAIL_TESTER_EMAIL || 'jaetill@gmail.com';
const ALIAS_PREFIX = `${BASE_EMAIL.split('@')[0]}+gn-`;

const INBOX_RUN_ID = process.env.GITHUB_RUN_ID || String(Date.now());

// Manual fixture wiring (per @platform/test-inbox README): use the host
// project's @playwright/test and call `inboxFixture` inside the fixture
// body. Avoids loading @playwright/test from two node_modules paths.
const test = base.extend({
  inbox: async ({}, use, testInfo) => {
    await inboxFixture(
      {
        inboxProject: 'gn',
        inboxRunId: INBOX_RUN_ID,
        inboxOverrides: {},
        title: testInfo.title,
      },
      use,
    );
  },
});

test.afterAll(async () => {
  if (SHOULD_SKIP) return;
  // Shared production pool (CLAUDE.md: us-east-2_xneeJzaDJ). The
  // alias-prefix guard + PLATFORM_TEST_INBOX_ALLOW_PROD_CLEANUP=true (set
  // in the test runner's env) are the load-bearing safety layers per
  // ADR-0014. This deletes only users whose email starts with the tester
  // prefix.
  const result = await cleanupCognitoTestUsers({
    userPoolId: COGNITO_USER_POOL_ID,
    region: COGNITO_REGION,
    emailMatchesAlias: ALIAS_PREFIX,
  });
  // eslint-disable-next-line no-console
  console.log(`[admin-invite-flow] cleanup: deleted=${result.deleted} skipped=${result.skipped}`);
});

test.describe('admin invite — portal user provisioning', () => {
  test.skip(SHOULD_SKIP, `Missing env: ${missingEnv.join(', ')}. See spec header for setup.`);

  test('Postmark invite email arrives in inbox (not spam) within seconds of POST /invite', async ({
    inbox,
  }) => {
    const apiBase = process.env.GAME_NIGHT_API_BASE.replace(/\/$/, '');
    const hostToken = process.env.GAME_NIGHT_HOST_AUTH_TOKEN;
    const nightId = process.env.GAME_NIGHT_TEST_NIGHT_ID;

    const before = new Date();

    const res = await fetch(`${apiBase}/invite`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${hostToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        nightId,
        action: 'invite',
        email: inbox.address,
      }),
    });

    // Read body text ONCE; reuse for both the assertion message and JSON parse.
    // Fetch Response bodies are single-use streams.
    const responseText = await res.text().catch(() => '');
    expect(res.status, responseText).toBe(200);
    const body = JSON.parse(responseText);
    // Lambda returns { sent: 1, provisioned: 'created'|'existing', inviteListChanged }.
    // Only 'created' exercises the new-user welcome path with the temp password
    // in the Postmark body; 'existing' just notifies an already-provisioned user.
    expect(['created', 'existing']).toContain(body.provisioned);
    test.skip(body.provisioned !== 'created', 'Invitee already provisioned; nothing to verify');

    // Wait for the Postmark invite email. Subject matches game-night-pwa's
    // template in lambda/nudge.js buildInviteText/buildInviteHtml.
    const message = await inbox.waitForEmail({
      subjectMatches: /invited to game night/i,
      sentAfter: before,
      timeoutMs: 90_000,
    });

    expect(message.to.toLowerCase()).toContain(inbox.address.toLowerCase());
    expect(message.subject).toMatch(/invited to game night/i);
    // Postmark template body should contain the RSVP URL at gamenights.jaetill.com.
    expect(message.bodyText ?? message.bodyHtml ?? '').toMatch(/jaetill\.com/i);

    // The diagnostic that catches the actual bug pattern:
    expect(
      inbox.lastWasInSpam(),
      'Game-night invite landed in SPAM — check SPF/DKIM/DMARC on jaetill.com',
    ).toBe(false);
    expect(message.receivedAt.getTime()).toBeGreaterThan(before.getTime() - 5_000);
  });
});
