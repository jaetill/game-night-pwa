# Game Night MCP Server

An MCP server that wraps the Game Night PWA API, letting Claude help you plan board game nights.

## Tools

| Tool | Description |
|------|-------------|
| `search_games` | Search your BGG collection by title |
| `list_groups` | List saved invitation groups |
| `save_group` | Create or update a named group of emails |
| `create_event` | Create a new game night event |
| `invite_to_event` | Send invite emails for an existing event |
| `list_events` | List upcoming (or all) game night events |
| `get_event` | Get details for a specific event |

## Setup

### 1. Get an API key

Keys are stored in SSM Parameter Store at `/game-night/api-keys/{key}` (SecureString).
The value is your Cognito username (e.g. `jaetill`).

```sh
# Generate a 32-byte hex key
KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Store it in SSM, mapping to your Cognito username
aws ssm put-parameter \
  --region us-east-2 \
  --name "/game-night/api-keys/$KEY" \
  --value "<your-cognito-username>" \
  --type SecureString
```

### 2. Install

```bash
cd mcp
npm install
```

### 3. Configure

| Variable | Required | Default |
|----------|----------|---------|
| `GAME_NIGHT_API_KEY` | Yes | — |
| `GAME_NIGHT_API_URL` | No | `https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod` |

## Claude Desktop config

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "game-night": {
      "command": "node",
      "args": ["/absolute/path/to/game-night-pwa/mcp/index.js"],
      "env": {
        "GAME_NIGHT_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Claude Code config

Add to `.claude/mcp.json` in the project root (or run `claude mcp add`):

```json
{
  "mcpServers": {
    "game-night": {
      "command": "node",
      "args": ["mcp/index.js"],
      "env": {
        "GAME_NIGHT_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Or register it globally via the CLI:

```bash
claude mcp add game-night node /absolute/path/to/game-night-pwa/mcp/index.js \
  --env GAME_NIGHT_API_KEY=your-api-key-here
```
