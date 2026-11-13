# AGENTS.md — VirgoStars agent coordination

## Current mode: public repository, owner-operated pilot

Read `README.md`, `docs/PRIVATE_PILOT.md`, `config/fleet.private.json`, `docs/SECURITY.md` and the selected target repository's `AGENTS.md`, roadmap, issue/PR list and relevant source before any work. The legacy pilot catalogs refer to targets with mixed visibility. **This orchestrator repository is now PUBLIC**; review [docs/PUBLIC_TRANSITION.md](docs/PUBLIC_TRANSITION.md) before handling any coordination files or inviting external agents.

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
Target-repository rules always apply. No direct push to main, automatic merge, production change, release, access change, unapproved publication or license alteration. **Read-only test GitHub Actions are authorized on public VirgoStars repositories**; private-repository workflows still require explicit authorization. No shared token in prompts/issues, no private information in public repository issues or PRs. Do not overwrite another agent's branch or uncommitted local work. Cross-repository work requires explicit dependency management and independent scoped PRs.

## Future work
`docs/START_HERE.md`, `docs/PROTOCOL.md`, and `docs/API.md` specify a **future public and 1,000-agent architecture**. They do not authorize public volunteers in the current pilot and no scheduler/API is yet deployed.

## Executable private task queue

Read `config/pilot-tasks.json` and `docs/CLI_PRIVATE_PILOT.md`. Every pilot reviewer must claim their issue before a review, just as developers must claim before code edits. The five initial tasks are reviewer-only and **do not authorize source changes**. `claim` requires a task explicitly marked `ready`; do not work on arbitrary issues. Local Codex may use the Node CLI; a GitHub-connected ChatGPT must use the exact same claim path and ownership rules through connector actions. A task claim is exclusive per issue key only, not across modules or files shared by different issues.


## Next task and continuity

Prefer `claim-next` for local agents with the CLI. Provide the **same session ID** when resuming the same chat; a new chat must generate a fresh session ID. The selector first checks whether that session already owns any curated task; it does not silently reserve a second. Normal `release` is rejected until the owner saves a factual handoff. If a claim is orphaned or you lose your session ID, stop and request explicit maintainer recovery rather than deleting another session's claim.

## Resource-first rule for code changes

For an explicitly approved `access: "write"` task, read [docs/RESOURCE_LOCKS.md](docs/RESOURCE_LOCKS.md). Acquire an exclusive `resources/OWNER__REPO/PARTITION.json` lock on `coordination/claims` **before** attempting `claims/OWNER__REPO/issue-N.json`. Both must have matching task, session, scope ID and frozen root paths. Read-only tasks only require an issue lock. Use the CLI to handle this automatically; connector-only agents must follow the same two-step protocol. If any lock or resource scope is inconsistent, **do not write code**. Single-partition claims do not authorize edits outside their declared paths. Do not change the curated catalog's resource IDs or roots while agents own those tasks.

## Trial launch and terminal submission status

For the first ChatGPT pilot, use `docs/LAUNCH_PRIVATE_MVP.md` (feature branch) and only five read-only reviewer assignments. A finished review is **submitted**, not DONE: publish real issue/PR review findings, save the owner handoff, then create a `submissions/OWNER__REPO/issue-N.json` marker on `coordination/claims` **before** releasing the issue claim. Never delete that marker as part of normal release. The CLI `submit --confirm` performs these steps with ownership validation; connector-only agents follow the documented equivalent. A new chat must not claim an already-submitted task. If the process fails between submission and release, the original owner or maintainer must reconcile it; do not steal the lock.

## Central monitoring and evidence review

Before a new wave of chats, run `fleet-status` or inspect the immutable private `coordination/claims` branch. Use [docs/PILOT_MONITOR.md](docs/PILOT_MONITOR.md) for state definitions. `submitted` means a review was handed off, not that defects are fixed or code approved. Do not reassign submitted work to a new agent without a maintainer decision. Investigate `inconsistent`, `resource-busy` and `submitted-pending-release` states before scheduling new code-writing tasks. The repository is now public: never post operational claim or monitor output to public logs, workflow artifacts, issues or PRs. The legacy coordinator requires privacy migration.

## Supervised developer pilot, wave 2

Read `docs/LAUNCH_DEVELOPERS_WAVE2.md` before selecting a developer task. Only two curated `pilot_wave:2`, `access:write` issues currently qualify. Each requires a verified **resource-first** lock, then issue claim, exact file-root scope compliance, new feature branch from the latest upstream PR head and a **draft stacked PR** against that PR's branch. No direct writes to active PR branches. Stop rather than expanding file scope. Existing five submitted reviewer findings remain pending independent review.

## Required PR scope gate for write tasks

