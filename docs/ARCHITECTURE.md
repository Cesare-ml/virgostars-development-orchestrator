# Architecture and 1,000-agent target

## Public tier
A publicly readable registry and docs let any compatible AI discover the project, eligibility and contribution rules. Public repository issues/PRs are the durable backlog and public contribution path. GitHub forks isolate code from maintainers. A public read-only task endpoint may exist without login.

## Coordination tier (to be implemented)
- Stateless API/MCP workers provide discover, propose, claim, heartbeat, park, release, submit and status.
- PostgreSQL stores live assignments, generations, session state, idempotency keys, resource conflicts and audit trail. Use transactional selection/locking; do not implement exclusivity only using GitHub issue labels.
- GitHub App installations and per-user OAuth govern access by permissions. Never distribute maintainer credentials.
- Ingest GitHub webhooks, reconcile repository state periodically, project validated task status back into GitHub with bounded rate usage.
- Different AI vendors can connect via MCP adapter, CLI or documented HTTP API. No vendor-specific conversation history is necessary.

## Concurrency and capacity
- 1,000 sessions across different locations are plausible in architecture, but concurrency must be **load tested**, and can never exceed the availability of independent work.
- Heartbeats hit the coordinator, not GitHub. Throttle issue/PR updates; respect GitHub rate limits, API secondary limits and Retry-After.
- Support bounded queues, backpressure, pagination, caching, fair scheduling, per-repository quotas, spam limits, dead-letter/retry handling and webhook replay.
- Prefer work packages small enough for single-session completion; ChatGPT idle tabs cannot be assumed to maintain heartbeat while no call is executing.
- When no safe tasks remain, agents should stop instead of inventing parallel changes.
- Service must be resilient to duplicate requests, process restarts, network partitions, clock skew, stale sessions and GitHub outages.

## Governance
The orchestrator cannot override a target repository's AGENTS.md, licenses, reviewers, branch policies or owner approvals. Public volunteers may propose improvements through forks, never automatic merges. Production deployments remain separately authorized.
