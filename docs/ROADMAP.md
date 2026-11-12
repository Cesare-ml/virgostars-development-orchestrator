# Roadmap — measurable milestones

## M0 — Safe public entry (this draft)
- [x] Agent onboarding, dynamic role model, public/fork trust model, registry and protocol specifications.
- [ ] Owner selects license and contributor policy; repository history/security audit.
- [ ] Owner explicitly authorizes public visibility.
- [ ] Validate prompts with at least three AI vendors/accounts including read-only fallback.

## M1 — Pilot scheduler implementation
- [ ] PostgreSQL schema, migrations, transaction-safe task/resource claims with idempotency and generation fencing.
- [ ] Minimal authenticated coordinator API, tests and MCP/CLI adapter.
- [ ] GitHub App/webhook sync (issue/PR), per-installation least privilege and retry.
- [ ] Verify 2-agent race tests, duplicate claims, crash/expiry/recovery, pause/restart and reviewer separation.
- [ ] Demonstrate one public fork PR with no upstream write permission.

## M2 — Five-repository adoption
- [ ] Owner-approved opt-in for each repo and reference to orchestrator instructions without overwriting target AGENTS.md.
- [ ] Deduplicate existing tasks/PRs and map dependencies; create small independent tasks.
- [ ] Verify contributor UX, resource contention, cross-repo coordination and safe handoffs.
- [ ] Establish observability: active/idle sessions, task throughput, PR review latency, retries, conflicts, GitHub API use.

## M3 — Scaling and abuse tests
- [ ] Simulate >=1,000 concurrent sessions across many independent identities and multiple regions/latency models.
- [ ] Prove per-task exclusivity and resource contention guards in load/chaos tests; audit unexpected duplication.
- [ ] Exercise GitHub outage and retry/backoff, limits, malicious agents, spam quotas and supply-chain review.
- [ ] Document measured capacity and costs. Scale only within actual ready-task and maintainer-review capacity.

No deployment, Actions workflow, merge, target repo mutation or visibility/license change is authorized by this roadmap.
