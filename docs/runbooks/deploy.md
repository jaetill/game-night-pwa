# Runbook: Manual deploy (Lambda functions)

## When to use this

Per `CLAUDE.md`, Lambdas are NOT in the deploy.yml workflow — they're deployed manually. This runbook documents that procedure. The frontend (GitHub Pages) is auto-deployed via deploy.yml on every push to `master`.

## Prerequisites

- AWS CLI authenticated as `jaetill-dev` credentials with permission to update each function in **us-east-2**
- Python 3 + zip (for `build/zip.py`) — Windows users: prefer Python or `tar -a` over `Compress-Archive` (CLAUDE.md notes Compress-Archive produces backslash paths Lambda can't resolve)
- The Lambda source you want to deploy in `lambda/`

## Steps

1. **For most handlers (single-file zip):**
   ```bash
   python build/zip.py /tmp/<fn>.zip lambda/<fn>.js
   aws lambda update-function-code \
     --function-name <fn> \
     --zip-file fileb:///tmp/<fn>.zip \
     --region us-east-2
   ```

2. **For `apiKeyAuthorizer` (bundles `aws-jwt-verify`):**
   ```bash
   cd lambda && npm install   # regenerate node_modules if needed
   cd ..
   python build/zip.py /tmp/apiKeyAuthorizer.zip lambda  # zips lambda/ + node_modules
   aws lambda update-function-code \
     --function-name apiKeyAuthorizer \
     --zip-file fileb:///tmp/apiKeyAuthorizer.zip \
     --region us-east-2
   ```

3. **Verify** by invoking the function or hitting its API Gateway route and observing CloudWatch Logs (and Sentry once Phase 5 lands).

## Verification

- `aws lambda get-function --function-name <fn> --region us-east-2` returns the new `LastModified` timestamp.
- A manual invocation (curl against API Gateway, or `aws lambda invoke`) returns expected output.
- CloudWatch Logs show fresh logs from the new code.

## Rollback

See [`rollback.md`](rollback.md). Lambda alias swap to previous version is the primary mechanism (post-Phase-6 once aliases exist).

## Escalation

For solo: that's you. If you're stuck >30 minutes:
- Document the state in a GitHub Issue with `incident:p0` label
- Consider taking the affected route offline by removing the API Gateway route
- The frontend continues to work for non-affected paths
