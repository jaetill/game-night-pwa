# API Key Authentication — Setup Guide

Agent-friendly alternative to Cognito browser auth. Lets Claude Dispatch call
the game night API with a static `X-API-Key` header instead of going through
the OAuth/Cognito flow.

---

## How it works

1. Each user gets a random 64-hex-char key stored in SSM Parameter Store.
2. A Lambda authorizer (`apiKeyAuthorizer`) intercepts requests, looks up the
   key in SSM, and injects `userId` into the request context.
3. Downstream Lambdas read `event.requestContext.authorizer.userId` — the same
   scoping as a Cognito JWT, so nothing about per-user data access changes.
4. Browser app routes keep their existing Cognito JWT authorizer unchanged.

---

## SSM parameter layout

```
/game-night/api-keys/{64-hex-char-key}  →  userId  (SecureString)
```

One parameter per key. The key is the path suffix; the userId is the value.
The authorizer does a direct `GetParameter` — no scanning.

---

## 1. Generate a key for a user

```bash
node scripts/manage-api-keys.js generate <userId>
```

`<userId>` is the Cognito username (the `sub` or `cognito:username` claim —
same value the app uses everywhere internally).

Example:

```
$ node scripts/manage-api-keys.js generate abc123-def456-...

API key created successfully.
  userId : abc123-def456-...
  apiKey : 3f8a9c2b1d4e...

Pass this as a request header:
  X-API-Key: 3f8a9c2b1d4e...

Store it somewhere safe — it cannot be retrieved from SSM after this point.
```

**The key is shown once.** Copy it into the agent's secret store immediately.

Other commands:
```bash
node scripts/manage-api-keys.js list              # list all keys (truncated)
node scripts/manage-api-keys.js whoami <apiKey>   # show userId for a key
node scripts/manage-api-keys.js revoke <apiKey>   # delete a key
```

---

## 2. Deploy the authorizer Lambda

Create a new Lambda function named `apiKeyAuthorizer`:

- **Runtime**: Node.js 20.x
- **Handler**: `apiKeyAuthorizer.handler`
- **Code**: `lambda/apiKeyAuthorizer.js`
- **Environment variables**: none required (defaults are fine)
- **IAM execution role**: needs `ssm:GetParameter` on the key path:

```json
{
  "Effect": "Allow",
  "Action": "ssm:GetParameter",
  "Resource": "arn:aws:ssm:us-east-2:214599503944:parameter/game-night/api-keys/*"
}
```

---

## 3. Register the authorizer in API Gateway

In the API Gateway console for `pufsqfvq8g`:

1. Go to **Authorizers** → **Create authorizer**
2. Settings:
   - **Name**: `ApiKeyAuthorizer`
   - **Type**: Lambda
   - **Lambda function**: `apiKeyAuthorizer`
   - **Lambda event payload**: Request
   - **Identity sources**: `method.request.header.X-API-Key`
   - **Authorization caching**: Enabled, TTL = 300 seconds

This authorizer is assigned to the **new** agent-facing routes only:
`POST /create-event`, `GET /search-games`, `GET /groups`, `POST /groups`.

Existing routes (`/nudge`, `/invite`, `/get-token`, `/upload-token`, `/bgg`)
keep their Cognito JWT authorizer.

---

## 4. Attach the authorizer to new routes

For each new agent-facing route in API Gateway:
- **Method Request** → **Authorization**: select `ApiKeyAuthorizer`

---

## 5. Calling the API from the agent

```http
GET /search-games?q=spirit+island HTTP/1.1
Host: pufsqfvq8g.execute-api.us-east-2.amazonaws.com
X-API-Key: <apiKey>
```

No `Authorization` header, no token refresh, no OAuth redirect.

---

## Using `resolveCallerId` in new Lambdas

New Lambdas (Phases 1–3) that need to support **both** auth paths should use
the shared helper at `lambda/lib/resolveCallerId.js`:

```javascript
const { resolveCallerId } = require('./lib/resolveCallerId');

exports.handler = async (event) => {
  const callerId = resolveCallerId(event);
  if (!callerId) return respond(401, { error: 'Unauthorized' });
  // ...
};
```

`resolveCallerId` checks `event.requestContext.authorizer.userId` first (API
key path), then falls back to decoding the Cognito JWT (browser app path).

Existing Lambdas (`nudge.js`) decode the JWT directly and don't need changes —
they're not exposed to the API key authorizer.

---

## Security notes

- Keys are stored as **SecureString** in SSM (encrypted at rest via KMS default key).
- Keys are **long-lived but revocable** — run `revoke <key>` to invalidate immediately.
- The key maps 1:1 to a userId, so the agent can only access that user's data.
- Never put keys in source code, `.env` files, or Lambda environment variables.
- Rate limiting can be added at the API Gateway stage level if needed.
