# Private MVP — five VirgoStars repositories

**This is the current deployment target.** The repository remains private; the user runs many ChatGPT and Codex chats using a single authorized GitHub account. A public volunteer program is explicitly deferred.

## Active repositories

See `config/fleet.private.json`, the authoritative pilot registry:
- `Cesare-ml/VirgoStars-Ephemeris`: astronomical Rust core;
- `Cesare-ml/VirgoStars-Event-Ephemeris`: event ephemerides;
- `Cesare-ml/astrological-charts`: chart renderer;
- `Cesare-ml/astrological-functions`: astrological methods (private);
- `Cesare-ml/virgostars-desktop`: desktop app (private).

The first three are public repositories, but the private coordinator is not an invitation to outside volunteers. The last two must NEVER be included in an automatically published public registry or copied into public issue/task bodies.

## Session startup (each chat)

1. Read this repository's `AGENTS.md`, `config/fleet.private.json`, this file and the specific target repo's `AGENTS.md` before doing anything else.
2. Create a stable **unique session ID** for this chat (example: `chat-<random-uuid>`) and keep it in the chat's own working context; do not reuse another chat's ID.
3. Discover a small, independently verifiable, explicitly approved task. Check the latest roadmap, issue, relevant branches and all overlapping open PRs. Different tasks may still touch the same files.
4. If assigned `planner`, `reviewer` or `auditor`, follow the read-only/non-code scope. `developer` must acquire an exclusive task claim before editing.
5. If no safe work is available, produce an issue proposal with scope/dependencies instead of taking an arbitrary issue.

## GitHub-native claim (pilot mechanism)

A dedicated branch `coordination/claims` exists on `Cesare-ml/virgostars-development-orchestrator`.

For a chosen issue `#N` in `owner/repo`, construct the **exact** path:

`claims/owner__repo/issue-N.json`

For example `claims/Cesare-ml__astrological-charts/issue-42.json`.

Use the GitHub Contents API or available GitHub connector's **create_file** action on that path and branch; NEVER use update_file to steal or overwrite an existing claim. JSON must include `target_repository`, `issue_number`, `session_id`, `state`, `claimed_at`, `branch` (when known) and `last_handoff` (when known). A successful create confirms exclusive acquisition of that *task claim path*. If GitHub rejects the write or the file already exists, stop and select a different issue. Report failed claims rather than treating API errors as success.

**Verified smoke test (2026-11-12):** two simultaneous GitHub connector `create_file` attempts at an identical path on a test branch led to one success and one 422 rejection. The first session's test file was then read, deleted with its blob SHA, and successfully recreated by a second session; a follow-up read confirmed the second owner. This does not prove production handoff, automatic expiry or cross-issue resource exclusivity.

Claims **do not expire automatically in this MVP**. `expires_at` is advisory, not proof of an available task. An interrupted chat must not be silently replaced by time. Recovery is a manual maintainer-controlled action: verify old owner has stopped, read current GitHub PR/branch, check no concurrent updates, then explicitly archive/delete the stale claim before reassignment. Do not use the initial test branch `coordination/pilot-state` for real claims.

## Work and handoff

Each active developer works on a dedicated feature branch, makes small commits and a draft PR (do not push to main). Preserve the target repository's own approval, licensing and CI restrictions. At the end of each run, add factual progress in issue/PR and maintain a handoff record; to continue after 20–30 minutes, re-read the remote claim and current PR/branch before making changes. A chat does not remain running during idle time.

**General cross-task conflict detection is not implemented.** Single-partition write locks now protect approved shared resource IDs, but not arbitrary edits or multiple resource partitions. The planner must choose nonoverlapping files/modules and check in-flight branches/PRs. Do not run 40 unsupervised writers on conflicting parts of the same repository. Start with 2 competing claims, then 5–10 disjoint tasks; expand only after conflict/recovery tests.

## Roles and allocation

Roles are not bound to a number of chats or a repository. A planner triages and splits work; developers implement; testers and reviewers independently validate; integrators prepare safe merges but only the owner may authorize protected integration. Prefer at least one planner and reviewer per repository when many chats are present. Managers cannot bypass claim ownership, and no agent may self-approve its own code.

## Owner's starter prompt for an individual chat

> You are an agent of my private VirgoStars development pilot. Read `Cesare-ml/virgostars-development-orchestrator` `AGENTS.md`, `docs/PRIVATE_PILOT.md` and `config/fleet.private.json`. Pick a suitable role and a non-conflicting task in one of the five active repositories. Read that repository's AGENTS.md, issues, PRs and roadmap. If you will change code, acquire a task claim on the `coordination/claims` branch using atomic GitHub create-file. If unsuccessful, do not work on that task. Use a feature branch and draft PR, run actual tests where possible, leave a factual handoff, and never deploy, run Actions, merge to main, or change licensing/visibility. If no safe work is available, propose a bounded task for a planner to approve.

This can be reused as the initial prompt for each chat; after that `ottimo, avanti con lo sviluppo` should trigger revalidation, not blind continuation.

## Readiness gate

The pilot is not considered fully functional until task discovery, claim, collision, handoff, release and stale-recovery flows are independently validated on all five repositories. The GitHub-native mechanism prevents two **successful creates of the same file**, not every form of duplicated engineering work or unauthorized GitHub writes.

## Runnable private pilot and five real assignments

The Node.js CLI, `config/pilot-tasks.json` and `docs/CLI_PRIVATE_PILOT.md` now provide an initial curated work queue: five read-only PR review tasks, one per target repo. The CLI implements session, discover, status, claim, handoff and release with direct GitHub Contents API. The tool pins claim reads to a branch **commit SHA** before reading the claim file, because a connector smoke test observed a stale immediate branch-path read after update (the stale-SHA delete failed closed with HTTP 409). The fresh content was verified by its commit SHA and successfully released. This is still an owner-only pilot, not automatic cross-issue resource fencing or a hosted service.


## Automatic next-task command

The pilot CLI supports `claim-next --session SESSION --role reviewer [--repo OWNER/REPO]`, so independent Codex/terminal sessions do not need to choose an issue manually. It resumes an existing owned task first, then tries remaining ready tasks, skips conflicts and closed issues, and returns `no-task` if none is available. A normal release is blocked unless the current owner has saved a factual handoff. There is still no lock between unrelated issue IDs and no unattended stale-lock reclamation.

## Write task resource coordination

The original issue-level claim method remains appropriate for initial read-only reviewer tasks. **For any curated write task**, use the two-stage exclusive-resource protocol in [RESOURCE_LOCKS.md](RESOURCE_LOCKS.md): acquire one approved resource partition before the issue. Write task roots must not overlap across different partition IDs within the same repository; the CLI validates the catalog and checks the matching resource on resume, handoff and release. A failed, incomplete or orphaned reservation is not available work. We have a tested single-partition model, **not** general multi-resource atomicity, automatic expiry, scope enforcement on GitHub pushes, or protection from out-of-catalog editing.

## How to actually launch 3–5 ChatGPT chats

Use the [private MVP launch guide](LAUNCH_PRIVATE_MVP.md). All five initial reviewer assignments are verified open as of 2026-11-12. Copy the same prompt into separate GitHub-connected ChatGPT chats. The instructions include UUID session isolation, create-only task locking, a real PR/issue review, handoff, and a persistent **submitted / awaiting-review** marker that prevents duplicate assignment. The main branch has not yet absorbed this feature branch. `submit` is not merge or approval.
