# ADR-0002: Repo line-ending policy — LF in-repo, OS-native locally

- **Status:** Accepted
- **Date:** 2026-05-09
- **Deciders:** Jason
- **Tags:** source-control, tooling, windows

> Format: MADR 4.x with three documented extensions. See `template.md`.

## Context and Problem Statement

After Phases 1-4 of the platform integration landed, the working tree showed 51 modified files with 7,190 insertions and 5,334 deletions — but `git diff -w` revealed that the diff was almost entirely whitespace, not behavior. Cause: the platform's `.editorconfig` and `.prettierrc.json` both pin `end_of_line = lf` / `"endOfLine": "lf"`, but the repo had no `.gitattributes`, `core.autocrlf` was unset, and the existing files had been saved with CRLF on Windows. Editor saves and Prettier runs were rewriting every line on contact.

Without a settled policy, every cross-platform edit risks producing a giant whitespace diff that drowns out real changes during review and triggers spurious lint/format failures.

## Decision Drivers

- **Solo project on Windows, with Linux Lambda runtimes and shell scripts.** Anything in `.claude/hooks/` or under `lambda/` runs on Linux at some point — CRLF in those breaks them silently or noisily.
- **Platform consistency.** `.editorconfig` and Prettier already declare LF. The repo state should match the declared policy.
- **Low ceremony.** The fix needs to be a one-time normalization, not an ongoing tax.
- **Future contributors.** If someone else (or future-Jason on a different machine) clones the repo, the policy must propagate via committed config, not per-clone setup.

## Considered Options

- **Option A — `.gitattributes` with `* text=auto eol=lf` + repo-wide renormalize.** Standard cross-platform pattern. One commit normalizes everything; subsequent commits stay clean. Policy travels with the repo.
- **Option B — Per-clone `core.autocrlf=input`.** Local-only fix. Doesn't propagate, doesn't fix existing CRLF state in-repo.
- **Option C — Loosen Prettier to `"endOfLine": "auto"`.** Half-measure. `.editorconfig` still says LF, the repo still has CRLF, and the underlying drift continues.

## Decision Outcome

Chosen option: **Option A — `.gitattributes` + renormalize**, because it's the only option that fixes the root cause (in-repo line-ending state) and propagates the policy via committed config rather than per-machine setup. The platform's stated direction (LF everywhere) becomes ground truth.

## Consequences

### Positive

- Lint and format checks run cleanly across platforms; no spurious whitespace failures.
- Reviewers see real diffs, not line-ending churn.
- Shell scripts and Lambda source remain LF on disk, which Linux requires.

### Negative

- One large normalization commit with thousands of whitespace-only changes will appear in `git blame` for affected lines. Use `git blame -w --ignore-rev <commit-sha>` (or commit the SHA to `.git-blame-ignore-revs`) to skip it.

### Neutral

- Windows checkouts can still display CRLF locally if Jason sets `core.autocrlf=true`. The repo state is LF either way; only the working tree differs.

## Pros and Cons of the Options

### Option A: `.gitattributes` + renormalize

- ✅ Single source of truth in the repo; no per-clone config needed.
- ✅ Aligns with `.editorconfig` and Prettier already in place.
- ✅ Standard pattern for cross-platform repos — well-understood by tooling and reviewers.
- ❌ One-time large commit with whitespace churn.

### Option B: Per-clone `core.autocrlf=input`

- ✅ No commit churn.
- ❌ Doesn't fix the in-repo state — CRLF stays in committed files.
- ❌ Doesn't propagate; every fresh clone needs the fix.

### Option C: Prettier `endOfLine: "auto"`

- ✅ Smallest change.
- ❌ Conflicts with `.editorconfig`'s `end_of_line = lf`.
- ❌ Leaves existing CRLF in the repo; doesn't actually solve the original problem.

## Implementation notes

- `.gitattributes` (committed alongside this ADR): `* text=auto eol=lf` plus explicit `text eol=lf` for `*.sh` and binary markers for common binary formats.
- `git add --renormalize .` was run after the file landed. In this case it produced **no** whitespace-only diff because Prettier had already converted the working-tree files to LF before this commit; the index already matched. No `.git-blame-ignore-revs` entry is needed.
- If a future commit ever does mass-rewrap or mechanical reformat, land it in its own commit and add the SHA to `.git-blame-ignore-revs` so IDEs that respect it skip the noise.
- This ADR is project-local for now. If the policy proves to be the right default for all platform-adopting projects, it should be promoted to a platform standard or platform-level ADR.

## Links

- [ADR-0001](0001-platform-adoption.md) — platform adoption that introduced `.editorconfig` / Prettier with LF.
- [Pro Git: gitattributes — End of Line](https://git-scm.com/docs/gitattributes#_end_of_line_conversion)
