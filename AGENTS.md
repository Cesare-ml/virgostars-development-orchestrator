# AGENTS.md — VirgoStars agent coordination

## Current mode: private pilot

Read `README.md`, `docs/PRIVATE_PILOT.md`, `config/fleet.private.json`, `docs/SECURITY.md` and the selected target repository's `AGENTS.md`, roadmap, issue/PR list and relevant source before any work. The pilot currently covers five specific repositories with mixed public/private visibility; the orchestrator itself remains PRIVATE.

Agents may be independent ChatGPT/Codex conversations but share authorized GitHub access. A unique session ID identifies each chat independently; different chats on the same GitHub account MUST NOT share a session ID.

## Dynamic roles
- Planner: split and triage tasks, identify dependencies and file conflicts; no self-approval.
- Developer: acquire an exclusive **issue claim** before coding, use a feature branch, draft PR and tests.
- Tester: independently run/report test evidence and scoped fixes only after claiming if writing code.
- Reviewer: independently inspect existing work; no self-approval or unauthorized merge.
- Auditor: read-only check of architecture, provenance, safety, licenses and backlog consistency.
- Integrator: assess dependencies/conflicts and prepare integration decisions; no automatic merge to main.

## Critical task-claim rules
1. Read `docs/PRIVATE_PILOT.md`. Only work on explicitly triaged, non-overlapping issues.
2. To claim issue N in owner/repo, attempt GitHub `create_file` (not update!) on `coordination/claims` branch of this repository at `claims/owner__repo/issue-N.json`, with a unique session ID and task metadata.
3. Only successful creation grants exclusive ownership of that **one task key**. A failed create, an existing file or an API error means **no claim**. Select another task; do not overwrite.
4. Claim does NOT prove safe ownership of overlapping files across different task IDs. Inspect open PRs, scope and resource conflicts before edits.
5. There is no automatic TTL reclaim; stale claims require owner-mediated review. Do not interpret advisory expiry as an unlocked task.
6. Before each follow-up work cycle, re-read the claim, current issue, target AGENTS.md and PR/branch; stop if ownership has changed. Never assume chat memory is authoritative.
7. Hand off branch, commit, PR, tests actually executed, risks and next action. Do not claim tests passed unless run.
8. Planner roles may propose tasks without claims but cannot bypass code-write rules. No eligible safe tasks -> stop and propose one.

## Repository safeguards
Target-repository rules always apply. No direct push to main, automatic merge, production change, unapproved GitHub Actions, release, access change, publication or license alteration. No shared token in prompts/issues, no private information in public repository issues or PRs. Do not overwrite another agent's branch or uncommitted local work. Cross-repository work requires explicit dependency management and independent scoped PRs.

## Future work
`docs/START_HERE.md`, `docs/PROTOCOL.md`, and `docs/API.md` specify a **future public and 1,000-agent architecture**. They do not authorize public volunteers in the current pilot and no scheduler/API is yet deployed.
