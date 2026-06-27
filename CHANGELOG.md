# Changelog

## [1.1.4](https://github.com/jaetill/game-night-pwa/compare/v1.1.3...v1.1.4) (2026-06-27)


### Bug Fixes

* **ci:** allow fleet App bot in release-captain allowed_bots ([#264](https://github.com/jaetill/game-night-pwa/issues/264)) ([25bf1ab](https://github.com/jaetill/game-night-pwa/commit/25bf1aba73caac8ec913312196ff8911fcefaf45)), closes [#183](https://github.com/jaetill/game-night-pwa/issues/183)
* **ci:** drop unused IMPLEMENTER_PAT forwarding from implementer caller (refs [#363](https://github.com/jaetill/game-night-pwa/issues/363)) ([#263](https://github.com/jaetill/game-night-pwa/issues/263)) ([4ca7e6e](https://github.com/jaetill/game-night-pwa/commit/4ca7e6ecee90327f2f2ef3767a70ed4a8c53f83c))
* **ci:** pin claude-pr-review reusable workflow to SHA ([#218](https://github.com/jaetill/game-night-pwa/issues/218)) ([#229](https://github.com/jaetill/game-night-pwa/issues/229)) ([eef318a](https://github.com/jaetill/game-night-pwa/commit/eef318aa3c18ecf083ea3d43cd2a92344dfeb32a))
* **ci:** prevent script injection in dependabot-auto-merge workflow ([#262](https://github.com/jaetill/game-night-pwa/issues/262)) ([30d20c1](https://github.com/jaetill/game-night-pwa/commit/30d20c1b973f9b32528caf24ab87cb64a1e3da92)), closes [#259](https://github.com/jaetill/game-night-pwa/issues/259)
* **docs:** add -detailed-exitcode to tofu plan flag in CLAUDE.md ([#247](https://github.com/jaetill/game-night-pwa/issues/247)) ([6e07d59](https://github.com/jaetill/game-night-pwa/commit/6e07d591973a239f612b275ab60c76c931fb0754)), closes [#75](https://github.com/jaetill/game-night-pwa/issues/75)
* **e2e:** guard JSON.parse against non-JSON API error responses ([#95](https://github.com/jaetill/game-night-pwa/issues/95)) ([#248](https://github.com/jaetill/game-night-pwa/issues/248)) ([51651f7](https://github.com/jaetill/game-night-pwa/commit/51651f75ae12cf6bf23f676e1de42b39e0c02ebb))
* **feedback:** fail-closed on DynamoDB throttling errors in rate limiter ([#265](https://github.com/jaetill/game-night-pwa/issues/265)) ([84f1c36](https://github.com/jaetill/game-night-pwa/commit/84f1c365f0a7bd1b606281eff46599b727deff44)), closes [#253](https://github.com/jaetill/game-night-pwa/issues/253)
* **feedback:** replace per-instance rate limiter with DynamoDB-backed distributed counter ([#252](https://github.com/jaetill/game-night-pwa/issues/252)) ([360b2d3](https://github.com/jaetill/game-night-pwa/commit/360b2d3417c9d2cc965c19307bb634c95db0532a))
* **feedback:** stop writing caller source IP into issue body ([#63](https://github.com/jaetill/game-night-pwa/issues/63)) ([#257](https://github.com/jaetill/game-night-pwa/issues/257)) ([2f93bea](https://github.com/jaetill/game-night-pwa/commit/2f93beae4fc09150ff120fdb35d624dac0cd4ef0))
* **iam:** remove s3:ListBucket from bggProxy role to prevent key enumeration ([#145](https://github.com/jaetill/game-night-pwa/issues/145)) ([#251](https://github.com/jaetill/game-night-pwa/issues/251)) ([04b9f3d](https://github.com/jaetill/game-night-pwa/commit/04b9f3d59db00583b888a721fe07c21a68725beb))
* omit the IP from the issue body entirely. The IP was only context for abuse tracing; that need is already met server-side without exposing it -- the per-IP rate limiter still acts on the raw IP, and the honeypot path still logs the IP to CloudWatch. No public exposure is required, so a salted hash would add no value here. Rate-limiting and logging logic are unchanged. ([2f93bea](https://github.com/jaetill/game-night-pwa/commit/2f93beae4fc09150ff120fdb35d624dac0cd4ef0))
* **security:** add GH_TOKEN=gho_* deny rule to close OAuth token gap ([#255](https://github.com/jaetill/game-night-pwa/issues/255)) ([f8c41b4](https://github.com/jaetill/game-night-pwa/commit/f8c41b4d76f7a390d423a80d7e332a50fb20e86a)), closes [#246](https://github.com/jaetill/game-night-pwa/issues/246)
* **security:** add OpenSSH key + gho_ token deny patterns to settings ([#254](https://github.com/jaetill/game-night-pwa/issues/254)) ([25115b6](https://github.com/jaetill/game-night-pwa/commit/25115b62b7b3704bdfabffc4f158dea9b2bc4162)), closes [#155](https://github.com/jaetill/game-night-pwa/issues/155) [#246](https://github.com/jaetill/game-night-pwa/issues/246)
* **security:** pin AdminAddUserToGroup to game-night-users via assertion + tests ([#250](https://github.com/jaetill/game-night-pwa/issues/250)) ([fedfcd3](https://github.com/jaetill/game-night-pwa/commit/fedfcd3c6ce40afcfa34968a3bab04f17ac53dc4)), closes [#165](https://github.com/jaetill/game-night-pwa/issues/165)
* **security:** pin dependabot/fetch-metadata to commit SHA (closes [#260](https://github.com/jaetill/game-night-pwa/issues/260)) ([#261](https://github.com/jaetill/game-night-pwa/issues/261)) ([a6f0131](https://github.com/jaetill/game-night-pwa/commit/a6f0131471882591caf039aa8550d85109ef9eae))
* **settings:** add Bash redirect deny patterns for credential paths ([#242](https://github.com/jaetill/game-night-pwa/issues/242)) ([ceeae94](https://github.com/jaetill/game-night-pwa/commit/ceeae944b4ae4948f415d8cb69fd0d81cc9fd28a))
* **settings:** add GH_TOKEN deny patterns to close gh-CLI credential-exposure gap ([#245](https://github.com/jaetill/game-night-pwa/issues/245)) ([14ef20a](https://github.com/jaetill/game-night-pwa/commit/14ef20a7b2fc6b8a56760515f7337d8ea3c675df)), closes [#153](https://github.com/jaetill/game-night-pwa/issues/153)
* **settings:** pin agentic-dev-environment plugin to commit SHA ([#249](https://github.com/jaetill/game-night-pwa/issues/249)) ([cda8018](https://github.com/jaetill/game-night-pwa/commit/cda8018b4b11a574c184063ce3f786459bf7e561))

## [1.1.3](https://github.com/jaetill/game-night-pwa/compare/v1.1.2...v1.1.3) (2026-06-20)


### Bug Fixes

* **ci:** pin claude-implementer reusable workflow to SHA ([#226](https://github.com/jaetill/game-night-pwa/issues/226)) ([7c188d3](https://github.com/jaetill/game-night-pwa/commit/7c188d39c72afdec14c8e1a54d9ac00345084616)), closes [#219](https://github.com/jaetill/game-night-pwa/issues/219)
* **iac:** remove iam:ListInstanceProfiles from iac_drift_introspect ([#224](https://github.com/jaetill/game-night-pwa/issues/224)) ([#227](https://github.com/jaetill/game-night-pwa/issues/227)) ([aa44515](https://github.com/jaetill/game-night-pwa/commit/aa44515640ace35193d1efda5ea345ead3960b3a))

## [1.1.2](https://github.com/jaetill/game-night-pwa/compare/v1.1.1...v1.1.2) (2026-06-19)


### Bug Fixes

* **iac:** consolidate bggProxy IAM into single S3Access policy ([#133](https://github.com/jaetill/game-night-pwa/issues/133)) ([#207](https://github.com/jaetill/game-night-pwa/issues/207)) ([52c7639](https://github.com/jaetill/game-night-pwa/commit/52c763910d0de779f8ebe767b3de0b8598615177))
* **iac:** remove ReadOnlyAccess from iac_drift role — narrow to inline policy ([#48](https://github.com/jaetill/game-night-pwa/issues/48)) ([#186](https://github.com/jaetill/game-night-pwa/issues/186)) ([5ea1827](https://github.com/jaetill/game-night-pwa/commit/5ea18273f28e64d71b7111cc47baec671ecd942e))
* **iam:** remove unused S3 permissions from github-deploy role ([#221](https://github.com/jaetill/game-night-pwa/issues/221)) ([63bc3ff](https://github.com/jaetill/game-night-pwa/commit/63bc3ff5f79bbc9825aeee5005db05b92e38f79c)), closes [#65](https://github.com/jaetill/game-night-pwa/issues/65)

## [1.1.1](https://github.com/jaetill/game-night-pwa/compare/v1.1.0...v1.1.1) (2026-06-18)


### Bug Fixes

* **ci:** add /mcp npm ecosystem entry to Dependabot config ([#209](https://github.com/jaetill/game-night-pwa/issues/209)) ([2bd8f63](https://github.com/jaetill/game-night-pwa/commit/2bd8f635fe8ad0d91aea079b43feb04aa2538fb5)), closes [#201](https://github.com/jaetill/game-night-pwa/issues/201)
* **ci:** add npm ecosystem entries to Dependabot config ([#200](https://github.com/jaetill/game-night-pwa/issues/200)) ([b3690e5](https://github.com/jaetill/game-night-pwa/commit/b3690e5db39c77ad610606ae8950419c4c5d5ee3)), closes [#192](https://github.com/jaetill/game-night-pwa/issues/192)
* **ci:** pin dep-watcher reusable to commit SHA and add Dependabot ([#178](https://github.com/jaetill/game-night-pwa/issues/178)) ([#191](https://github.com/jaetill/game-night-pwa/issues/191)) ([c852421](https://github.com/jaetill/game-night-pwa/commit/c8524219772956b2305f24e0124c287aca0ded12))
* **ci:** pin iac-guard reusable workflow to commit SHA ([#216](https://github.com/jaetill/game-night-pwa/issues/216)) ([5fb7ec5](https://github.com/jaetill/game-night-pwa/commit/5fb7ec55c5377dc87564d813f85ddbb9233125d5)), closes [#171](https://github.com/jaetill/game-night-pwa/issues/171)
* **ci:** pin release reusable to commit SHA to prevent secret leakage ([#199](https://github.com/jaetill/game-night-pwa/issues/199)) ([419eb18](https://github.com/jaetill/game-night-pwa/commit/419eb18b09850b5e2b822faa89208f16bed8ecea)), closes [#177](https://github.com/jaetill/game-night-pwa/issues/177)
* **ci:** scope reusable secrets explicitly (ADR-0048) ([#217](https://github.com/jaetill/game-night-pwa/issues/217)) ([a0187a4](https://github.com/jaetill/game-night-pwa/commit/a0187a48ab1d06800434c87e6c49f5c3f8a9fda9))
* **drift-detector:** add -input=false + supply grafana_external_id so plan stops hanging ([#181](https://github.com/jaetill/game-night-pwa/issues/181)) ([8d7c12c](https://github.com/jaetill/game-night-pwa/commit/8d7c12c1a56cf292818625d8fbae9f50f1705ff5))
* **e2e:** enforce HTTPS on GAME_NIGHT_API_BASE before sending Bearer token ([#185](https://github.com/jaetill/game-night-pwa/issues/185)) ([29d1e6c](https://github.com/jaetill/game-night-pwa/commit/29d1e6c7441299c9cb8c3252fce225c1e594c9db)), closes [#93](https://github.com/jaetill/game-night-pwa/issues/93)
* **iac:** narrow iam:Get* wildcard to explicit actions in iac_drift_introspect ([#184](https://github.com/jaetill/game-night-pwa/issues/184)) ([d9efcdc](https://github.com/jaetill/game-night-pwa/commit/d9efcdcdfa51bee265c0741e3cf9999b073f747a)), closes [#68](https://github.com/jaetill/game-night-pwa/issues/68)
* **iac:** remove s3:ListBucket wildcard from iac_drift_introspect ([#187](https://github.com/jaetill/game-night-pwa/issues/187)) ([#190](https://github.com/jaetill/game-night-pwa/issues/190)) ([ed2d794](https://github.com/jaetill/game-night-pwa/commit/ed2d794ee4cab2ab892c20bc73317a2a1c54bd31))
* **iac:** replace lambda:Get* wildcard with explicit actions in iac_drift_introspect ([#189](https://github.com/jaetill/game-night-pwa/issues/189)) ([7edb47a](https://github.com/jaetill/game-night-pwa/commit/7edb47a28dcd34a5dbef4af9472ecd8f963940f6))

## [1.1.0](https://github.com/jaetill/game-night-pwa/compare/v1.0.0...v1.1.0) (2026-06-05)


### Features

* **iac:** wire ADR-0035 iac-additive-guard caller + pull_request OIDC trust ([#169](https://github.com/jaetill/game-night-pwa/issues/169)) ([26d87b7](https://github.com/jaetill/game-night-pwa/commit/26d87b757fb3cc1ce84b3b486c29202875830f87))


### Bug Fixes

* **bggProxy:** catch AccessDenied+s3:ListBucket in s3Get ([#125](https://github.com/jaetill/game-night-pwa/issues/125)) ([#128](https://github.com/jaetill/game-night-pwa/issues/128)) ([a8f9de2](https://github.com/jaetill/game-night-pwa/commit/a8f9de22e7f9060e0de0ce9978afe52944066796))
* **e2e:** make @platform/test-inbox optional so npm ci doesn't ENOENT in CI ([#131](https://github.com/jaetill/game-night-pwa/issues/131)) ([cad0133](https://github.com/jaetill/game-night-pwa/commit/cad013360208ebbc744e83986b33d3a395eaad4c)), closes [#92](https://github.com/jaetill/game-night-pwa/issues/92)
* **e2e:** replace no-op receivedAt assertion with max-latency check ([#96](https://github.com/jaetill/game-night-pwa/issues/96)) ([#138](https://github.com/jaetill/game-night-pwa/issues/138)) ([24c985d](https://github.com/jaetill/game-night-pwa/commit/24c985d3c5f3b976d48298892dcf4c063840e6eb))
* **feedback:** add pipe to escapeMarkdown to block Markdown table injection ([#64](https://github.com/jaetill/game-night-pwa/issues/64)) ([#127](https://github.com/jaetill/game-night-pwa/issues/127)) ([0e513ff](https://github.com/jaetill/game-night-pwa/commit/0e513fffd3fe8121c34b6a2f985477296a84d106))
* **feedback:** gate localhost CORS origin behind DEPLOY_ENV != prod ([#70](https://github.com/jaetill/game-night-pwa/issues/70)) ([#140](https://github.com/jaetill/game-night-pwa/issues/140)) ([1aeedb1](https://github.com/jaetill/game-night-pwa/commit/1aeedb174692a520ba832e234c0f1831ebf4fbbd))
* **feedback:** remove submitter email from public GitHub issue body ([#150](https://github.com/jaetill/game-night-pwa/issues/150)) ([c3c2c83](https://github.com/jaetill/game-night-pwa/commit/c3c2c83ad2a0917b38eeff9740f368c40887272d)), closes [#88](https://github.com/jaetill/game-night-pwa/issues/88)
* **feedback:** use allowlist for DEPLOY_ENV localhost CORS gate ([#143](https://github.com/jaetill/game-night-pwa/issues/143)) ([#147](https://github.com/jaetill/game-night-pwa/issues/147)) ([ddc654e](https://github.com/jaetill/game-night-pwa/commit/ddc654ed4e82df79a51f487d2fc910950e3575b5))
* **GeneratePresignedPost:** catch AccessDenied+s3:ListBucket as not-found ([#81](https://github.com/jaetill/game-night-pwa/issues/81)) ([#135](https://github.com/jaetill/game-night-pwa/issues/135)) ([395b6ff](https://github.com/jaetill/game-night-pwa/commit/395b6ff032e6c4d2a295988bc0d5f5e4e4c1681e))
* **iac:** replace cognito-idp:List* with safe explicit actions in iac_drift_introspect ([#168](https://github.com/jaetill/game-night-pwa/issues/168)) ([27e7c50](https://github.com/jaetill/game-night-pwa/commit/27e7c507c25f21c2f8555d1fefd2ebb80bca097d)), closes [#66](https://github.com/jaetill/game-night-pwa/issues/66)
* **iam:** add unconditional s3:ListBucket to bggProxy policies ([#124](https://github.com/jaetill/game-night-pwa/issues/124)) ([#144](https://github.com/jaetill/game-night-pwa/issues/144)) ([d4ddd3f](https://github.com/jaetill/game-night-pwa/commit/d4ddd3f0c1060c6c3468ea29b41289593162ba9d))
* **iam:** scope bggProxy s3:ListBucket to collections/* and profiles/* ([#122](https://github.com/jaetill/game-night-pwa/issues/122)) ([#129](https://github.com/jaetill/game-night-pwa/issues/129)) ([fd7987c](https://github.com/jaetill/game-night-pwa/commit/fd7987cd9ee7b3bdef56f23d57f1d0b8093bcff4))
* **searchGames:** catch AccessDenied+s3:ListBucket as empty collection ([#126](https://github.com/jaetill/game-night-pwa/issues/126)) ([#139](https://github.com/jaetill/game-night-pwa/issues/139)) ([f6e0d79](https://github.com/jaetill/game-night-pwa/commit/f6e0d791c44a571ab34bfc7abb7e045b02226b18))
* **security:** add credential-exposure patterns to permissions.deny ([#152](https://github.com/jaetill/game-night-pwa/issues/152)) ([be37f49](https://github.com/jaetill/game-night-pwa/commit/be37f4966020b0cbe72131c93393cc4b45c0a26f)), closes [#84](https://github.com/jaetill/game-night-pwa/issues/84)
* **security:** add ghs_ and gho_ GitHub token prefixes to deny block ([#167](https://github.com/jaetill/game-night-pwa/issues/167)) ([c383b2c](https://github.com/jaetill/game-night-pwa/commit/c383b2c5fc4368069094298293ca0db55ff08c74)), closes [#156](https://github.com/jaetill/game-night-pwa/issues/156)
* **settings:** extend permissions.deny to cover credential and SSH paths ([#151](https://github.com/jaetill/game-night-pwa/issues/151)) ([e0dd54a](https://github.com/jaetill/game-night-pwa/commit/e0dd54a9086dd7a0fe174be33d4bf46a63ecf1aa))

## 1.0.0 (2026-05-25)


### Features

* **.claude:** subscribe to agentic-dev-environment plugin ([0640775](https://github.com/jaetill/game-night-pwa/commit/06407756065d4fa066fb2fa97b202da526c4028e))
* **.claude:** subscribe to agentic-dev-environment plugin ([3e748ae](https://github.com/jaetill/game-night-pwa/commit/3e748ae9308fb4b363098920183c5a4647e9dfd2))
* ADR-0013 + Phase A + Phase B (autonomous team architecture) ([#15](https://github.com/jaetill/game-night-pwa/issues/15)) ([af22ec5](https://github.com/jaetill/game-night-pwa/commit/af22ec5e57d2ab503e3786eec83095bc1f682753))
* **agents:** wire incident-responder via Sentry → repository_dispatch ([658adeb](https://github.com/jaetill/game-night-pwa/commit/658adebb82221304c1339eb2e079a6984432aab1))
* **ci:** migrate claude-pr-review to platform reusable (ADR-0018) ([8a00cfb](https://github.com/jaetill/game-night-pwa/commit/8a00cfb8225237c93e6cd04cf121956a54766bbd))
* **ci:** prefer Claude Max OAuth token over pay-per-token API key ([08cb178](https://github.com/jaetill/game-night-pwa/commit/08cb178def76ae4616ba212116a76aad009111af))
* **ci:** wire claude-pr-review to anthropics/claude-code-action ([4cfde43](https://github.com/jaetill/game-night-pwa/commit/4cfde43a3f562868428ce15ce14d67731f409405))
* **e2e:** set up Playwright + wire e2e-tester agent into PR pipeline ([330af6d](https://github.com/jaetill/game-night-pwa/commit/330af6d92b8393342cb393cb1693900176c46890))
* **feedback:** Phase 7 — POST /feedback Lambda + frontend widget (Standard 11) ([b463410](https://github.com/jaetill/game-night-pwa/commit/b463410f11fef9a61aa5640c94dc743f251a523d))
* **iac:** add read-only OIDC role for drift detection ([09d3839](https://github.com/jaetill/game-night-pwa/commit/09d3839ac2309e36268802a292856485dde9cb12))
* **iac:** add Sentry provider; stub import for the prod alert rule ([2fa1d64](https://github.com/jaetill/game-night-pwa/commit/2fa1d64213d6255cf1fabce3de3872909294519d))
* **iac:** Phase 6 — full IaC retrofit, all live AWS state under Terraform ([d667cbe](https://github.com/jaetill/game-night-pwa/commit/d667cbe17dc8466ae3b795b9486c72bf026decf0))
* **iac:** re-introduce default_tags on AWS provider ([745356c](https://github.com/jaetill/game-night-pwa/commit/745356c940a58f5676ba97909a2548e04709f974))
* **observability:** Grafana Cloud CloudWatch pull + first dashboard ([#30](https://github.com/jaetill/game-night-pwa/issues/30)) ([218e88c](https://github.com/jaetill/game-night-pwa/commit/218e88c9ea3a920ca284cfcb22102f74f1f08b4d))
* **observability:** source maps to Sentry + agent fetches full context ([f59f20a](https://github.com/jaetill/game-night-pwa/commit/f59f20a6717e1ba66497b2664abe47b19edb6aea))
* **observability:** wrap all 8 Lambda handlers with Sentry + structured logger ([e2451ac](https://github.com/jaetill/game-night-pwa/commit/e2451aca8cc7e49f77f213f27325bf3f19003899))
* **orchestration:** fleet-dispatch support + retire legacy triage-bot (ADR-0020) ([#109](https://github.com/jaetill/game-night-pwa/issues/109)) ([2b651de](https://github.com/jaetill/game-night-pwa/commit/2b651decfd6d7b5d7c60e9fd8546c6fdcb5a28da))


### Bug Fixes

* **ci:** drift-detector should not lock state ([#38](https://github.com/jaetill/game-night-pwa/issues/38)) ([d5404be](https://github.com/jaetill/game-night-pwa/commit/d5404beafd6c284ccdb6103ddb6fb8c0821dcf28))
* **ci:** drop the broken Conventional-Commits filter from fix-iteration trigger ([#69](https://github.com/jaetill/game-night-pwa/issues/69)) ([dd22d42](https://github.com/jaetill/game-night-pwa/commit/dd22d42972d807cec4cba72d2fec84463b8fd8fc))
* **ci:** hoist NB comment out of if-block scalar (workflow was unparseable) ([#107](https://github.com/jaetill/game-night-pwa/issues/107)) ([419c96e](https://github.com/jaetill/game-night-pwa/commit/419c96e98891bfc285cec006b57fae74abe1737b))
* **ci:** inline release-please instead of referencing missing platform repo ([dfc80b8](https://github.com/jaetill/game-night-pwa/commit/dfc80b8904eb82681fd6f4ca27879c7091ea72d4))
* **ci:** inline security-scan; disable claude-pr-review until rebuilt ([4c84320](https://github.com/jaetill/game-night-pwa/commit/4c84320b52fa987e68047748134247fea82b4b7d))
* **ci:** move Sentry secrets to job-level env so deploy.yml parses ([1a97a35](https://github.com/jaetill/game-night-pwa/commit/1a97a35b31cab39dec74cce2735e5e21e0588561))
* **ci:** npm ci lambda/ in test job — tests load handler modules ([20f5984](https://github.com/jaetill/game-night-pwa/commit/20f5984aad507b9922f522f297134adebe5e3e62))
* **ci:** parse gh issue create URL output (no --json flag on create) ([e1862ca](https://github.com/jaetill/game-night-pwa/commit/e1862ca788efced410ee0b9d652df962ec26de58))
* **ci:** pass alert payload via env, not heredoc (workflow_dispatch null case) ([14bfd22](https://github.com/jaetill/game-night-pwa/commit/14bfd220a847161d8cf4148ae6fb24f1b7a05eb7))
* **ci:** pre-create smoke-test label in incident-responder workflow ([b31b043](https://github.com/jaetill/game-night-pwa/commit/b31b043ce4123c66ebccef6023f2bcb97c1a6a71))
* **ci:** reviewers MUST run on bot-authored PRs ([#19](https://github.com/jaetill/game-night-pwa/issues/19)) ([e4b9633](https://github.com/jaetill/game-night-pwa/commit/e4b9633f1bc2468a848593223536267c7bb6f3e0))
* **ci:** whitelist sentry[bot] in incident-responder action ([6e1a716](https://github.com/jaetill/game-night-pwa/commit/6e1a716d8feb404f0e4f523f8b3a1f5a0f4fd140))
* **createEvent:** use crypto.randomBytes for event IDs ([#5](https://github.com/jaetill/game-night-pwa/issues/5)) ([548f313](https://github.com/jaetill/game-night-pwa/commit/548f31363ae6df680a1e991d2235ae3d22120e7d))
* **deploy:** pass VITE_SENTRY_DSN + env metadata to the build step ([80068e1](https://github.com/jaetill/game-night-pwa/commit/80068e18440d302ba135e061203fd02fbb4acaf7))
* **e2e:** add in-file safety guards for shared-pool Cognito cleanup ([#91](https://github.com/jaetill/game-night-pwa/issues/91)) ([#118](https://github.com/jaetill/game-night-pwa/issues/118)) ([c1b38c4](https://github.com/jaetill/game-night-pwa/commit/c1b38c42cb709b26fe0ae68545fc90e6b1e80247))
* **feedback:** escape Markdown in GitHub issue title and body ([#39](https://github.com/jaetill/game-night-pwa/issues/39)) ([3c7637b](https://github.com/jaetill/game-night-pwa/commit/3c7637b990ec650dcb1477acfbc75203f6ea2a89)), closes [#32](https://github.com/jaetill/game-night-pwa/issues/32)
* **feedback:** use dynamic import for @octokit/rest (ESM-only since v18+) ([ec07e5d](https://github.com/jaetill/game-night-pwa/commit/ec07e5d6a5797086faf2802961db6ca15f98301d))
* **feedback:** validate page_url against known app origins before embedding ([#58](https://github.com/jaetill/game-night-pwa/issues/58)) ([88da87c](https://github.com/jaetill/game-night-pwa/commit/88da87c9106910708be96124a883528d91eb65a4))
* **iac:** re-attach ReadOnlyAccess to iac_drift (revert [#48](https://github.com/jaetill/game-night-pwa/issues/48) narrowing) ([#76](https://github.com/jaetill/game-night-pwa/issues/76)) ([d9bf914](https://github.com/jaetill/game-night-pwa/commit/d9bf9140aee049462bc5fe97dca105433bc2bed8))
* **implementer:** allow fleet-App dispatch; drop API-key fallback ([#114](https://github.com/jaetill/game-night-pwa/issues/114)) ([05b56df](https://github.com/jaetill/game-night-pwa/commit/05b56dfee20d51ffc8b41b9b39bd70d05077dd45))
* **nudge:** add string type and length guard on inviteEmail ([#23](https://github.com/jaetill/game-night-pwa/issues/23)) ([#26](https://github.com/jaetill/game-night-pwa/issues/26)) ([ffeaa23](https://github.com/jaetill/game-night-pwa/commit/ffeaa238e0ba1186a2936d1926043a6cc85d188d))
* **nudge:** escape user-supplied fields in buildHtml to prevent XSS ([#18](https://github.com/jaetill/game-night-pwa/issues/18)) ([fef992d](https://github.com/jaetill/game-night-pwa/commit/fef992d931a3784030fdaa4f507d55793a19fdb1))
* **nudge:** reject invite emails containing double-quotes to prevent Cognito filter injection ([#22](https://github.com/jaetill/game-night-pwa/issues/22)) ([#27](https://github.com/jaetill/game-night-pwa/issues/27)) ([f902305](https://github.com/jaetill/game-night-pwa/commit/f9023056fe21d58de70ae15a6273a0befcd0e622))
* **nudge:** remove invitee email from nudge error response body ([#44](https://github.com/jaetill/game-night-pwa/issues/44)) ([#49](https://github.com/jaetill/game-night-pwa/issues/49)) ([335e273](https://github.com/jaetill/game-night-pwa/commit/335e273442eabb1d7c900cb297e036e31833416e))
* **nudge:** scrub Postmark error from invite 500 response body ([#55](https://github.com/jaetill/game-night-pwa/issues/55)) ([#57](https://github.com/jaetill/game-night-pwa/issues/57)) ([f6b2c06](https://github.com/jaetill/game-night-pwa/commit/f6b2c06c5e693ff90202b9fbe8536b65b9b3a9d8))
* **observability:** actually import sentry.js from the HTML entry points ([c09cff3](https://github.com/jaetill/game-night-pwa/commit/c09cff39348b5c3351be2a64bd4361c5aa670a35))
* **observability:** scope Grafana Logs perms to /aws/lambda/* + cleanup nits ([#37](https://github.com/jaetill/game-night-pwa/issues/37)) ([b23bf5b](https://github.com/jaetill/game-night-pwa/commit/b23bf5b00ec9f3d84406f7594bfa73864e13b1d3))
* **platform:** [#24](https://github.com/jaetill/game-night-pwa/issues/24) fix-iteration trigger + [#25](https://github.com/jaetill/game-night-pwa/issues/25) test-writer reviewer mode ([#28](https://github.com/jaetill/game-night-pwa/issues/28)) ([212a639](https://github.com/jaetill/game-night-pwa/commit/212a639e02c71b110a6ba13631579f238041ac9d))
* **platform:** [#29](https://github.com/jaetill/game-night-pwa/issues/29) implementer pre-flight conflict check ([#42](https://github.com/jaetill/game-night-pwa/issues/42)) ([bb61aee](https://github.com/jaetill/game-night-pwa/commit/bb61aeeaa95488387528aac43f92a910eba54d95))
* **platform:** [#43](https://github.com/jaetill/game-night-pwa/issues/43) add pre-flight conflict check to Mode B fix-iteration ([#46](https://github.com/jaetill/game-night-pwa/issues/46)) ([0b32cc9](https://github.com/jaetill/game-night-pwa/commit/0b32cc95b650196a635bd358b19cb9c855248027))
* **platform:** scope iac_drift role + sync implementer spec ([#48](https://github.com/jaetill/game-night-pwa/issues/48), [#52](https://github.com/jaetill/game-night-pwa/issues/52)) ([#59](https://github.com/jaetill/game-night-pwa/issues/59)) ([da83e7c](https://github.com/jaetill/game-night-pwa/commit/da83e7c4abf6e1d724d1af7c3e1588acbb01c2e6))
* restore correct BGG XML API URL and remove host-blocking RSVP check in modal ([1a2aadc](https://github.com/jaetill/game-night-pwa/commit/1a2aadcdcb454cb08532409f03ba10a891152610))
* **security:** address 3 LOW findings from issue [#6](https://github.com/jaetill/game-night-pwa/issues/6) ([#11](https://github.com/jaetill/game-night-pwa/issues/11)) ([a46f701](https://github.com/jaetill/game-night-pwa/commit/a46f701592409ef9246ff78d1bcb6a08a0712c3c))
* **security:** address claude-pr-review findings from PR [#3](https://github.com/jaetill/game-night-pwa/issues/3) ([#4](https://github.com/jaetill/game-night-pwa/issues/4)) ([41c6500](https://github.com/jaetill/game-night-pwa/commit/41c6500962092ecead3c4819eace376274bcb330))
* **security:** allowlist legacy app.js in gitleaks (history-only file) ([ca28201](https://github.com/jaetill/game-night-pwa/commit/ca2820144750c3efa89d95bf781fb8c67a7c739b))
* **security:** block git push -f shorthand in permissions deny list ([#116](https://github.com/jaetill/game-night-pwa/issues/116)) ([4691115](https://github.com/jaetill/game-night-pwa/commit/46911151032edfe1867f7fdda3a3bcebedbcc942))
* **security:** close real npm audit + add focused gitleaks allowlist ([dd9255b](https://github.com/jaetill/game-night-pwa/commit/dd9255b3b69e27534b9b4a99659f31dda88e8b7f))
* **security:** scrub S3 internal error messages from 500 API responses ([#45](https://github.com/jaetill/game-night-pwa/issues/45)) ([#47](https://github.com/jaetill/game-night-pwa/issues/47)) ([bfb21e2](https://github.com/jaetill/game-night-pwa/commit/bfb21e2c16d58cea749cc75aedb2482a42a1ccab))
* **security:** tighten PII redaction + JWT verifier triage; resolve real lint errors ([bcd336b](https://github.com/jaetill/game-night-pwa/commit/bcd336b3acd641759afe9a728a20e0ae85f8917a))
* **tests:** widen error-guard regex to match any catch-binding name ([#53](https://github.com/jaetill/game-night-pwa/issues/53)) ([#60](https://github.com/jaetill/game-night-pwa/issues/60)) ([1d45534](https://github.com/jaetill/game-night-pwa/commit/1d455346e2da691f3bc4be40c0de9a85221287f3))
* use CORS proxy for BGG collection fetch, skip empty/stale cache ([db6b00b](https://github.com/jaetill/game-night-pwa/commit/db6b00beb725b5d421f7568679c33ebabd7edac5))
