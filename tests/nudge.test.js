// Unit tests for HTML-escaping in lambda/nudge.js buildHtml.
//
// Regression guard: buildHtml was interpolating user-supplied fields raw,
// while buildInviteHtml already called escapeHtml. This test locks in the
// fix so any future edit that removes escapeHtml calls breaks loudly here.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { _buildHtml: buildHtml, _escapeHtml: escapeHtml } = require('../lambda/nudge.js');

const BASE = {
  name: 'Alice',
  hostName: 'Bob',
  dateStr: 'Saturday, May 15',
  timeStr: '7:00 PM',
  location: 'Bob\'s Place',
  description: 'Bring your favourite games.',
};

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
