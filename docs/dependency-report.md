## Dependency Watch (2026-06-29)

---

### `package.json` (root)

**npm audit** — 0 vulnerabilities across 595 installed packages (593 dev, 1 prod).

**npm outdated** — all packages current.

No actionable findings.

---

### `lambda/package.json`

**npm audit** — 0 vulnerabilities across 107 installed prod packages.

**npm outdated** — all packages at latest (`wanted == latest` for all 9 direct prod deps).

| Package | Pinned | Latest |
|---|---|---|
| `@aws-sdk/client-cognito-identity-provider` | `^3.x` | 3.1075.0 |
| `@aws-sdk/client-dynamodb` | `^3.x` | 3.1075.0 |
| `@aws-sdk/client-s3` | `^3.x` | 3.1075.0 |
| `@aws-sdk/client-secrets-manager` | `^3.x` | 3.1075.0 |
| `@aws-sdk/client-ssm` | `^3.x` | 3.1075.0 |
| `@aws-sdk/s3-request-presigner` | `^3.x` | 3.1075.0 |
| `@octokit/rest` | `^22.x` | 22.0.1 |
| `@sentry/aws-serverless` | `^10.x` | 10.62.0 |
| `aws-jwt-verify` | `^5.x` | 5.2.1 |

No actionable findings.

---

### `mcp/package.json`

> **Context:** This package is the local Claude Code MCP server (internal tool), not a deployed Lambda. All vulnerabilities are in transitive dependencies pulled in by `@modelcontextprotocol/sdk`.

**npm outdated** — direct dependencies current.

| Package | Constraint | Latest |
|---|---|---|
| `@modelcontextprotocol/sdk` | `^1.0.0` | 1.29.0 |
| `@aws-sdk/client-s3` | `^3.1075.0` | 3.1075.0 |

**npm audit** — **5 vulnerabilities** (2 HIGH, 3 MODERATE). All fixes available via `npm audit fix`.

#### HIGH severity