Before handoff or submission of a write task, inspect `docs/PR_SCOPE_AUDIT.md`. Check every changed file on the new stacked draft PR against the **exact curated resource roots** and verify the PR's base/upstream HEAD. Local agents must run `node bin/vs-agent.mjs audit-pr OWNER/REPO ISSUE PR_NUMBER`; the CLI's `submit` requires `--pr` and rechecks this evidence automatically. GitHub-connector-only chat agents must manually inspect the actual changed-file metadata and report that the machine audit was not run. Never record an unaudited manual check as `scope-clean`. A new PR commit invalidates the previous audit snapshot. No scope audit is PR approval, runtime validation or authorization to merge.

## Detecting PR changes after developer handoff

Before recommending integration of a write submission, run private `fleet-status` and `audit-pr` on the **current** PR HEAD. `submitted` is only the state recorded at handoff. A subsequent PR or upstream commit can make it `stale-submission`, even when the stored SHA was scope-clean. Stop and obtain a fresh audit/evidence on drift; never edit immutable submission markers merely to conceal an outdated PR. Connector-only manual submissions without executable CLI evidence continue to require independent review. No automatic approval or merge.

## Open PR collision gate before submitting write work

Run `audit-collisions OWNER/REPO ISSUE` as well as `audit-pr` before final write-task handoff. Two open PRs for the same authorized file are a **conflict**, even if each PR individually passes its file scope audit. The Node `submit` command now blocks delivery unless the only open PR touching the resource is the named delivery PR. For connector-only agents, manually inspect the current complete open-PR inventory, report competing branches and do not claim CLI validation. Follow [docs/PR_COLLISIONS.md](docs/PR_COLLISIONS.md). Never force close/rebase/merge another agent's PR.

## Human integration gate after task submission

Review [docs/REVIEW_GATES.md](docs/REVIEW_GATES.md) and run private `fleet-status` before recommending a developer PR for integration. A task can have a correctly filed `submitted` marker and still have stale PR evidence, competing open PRs, unrun native/visual tests and outstanding review. Inspect `review_gates.blockers`; never infer `approved` or `merge ready` from a scope-clean diff. The readiness flag is deliberately `false` in this private pilot. The monitor is read-only and cannot independently validate tests, merge or clean up another agent's branches.

## Native checks from pinned private GitHub snapshots

Before claiming that the private coordinator itself has passed `npm run check`, use [docs/NATIVE_VALIDATION.md](docs/NATIVE_VALIDATION.md). The Node-only `scripts/verify-pilot.mjs` is a **manually invoked** read-only downloader/validator for this exact private repo and feature branch, not an unattended agent or GitHub Action. It requires a read-scoped token in the operator's local environment and refuses unsafe/truncated Git snapshots. Never paste API credentials into chat/PRs or forward them to arbitrary test code. A native unit test of this downloader is not proof that the entire coordinator branch passed its full suite. A passing result is still NOT PR approval or merge authorization.

## Do not confuse unsigned native receipts with independent acceptance

When checking the private coordinator, consult [docs/VALIDATION_RECEIPTS.md](docs/VALIDATION_RECEIPTS.md). The manual `scripts/verify-pilot.mjs --sha HEAD --receipt FILE.json` command records a *local, unsigned* `npm run check` exit result and SHA. An independent reviewer may run `--verify-receipt FILE.json --sha HEAD` without a token, but structural receipt verification **does not authenticate its author or prove native tests were reproduced**. Keep private tokens out of receipts, issues and chat. New commits invalidate an earlier SHA receipt. Continue to require independent source review, native test evidence, scoped PR checks and an explicit decision before any merge.

## Safe public agent entry point

When someone requests to explore this public repository **without established owner authority**, use `node bin/vs-agent.mjs public-discover` or inspect [docs/PUBLIC_DISCOVERY.md](docs/PUBLIC_DISCOVERY.md). This preview requires no token and intentionally does not read old private-pilot task catalogs, claims or submissions. It grants **no permission** to claim an issue, access a private repository, modify GitHub state or merge code. Owner-operated pilot agents must still follow explicit approval and the resource-first lock protocol. Do not treat the public `coordination/claims` branch as confidential; a separate private ledger migration is pending.

## Public-visibility gate on legacy coordination

**Do not create new owner-only claims, resource locks or submission markers in this public repository.** The Node CLI checks the configured coordination repository's live GitHub visibility and refuses the historical public branch before any legacy operation; it rechecks before each read/write. The old GitHub connector create-only protocol remains documented for historical reproducibility but **must not be used for new private tasks** until the owner completes an approved, private-ledger migration under issue #19. The guard does not prevent direct connector/API writes or erase old public history. Public-only discovery via `public-discover` remains available. No unsafe override, deployment or merge authorization is implied.

## Private destination preflight does not grant migration authority

The read-only `check-private-destination OWNER/REPO` command is a planning aid only. It must never be used to create a new issue/resource lock on this **public** orchestrator or to bypass the legacy public-ledger guard. It does not read private claim contents, never publishes private paths and cannot approve migration. A separate owner-controlled private-store cutover is still required; see [PRIVATE_LEDGER_PREFLIGHT.md](docs/PRIVATE_LEDGER_PREFLIGHT.md) and issue #19. This feature is developed as a separate draft PR from the current orchestrator PR #1 because new confidential coordination records must not be created on the old public branch.

