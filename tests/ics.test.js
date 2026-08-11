import { describe, it, expect } from 'vitest';
import { buildIcs, _parseTime } from '../lambda/lib/ics.js';

const NOW = new Date('2026-08-11T12:00:00Z');

describe('parseTime', () => {
  it('parses 24h and 12h formats', () => {
    expect(_parseTime('19:00')).toEqual({ h: 19, m: 0 });
    expect(_parseTime('7pm')).toEqual({ h: 19, m: 0 });
    expect(_parseTime('7:30 PM')).toEqual({ h: 19, m: 30 });
    expect(_parseTime('12am')).toEqual({ h: 0, m: 0 });
    expect(_parseTime('12:15 pm')).toEqual({ h: 12, m: 15 });
  });

  it('rejects unparseable times', () => {
    expect(_parseTime('after dinner')).toBeNull();
    expect(_parseTime('25:00')).toBeNull();
    expect(_parseTime(undefined)).toBeNull();
  });
});

describe('buildIcs', () => {
  const night = {
    id: 'n42',
    date: '2026-08-21',
    time: '7:00 PM',
    location: "Jason's place",
    description: 'Bring snacks; we, the hosts, provide drinks',
  };

  it('builds a timed event with a 3h default duration', () => {
    const ics = buildIcs(night, { hostName: 'Jason', appUrl: 'https://gamenights.jaetill.com/', now: NOW });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART:20260821T190000');
    expect(ics).toContain('DTEND:20260821T220000');
    expect(ics).toContain("SUMMARY:Game night at Jason's");
    expect(ics).toContain('UID:n42@gamenights.jaetill.com');
  });

  it('escapes RFC 5545 special characters', () => {
    const ics = buildIcs(night, { now: NOW });
    expect(ics).toContain("LOCATION:Jason's place");
    expect(ics).toContain('Bring snacks\\; we\\, the hosts\\, provide drinks');
  });

  it('falls back to an all-day event when time is unparseable', () => {
    const ics = buildIcs({ ...night, time: 'evening-ish' }, { now: NOW });
    expect(ics).toContain('DTSTART;VALUE=DATE:20260821');
    expect(ics).toContain('DTEND;VALUE=DATE:20260822');
  });

  it('rolls the end time past midnight correctly', () => {
    const ics = buildIcs({ ...night, time: '10:30 PM' }, { now: NOW });
    expect(ics).toContain('DTSTART:20260821T223000');
    expect(ics).toContain('DTEND:20260822T013000');
  });

  it('returns null without a parseable date', () => {
    expect(buildIcs({ id: 'x', date: 'soon' }, { now: NOW })).toBeNull();
    expect(buildIcs({ id: 'x' }, { now: NOW })).toBeNull();
  });

  it('uses CRLF line endings and folds long lines', () => {
    const long = buildIcs({ ...night, description: 'x'.repeat(300) }, { now: NOW });
    expect(long).toContain('\r\n');
    for (const line of long.split('\r\n')) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
  });
});
