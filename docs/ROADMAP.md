# Roadmap

## M0A — Private owner-only pilot (CURRENT PRIORITY)
- [x] Specify five initial repositories in `config/fleet.private.json`; no public/private registry mixing.
- [x] Document sessions, roles, pilot startup prompt, and GitHub-native task claims.
- [x] One real two-client create-file collision test in a separate test branch: one succeeded, one rejected.
- [ ] Verify complete claim -> renew/hand-off -> release -> re-claim lifecycle with two distinct agent sessions.
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
