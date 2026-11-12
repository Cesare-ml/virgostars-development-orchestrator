# Roadmap

## M0A — Private owner-only pilot (CURRENT PRIORITY)
- [x] Specify five initial repositories in `config/fleet.private.json`; no public/private registry mixing.
- [x] Document sessions, roles, pilot startup prompt, and GitHub-native task claims.
- [x] One real two-client create-file collision test in a separate test branch: one succeeded, one rejected.
- [x] Verified GitHub test-branch claim collision, owner-checked release, and subsequent re-claim by a second session (2026-11-12). Renewal, handoff and automated lifecycle still pending.
- [ ] Verify full claim -> handoff/renew -> release lifecycle during real work with independently active chat sessions.
- [ ] Create an explicitly triaged small task queue in each repo, avoiding scope overlap with active PRs.
- [ ] Ensure AGENTS.md in each target repo references the coordinator without replacing local agent rules (separate reviewable PRs).
- [ ] Test with 5–10 disjoint real tasks; assess rate limits, branch conflicts, interrupted sessions and manual recovery.
- [ ] Scale toward 40 simultaneous chats *after* the pilot meets its acceptance tests.
- [ ] Integrate an optional native CLI for Codex; ChatGPT connector can use GitHub create_file directly.

## M0B — Hardened private scheduler
- [ ] Implement atomic task/resource assignment, lease generations, idempotency and expiry/recovery; GitHub labels/comments alone are insufficient.
- [ ] Add safeguards against cross-task file conflicts, stale agents and concurrent writes.
- [ ] Introduce a PostgreSQL + authenticated API scheduler if GitHub-native coordination is not robust enough.
- [ ] Build independent collision, crash, stale lease, latency and conflict tests.

## M1 — Optional future public collaboration
- [ ] Owner chooses license/contributor policy; audits history, secrets, private data and asset rights.
- [ ] Owner explicitly authorizes orchestrator visibility change to public.
- [ ] Separate public registry and role/task policies; never leak private repo metadata.
- [ ] External volunteers use their own identities, forks and pull requests, with no privileged writes.
- [ ] MCP/CLI adapters and secure auth for external AI vendors.

## M2 — Scale
- [ ] Simulate 1,000+ agents, workload fairness, database/transport capacity, GitHub rate limits and review backpressure.
- [ ] Document measured concurrency, costs and resilience; do not claim throughput before tests.

No deploy, Actions, production mutation, release, automatic merge, or license/visibility change is implied.

## Checkpoint: first executable private queue (2026-11-12)

- [x] Register five triaged read-only QA issues in `config/pilot-tasks.json`, one per target repository.
- [x] Add local Node CLI with exclusive create, status, owner handoff, manual release and curated discovery.
- [x] Add mock regression tests and observe real GitHub collision / handoff / SHA-safe release on `coordination/claims`.
- [x] Pin claim reads to a concrete Git commit SHA to avoid stale branch-path responses observed in testing.
- [ ] Run the committed CLI suite in a full checkout, including Windows 11 Codex shell; local implementation tests passed, but the remote commit was not executed in this environment.
- [ ] Review the five QA handoffs, triage nonoverlapping coding tasks, and test 5–10 independent working chats before targeting 40.


## Increment: private next-task selector

- [x] Add `claim-next` command with explicit role, optional repository filter and existing-session resume.
- [x] Treat a busy claim as a reason to try another eligible task; skip closed issues without fabricating work.
- [x] Require a stored owner handoff before normal release.
- [x] Execute 12 deterministic local Node.js mock tests, including simultaneous selection, permission errors, resume and handoff/release; local copies of the committed modules were exercised.
- [ ] Run checkout-native checks on Windows and verify the full CLI against GitHub with two independent real chats.
- [ ] Implement cross-task resource conflict guards before parallel write-heavy assignments.

## Checkpoint — partition-safe pilot writes (2026-11-12)

