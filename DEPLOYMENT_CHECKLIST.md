# Voice Workflow Deployment Checklist

Step-by-step guide for deploying all five phases of the voice-driven game night
creation feature. Complete the phases in order — Phases 1–4 are independent of
each other but Phase 5 requires all four.

---

## Step 1 — Merge worktree branches into master

Each phase was built in a separate worktree branch. Merge them all before
deploying Lambda code.

| Phase | Branch | New files |
|-------|--------|-----------|
| 1 & 2 | `claude/sad-brown` | `lambda/createEvent.js`, `lambda/searchGames.js` |
| 3 | `claude/youthful-goldberg` | `lambda/groups.js` |
| 4 | `claude/sweet-villani` | `lambda/apiKeyAuthorizer.js`, `lambda/lib/resolveCallerId.js`, `scripts/manage-api-keys.js`, `API_KEY_SETUP.md` |
| 5 | `claude/thirsty-booth` | `mcp/server.js`, `mcp/package.json`, `mcp/README.md` |

```bash
git checkout master

git merge claude/sad-brown
git merge claude/youthful-goldberg
git merge claude/sweet-villani
git merge claude/thirsty-booth

git push origin master
```

If there are merge conflicts, the Lambda files don't overlap — only `nudge.js`
was present on master before. Resolve any conflicts in that file manually.

---

## Step 2 — Phase 1: Deploy `createEvent` Lambda

**What it does:** `POST /create-event` — reads `gameNights.json`, appends a new
event, writes it back. Returns `{ id, event }`.

### Create the Lambda

1. AWS Console → Lambda → **Create function**
2. **Name**: `createEvent`
3. **Runtime**: Node.js 20.x
4. **Architecture**: x86_64
5. Upload `lambda/createEvent.js` (zip the file or paste into inline editor)
6. **Handler**: `createEvent.handler`

### Environment variables

| Key | Value |
|-----|-------|
| `S3_BUCKET` | `jaetill-game-nights` |

### IAM execution role

Create a new role (or reuse an existing game-night role) with this inline policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::jaetill-game-nights/gameNights.json"
    }
  ]
}
```

Also attach `AWSLambdaBasicExecutionRole` for CloudWatch logs.

### API Gateway route

In API Gateway console for `pufsqfvq8g` (prod stage):

1. Create resource `/create-event`
2. Create method **POST**
3. Integration type: Lambda Function → `createEvent`
4. **Authorization**: `CognitoAuthorizer` (same authorizer used by existing routes)
5. Enable CORS (or add OPTIONS method manually matching the existing pattern)
6. Deploy to the `prod` stage

---

## Step 3 — Phase 2: Deploy `searchGames` Lambda

**What it does:** `GET /search-games?q=<query>` — reads the caller's BGG
collection from S3 and returns the top 5 matching games.

### Create the Lambda

1. **Name**: `searchGames`
2. **Runtime**: Node.js 20.x
3. Upload `lambda/searchGames.js`
4. **Handler**: `searchGames.handler`

### Environment variables

| Key | Value |
|-----|-------|
| `S3_BUCKET` | `jaetill-game-nights` |

### IAM execution role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::jaetill-game-nights/bgg-collections/*"
    }
  ]
}
```

Also attach `AWSLambdaBasicExecutionRole`.

### API Gateway route

1. Create resource `/search-games`
2. Create method **GET**
3. Integration: Lambda → `searchGames`
4. **Authorization**: `CognitoAuthorizer`
5. Enable CORS, deploy to `prod`

---

## Step 4 — Phase 3: Deploy `groups` Lambda

**What it does:** `GET /groups`, `POST /groups`, `DELETE /groups` — reads and
writes the `groups` array in `profiles/{userId}.json`.

### Create the Lambda

1. **Name**: `groups`
2. **Runtime**: Node.js 20.x
3. Upload `lambda/groups.js`
4. **Handler**: `groups.handler`

### Environment variables

| Key | Value |
|-----|-------|
| `S3_BUCKET` | `jaetill-game-nights` |

