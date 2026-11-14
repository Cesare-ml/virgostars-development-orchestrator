# Native private-pilot validation from a pinned GitHub snapshot

The orchestrator's full Node test suite needs to run on a **real, unmodified checkout of one immutable Git commit**. GitHub-connected chat agents can edit code and run limited isolated source checks, but they must not claim to have passed the entire `npm run check` unless they actually execute it.

## Simplest path: use an existing local Git checkout

On a trusted Windows workstation with Node.js 20+ and repository access:

```powershell
git switch feat/distributed-agent-coordination-v0
git pull --ff-only
npm run check
node bin/vs-agent.mjs fleet-status
```

These commands do **not** merge to main, run GitHub Actions or deploy. The last command also needs a read-scoped `GITHUB_TOKEN` to access private coordinator and target repositories.

## Alternative: verify a private GitHub snapshot without Git clone

This mode is useful when the operator has an authenticated GitHub REST token, but cannot or does not want to make another checkout. It fetches a **fixed repository and branch only**:

- Repository: `Cesare-ml/virgostars-development-orchestrator`
- Branch: `feat/distributed-agent-coordination-v0`
- Tool: `scripts/verify-pilot.mjs`

On a trusted Windows PowerShell terminal, set `GITHUB_TOKEN` in your local session using a token with **Contents: read** access to the *private orchestrator repository*. Do **not** send or paste this token into ChatGPT, GitHub issues, PRs, shell history or source files.

```powershell
# Authenticate locally beforehand; do not paste the token into chat.
# The following assumes $env:GITHUB_TOKEN is already configured.
node scripts/verify-pilot.mjs --help
node scripts/verify-pilot.mjs --sha FULL_40_CHARACTER_FEATURE_BRANCH_HEAD_SHA
```

You may omit `--sha` to resolve the current head from GitHub and pin it at the start of the run. Passing `--sha` is recommended to detect if the expected branch changed before the run. You can also use `npm run verify:private -- --sha FULL_SHA`. The optional `--keep` retains the temporary directory for debugging; by default temporary files are removed afterward.

## What the script guarantees

1. Reads the private branch ref and resolves it to **one commit SHA**, then fetches that commit's Git tree.
2. Rejects truncated trees, unsupported object kinds, symlinks, unsafe/traversal/Windows-reserved paths, case-colliding names, unexpectedly large files and incomplete snapshots.
3. Downloads every tracked blob through the GitHub REST **GET** API, verifies the exact SHA-1 Git blob identity (`blob {length}\0{bytes}`), byte size and pinned tree metadata before writing it to an isolated temporary directory.
4. Runs **real** `npm run check` (syntax checks + `node --test`) in that temporary checkout, with a bounded child timeout. Only an allowlisted set of non-secret environment variables is passed to the child; GitHub credentials are explicitly excluded.
5. Prints actual exit code, verified file count, commit/tree SHAs and a conservative success/failure result. A failed or stale snapshot is **never** reported as passing.

There are no new npm dependencies, GitHub Actions, background processes, write requests to GitHub, automatic merges, deployments or releases.

## Validation evidence and remaining gate

**Executed 2026-11-12 in this environment:** Node.js 22.16.0 ran `node --test test/native-check.test.mjs` on copies whose Git blob SHAs **exactly match** `src/native-check.mjs` and `test/native-check.test.mjs` in the private feature branch. **11/11 tests passed**, including a nested real `npm run check` invocation on an intentionally tiny signed fixture snapshot. The final 11 cases also cover Windows npm.cmd execution, failure cleanup and GitHub GET-only requests. An initial test assertion used `assert.rejects` incorrectly for a synchronous throw; it was fixed, then the entire suite was rerun and passed.

**Still unexecuted:** the full `npm run check` test suite of the real private repository snapshot. This environment cannot resolve GitHub's DNS outside the authorized GitHub connector, which does not directly mount a clone into the Node execution environment. The new script can be run from an authenticated Windows/macOS/Linux machine with network access to GitHub; report its exact command, SHA and exit status before treating the private coordinator's implementation as fully native-validated.

