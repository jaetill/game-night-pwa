## Dependency Watch (2026-06-22)

Manifests scanned: `package.json` (root), `lambda/package.json`, `mcp/package.json`.
Audit scope: production dependencies only (`--omit=dev`).

---

### `package.json` (root — dev-only toolchain)

No production dependencies. Audit: **0 vulnerabilities**.

`npm outdated`: nothing to report — all devDependencies are current.

---

### `lambda/package.json`

Audit: **18 moderate vulnerabilities** (0 high, 0 critical).

#### Moderate — security advisories (fix requires major bump)

| Package | Installed | Fix version | Advisory |
|---|---|---|---|
| `@opentelemetry/core` (transitive via `@sentry/aws-serverless`) | <2.8.0 | 2.8.0+ | [GHSA-8988-4f7v-96qf](https://github.com/advisories/GHSA-8988-4f7v-96qf) — Unbounded memory allocation in W3C Baggage propagation (CVSS 5.3) |

All 18 advisories trace to `@opentelemetry/core <2.8.0`, which is pulled in by
`@sentry/aws-serverless ^9`. The only fix available is a major upgrade:

#### Major version bump required

| Package | Current range | Wanted | Latest | Risk |
|---|---|---|---|---|
| `@sentry/aws-serverless` | `^9.0.0` | 9.47.1 | **10.59.0** | Major semver bump — Sentry v9 → v10 API changes. Review migration guide before upgrading. Upgrading resolves all 18 OpenTelemetry moderate advisories. |

**Action:** Upgrade `@sentry/aws-serverless` to `^10.59.0` in `lambda/package.json`,
then run `cd lambda && npm install`. Validate that `lambda/lib/sentry.js` and all
`Sentry.wrapHandler` call sites are compatible with the v10 API before deploying.

All other direct dependencies (`@aws-sdk/*`, `@octokit/rest`, `aws-jwt-verify`) are
current at their latest versions.

---

### `mcp/package.json`

Audit: **5 vulnerabilities** (2 high, 3 moderate). All in transitive deps of
`@modelcontextprotocol/sdk@1.29.0` (already at latest) and `@aws-sdk/client-s3`
(already at latest).

#### High — flag for immediate update

| Package | Severity | Advisory | CVSS |
|---|---|---|---|
| `fast-uri` ≤3.1.1 (transitive) | HIGH | [GHSA-q3j6-qgpj-74h6](https://github.com/advisories/GHSA-q3j6-qgpj-74h6) — path traversal via percent-encoded dot segments | 7.5 |
| `fast-uri` ≤3.1.1 (transitive) | HIGH | [GHSA-v39h-62p7-jpjc](https://github.com/advisories/GHSA-v39h-62p7-jpjc) — host confusion via percent-encoded authority delimiters | 7.5 |
| `hono` ≤4.12.24 (transitive) | HIGH | [GHSA-88fw-hqm2-52qc](https://github.com/advisories/GHSA-88fw-hqm2-52qc) — CORS middleware reflects any origin with credentials when `origin` defaults to wildcard | 7.1 |

#### Moderate — batch in monthly sweep

| Package | Advisory | CVSS |
|---|---|---|
| `ip-address` ≤10.1.0 → `express-rate-limit` | [GHSA-v2v4-37r5-5v8g](https://github.com/advisories/GHSA-v2v4-37r5-5v8g) — XSS in Address6 HTML-emitting methods | N/A |
| `qs` 6.11.1–6.15.1 | [GHSA-q8mj-m7cp-5q26](https://github.com/advisories/GHSA-q8mj-m7cp-5q26) — DoS via `qs.stringify` crash on null/undefined in comma-format arrays | 5.3 |

**Additional hono advisories (moderate):** GHSA-qp7p-654g-cw7p (CSS injection), GHSA-hm8q-7f3q-5f36 (JWT NumericDate), GHSA-p77w-8qqv-26rm (cache leakage), GHSA-9vqf-7f2p-gf9v (bodyLimit bypass), GHSA-69xw-7hcm-h432 (JSX tag injection), GHSA-xrhx-7g5j-rcj5 (IPv6 IP restriction bypass), GHSA-3hrh-pfw6-9m5x (Set-Cookie injection), GHSA-f577-qrjj-4474 (JWT scheme), GHSA-2gcr-mfcq-wcc3 (percent-encoded routing), GHSA-wwfh-h76j-fc44 (Windows path traversal), GHSA-j6c9-x7qj-28xf (multi Set-Cookie merge), GHSA-rv63-4mwf-qqc2 (body limit bypass on Lambda).

**Action:** Run `npm audit fix --prefix mcp` — fix is available without a major semver
bump. If the direct dep `@modelcontextprotocol/sdk` ships updated transitive deps in
a patch, that alone may resolve all five. Monitor for an MCP SDK patch release.
Note that the MCP server is a local CLI tool (not internet-facing), which reduces
the immediate blast radius of the HIGH `hono`/`fast-uri` advisories, but they
should still be resolved promptly.

---

### Summary

| Manifest | Vulnerabilities | Outdated (major) | Action required |
|---|---|---|---|
| `package.json` (root) | 0 | 0 | None |
| `lambda/package.json` | 18 moderate | 1 (`@sentry/aws-serverless` 9→10) | Upgrade Sentry to v10 (resolves all advisories) |
| `mcp/package.json` | 2 high, 3 moderate | 0 | `npm audit fix --prefix mcp` |
