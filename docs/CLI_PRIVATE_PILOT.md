# Using the private pilot claim CLI

This is a Node.js 20+ command-line utility for the **owner-only pilot**. The authoritative list of five repositories is `config/fleet.private.json`. Only entries with `status=ready` in `config/pilot-tasks.json` may be claimed.

## Codex or another local terminal

Use a checkout of branch `feat/distributed-agent-coordination-v0`. Node.js is sufficient; no package installation or GitHub Actions.

Supply a GitHub API credential privately through the environment variable `GITHUB_TOKEN`. Do not put it in chat messages, terminal commands, issues, or source files. The credential needs read access to the target issue and read/write access to the orchestrator's claim branch; never grant more access than required.

Example commands (replace the session placeholder with the actual output of the first command):

    node bin/vs-agent.mjs session --kind codex
    node bin/vs-agent.mjs discover
    node bin/vs-agent.mjs status Cesare-ml/astrological-charts 23
    node bin/vs-agent.mjs claim Cesare-ml/astrological-charts 23 --session codex-YOUR-UUID --role reviewer
    node bin/vs-agent.mjs handoff Cesare-ml/astrological-charts 23 --session codex-YOUR-UUID --summary "Reviewed PR and posted findings"
    node bin/vs-agent.mjs release Cesare-ml/astrological-charts 23 --session codex-YOUR-UUID --confirm

Before releasing a claim, verify that the work has stopped, the handoff was recorded in the issue or PR, and no other chat is actively continuing it. Release does not mean a PR was merged.

## ChatGPT with GitHub connector (without local Node)

1. Read `AGENTS.md`, `docs/PRIVATE_PILOT.md`, and both pilot registries on the feature branch.
2. Generate a fresh UUID v4 for your chat session, prefixed `chat-`. Never reuse a session from another chat.
3. Choose one **ready** task from `config/pilot-tasks.json` and respect the required role.
4. Use GitHub connector `create_file` in the private orchestrator, branch `coordination/claims`, file path `claims/OWNER__REPO/issue-N.json`. Example path: `claims/Cesare-ml__astrological-charts/issue-23.json`.
5. Store JSON fields: `schema_version:1`, `target_repository`, `issue_number`, `session_id`, `role`, `state:"claimed"`, `claimed_at` (ISO UTC), `branch:null`, `last_handoff:null`.
6. On any failure (including HTTP 409/422), you **do not** own the task. Try a different ready task. Verify the stored file after successful creation.
7. Before every further work cycle, re-read the claim and current issue/PR. Hand off via a target issue/PR comment and optionally update the claim with `update_file` using its current blob SHA.
8. Release only via `delete_file` with the exact current blob SHA after checking ownership. Never delete another session's claim.

## Limits

The five initial tasks are **read-only reviews** to exercise claim and handoff before parallel coding. They do not authorize editing application code.

Claims are exclusive **only per issue file path**, not across different issues touching overlapping files. There is no automatic expiry, no server, no heartbeat, and no transactionally enforced resource lock. Recovery of stale claims requires explicit owner inspection. Do not assume an idle browser tab continues working.

Run `npm run check` locally to execute syntax checks and mock regression tests. Also verify real GitHub behavior before scaling. No automatic merge, production changes, deployment or new GitHub Actions are permitted.


## Automatic selection of the next task

Instead of choosing an issue number yourself, use:

    node bin/vs-agent.mjs claim-next --session codex-YOUR-UUID --role reviewer
    node bin/vs-agent.mjs claim-next --session codex-YOUR-UUID --role reviewer --repo Cesare-ml/astrological-charts

The first call checks whether this session already owns any curated task. If so it returns `already-owned` and its saved task; otherwise it tries ready, compatible tasks in the curated order. An occupied task is skipped, a closed issue is skipped, and HTTP permission/network failures stop the attempt without claiming anything. When no task can be acquired it returns `no-task` (CLI exit status 2). A normal `release` requires that the same session previously saved a nonempty handoff; write the corresponding factual issue/PR note before releasing. This does **not** replace the manual recovery procedure for orphaned claims.

All five initial tasks require `--role reviewer`. The CLI remains a local tool; connector-based ChatGPT users can reproduce the same selection using current issue and claim-file reads, then an exclusive `create_file` on the first ready task that succeeds.

## Important: code-writing agents must acquire a resource first

The GitHub connector walkthrough above is valid **only for `access: "read"` tasks**. For `access: "write"`, read `config/pilot-tasks.json` and `docs/RESOURCE_LOCKS.md`. First create `resources/OWNER__REPO/PARTITION.json` with the same session/issue and approved path roots, then create the issue claim. If either fails, stop or perform the documented verified rollback. On normal release, delete the issue claim **before** the resource. Never delete a foreign/orphaned lock or infer release from a timeout. The local Node CLI `claim`/`claim-next`/`handoff`/`release` implements these steps. All five initially curated tasks remain read-only, so this feature is intended for future separately approved developer tasks.

