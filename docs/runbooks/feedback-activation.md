# Runbook: Feedback pipeline (POST /feedback) — status & redeploy

## Status (verified 2026-08-07)

The feedback backend is **fully activated and verified live**:

- Lambda `feedback` (role `feedback-lambda-role`, Sentry DSN + GitHub env wired)
- Public `POST /feedback` + `OPTIONS` on API Gateway `pufsqfvq8g/prod` — no
  authorizer by design; the handler rate-limits per source IP and drops
  honeypot submissions
- Secret `game-night/prod/github-token` in Secrets Manager (GitHub PAT)

Live probe used for verification (safe — fails validation, files no issue):

```bash
curl -s -X POST \
  https://pufsqfvq8g.execute-api.us-east-2.amazonaws.com/prod/feedback \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://gamenights.jaetill.com' \
  -d '{"type":"other","description":"short"}'
# expect: {"error":"validation_error","detail":"description must be 10-2000 characters"} (HTTP 400)
```

## Why the widget didn't work historically

The backend was fine. The frontend built its endpoint from `VITE_API_URL`,
whose configured value included the `/get-token` route path — so the widget
posted to `/prod/get-token/feedback`, which doesn't exist. Fixed 2026-08-07:
`src/js/feedback.js` now uses `API_BASE` from `src/js/config.js`. The widget
works as soon as a frontend build containing that fix is deployed.

## Redeploying Lambda code

All game-night Lambdas share one packaging path (handler at zip root +
`lambda/lib/` + `lambda/node_modules/`):

```bash
cd "E:\Users\tille\Documents\Source Code\game-night-pwa"
python build/make_deploy_zips.py feedback        # or: no args = the 5 active ones
aws lambda update-function-code --function-name feedback \
  --zip-file fileb://build/feedback-deploy.zip --region us-east-2
```

Smoke test after any deploy (catches missing-module init crashes):

```bash
aws lambda invoke --function-name feedback --region us-east-2 \
  --payload '{"httpMethod":"OPTIONS","headers":{"origin":"https://gamenights.jaetill.com"}}' \
  --cli-binary-format raw-in-base64-out out.json && cat out.json
# expect statusCode 200
```

## Rotating the GitHub PAT

Fine-grained PAT, `jaetill/game-night-pwa`, **Issues: Read and write** only:

```bash
aws secretsmanager put-secret-value \
  --secret-id game-night/prod/github-token \
  --secret-string '{"GITHUB_TOKEN":"github_pat_XXXX"}' \
  --region us-east-2
```

The Lambda caches the secret per warm instance; the new value applies on the
next cold start (or force with any config update to cycle instances).
