// Smoke tests for the pre-auth surface of the app.
//
// These verify the SPA shell builds + boots correctly. They do NOT cover
// the authenticated flows (event list, RSVP, BGG import) — those require a
// stable test user against Cognito and are out of scope for the smoke
// pass. When test credentials are wired, add specs under tests/e2e/auth/.

import { test, expect } from '@playwright/test';

test.describe('app shell — pre-auth', () => {
  test('root page loads and redirects unauthenticated user to Hosted UI', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Either we're still on localhost (the script hasn't redirected yet) or
    // we've been bounced to the Cognito Hosted UI. Both are "the app boots
    // correctly" — what we DON'T want is a 500, a console error, or the
    // app rendering the authenticated UI without a session.
    await page.waitForURL(
      (url) => url.host === 'localhost:5173' || url.host === 'just.jaetill.com',
      { timeout: 10_000 },
    );

    const currentHost = new URL(page.url()).host;
    if (currentHost === 'just.jaetill.com') {
      // Confirm we hit Cognito Managed Login (v2) with the right client_id.
      // The Hosted UI lands on /login first, then to /oauth2/authorize after
      // sign-in — either is valid as "we made it to the auth host."
      expect(page.url()).toMatch(/\/(login|oauth2\/authorize)/);
      expect(page.url()).toContain('client_id=34et7dk67ngqep1oqef49te0ic');
    } else {
      // Still on localhost — the app's bootstrap should have loaded.
      // Don't assert on specific rendered text; the shell can be empty
      // while it waits for the auth check to fire.
      await expect(page).toHaveTitle(/Game Night/i);
    }
  });

  test('callback page loads without crashing on malformed input', async ({ page }) => {
    const consoleErrors = [];
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    // Visit /callback.html with no code or state — the handler should
    // surface an error gracefully, not crash the page.
    await page.goto('/callback.html', { waitUntil: 'domcontentloaded' });

    // No uncaught JS exceptions during boot.
    expect(consoleErrors, `pageerror: ${consoleErrors.join('; ')}`).toHaveLength(0);
  });
});
