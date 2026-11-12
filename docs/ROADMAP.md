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