- [x] Add single-partition `resource_scope` declarations and validation of disjoint write roots (case-insensitive check).
- [x] Acquire resource lock before task lock; release task lock before resource, with explicit partial-failure handling.
- [x] Fail closed on malformed task catalogs, path traversal-like repository IDs, missing/foreign resource locks and scope changes after a session has claimed work.
- [x] Execute 28 local Node.js mock tests on an equivalent source mirror, including real protocol failure and concurrency cases; **not** a fresh remote checkout test.
- [x] Real GitHub resource-create collision test: exactly one success, one HTTP 422; synthetic task claim/handoff/release and resource release; both paths absent in final Git tree.
- [ ] Test real developer tasks on two nonoverlapping modules in the same target repo, verifying actual diffs stay within declared roots.
- [ ] Add maintainer-guided audit/recovery tooling for orphaned resources, with protections against stale chat sessions.
- [ ] Prove multi-partition atomicity via PostgreSQL backend before allowing tasks spanning independent partitions. No 40-agent scalability claim yet.

- [x] Detect orphaned resource locks during task discovery, returning `resource-busy` instead of falsely advertising unclaimed write tasks.

## First-chat launch gate (2026-11-12)

- [x] Verified the five initial reviewer issues remain open; private lock ledger was empty before first-chat preparation.
- [x] Add `docs/LAUNCH_PRIVATE_MVP.md`: a single copy/paste chat prompt and clear 3–5-chat launch instructions.
- [x] Add immutable `submissions/` terminal queue markers: `submit --confirm` records work submitted for independent review before releasing the claim. `discover` and `claim-next` skip submitted tasks.
- [x] Add submission tests for owner-only delivery, retries, interrupted release, duplicate prevention, and queue exhaustion; checked into PR #1.
- [ ] Run `npm run check` on a fresh checkout of the feature branch on Windows/Codex; this environment has no direct network checkout of the private repository.
- [ ] Test with 3–5 actual independent ChatGPT conversations and inspect their technical issue-review comments.
- [ ] Only then curate two disjoint code-writing tasks with explicit scope/PR review before wider parallel development.

- [x] Real GitHub synthetic review submission test: acquired issue claim, saved handoff, created `submitted` marker, released issue; marker still existed after release. Removed synthetic test marker and verified cleanup. This validates the GitHub write sequence, not a real ChatGPT agent performing a review.
- [ ] On Windows or another GitHub-capable checkout run `npm run check` and record the exact result before expanding beyond review-only pilot.

## First-wave observability checkpoint — 2026-11-12

- [x] Observed all five submitted reviewer markers in the private claim ledger; corresponding technical issue comments were located. No existing submitted data was edited.
- [x] Add `fleet-status` CLI read-only audit from one immutable Git tree, aggregating available, claimed, submitted, inconsistent, pending-release, resource-busy and closed statuses.
- [x] Preserve compatibility with `last_handoff` markers from ChatGPT and `handoff` records from early CLI versions; normalize new CLI submissions to `last_handoff`.
- [x] Add mock tests for mixed marker formats, identity mismatch, orphaned resources, untracked records, permission errors and truncated Git snapshot.
- [x] Validate the live GitHub REST ref → commit → tree → blobs path and confirm each of the five submissions references an issue comment.
- [ ] Run `npm run check` against a fresh checkout of this latest feature branch; newly committed monitor tests have not been executed in this tool runtime.
- [ ] Independent maintainer review of the five submitted findings before converting them into scoped coding tasks; no automatic task approval or merging.

## Wave 2 kickoff — two disjoint real developer tasks

- [x] Reviewed five original reviewer comments and checked updated open PR status; recognized that PR heads have advanced since original review evidence.
- [x] Created test-scoped issues `Cesare-ml/astrological-functions#5` (provider ESM consumer import) and `Cesare-ml/astrological-charts#25` (axis canvas browser smoke).
- [x] Verified all three intended new file paths are absent on the source PR branches at selection time; no source files in existing PRs are authorized to change under these tasks.
- [x] Added both `access:write`, `pilot_wave:2` tasks to the private curated catalog with exact resource roots and upstream PR metadata; first five `submitted` reviews retained.
- [x] Authored `docs/LAUNCH_DEVELOPERS_WAVE2.md` with a shared two-chat prompt, resource-first claim format, stacked draft PR requirement and honest test/handoff reporting.
- [ ] Observe both agents independently acquire disjoint resource+issue locks and open draft PRs without writing outside declared paths.
- [ ] Verify their tests and target PR heads, then decide whether to approve work or expand toward additional repos.

