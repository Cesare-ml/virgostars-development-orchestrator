# Work coordination protocol — proposed v0.1

## Data model
A **task** has a globally unique key (repository full name plus issue number), objective, dependencies, priority, risk tier, required skills, allowed resource scopes, acceptance tests and allowed contribution mode (public fork vs trusted maintainer). A **session** is unique per independent chat or process, not just a GitHub username. An **assignment** includes an immutable generation/fencing number, current state, lease expiry, actor and audit event IDs.

States: PROPOSED -> TRIAGED -> READY -> CLAIMED -> IN_PROGRESS -> REVIEW -> DONE; alternatives BLOCKED, EXPIRED, CANCELLED. Only triaged READY tasks are eligible for automatic claiming. DONE requires target-repository acceptance policy, not merely a PR submission.

## Exclusivity
- Use a durable database with atomic transactions and a unique active owner per task.
- Select eligible tasks under transaction row locks (e.g. PostgreSQL FOR UPDATE SKIP LOCKED), enforce dependencies and resource overlap, issue monotonic per-task generation and lease.
- Lock resource scopes in deterministic order; reject/rollback a claim that cannot obtain all required resources. Broad shared files can be excluded or treated as high-conflict resources.
- Unique claim/request idempotency key; duplicate requests from one session return the same result rather than allocating another task.
- A heartbeat extends the lease only if session, generation and active status still match.
- On expiry, mark the old generation invalid and require new claim/recovery; never allow an old session to silently renew after reassignment.
- Return an explicit error and do not start work on failed claim.
- Agent pauses are normal: distinguish durable PR state from short-lived lease; don't hold resource locks for idle sessions indefinitely.

## Fencing limitation
A fencing token protects **only mutations passing through a service that verifies it**. An untrusted external contributor can still push to their own fork independently. Therefore stale work cannot be technically prevented at source, but the coordinator can reject stale submissions/acceptance and maintainers must verify the current owner and latest branch before merging. Do not claim absolute prevention of duplicate local work.

## GitHub synchronization
GitHub issues and PRs are the durable work specification and review record. A coordinator database is authoritative for live assignment; issue labels are projected status only. Use webhooks for updates plus periodic reconciliation, idempotent event handling and bounded GitHub API calls. Never make lease renewal depend on writing GitHub comments every minute.

## Handoff schema
Include task key, role, owner/session reference (non-secret), assignment generation, branch, commit SHA, PR URL, resources modified, checks run + outcomes, review status, remaining steps, blockers and next expected action. Do not store API keys or private data.

## Review
Untrusted outside contributors submit fork PRs. Only approved maintainers or separately authorized reviewers can approve sensitive changes. Reviewer must not be the task author and may not bypass protection rules. Cross-repository tasks need explicit dependency/blocker records, not hidden assumptions.
