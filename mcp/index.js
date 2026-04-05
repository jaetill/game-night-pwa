#!/usr/bin/env node
// Game Night MCP Server
// Wraps the Game Night PWA API for use with Claude Desktop / Claude Code.
//
// Config via environment variables:
//   GAME_NIGHT_API_KEY  — required; X-API-Key sent on every request
//   GAME_NIGHT_API_URL  — optional; defaults to prod API Gateway URL

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const API_URL = (process.env.GAME_NIGHT_API_URL || 'https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod').replace(/\/$/, '');
const API_KEY = process.env.GAME_NIGHT_API_KEY || '';

if (!API_KEY) {
  process.stderr.write('Warning: GAME_NIGHT_API_KEY is not set — all requests will fail auth\n');
}

// ── API helpers ───────────────────────────────────────────

function headers() {
  return { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' };
}

async function apiFetch(path, options = {}) {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, { ...options, headers: { ...headers(), ...options.headers } });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const msg = json?.error || json?.message || text || `HTTP ${res.status}`;
    throw new Error(`API error ${res.status}: ${msg}`);
  }
  return json;
}

// ── MCP server setup ──────────────────────────────────────

const server = new McpServer({
  name: 'game-night',
  version: '1.0.0',
});

// ── Tool: search_games ────────────────────────────────────

server.tool(
  'search_games',
  'Search the user\'s BGG game collection by title. Returns up to 5 matching games. Use this before create_event to resolve game names to game objects.',
  { q: z.string().describe('Search query — partial or full game title') },
  async ({ q }) => {
    const data = await apiFetch(`/search-games?q=${encodeURIComponent(q)}`);
    const results = data.results || [];
    if (results.length === 0) {
      return { content: [{ type: 'text', text: `No games found matching "${q}". Check spelling or try a shorter search term.` }] };
    }
    const lines = results.map(g =>
      `- ${g.title} (bggId: ${g.bggId}, players: ${g.minPlayers}–${g.maxPlayers})`
    );
    return { content: [{ type: 'text', text: `Found ${results.length} game(s):\n${lines.join('\n')}` }] };
  }
);

// ── Tool: list_groups ─────────────────────────────────────

server.tool(
  'list_groups',
  'List saved invitation groups. Each group has a name and a list of email addresses.',
  {},
  async () => {
    const data = await apiFetch('/groups');
    const groups = data.groups || [];
    if (groups.length === 0) {
      return { content: [{ type: 'text', text: 'No saved groups. Use save_group to create one.' }] };
    }
    const lines = groups.map(g => `- ${g.name}: ${g.emails.join(', ')}`);
    return { content: [{ type: 'text', text: `Saved groups:\n${lines.join('\n')}` }] };
  }
);

// ── Tool: save_group ──────────────────────────────────────

server.tool(
  'save_group',
  'Create or update a named invitation group. If a group with the same name already exists it will be replaced.',
  {
    name:   z.string().describe('Group name (e.g. "Friday crew")'),
    emails: z.array(z.string().email()).describe('List of email addresses in the group'),
  },
  async ({ name, emails }) => {
    const data = await apiFetch('/groups', {
      method: 'POST',
      body: JSON.stringify({ name, emails }),
    });
    const groups = data.groups || [];
    const saved = groups.find(g => g.name === name);
    return { content: [{ type: 'text', text: `Saved group "${name}" with ${saved?.emails.length ?? emails.length} email(s).` }] };
  }
);

// ── Tool: create_event ────────────────────────────────────

server.tool(
  'create_event',
  'Create a new game night event. Game names are resolved via search_games automatically — you can pass partial titles. Guests can be provided as a saved group name or a list of email addresses.',
  {
    date:        z.string().describe('Event date in YYYY-MM-DD format'),
    time:        z.string().optional().describe('Event time, e.g. "7:00 PM"'),
    location:    z.string().optional().describe('Location or address'),
    description: z.string().optional().describe('Optional description or notes'),
    game_names:  z.array(z.string()).optional().describe('Game titles to include — resolved from your BGG collection via search'),
    group_name:  z.string().optional().describe('Saved group name to invite — resolved via list_groups'),
    emails:      z.array(z.string()).optional().describe('Additional emails to invite (combined with group_name if provided)'),
  },
  async ({ date, time, location, description, game_names, group_name, emails }) => {
    // Resolve games
    const selectedGames = [];
    const notFound = [];
    for (const name of game_names || []) {
      const data = await apiFetch(`/search-games?q=${encodeURIComponent(name)}`);
      const results = data.results || [];
      if (results.length === 0) {
        notFound.push(name);
      } else {
        const match = results[0];
        selectedGames.push({ id: match.bggId, title: match.title, maxPlayers: match.maxPlayers });
      }
    }

    if (notFound.length > 0) {
      return {
        content: [{
          type: 'text',
          text: `Could not find these games in your collection: ${notFound.join(', ')}.\nCheck the spelling or use search_games to find the exact title, then try again.`,
        }],
      };
    }

    // Resolve invited emails
    let invited = [...(emails || [])];
    if (group_name) {
      const data = await apiFetch('/groups');
      const group = (data.groups || []).find(g => g.name === group_name);
      if (!group) {
        const names = (data.groups || []).map(g => `"${g.name}"`).join(', ');
        return {
          content: [{
            type: 'text',
            text: `Group "${group_name}" not found. Available groups: ${names || 'none'}. Use save_group to create it.`,
          }],
        };
      }
      invited = [...new Set([...group.emails, ...invited])];
    }

    const body = { date, time, location, description, selectedGames, invited };
    const data = await apiFetch('/create-event', { method: 'POST', body: JSON.stringify(body) });

    const gamesStr = selectedGames.length > 0 ? `\nGames: ${selectedGames.map(g => g.title).join(', ')}` : '';
    const inviteStr = invited.length > 0 ? `\nInvited: ${invited.join(', ')}` : '';
    return {
      content: [{
        type: 'text',
        text: `Event created! ID: ${data.id}\nDate: ${date}${time ? `\nTime: ${time}` : ''}${location ? `\nLocation: ${location}` : ''}${gamesStr}${inviteStr}`,
      }],
    };
  }
);

