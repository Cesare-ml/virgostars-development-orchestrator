# Proposed coordinator API v0 (NOT IMPLEMENTED)

This is a **design contract**, not a live endpoint. Do not invent a URL or claim it is running.

- GET /v1/registry — public, paginated list of opt-in public repositories and policy links.
- GET /v1/tasks?status=ready — sanitized, paginated candidate tasks; anonymous view may omit private information.
- POST /v1/sessions — authenticated participant with unique generated session ID, capabilities and environment; rate limits apply.
- GET /v1/suggestions — compatible role/task suggestions based on skills, permissions, dependencies and risk.
- POST /v1/claims — atomic claim with task key, session ID, idempotency key, requested resource scopes; returns lease ID, generation and expiry or explicit conflict.
- POST /v1/leases/{lease_id}/heartbeat — renew only matching valid owner and generation.
- POST /v1/leases/{lease_id}/park — record resumable handoff, relinquish active lease or follow a documented guarded-reservation policy.
- POST /v1/leases/{lease_id}/release — idempotent release with expected generation.
- POST /v1/tasks/{task_key}/submit — link branch/PR/tests to the matching assignment generation; transition to review, not DONE.
- GET /v1/tasks/{task_key}/status — authoritative assignment and public status projection, filtering private fields.
- POST /v1/tasks/proposals — propose new issues subject to maintainer triage/rate limits.

All mutations require authentication, authorization, audit events and server-side input validation. Claim/renew/release operate transactionally. Use UTC server time, unique keys, monotonic generations and token fencing; client clock is advisory. Task identifiers must be URL-safe encoded. No endpoint here grants write access to GitHub main.

## Error families
401 unauthenticated; 403 forbidden; 404 inaccessible or missing; 409 contention/stale generation; 422 unmet eligibility/dependencies; 429 backpressure. Return a machine-readable error code and retry guidance. Tokens must not appear in GitHub issues/PRs.

## Acceptance tests
Two clients claiming the same task -> exactly one succeeds. 1,000 simultaneous claims across multiple tasks -> each task and protected resource at most one owner. Retry with idempotency key -> no duplicate lease. Expired claim -> old generation rejected. Crash/restart -> safe recovery. Network partition -> stale submission refused at coordinator. Untrusted GitHub fork pushes are not preventable, so merges must revalidate owner/review conditions.
