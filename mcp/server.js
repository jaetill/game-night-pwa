#!/usr/bin/env node
/**
 * Game Night MCP Server
 *
 * Wraps the game night app's API as Model Context Protocol tools so Claude
 * can create events, search games, manage groups, and send invites without
 * the user opening a browser.
 *
 * Configuration (environment variables):
 *   GAME_NIGHT_API_KEY  — required: your personal API key (X-API-Key header)
 *   GAME_NIGHT_API_URL  — optional: overrides the default prod API Gateway URL
 *
 * Auth dependencies (Phases 1–4 must be deployed):
 *   /create-event  — X-API-Key (Phase 4 authorizer)
 *   /search-games  — X-API-Key (Phase 4 authorizer)
 *   /groups        — X-API-Key (Phase 4 authorizer)
 *   /get-token     — X-API-Key (Phase 4 authorizer must cover this route too)
 *   /invite        — X-API-Key (Phase 4 authorizer must cover this route too)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const API_BASE = (process.env.GAME_NIGHT_API_URL || 'https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod').replace(/\/$/, '');
const API_KEY  = process.env.GAME_NIGHT_API_KEY;

// ── API client ────────────────────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  if (!API_KEY) throw new Error('GAME_NIGHT_API_KEY environment variable is not set');

  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
      ...options.headers,
    },
  });

  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`API returned non-JSON (${res.status}): ${raw.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error(data.error || `API error ${res.status}`);
  }

  return data;
}

// ── Core API wrappers ─────────────────────────────────────────────────────────

async function searchGames(query) {
  const data = await apiFetch(`/search-games?q=${encodeURIComponent(query.trim())}`);
  return data.results || [];
}

async function listGroups() {
  const data = await apiFetch('/groups');
  return data.groups || [];
}

async function fetchGameNights() {
  // Step 1: get a presigned S3 download URL
  const { url } = await apiFetch('/get-token');

  // Step 2: download gameNights.json directly from S3 (no auth header needed)
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download game nights: ${res.status}`);
  const nights = await res.json();
  return Array.isArray(nights) ? nights : [];
}

// ── MCP server setup ──────────────────────────────────────────────────────────

const server = new Server(
  { name: 'game-night-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } },
);

// ── Tool definitions ──────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'search_games',
      description:
        "Search the host's BoardGameGeek collection by game title. " +
        'Use this to verify a game name and resolve it to a BGG ID before creating an event. ' +
        'Returns up to 5 matches with player counts.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Game title to search for (e.g. "Amsterdam", "Spirit Island")',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'list_groups',
      description:
        "List the host's saved invitation groups (e.g. \"Regular Group\", \"Thursday Crew\"). " +
        'Each group has a name and a list of email addresses. ' +
        "Call this before create_event or invite_to_event when the user mentions a group by name.",
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'save_group',
      description: 'Save or update a named invitation group with a list of email addresses. ' +
        'If a group with the same name already exists it is replaced.',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Group name (e.g. "Regular Group")',
          },
          emails: {
            type: 'array',
            items: { type: 'string' },
            description: 'Email addresses to include in the group',
          },
        },
        required: ['name', 'emails'],
      },
    },
    {
      name: 'create_event',
      description:
        'Create a new game night event. ' +
        'If game_names are provided they are resolved against the BGG collection first — ' +
        'if any name cannot be matched the tool returns an error with suggestions. ' +
        'If group_name is provided the group is resolved to its email list. ' +
        'Date is required; always ask for time and location before calling if they are missing.',
      inputSchema: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Event date in YYYY-MM-DD format (e.g. "2025-05-01")',
          },
          time: {
            type: 'string',
            description: 'Start time (e.g. "19:00" or "7pm")',
          },
          location: {
            type: 'string',
            description: 'Location or address (e.g. "Jason\'s place")',
          },
          description: {
            type: 'string',
            description: 'Optional notes for the event',
          },
          game_names: {
            type: 'array',
            items: { type: 'string' },
            description: 'Game titles to include (e.g. ["Amsterdam", "Spirit Island"]). Each is searched in the BGG collection.',
          },
          group_name: {
            type: 'string',
            description: 'Name of a saved group to invite (e.g. "Regular Group"). Takes precedence over emails when both are provided, but both lists are merged.',
          },
          emails: {
            type: 'array',
            items: { type: 'string' },
            description: 'Email addresses to invite directly (merged with group_name emails if both are provided)',
          },
        },
        required: ['date'],
      },
    },
    {
      name: 'invite_to_event',
      description:
        'Send invitation emails for an existing game night event. ' +
        'Provide either group_name (resolved from saved groups) or a list of emails, or both. ' +
        'Sends one invite email per address via Postmark.',
      inputSchema: {
        type: 'object',
        properties: {
          event_id: {
            type: 'string',
            description: 'The ID of the game night event',
          },
          group_name: {
            type: 'string',
            description: 'Name of a saved group to invite',
          },
          emails: {
            type: 'array',
            items: { type: 'string' },
            description: 'Individual email addresses to invite',
          },
        },
        required: ['event_id'],
      },
    },
    {
      name: 'list_events',
      description:
        'List game night events. By default returns only upcoming (future) events sorted by date. ' +
        'Set include_past to true to include past events.',
      inputSchema: {
        type: 'object',
        properties: {
          include_past: {
            type: 'boolean',
            description: 'Include past events (default: false)',
          },
        },
        required: [],
      },
    },
    {
      name: 'get_event',
      description: 'Get full details of a specific game night event by ID, including games, invited list, RSVPs, and declines.',
      inputSchema: {
        type: 'object',
        properties: {
          event_id: {
            type: 'string',
            description: 'The ID of the event to retrieve',
          },
        },
        required: ['event_id'],
      },
    },
  ],
}));

// ── Tool call handler ─────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {

      // ── search_games ──────────────────────────────────────────────────────
      case 'search_games': {
        const query = (args.query || '').trim();
        if (!query) return text('Error: query is required');

        const results = await searchGames(query);
        if (results.length === 0) {
          return text(
            `No games found matching "${query}". ` +
            `The collection may be empty, not yet imported from BGG, or the title may be spelled differently. ` +
            `Try a shorter or alternative title.`,
          );
        }

        const lines = results.map(g =>
          `• ${g.title} (BGG ID: ${g.bggId}, ${g.minPlayers}–${g.maxPlayers} players)`,
        );
        return text(`Found ${results.length} match(es) for "${query}":\n${lines.join('\n')}`);
      }

      // ── list_groups ───────────────────────────────────────────────────────
      case 'list_groups': {
        const groups = await listGroups();
        if (groups.length === 0) {
          return text('No saved groups found. Use save_group to create a named group of contacts.');
        }
        const lines = groups.map(g =>
          `• ${g.name} (${g.emails.length} member${g.emails.length !== 1 ? 's' : ''}): ${g.emails.join(', ')}`,
        );
        return text(`${groups.length} saved group(s):\n${lines.join('\n')}`);
      }

      // ── save_group ────────────────────────────────────────────────────────
      case 'save_group': {
        const groupName  = (args.name || '').trim();
        const emails     = args.emails;

        if (!groupName)                    return text('Error: name is required');
        if (!Array.isArray(emails) || emails.length === 0)
          return text('Error: emails must be a non-empty array');

        const validEmails   = emails.filter(e => typeof e === 'string' && e.includes('@'));
        const invalidEmails = emails.filter(e => !validEmails.includes(e));

        if (validEmails.length === 0) {
          return text(`Error: no valid email addresses provided. Got: ${emails.join(', ')}`);
        }

        const data   = await apiFetch('/groups', {
          method: 'POST',
          body: JSON.stringify({ name: groupName, emails: validEmails }),
        });
        const saved = (data.groups || []).find(g => g.name === groupName);

        let response = `Saved group "${groupName}" with ${saved?.emails.length ?? validEmails.length} member(s).`;
        if (invalidEmails.length > 0) {
          response += ` (Skipped invalid addresses: ${invalidEmails.join(', ')})`;
        }
        return text(response);
      }

      // ── create_event ──────────────────────────────────────────────────────
      case 'create_event': {
        const { date, time, location, description, game_names, group_name, emails: directEmails } = args;
        if (!date) return text('Error: date is required (YYYY-MM-DD format, e.g. "2025-05-01")');

        // ── Resolve game names → BGG objects ──
        const resolvedGames  = [];
        const unresolvedGames = [];

        if (Array.isArray(game_names) && game_names.length > 0) {
          for (const gameName of game_names) {
            const results = await searchGames(gameName);
            if (results.length === 0) {
              unresolvedGames.push(gameName);
            } else {
              resolvedGames.push(results[0]); // best match first
            }
          }
        }

        if (unresolvedGames.length > 0) {
          const plural = unresolvedGames.length === 1 ? 'game was' : 'games were';
          return text(
            `The following ${plural} not found in your BGG collection: ${unresolvedGames.join(', ')}.\n` +
            `Use search_games to find the correct title, then retry with the exact name.`,
          );
        }

        // ── Resolve group name → emails ──
        let inviteEmails = Array.isArray(directEmails) ? [...directEmails] : [];

        if (group_name) {
          const groups = await listGroups();
          const match  = groups.find(g => g.name.toLowerCase() === group_name.toLowerCase());
          if (!match) {
            const available = groups.map(g => `"${g.name}"`).join(', ') || 'none';
            return text(
              `Group "${group_name}" not found. Available groups: ${available}.\n` +
              `Use list_groups to see all groups, or save_group to create one.`,
            );
          }
          // Merge, deduplicate
          inviteEmails = [...new Set([...inviteEmails, ...match.emails])];
        }

        // ── Build request body ──
        const selectedGames = resolvedGames.map(g => ({
          id:         g.bggId,
          bggId:      g.bggId,
          title:      g.title,
          maxPlayers: g.maxPlayers,
        }));

        const body = {
          date,
          selectedGames,
          invited: inviteEmails,
        };
        if (time)        body.time        = time;
        if (location)    body.location    = location;
        if (description) body.description = description;

        const data = await apiFetch('/create-event', {
          method: 'POST',
          body: JSON.stringify(body),
        });

        // ── Build confirmation message ──
        const headline = [
          `Created game night on ${date}`,
          time     ? `at ${time}`       : null,
          location ? `at ${location}`   : null,
          `(ID: ${data.id})`,
        ].filter(Boolean).join(' ');

        const details = [headline + '.'];
        if (resolvedGames.length > 0) {
          details.push(`Games: ${resolvedGames.map(g => g.title).join(', ')}.`);
        }
        if (inviteEmails.length > 0) {
          details.push(
            `Invited list set to ${inviteEmails.length} address(es): ${inviteEmails.join(', ')}.\n` +
            `Call invite_to_event with ID ${data.id} to send the actual invitation emails.`,
          );
        } else {
          details.push('No guests added yet — call invite_to_event to send invitations.');
        }

        return text(details.join('\n'));
      }

      // ── invite_to_event ───────────────────────────────────────────────────
      case 'invite_to_event': {
        const { event_id, group_name, emails: directEmails } = args;
        if (!event_id) return text('Error: event_id is required');

        let inviteEmails = Array.isArray(directEmails) ? [...directEmails] : [];

        if (group_name) {
          const groups = await listGroups();
          const match  = groups.find(g => g.name.toLowerCase() === group_name.toLowerCase());
          if (!match) {
            const available = groups.map(g => `"${g.name}"`).join(', ') || 'none';
            return text(
              `Group "${group_name}" not found. Available groups: ${available}.`,
            );
          }
          inviteEmails = [...new Set([...inviteEmails, ...match.emails])];
        }

        if (inviteEmails.length === 0) {
          return text('Error: provide group_name, emails, or both');
        }

        const sent   = [];
        const errors = [];

        for (const email of inviteEmails) {
          try {
            await apiFetch('/invite', {
              method: 'POST',
              body: JSON.stringify({ nightId: event_id, action: 'invite', email }),
            });
            sent.push(email);
          } catch (e) {
            errors.push({ email, error: e.message });
          }
        }

        const lines = [`Sent ${sent.length} of ${inviteEmails.length} invite(s).`];
        if (sent.length > 0)   lines.push(`Sent to: ${sent.join(', ')}.`);
        if (errors.length > 0) lines.push(`Failed: ${errors.map(e => `${e.email} (${e.error})`).join('; ')}.`);

        return text(lines.join('\n'));
      }

      // ── list_events ───────────────────────────────────────────────────────
      case 'list_events': {
        const includePast = args.include_past === true;
        const nights      = await fetchGameNights();
        const today       = new Date().toISOString().slice(0, 10);

        const filtered = nights
          .filter(n => includePast || n.date >= today)
          .sort((a, b) => a.date.localeCompare(b.date));

        if (filtered.length === 0) {
          return text(
            includePast
              ? 'No game nights found.'
              : 'No upcoming game nights. Use create_event to schedule one.',
          );
        }

        const lines = filtered.map(n => {
          const gameCount  = Object.keys(n.selectedGames || {}).length;
          const guestCount = (n.invited || []).length;
          const rsvpCount  = (n.rsvps   || []).length;
          const parts = [n.date];
          if (n.time)     parts.push(`at ${n.time}`);
          if (n.location) parts.push(`— ${n.location}`);
          return (
            `• ${parts.join(' ')} | ${gameCount} game(s), ${guestCount} invited, ${rsvpCount} RSVP'd | ID: ${n.id}`
          );
        });

        return text(`${filtered.length} event(s):\n${lines.join('\n')}`);
      }

      // ── get_event ─────────────────────────────────────────────────────────
      case 'get_event': {
        const { event_id } = args;
        if (!event_id) return text('Error: event_id is required');

        const nights = await fetchGameNights();
        const night  = nights.find(n => n.id === event_id);

        if (!night) {
          return text(
            `Event "${event_id}" not found. Use list_events to see available event IDs.`,
          );
        }

        const gameIds = Object.keys(night.selectedGames || {});
        const rsvps   = (night.rsvps    || []).map(r => r.userId || r);
        const lines   = [
          `Event ID:  ${night.id}`,
          `Date:      ${night.date}${night.time ? ` at ${night.time}` : ''}`,
          night.location    ? `Location:  ${night.location}`               : null,
          night.description ? `Notes:     ${night.description}`            : null,
          `Games:     ${gameIds.join(', ') || 'none'}`,
          `Invited:   ${(night.invited  || []).join(', ') || 'none'}`,
          `RSVP'd:    ${rsvps.join(', ')                  || 'none'}`,
          `Declined:  ${(night.declined || []).join(', ') || 'none'}`,
        ].filter(Boolean);

        return text(lines.join('\n'));
      }

      default:
        return text(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return text(`Error: ${err.message}`);
  }
});

// ── Helper ────────────────────────────────────────────────────────────────────

function text(content) {
  return { content: [{ type: 'text', text: content }] };
}

// ── Start ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!API_KEY) {
    process.stderr.write(
      'Warning: GAME_NIGHT_API_KEY is not set — all API calls will fail with an auth error.\n',
    );
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});