// ── Tool: invite_to_event ─────────────────────────────────

server.tool(
  'invite_to_event',
  'Send invite emails to guests for an existing event. Guests can be a saved group name and/or a list of email addresses.',
  {
    event_id:   z.string().describe('Event ID (from list_events or create_event)'),
    group_name: z.string().optional().describe('Saved group name to invite'),
    emails:     z.array(z.string()).optional().describe('Additional individual email addresses to invite'),
  },
  async ({ event_id, group_name, emails }) => {
    // Resolve emails from group if provided
    let allEmails = [...(emails || [])];
    if (group_name) {
      const data = await apiFetch('/groups');
      const group = (data.groups || []).find(g => g.name === group_name);
      if (!group) {
        const names = (data.groups || []).map(g => `"${g.name}"`).join(', ');
        return {
          content: [{
            type: 'text',
            text: `Group "${group_name}" not found. Available groups: ${names || 'none'}.`,
          }],
        };
      }
      allEmails = [...new Set([...group.emails, ...allEmails])];
    }

    if (allEmails.length === 0) {
      return { content: [{ type: 'text', text: 'No emails provided. Pass group_name or emails (or both).' }] };
    }

    // Send invite for each email via POST /invite (API key auth)
    const results = [];
    for (const email of allEmails) {
      try {
        await apiFetch('/invite', {
          method: 'POST',
          body: JSON.stringify({ nightId: event_id, action: 'invite', email }),
        });
        results.push({ email, ok: true });
      } catch (e) {
        results.push({ email, ok: false, error: e.message });
      }
    }

    const sent = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok);
    let text = `Sent ${sent}/${allEmails.length} invite(s).`;
    if (failed.length > 0) {
      text += `\nFailed: ${failed.map(f => `${f.email} (${f.error})`).join(', ')}`;
    }
    return { content: [{ type: 'text', text }] };
  }
);

// ── Tool: list_events ─────────────────────────────────────

server.tool(
  'list_events',
  'List upcoming game night events (today and future). Returns event ID, date, time, location, host, and game count.',
  {
    include_past: z.boolean().optional().describe('Set true to include past events too (default: false)'),
  },
  async ({ include_past } = {}) => {
    // Get presigned URL then fetch gameNights.json
    const tokenData = await apiFetch('/get-token');
    const presignedUrl = tokenData.url;
    if (!presignedUrl) throw new Error('No presigned URL returned from /get-token');

    const res = await fetch(presignedUrl);
    if (!res.ok) throw new Error(`Failed to fetch game nights: HTTP ${res.status}`);
    const nights = await res.json();

    const today = new Date().toISOString().slice(0, 10);
    const filtered = include_past
      ? nights
      : nights.filter(n => n.date >= today);

    filtered.sort((a, b) => a.date.localeCompare(b.date));

    if (filtered.length === 0) {
      return { content: [{ type: 'text', text: include_past ? 'No events found.' : 'No upcoming events. Past events can be shown with include_past: true.' }] };
    }

    const lines = filtered.map(n => {
      const gameCount = Object.keys(n.selectedGames || {}).length;
      const rsvpCount = (n.rsvps || []).length;
      return `- [${n.id}] ${n.date}${n.time ? ` ${n.time}` : ''}${n.location ? ` @ ${n.location}` : ''} | ${gameCount} game(s) | ${rsvpCount} RSVP(s)`;
    });
    return { content: [{ type: 'text', text: `${filtered.length} event(s):\n${lines.join('\n')}` }] };
  }
);

// ── Tool: get_event ───────────────────────────────────────

server.tool(
  'get_event',
  'Get details for a specific game night event by ID.',
  { event_id: z.string().describe('Event ID') },
  async ({ event_id }) => {
    const tokenData = await apiFetch('/get-token');
    const presignedUrl = tokenData.url;
    if (!presignedUrl) throw new Error('No presigned URL returned from /get-token');

    const res = await fetch(presignedUrl);
    if (!res.ok) throw new Error(`Failed to fetch game nights: HTTP ${res.status}`);
    const nights = await res.json();

    const night = nights.find(n => n.id === event_id);
    if (!night) {
      return { content: [{ type: 'text', text: `Event "${event_id}" not found. Use list_events to see available event IDs.` }] };
    }

    const games = Object.entries(night.selectedGames || {}).map(([id, g]) =>
      `  - ${id}: ${g.signedUpPlayers?.length ?? 0}/${g.maxPlayers} signed up`
    );
    const rsvps = (night.rsvps || []).map(r => `  - ${r.userId}`);
    const declined = (night.declined || []).map(id => `  - ${id}`);

    const lines = [
      `Event: ${night.id}`,
      `Date: ${night.date}${night.time ? ` at ${night.time}` : ''}`,
      night.location    ? `Location: ${night.location}` : null,
      night.description ? `Description: ${night.description}` : null,
      `Host: ${night.hostUserId}`,
      `Invited: ${(night.invited || []).length}`,
      games.length > 0    ? `Games:\n${games.join('\n')}` : 'Games: none',
      rsvps.length > 0    ? `RSVPs:\n${rsvps.join('\n')}` : 'RSVPs: none',
      declined.length > 0 ? `Declined:\n${declined.join('\n')}` : null,
    ].filter(Boolean);

    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

// ── Start ─────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
