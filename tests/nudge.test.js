// Unit tests for HTML-escaping in lambda/nudge.js buildHtml.
//
// Regression guard: buildHtml was interpolating user-supplied fields raw,
// while buildInviteHtml already called escapeHtml. This test locks in the
// fix so any future edit that removes escapeHtml calls breaks loudly here.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  _buildHtml: buildHtml,
  _buildInviteHtml: buildInviteHtml,
  _escapeHtml: escapeHtml,
  _isValidInviteEmail: isValidInviteEmail,
} = require('../lambda/nudge.js');

const BASE = {
  name: 'Alice',
  hostName: 'Bob',
  dateStr: 'Saturday, May 15',
  timeStr: '7:00 PM',
  location: 'Bob\'s Place',
  description: 'Bring your favourite games.',
};

describe('isValidInviteEmail', () => {
  // Unified validator combining issue #22 (Cognito filter injection — no double-quotes)
  // and issue #23 (string/length guard so non-strings don't throw on .includes).

  it('accepts a normal email address', () => {
    expect(isValidInviteEmail('alice@example.com')).toBe(true);
  });

  it('accepts a well-formed email (alt)', () => {
    expect(isValidInviteEmail('user@example.com')).toBe(true);
  });

  it('rejects undefined', () => {
    expect(isValidInviteEmail(undefined)).toBe(false);
  });

  it('rejects null', () => {
    expect(isValidInviteEmail(null)).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidInviteEmail('')).toBe(false);
  });

  it('rejects an address with no @ sign', () => {
    expect(isValidInviteEmail('notanemail')).toBe(false);
  });

  it('rejects an email containing a double-quote (Cognito filter injection)', () => {
    expect(isValidInviteEmail('foo"@bar.com')).toBe(false);
  });

  it('rejects an email where the double-quote is mid-address', () => {
    expect(isValidInviteEmail('a"b@example.com')).toBe(false);
  });

  it('rejects a crafted filter-escape payload', () => {
    // Payload that would break the ListUsers filter: email = "x" OR "1"="1"
    expect(isValidInviteEmail('x" OR "1"="1')).toBe(false);
  });

  it('rejects an array — would throw TypeError on old .includes guard', () => {
    expect(isValidInviteEmail(['user@example.com'])).toBe(false);
  });

  it('rejects a plain object', () => {
    expect(isValidInviteEmail({ email: 'user@example.com' })).toBe(false);
  });

  it('rejects a number', () => {
    expect(isValidInviteEmail(42)).toBe(false);
  });

  it('rejects a string longer than 254 characters', () => {
    const long = 'a'.repeat(245) + '@b.com'; // 251 chars — under cap
    const tooLong = 'a'.repeat(249) + '@b.com'; // 255 chars — over cap
    expect(isValidInviteEmail(long)).toBe(true);
    expect(isValidInviteEmail(tooLong)).toBe(false);
  });
});

describe('escapeHtml', () => {
  it('encodes the five dangerous characters', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('leaves plain text untouched', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });

  it('handles null/undefined gracefully', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('buildHtml XSS escaping', () => {
  it('escapes <script> in hostName', () => {
    const html = buildHtml({ ...BASE, hostName: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes <b> tag in location', () => {
    const html = buildHtml({ ...BASE, location: 'A<b>B</b>C' });
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;');
  });

  it('escapes HTML in description', () => {
    const html = buildHtml({ ...BASE, description: '<img src=x onerror=alert(1)>' });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('escapes HTML in name (greeting)', () => {
    const html = buildHtml({ ...BASE, name: '<em>Alice</em>' });
    expect(html).not.toContain('<em>');
    expect(html).toContain('&lt;em&gt;');
  });

  it('escapes HTML in dateStr', () => {
    const html = buildHtml({ ...BASE, dateStr: '&amp;<b>Friday</b>' });
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;');
  });

  it('escapes HTML in timeStr', () => {
    const html = buildHtml({ ...BASE, timeStr: '7:00<br>PM' });
    expect(html).not.toContain('<br>');
    expect(html).toContain('&lt;br&gt;');
  });

  it('escapes hostName in both occurrences', () => {
    const html = buildHtml({ ...BASE, hostName: '<b>Evil</b>' });
    // Two uses: "reminded by" and "Let X know"
    expect(html.indexOf('<b>')).toBe(-1);
    const count = (html.match(/&lt;b&gt;Evil&lt;\/b&gt;/g) ?? []).length;
    expect(count).toBe(2);
  });

  it('renders benign inputs without mangling them', () => {
    const html = buildHtml(BASE);
    expect(html).toContain('Bob');
    // apostrophe is legitimately encoded by escapeHtml
    expect(html).toContain('Bob&#39;s Place');
    expect(html).toContain('Bring your favourite games.');
  });
});

describe('buildInviteHtml XSS escaping', () => {
  // Regression guard for code-review findings #20 and #21 — same class of
  // bug as buildHtml; the implementer's first PR fixed buildHtml only,
  // reviewer caught that buildInviteHtml had the same gap.

  it('escapes a malicious hostName', () => {
    const html = buildInviteHtml({ ...BASE, hostName: '<script>alert(1)</script>' });
    expect(html.indexOf('<script>')).toBe(-1);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('escapes a malicious dateStr (finding #20)', () => {
    const html = buildInviteHtml({ ...BASE, dateStr: '<img src=x onerror=alert(1)>' });
    expect(html.indexOf('<img src=x')).toBe(-1);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes a malicious timeStr (finding #20)', () => {
    const html = buildInviteHtml({ ...BASE, timeStr: '<svg onload=alert(1)>' });
    expect(html.indexOf('<svg onload')).toBe(-1);
    expect(html).toContain('&lt;svg onload=alert(1)&gt;');
  });

  it('escapes a malicious name in the greeting (finding #21)', () => {
    const html = buildInviteHtml({ ...BASE, name: '<em>Mallory</em>' });
    expect(html.indexOf('<em>Mallory</em>')).toBe(-1);
    expect(html).toContain('Hi &lt;em&gt;Mallory&lt;/em&gt;!');
  });

  it('escapes a malicious location', () => {
    const html = buildInviteHtml({ ...BASE, location: '<b>Pwn</b>ed' });
    expect(html.indexOf('<b>Pwn</b>')).toBe(-1);
    expect(html).toContain('&lt;b&gt;Pwn&lt;/b&gt;ed');
  });

  it('escapes a malicious description', () => {
    const html = buildInviteHtml({ ...BASE, description: '<iframe src=evil></iframe>' });
    expect(html.indexOf('<iframe')).toBe(-1);
    expect(html).toContain('&lt;iframe src=evil&gt;&lt;/iframe&gt;');
  });

  it('escapes hostName in both occurrences (invite + RSVP prompt)', () => {
    const html = buildInviteHtml({ ...BASE, hostName: '<x>' });
    expect(html.indexOf('<x>')).toBe(-1);
    const count = (html.match(/&lt;x&gt;/g) ?? []).length;
    expect(count).toBe(2);
  });

  it('renders benign inputs cleanly', () => {
    const html = buildInviteHtml(BASE);
    expect(html).toContain('Bob');
    expect(html).toContain('Bob&#39;s Place');
    expect(html).toContain('Bring your favourite games.');
  });
});