The `discover` command exposes `resource-busy` for write issues whose partition is occupied, even if the issue claim itself does not exist. Such tasks must not be started, and orphan recovery remains owner-controlled.

## Final delivery: submit, rather than release-and-reassign

When a review is actually complete, first post your findings in the target issue and save a factual handoff. Then use:

    node bin/vs-agent.mjs submit OWNER/REPO ISSUE --session YOUR_SESSION --confirm

This saves a private immutable `submissions/OWNER__REPO/issue-N.json` marker with the handoff, then releases the issue lock (and write-resource lock if applicable). The queue reports `submitted` and will not reassign that work merely because the issue claim is gone. **Submitted does not mean reviewed, approved or merged.** To abandon incomplete work, use `release` only after a handoff; such tasks can be claimed again.

For connector-only ChatGPT chats, follow [LAUNCH_PRIVATE_MVP.md](LAUNCH_PRIVATE_MVP.md) to create and verify a submission marker **before** deleting the claim. An interrupted `submit` may leave both marker and claim; only the original session or a maintainer may complete the release.

## Read-only monitoring of the whole private fleet

Run `node bin/vs-agent.mjs fleet-status` from the feature branch with a private `GITHUB_TOKEN`. This command performs only GitHub reads; it produces structured JSON with an immutable ledger commit, five task states, pending review links, and alerts for mismatched or orphaned locks. It is intended for the maintainer and doesn't autonomously claim, approve, merge or restart work. Full status definitions and first-wave reviewer comments are in [PILOT_MONITOR.md](PILOT_MONITOR.md).

## Two supervised write tasks now available

After the first five reviewer tasks were submitted, the private catalog gained two `pilot_wave:2` developer tasks. Local Codex may run `node bin/vs-agent.mjs claim-next --session YOUR_SESSION --role developer`; it will try the two curated tasks and require a resource lock before the task claim. Follow `docs/LAUNCH_DEVELOPERS_WAVE2.md` for exact branch/PR rules, permitted paths and handoff/submit procedure. These are **stacked draft PRs**, not updates to main or the existing active PR branches.

## Prevent out-of-scope developer submissions

Developer tasks must use the actual draft PR number and current PR HEAD SHA. After publishing a factual handoff, run `node bin/vs-agent.mjs audit-pr OWNER/REPO ISSUE PR_NUMBER` and then `node bin/vs-agent.mjs submit OWNER/REPO ISSUE --session YOUR_SESSION --pr PR_NUMBER --confirm`. Submission rechecks the scope and refuses missing or unauthorized changes. The original five reviewer tasks remain `access:read` and do not require `--pr`. Read `docs/PR_SCOPE_AUDIT.md` for the exact checks, error codes, and limitations. A manually created ChatGPT marker is not evidence of CLI execution.

## Block overlapping open PRs on one resource

Run `node bin/vs-agent.mjs audit-collisions OWNER/REPO ISSUE` on an authenticated feature-branch checkout. `conflict` means two or more open PRs touch at least one approved resource root. The CLI returns exit code 2 on conflict, and write `submit --pr N --confirm` refuses to mark the task delivered unless exactly one PR candidate exists and it is PR N. This is read-only GitHub PR metadata inspection, not independent tests or approval; connector-only manual submissions do not imply the CLI ran. See [PR_COLLISIONS.md](PR_COLLISIONS.md).

## Summarize outstanding integration blockers across submissions

Run `node bin/vs-agent.mjs fleet-status` with the existing read credentials. The output now combines one-commit claim/submission data, live per-PR freshness checks, overlapping open PR candidates and conservative `review_gates.blockers` for submitted write tasks. It always records native test evidence as **unverified** and keeps human approval outstanding: no `scope-clean` or absent conflict means tests passed. See [REVIEW_GATES.md](REVIEW_GATES.md). No GitHub write action is performed.

## Reproduce full native Node checks without an existing clone

The manual `npm run verify:private -- --sha FULL_FEATURE_HEAD_SHA` script can materialize a trusted, pinned private coordinator commit from GitHub read-only APIs and execute actual `npm run check` in a temporary isolated checkout. It requires a locally configured `GITHUB_TOKEN` with Contents: read access. All downloaded blobs are verified against Git SHA-1 IDs; unsafe paths, symlinks, incomplete listings and credential propagation to child npm are prohibited. See [NATIVE_VALIDATION.md](NATIVE_VALIDATION.md). No Actions or unattended runtime; the full real repository test remains pending until actually executed.