## Public-to-private cutover planning is read-only

The `plan-private-cutover OWNER/PRIVATE-REPO` command is a **metadata-only** planning aid under issue #24, stacked on the private-destination preflight PR. It may be run only with locally managed read access and must never copy or expose private claim contents, create destination branches or bypass the public legacy-ledger guard. Every output is `ready_to_migrate:false`, `writes_enabled:false`. Do not claim migration is authorized or complete. See [docs/PRIVATE_CUTOVER_PLAN.md](docs/PRIVATE_CUTOVER_PLAN.md) and owner migration issue #19.

## Offline backup rehearsal is not a migration authorization

The `rehearse-private-cutover FILE.json` command reads only a **locally supplied** backup manifest, verifies listed record bytes against Git blob hashes and reports aggregate collisions/rollback blockers. It must not print record contents, Git filenames, session IDs or private target identities. **Never** upload real backup manifests into this public repository, its CI artifacts or chat. It does not verify live GitHub identity, private visibility, full-tree backup completeness or owner approval; the output always denies writes and migration. Follow [OFFLINE_CUTOVER_REHEARSAL.md](docs/OFFLINE_CUTOVER_REHEARSAL.md) before any separately authorized cutover.

## First alpha activation for owner-only operations

The existing public coordinator's claims branch is **never** a safe owner-only ledger. Read [docs/FIRST_OWNER_ALPHA.md](docs/FIRST_OWNER_ALPHA.md) before using any owner-only CLI command. Two exactly matching local variables (VS_PRIVATE_LEDGER_REPO and VS_PRIVATE_LEDGER_APPROVED_REPO) may select an independently provisioned PRIVATE ledger; there is no committed override or permission bypass. The CLI first validates live private visibility, frozen public source, and byte-identical preservation of all seven historical submitted markers before any protected operation. A fresh empty private branch is **not** safe: it would reoffer already-delivered tasks. Keep historical public records unchanged. No agent may treat passing a read-only check as permission to merge, deploy, enroll external users or perform an unauthorized migration.

## Locally SHA-approved new task queue

For the owner-only first alpha, after a reviewed private-ledger cutover, new task definitions must be held **outside** the public Git checkout. Read [docs/OWNER_TASK_QUEUE.md](docs/OWNER_TASK_QUEUE.md). The optional VS_PRIVATE_TASKS_FILE must be an absolute local regular file outside this repository; VS_PRIVATE_TASKS_APPROVED_SHA256 must equal its exact SHA-256. The tokenless `fingerprint-tasks FILE.json` may only print digest and aggregate counts, never task records. Public discovery must never read this file. Never treat the SHA as an authentication secret or as task authorization: check the live issue, lock, resource partition and competing PR before work. Do not reuse any of the seven historically submitted issue identities.

## Read-only alpha launch readiness (owner-only)

Before proposing the first two new developer chats, follow [docs/ALPHA_READINESS.md](docs/ALPHA_READINESS.md). On a trusted local machine, `node bin/vs-agent.mjs alpha-doctor` requires a verified PRIVATE coordination ledger and the exact approved local task file. Its aggregate output cannot approve a merge or acquire a task. Agents MUST still verify and exclusively acquire their own resource/issue locks after a positive report. If the report blocks, do not bypass it by writing to the old public ledger or by reusing seven historical submitted issues. No public workflow receives owner-only tokens or task data.

## Offline two-agent rehearsal (synthetic only)

Before a live owner-operated pilot, run `node bin/vs-agent.mjs rehearse-two-agents` and review [docs/OFFLINE_TWO_AGENT_REHEARSAL.md](docs/OFFLINE_TWO_AGENT_REHEARSAL.md). The command uses only synthetic in-memory GitHub data, even with private environment variables set. It exercises actual claim/handoff/submit/release functions, overlapping PR submission blockers and owner retry after interrupted release. Never represent synthetic pass as proof of a live private ledger, human code review, real branch tests, GitHub write concurrency or a deployed coordinator. No public ledger operations are authorized.

## Synthetic fleet stress (bounded to 40)

The optional `node bin/vs-agent.mjs stress-fleet --agents 40` is an offline, single-process regression harness using fictional repositories and in-memory GitHub data. Consult [docs/OFFLINE_FLEET_STRESS.md](docs/OFFLINE_FLEET_STRESS.md). Never claim that its green result proves multi-browser concurrency, a secure deployed coordinator, authenticated production permissions, or an owner-approved private ledger. Real issue/resource locks remain mandatory for every agent.

## Owner-local historical staging is not a remote cutover

`stage-ledger-copy` is strictly offline and creates a sensitive PRIVATE local folder from an exact SHA-approved historical backup. See [docs/OWNER_LOCAL_STAGING.md](docs/OWNER_LOCAL_STAGING.md). No public GitHub branch, PR, issue or test output may contain original staged records. The operator must independently approve a private destination, full backups and later copy-only transfer. Agents must not assume staging authorizes new task claims, merge or deployment.
