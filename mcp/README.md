# Game Night MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that
wraps the Game Night app's API as native Claude tools. With this installed,
Claude can create game night events, search your BoardGameGeek collection,
manage invitation groups, and send invites — all through conversation.

## Prerequisites

- Node.js 18 or later
- Phases 1–4 of the Voice Workflow deployed to AWS
  (Lambda functions `createEvent`, `searchGames`, `groups`, and the
  `apiKeyAuthorizer` covering all five routes the MCP server calls)
- A personal API key stored in SSM at `/game-night/api-keys/<your-key>`

## Install

```sh
cd mcp
npm install
```

## Configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `GAME_NIGHT_API_KEY` | Yes | — | Your personal API key (`X-API-Key`) |
| `GAME_NIGHT_API_URL` | No | `https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod` | Override the API base URL |

### Generating an API key

```sh
# Generate a 32-byte hex key
KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Store it in SSM, mapping to your Cognito userId
aws ssm put-parameter \
  --region us-east-2 \
  --name "/game-night/api-keys/$KEY" \
  --value "<your-cognito-user-id>" \
  --type SecureString
```

Your Cognito userId is the `sub` claim from any JWT you receive when signing
in to the app. You can extract it from browser DevTools → Application →
Local Storage or from the Cognito console.

## Configure Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "game-night": {
      "command": "node",
      "args": ["/absolute/path/to/game-night-pwa/mcp/server.js"],
      "env": {
        "GAME_NIGHT_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Restart Claude Desktop after saving the config.

## Configure Claude Code

Add to your project or global settings (`~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "game-night": {
      "command": "node",
      "args": ["/absolute/path/to/game-night-pwa/mcp/server.js"],
      "env": {
        "GAME_NIGHT_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Or pass the key via your shell environment:

```json
{
  "mcpServers": {
    "game-night": {
      "command": "node",
      "args": ["/absolute/path/to/game-night-pwa/mcp/server.js"]
    }
  }
}
```

```sh
export GAME_NIGHT_API_KEY="your-api-key-here"
claude
```

## Available Tools

| Tool | What it does |
|---|---|
| `search_games` | Search your BGG collection by title — resolves fuzzy names to BGG IDs |
| `list_groups` | List your saved invitation groups |
| `save_group` | Create or update a named group of email addresses |
| `create_event` | Create a game night event; resolves game names and groups automatically |
| `invite_to_event` | Send invitation emails to a group or list of addresses |
| `list_events` | List upcoming (or all) game night events |
| `get_event` | Get full details of a specific event by ID |

## Example Conversation Flow

The following shows the full voice-driven game night creation workflow
described in `VOICE_WORKFLOW_PLAN.md` (Phase 5):

---

**User:** Set up a game night on May 1st. Add Amsterdam and Spirit Island.
Invite my regular group.

**Claude** *(internal tool calls)*:
1. `search_games("Amsterdam")` → `Amsterdam (BGG ID: 245655, 2–4 players)`
2. `search_games("Spirit Island")` → `Spirit Island (BGG ID: 162886, 1–4 players)`
3. `list_groups()` → finds "Regular Group": alice@example.com, bob@example.com, carol@example.com

**Claude:** I found both games and your Regular Group (Alice, Bob, Carol).
What time and where should I set it up?

---

**User:** 7pm at my place.

**Claude** *(internal tool calls)*:

4. `create_event({ date: "2025-05-01", time: "19:00", location: "my place", game_names: ["Amsterdam", "Spirit Island"], group_name: "Regular Group" })`

**Claude:** Done! Game night created for May 1 at 7pm at my place
(ID: `lz3xkq4m`). Games: Amsterdam, Spirit Island. Sending invites
to Alice, Bob, and Carol now…

5. `invite_to_event({ event_id: "lz3xkq4m", group_name: "Regular Group" })`

**Claude:** Invites sent to alice@example.com, bob@example.com, and
carol@example.com. They'll each get an email with a link to RSVP.

---

**User:** What game nights do I have coming up?

**Claude** *(internal tool call)*:

6. `list_events()`

**Claude:**
```
2 upcoming event(s):
• 2025-05-01 at 19:00 — my place | 2 games, 3 invited, 0 RSVP'd | ID: lz3xkq4m
• 2025-05-15 at 18:30 — the usual spot | 1 game, 5 invited, 3 RSVP'd | ID: m4yp2n8r
```

---

## Auth Notes

The MCP server sends `X-API-Key: <your-key>` on every request. The
`apiKeyAuthorizer` Lambda (Phase 4) validates this header and injects
your `userId` into the request context so downstream Lambdas scope all
reads/writes to your data.

The following routes must have the Phase 4 API key authorizer applied in
API Gateway (in addition to `/create-event`, `/search-games`, `/groups`):

| Route | Used by |
|---|---|
| `GET /get-token` | `list_events`, `get_event` |
| `POST /invite` | `invite_to_event` |

Existing browser-facing routes (`/nudge`, `/upload-token`) continue to use
the Cognito JWT authorizer and are not called by this MCP server.