| Package | Installed | Advisory | CVSS | Fix |
|---|---|---|---|---|
| `fast-uri` | 3.1.0 | [GHSA-q3j6-qgpj-74h6](https://github.com/advisories/GHSA-q3j6-qgpj-74h6): Path traversal via percent-encoded dot segments | 7.5 | Upgrade `fast-uri` > 3.1.1 |
| `fast-uri` | 3.1.0 | [GHSA-v39h-62p7-jpjc](https://github.com/advisories/GHSA-v39h-62p7-jpjc): Host confusion via percent-encoded authority delimiters | 7.5 | Upgrade `fast-uri` > 3.1.1 |
| `hono` | 4.12.15 | [GHSA-88fw-hqm2-52qc](https://github.com/advisories/GHSA-88fw-hqm2-52qc): CORS Middleware reflects any Origin with credentials when `origin` defaults to wildcard | 7.1 | Upgrade `hono` ≥ 4.12.25 |

#### MODERATE severity

| Package | Installed | Advisory | CVSS | Fix |
|---|---|---|---|---|
| `hono` | 4.12.15 | [GHSA-qp7p-654g-cw7p](https://github.com/advisories/GHSA-qp7p-654g-cw7p): CSS Declaration Injection via Style Object Values in JSX SSR | 4.3 | Upgrade `hono` ≥ 4.12.18 |
| `hono` | 4.12.15 | [GHSA-hm8q-7f3q-5f36](https://github.com/advisories/GHSA-hm8q-7f3q-5f36): Improper validation of NumericDate claims in JWT verify() | 3.8 | Upgrade `hono` ≥ 4.12.18 |
| `hono` | 4.12.15 | [GHSA-p77w-8qqv-26rm](https://github.com/advisories/GHSA-p77w-8qqv-26rm): Cache Middleware ignores `Vary: Authorization` / `Vary: Cookie` | 5.3 | Upgrade `hono` ≥ 4.12.18 |
| `hono` | 4.12.15 | [GHSA-9vqf-7f2p-gf9v](https://github.com/advisories/GHSA-9vqf-7f2p-gf9v): bodyLimit() bypass for chunked/unknown-length requests | 6.5 | Upgrade `hono` ≥ 4.12.16 |
| `hono` | 4.12.15 | [GHSA-69xw-7hcm-h432](https://github.com/advisories/GHSA-69xw-7hcm-h432): Unvalidated JSX Tag Names allowing HTML Injection | 4.7 | Upgrade `hono` ≥ 4.12.16 |
| `hono` | 4.12.15 | [GHSA-xrhx-7g5j-rcj5](https://github.com/advisories/GHSA-xrhx-7g5j-rcj5): IP Restriction bypass for non-canonical IPv6 | 5.3 | Upgrade `hono` ≥ 4.12.21 |
| `hono` | 4.12.15 | [GHSA-3hrh-pfw6-9m5x](https://github.com/advisories/GHSA-3hrh-pfw6-9m5x): Cookie helper allows Set-Cookie injection via `sameSite`/`priority` | 4.3 | Upgrade `hono` ≥ 4.12.21 |
| `hono` | 4.12.15 | [GHSA-f577-qrjj-4474](https://github.com/advisories/GHSA-f577-qrjj-4474): JWT middleware accepts any Authorization scheme, not only Bearer | 4.8 | Upgrade `hono` ≥ 4.12.21 |
| `hono` | 4.12.15 | [GHSA-2gcr-mfcq-wcc3](https://github.com/advisories/GHSA-2gcr-mfcq-wcc3): app.mount() strips prefix using undecoded path | 5.3 | Upgrade `hono` ≥ 4.12.21 |
| `hono` | 4.12.15 | [GHSA-wwfh-h76j-fc44](https://github.com/advisories/GHSA-wwfh-h76j-fc44): Path traversal in `serve-static` on Windows via `%5C` | 5.9 | Upgrade `hono` ≥ 4.12.25 |
| `hono` | 4.12.15 | [GHSA-j6c9-x7qj-28xf](https://github.com/advisories/GHSA-j6c9-x7qj-28xf): AWS Lambda adapter merges multiple `Set-Cookie` headers | 5.3 | Upgrade `hono` ≥ 4.12.25 |
| `hono` | 4.12.15 | [GHSA-rv63-4mwf-qqc2](https://github.com/advisories/GHSA-rv63-4mwf-qqc2): Body Limit Middleware bypass on AWS Lambda via `Content-Length` | 6.5 | Upgrade `hono` ≥ 4.12.25 |
| `hono` | 4.12.15 | [GHSA-wgpf-jwqj-8h8p](https://github.com/advisories/GHSA-wgpf-jwqj-8h8p): Lambda@Edge adapter drops repeated request headers | 4.8 | Upgrade `hono` ≥ 4.12.25 |
| `express-rate-limit` | 8.3.2 | [GHSA-v2v4-37r5-5v8g](https://github.com/advisories/GHSA-v2v4-37r5-5v8g): Depends on vulnerable `ip-address` (XSS in Address6 HTML methods) | — | Upgrade `express-rate-limit` > 8.5.0 |
| `ip-address` | 10.1.0 | [GHSA-v2v4-37r5-5v8g](https://github.com/advisories/GHSA-v2v4-37r5-5v8g): XSS in `Address6` HTML-emitting methods | — | Upgrade `ip-address` > 10.1.0 |
| `qs` | 6.15.0 | [GHSA-q8mj-m7cp-5q26](https://github.com/advisories/GHSA-q8mj-m7cp-5q26): DoS — `qs.stringify` crashes with TypeError on null/undefined entries in comma-format arrays | 5.3 | Upgrade `qs` > 6.15.1 |

#### Recommended action

```bash
cd mcp && npm audit fix
```

All 5 vulnerabilities have automatic fixes available. Since these are transitive dependencies of `@modelcontextprotocol/sdk`, the fix will update the lockfile without requiring a direct-dependency version change.

---

*Generated by dep-watcher · 2026-06-29*