## Trust and limitations

The verifier runs the repository's actual npm scripts. Run it only against **your trusted private repository**; a remote commit could itself contain executable code. A hash-verified download proves the bytes match GitHub's tree, not that arbitrary code inside is safe. The script deliberately pins the only allowed repository and branch and does not clone arbitrary outside projects.

A successful native `npm run check` does **not** authorize merging any feature branch. The two wave-2 projects still require their own native/browser tests and independent reviewer approval. The private coordinator and all associated repository credentials must remain private.

## Optional unsigned JSON receipt and offline SHA check

To retain reproducible local metadata after a full native run, add `--receipt ./validation-COMMIT.json` to `node scripts/verify-pilot.mjs --sha FULL_COMMIT_SHA`. This writes a **new**, atomic no-overwrite JSON receipt containing only commit/tree SHA, verified byte/file counts, Node version, `npm run check` exit status, completion time and explicit `unsigned:true` / `merge_authorized:false` fields. GitHub tokens and the native child environment are omitted. For offline validation without GitHub or a token, run `node scripts/verify-pilot.mjs --verify-receipt ./validation-COMMIT.json --sha FULL_COMMIT_SHA`. The verifier rejects malformed/oversized or SHA-mismatched receipts but cannot independently authenticate who ran the test. Details: [VALIDATION_RECEIPTS.md](VALIDATION_RECEIPTS.md).

**Additional native verification:** 9/9 new receipt tests plus the existing 11/11 snapshot verifier tests succeeded using exact Git blob-matching Node.js 22.16.0 sources. The **full real private repository** `npm run check` remains unexecuted; no receipt claiming whole-repository acceptance has been produced.

## 2026-11-12 — independently executed complete Node test suite on a source-verified local mirror

An actual **Node.js 22.16.0** invocation of `npm run check` succeeded with **120 passed, 0 failed, 0 skipped**, covering the project-wide `node --check` chain and every `test/*.test.mjs` case. This is materially broader than the isolated V8 tests or the native snapshot-validator's original 11/11 tests.

**Provenance:** the authorized GitHub connector fetched private source code, all Node tests, package and both configs from feature commit `f3736003b01af0ab5e12f21283719bd1412cf25d` (Git tree `262a08d51a91a7fd2c00dc5c6a7c83e313d73ce1`). The exact **36 relevant files** (including the fixed test under issue #17) were reconstructed in a temporary local test directory, each independently checked with `git hash-object`; their sorted `path<TAB>blob-sha<newline>` manifest has FNV-1a-64 checksum `40dcc945464b179f`, and their total size is **171,781 bytes**. Those numbers exactly matched the 36 source/test/config/CLI blob entries from the pinned GitHub tree. The feature branch's documentation, issue/PR templates and other non-runtime files were **not** copied into that mirror; this is **not** a clone of all 57 tracked files or an authenticated execution of `verify:private` against the full Git tree.

**Fixed native regression:** original `test/write-resources.test.mjs` incorrectly expected `Resource lock invalid` while the issue had no saved handoff, and the release guard correctly stopped first with `Save an owner handoff`. The test was updated to expect the real guard and a new separate test checks that release still rejects an absent resource *after* a valid handoff. The fix was committed as `f3736003b01af0ab5e12f21283719bd1412cf25d` and the corrected test blob was verified as `3018e540928a0b19b39958e66ff80c2dfcda1ad6`.

**Acceptance boundary:** These results establish that all current native scripts/tests pass against the exact reconstructed runtime/test/config files of the pinned commit. They do **not** validate GitHub PR #1's own merger readiness, target-repository browser/Rust/Python tests, any production deployment, an independent human review, or a full 57-file authenticated snapshot. A future source/test change requires a new run; docs-only edits require checking that the 36 runtime files are unchanged and rerunning the command.
