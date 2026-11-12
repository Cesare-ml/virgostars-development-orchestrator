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