### IAM execution role

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::jaetill-game-nights/profiles/*"
    }
  ]
}
```

Also attach `AWSLambdaBasicExecutionRole`.

### API Gateway routes

Create resource `/groups` with three methods:

| Method | Integration | Authorization |
|--------|-------------|---------------|
| GET | Lambda → `groups` | `CognitoAuthorizer` |
| POST | Lambda → `groups` | `CognitoAuthorizer` |
| DELETE | Lambda → `groups` | `CognitoAuthorizer` |

Enable CORS on the resource, deploy to `prod`.

---

## Step 5 — Phase 4: Deploy API key authorizer

**What it does:** Lets the MCP server (and Claude) call the API using a static
`X-API-Key` header instead of a Cognito JWT. Keys are stored in SSM Parameter
Store. The authorizer injects `userId` into the request context so downstream
Lambdas scope reads/writes to the right user automatically.

### 5a. Create the `apiKeyAuthorizer` Lambda

1. **Name**: `apiKeyAuthorizer`
2. **Runtime**: Node.js 20.x
3. Upload `lambda/apiKeyAuthorizer.js`
4. **Handler**: `apiKeyAuthorizer.handler`
5. No environment variables required (SSM prefix defaults to `/game-night/api-keys/`)

### IAM execution role for `apiKeyAuthorizer`

Create a new role with this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ssm:GetParameter",
      "Resource": "arn:aws:ssm:us-east-2:214599503944:parameter/game-night/api-keys/*"
    }
  ]
}
```

Also attach `AWSLambdaBasicExecutionRole`.

### 5b. Register the authorizer in API Gateway

In API Gateway console → `pufsqfvq8g` → **Authorizers** → **Create authorizer**:

| Setting | Value |
|---------|-------|
| Name | `ApiKeyAuthorizer` |
| Type | Lambda |
| Lambda function | `apiKeyAuthorizer` |
| Lambda event payload | **Request** |
| Identity sources | `method.request.header.X-API-Key` |
| Authorization caching | Enabled |
| TTL | 300 seconds |

### 5c. Apply the authorizer to agent-facing routes

For each route listed below, go to the method → **Method Request** →
**Authorization** → select `ApiKeyAuthorizer`:

| Route | Why |
|-------|-----|
| `POST /create-event` | MCP `create_event` tool |
| `GET /search-games` | MCP `search_games` tool |
| `GET /groups` | MCP `list_groups` tool |
| `POST /groups` | MCP `save_group` tool |
| `GET /get-token` | MCP `list_events` / `get_event` tools |
| `POST /invite` | MCP `invite_to_event` tool |

> **Note:** Existing browser-facing routes (`/nudge`, `/upload-token`, `/bgg`)
> keep their Cognito JWT authorizer. Only the six routes above get the API key
> authorizer.

Deploy the `prod` stage after making these changes.

### 5d. Generate the first API key

You need your Cognito `userId` (the `sub` claim). Find it in:
- Browser DevTools → Application → Local Storage → look for the Cognito token
  entry and decode the JWT, or
- AWS Console → Cognito → `us-east-2_xneeJzaDJ` → Users → find your user →
  copy the **Username** (UUID format)

Then generate a key:

```bash
node scripts/manage-api-keys.js generate <your-cognito-user-id>
```

Example output:
```
API key created successfully.
  userId : abc123-def456-...
  apiKey : 3f8a9c2b1d4e...

Pass this as a request header:
  X-API-Key: 3f8a9c2b1d4e...

Store it somewhere safe — it cannot be retrieved from SSM after this point.
```

**Copy the key immediately.** It is shown once. Store it in your password
manager or directly in the MCP server config (next step).

Other key management commands:
```bash
node scripts/manage-api-keys.js list              # list all stored keys (truncated)
node scripts/manage-api-keys.js whoami <apiKey>   # show userId for a key
node scripts/manage-api-keys.js revoke <apiKey>   # delete a key from SSM
```

---

## Step 6 — Phase 5: Configure the MCP server

**What it does:** Wraps the game night API as native Claude tools so Claude can
create events, search games, manage groups, and send invites through conversation.

### 6a. Install dependencies

```bash
cd mcp
npm install
```

### 6b. Add to Claude Desktop

Edit `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "game-night": {
      "command": "node",
      "args": ["C:/Users/tille/Documents/Source Code/game-night-pwa/mcp/server.js"],
      "env": {
        "GAME_NIGHT_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

### 6c. Add to Claude Code (alternative)

Edit `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "game-night": {
      "command": "node",
      "args": ["C:/Users/tille/Documents/Source Code/game-night-pwa/mcp/server.js"],
      "env": {
        "GAME_NIGHT_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Or pass the key via shell environment instead of the config:

```bash
export GAME_NIGHT_API_KEY="your-api-key-here"
claude
```

### 6d. Environment variable reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GAME_NIGHT_API_KEY` | Yes | — | The API key generated in Step 5d |
| `GAME_NIGHT_API_URL` | No | `https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod` | Override the API base URL |

---

## Step 7 — Verification

### Phase 1 smoke test (createEvent)

```bash
TOKEN="<your-cognito-jwt>"
curl -s -X POST \
  "https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod/create-event" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date":"2025-12-31","time":"19:00","location":"Test place"}' | jq .
# Expected: { "id": "...", "event": { ... } }
```

### Phase 2 smoke test (searchGames)

```bash
curl -s \
  "https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod/search-games?q=catan" \
  -H "Authorization: Bearer $TOKEN" | jq .
# Expected: array of up to 5 game objects
```

### Phase 3 smoke test (groups)

```bash
# Create a group
curl -s -X POST \
  "https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod/groups" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Group","emails":["test@example.com"]}' | jq .

# List groups
curl -s \
  "https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod/groups" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### Phase 4 smoke test (API key auth)

```bash
API_KEY="<key-from-step-5d>"
curl -s \
  "https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod/search-games?q=catan" \
  -H "X-API-Key: $API_KEY" | jq .
# Expected: same result as JWT path, no 401/403
```

### Phase 5 smoke test (MCP server)

After configuring Claude Desktop or Claude Code, start a conversation and try:

```
List my game night groups.
```

```
Search my game collection for "spirit island".
```

```
Set up a game night on December 31. Add Catan. Invite my Regular Group.
```

Claude should make tool calls to `list_groups`, `search_games`, and
`create_event` automatically, asking for any missing details (time, location)
before creating the event.

---

## Rollback

- **Lambda**: Re-deploy the previous zip, or delete the function if it was newly created.
- **API Gateway**: Remove the new resources/methods and redeploy `prod`.
- **API key authorizer**: Change the Authorization setting back to `CognitoAuthorizer` on each route.
- **SSM keys**: `node scripts/manage-api-keys.js revoke <apiKey>` to invalidate any issued keys.