## Read-only PR scope guard — issue #11 (2026-11-12)

- [x] Implement `audit-pr OWNER/REPO ISSUE PR_NUMBER` for scoped stacked draft PRs, including complete bounded GitHub PR file pagination and checks against upstream PR branch/SHA.
- [x] Require actual `added` new files and every approved wave-2 path, rejecting out-of-scope changes, renames and missing declared files.
- [x] Require `--pr` when a local developer uses `submit`; re-audit and persist the exact checked PR HEAD/base SHA, while leaving reviewer submission semantics unchanged.
- [x] Add regression tests for scope failures, wrong branch, incomplete file lists, GitHub permission errors and write-submission rejection; private monitor flags unaudited write markers as `needs-scope-audit`.
- [x] Run 7 isolated local Node 22 tests for the exact `src/pr-audit.mjs` blob (same Git SHA as committed file); these passed. This does not validate the whole orchestrator checkout.
- [ ] Run full `npm run check` on a fresh authenticated Git checkout, including new pagination and write-submission integration tests.
- [ ] Audit both real developer stacked PRs and independently execute required target tests before deciding on acceptance.

## Submission freshness checkpoint — issue #12 (2026-11-12)

- [x] Add read-only `src/submission-freshness.mjs`, comparing current stacked PR and upstream HEAD with immutable recorded submission evidence.
- [x] Enhance `fleet-status` to show `stale-submission`, `needs-scope-audit` and per-PR recorded/live HEAD/SHA checks; preserve risk states when an issue claim also remains active.
- [x] Re-fetch the PR and its upstream HEAD after changed-file pagination, refusing checks that raced with a push/rebase.
- [x] Add targeted Node test cases for PR HEAD drift, upstream movement, scope violations, manual handoffs, API denial, claim release overlap and concurrent PR updates.
- [x] Run **9/9** isolated Node.js 22 regression tests from `test/submission-freshness.test.mjs` against exact Git-blob-identical copies of `src/submission-freshness.mjs`, `src/pr-audit.mjs`, and `src/resources.mjs`; all corresponding SHA-1 Git blob IDs matched the private feature branch.
- [ ] Run the **entire** `npm run check` suite on a fresh checkout; the extended `fleet-status` integration tests have not yet been independently executed.
- [ ] Observe real developer stacked PRs from two independent chats and verify scope, commit freshness and actual target test evidence before any integration decision.

## Open PR collision prevention — issue #13 (2026-11-12)

