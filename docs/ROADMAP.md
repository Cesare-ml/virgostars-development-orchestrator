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