- [x] Verify Charts #27 and #28 both open, draft and overlapping on `tests/pilot-axis-canvas.browser.test.mjs` while #22's upstream HEAD has advanced. Confirmed in actual GitHub read-only scan of seven open PRs.
- [x] Implement `audit-collisions OWNER/REPO ISSUE` with bounded open PR inventory, changed-file paths including rename sources, resource scope overlap, and start/end PR inventory comparison.
- [x] Block local CLI write `submit --pr ...` unless exactly one candidate PR touches its scoped resource and it is the submitted PR. Original read-only reviews and manual submission markers are not modified.
- [x] Add `test/pr-collisions.test.mjs` and write-submission regression for two overlapping open PRs; correct a `page=1` URL matching error in existing pagination tests.
- [x] Execute 8/8 isolated V8 checks of exact GitHub checker sources, 6/6 isolated V8 checks of write-submission guard, and live GitHub read-only conflict scan; these were **not** Node's native test runner.
- [ ] Execute complete `npm run check` on a fresh private checkout and review native test reports before integrating the coordinator PR.
- [ ] Choose one Charts test PR (#27 or #28) after real browser testing; update its upstream base and review/close the redundant proposal only by explicit owner/maintainer decision, never automatically.

## Live integration blockers in central fleet monitor — issue #14 (2026-11-12)

- [x] Combine exact submitted write-task PR freshness with all current overlapping open PR candidates in private `fleet-status`.
- [x] Preserve existing `stale-submission` or `needs-scope-audit` statuses while separately recording `collision_check`, warning and explicit blocker codes.
- [x] Require independent native test evidence and independent code review regardless of the self-submitted marker or matching HEAD; `integration_ready:false` and `merge_authorized:false` throughout the private pilot.
- [x] Add `test/review-gates.test.mjs` (11/11 isolated source checks) and extend `test/fleet-status.test.mjs` (13/13 isolated checks) for duplicate open PRs, missing PRs, manual markers, upstream drift and API failures.
- [x] Check scoped PR audit's original regressions (8/8 isolated source checks); correct an outdated test expectation for the earlier catalog validation error and retain authorized tester-role parity.
- [x] Preserve GitHub privacy and existing submitted ledger; do not modify target branches or PRs. Our own private coordinator claim is held only during the implementation.
- [ ] Run full **native** `npm run check` on an authenticated checkout and independently verify complete live fleet report before claiming production-grade monitoring.
- [ ] Run wave-2 Functions Node/npm and Charts actual browser tests; resolve duplicate Charts PR #27/#28 by explicit maintainer selection, not automated merge.

## Pinned private native test reproducer — issue #15 (2026-11-12)

- [x] Added dependency-free Node `src/native-check.mjs` to retrieve one pinned private coordinator GitHub branch commit/tree/blob snapshot, reject symlinks, unsafe/case-colliding paths, oversized/truncated results and SHA mismatches, and isolate all files in a temporary directory.
- [x] Added `scripts/verify-pilot.mjs` and `npm run verify:private -- --sha SHA` for explicit operator execution of actual `npm run check` with a strict child environment allowlist excluding GitHub tokens.
- [x] Added `test/native-check.test.mjs` and ran it with **real Node.js 22.16.0**: **11/11 passing**, including a nested **real npm** test run against a three-file synthetic snapshot; corrected two erroneous `assert.rejects` expectations for synchronous argument validation.
- [x] Verified exact Git blob SHA equality for test and module: `src/native-check.mjs` `ee2826ea88b20f30c42b742da6af97a41807b707`; `test/native-check.test.mjs` `de443acc5e1714528acab6ffb94d6b1bdf57a538`; CLI `scripts/verify-pilot.mjs` `5eff28b0da3c663ce72708621c5cc45d3a6a6365`. Manual CLI help/invalid SHA/missing token errors also tested successfully.
- [x] Wrote [docs/NATIVE_VALIDATION.md](NATIVE_VALIDATION.md) with offline checkout and authenticated snapshot validation options; neither makes GitHub Actions calls or merges PRs.
- [ ] On a trusted network-connected environment with GitHub repo read access, execute `npm run verify:private -- --sha CURRENT_BRANCH_SHA` and independently record the **complete** `npm run check` output. This remains unexecuted on the full private repo in this runtime because DNS/network is unavailable.
- [ ] Review the complete native suite before considering coordinator PR #1 for a non-draft merge decision; do not confuse verifier's own 11 tests with whole-branch acceptance.

## Unsigned native validation receipts — issue #16 (2026-11-12)

- [x] Add `src/validation-receipt.mjs` with a strict versioned schema, explicitly **unsigned** evidence and a deterministic native exit-status/commit integrity check.
- [x] Extend `scripts/verify-pilot.mjs` to write `--receipt NEW_FILE.json` only after native execution returns, and to inspect `--verify-receipt FILE.json --sha SHA` completely offline without a token.
- [x] Atomically publish using an exclusive same-directory hard link; reject existing outputs and malformed/too-large inputs. Read at most 4097 bytes to reject oversized receipts without loading large files into memory.
- [x] Add `test/validation-receipt.test.mjs` and validate using **real Node.js 22.16.0** on exact Git-blob-identical files: receipt tests **9/9**, existing native snapshot tests **11/11** (**20/20 total**). CLI subprocesses were executed in offline mode, covering successful and failed receipts, missing GitHub authorization and secret omission.
- [x] Add syntax-check gating for the receipt module and document the unsigned record/human validation boundary in [VALIDATION_RECEIPTS.md](VALIDATION_RECEIPTS.md).
- [ ] Perform the **full real private orchestrator checkout's** authenticated `npm run check`; native tests of the verifier and receipt are not a substitute.
- [ ] Independently reproduce submitted developer PR tests and resolve competing Charts PRs before any integration/merge decision.
