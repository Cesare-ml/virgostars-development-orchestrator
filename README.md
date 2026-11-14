# VirgoStars Development Orchestrator

## Operational MVP activation (14 November 2026)

The immediate release target is a **supervised two-chat pilot**, not a deployed 40-agent scheduler. The repository is public, and the legacy private claim operations deliberately fail closed until the owner validates a separate PRIVATE ledger. **Do not write owner-only claims to the historical public coordination branch.**

Read the [MVP activation and PR integration guide](docs/MVP_ACTIVATION.md). After integration, safe local entry points are `npm run check`, `node bin/vs-agent.mjs --help`, and tokenless `node bin/vs-agent.mjs public-discover`.

**Status: PUBLIC repository, owner-operated pilot.** GitHub visibility changed on 2026-11-12; external write-task enrollment remains disabled. Legacy private-pilot records are still present and require owner-controlled review/migration before broad public onboarding. See [public transition and CI safety](docs/PUBLIC_TRANSITION.md).

**Start here:** [public transition](docs/PUBLIC_TRANSITION.md), [agent instructions](AGENTS.md) and [legacy owner-only pilot instructions](docs/PRIVATE_PILOT.md). The old pilot catalog is not a public contributor registry.

The initial objective is to let many independent ChatGPT and Codex conversations coordinate via a shared GitHub-backed task/claim ledger. Roles are dynamically chosen from planner, developer, tester, reviewer, auditor and integrator. GitHub task claims use exclusive creation of one file per issue in the separate `coordination/claims` branch. This is a **limited pilot mechanism**: it does not yet provide cross-task resource locks, automatic expiration or transactionally fenced code writes.

## First usable owner-operated alpha (private ledger required)

**New: [offline two-agent end-to-end rehearsal](docs/OFFLINE_TWO_AGENT_REHEARSAL.md).** Run `node bin/vs-agent.mjs rehearse-two-agents` on Node 20+ with no GitHub token. It executes actual task claim, resource lock, handoff, PR scope/collision audit, submission and release functions using **synthetic, in-memory GitHub fixture data**. It demonstrates collision rejection and interrupted release recovery; it does **not** contact real GitHub, launch live browser chats or replace the separately approved PRIVATE ledger.


**New: [two-agent launch readiness doctor](docs/ALPHA_READINESS.md)** — after setting a reviewed PRIVATE ledger and a SHA-approved local task file, run `node bin/vs-agent.mjs alpha-doctor`. This is a read-only aggregate audit of historical submission preservation, available new tasks, open issues, upstream PRs and competing changed paths. It does not assign tasks, merge PRs or authorize an unattended fleet. A private ledger is still required for real use.


A guarded first-alpha CLI path and a locally SHA-approved task queue are now proposed in a **stacked draft**, not merged into main. See [FIRST_OWNER_ALPHA.md](docs/FIRST_OWNER_ALPHA.md) for the owner-only Windows quickstart: prepare a separate PRIVATE GitHub ledger, preserve the seven original submitted records byte-for-byte, run the read-only `verify-private-activation` check and only then select the private repository through two matching local environment variables. The old public claim store remains blocked. No automatic migration, hosted scheduler or authorization for public agent writes is provided. Do not reassign already-submitted historic tasks. **New work can be curated in an owner-held local JSON outside the public repository**, approved by SHA-256 via the offline `fingerprint-tasks` command. See [OWNER_TASK_QUEUE.md](docs/OWNER_TASK_QUEUE.md); no automatic task enrollment or permission grants.

## Future design

- [General onboarding](docs/START_HERE.md) — for a possible future public community.
- [Coordination protocol](docs/PROTOCOL.md) — proposed long-term workflow.
- [Architecture](docs/ARCHITECTURE.md) and [API proposal](docs/API.md) — future service/backend design.
- [Security](docs/SECURITY.md), [Roadmap](docs/ROADMAP.md).
- [Public-safe example registry](config/fleet.json). The legacy pilot catalog is already in this repository's public history; **do not replicate or export its nonpublic project details**. See [migration guidance](docs/PUBLIC_TRANSITION.md).

The pilot uses authorized GitHub tools. **Test-only GitHub Actions CI is enabled for this public repository**; there is no hosted scheduler/API, automatic merge or deployment.

## First runnable private-agent pilot

The initial Node.js 20+ CLI is in `bin/vs-agent.mjs`, with no external runtime packages. Read `docs/CLI_PRIVATE_PILOT.md` for local Codex commands and GitHub-connected ChatGPT equivalent actions. `config/pilot-tasks.json` curates exactly five initial **read-only PR review tasks**, one for each target repository. The CLI supports session creation, discovery, issue claim, status, factual handoff and explicit owner-controlled release. It is not a hosted API; other task types will be opened only after scope review.


### Automatic task pickup (private pilot)

The CLI now supports `claim-next --session chat-UUID --role reviewer [--repo OWNER/REPO]`. It resumes a task already owned by that session, otherwise tries approved ready tasks in order and skips busy or closed issues. It never creates tasks from unreviewed issues. A normal release requires an owner-authored handoff to prevent silent loss of progress. See [CLI instructions](docs/CLI_PRIVATE_PILOT.md).

## Cooperative write-resource locks

Private pilot write tasks now require a **single approved resource partition**, acquired before the issue claim. Different issues sharing that partition cannot both become writers; disjoint declared partitions may be worked on concurrently. Catalog scopes are validated for overlapping paths. The five initial eligible tasks remain read-only reviews; this does not automatically authorize new coding work. See [resource lock protocol](docs/RESOURCE_LOCKS.md). There is no multi-resource transaction, automatic stale lock recovery or enforcement of actual file edits outside the declared scope.

## Ready to launch the first private chats

**[Open the single-prompt pilot launch guide](docs/LAUNCH_PRIVATE_MVP.md).** Start with 3–5 ChatGPT chats using their connected GitHub tools. All five initial tasks are read-only reviews. Each agent claims one task via `coordination/claims`, posts its findings in the target issue, stores its handoff and creates a private `submissions/OWNER__REPO/issue-N.json` marker **before** releasing the issue claim. Submitted work is not automatically reassigned and is *not* considered approved. The executable Node CLI supports `claim-next`, `handoff`, and `submit --confirm`. Do not confuse the feature branch with `main`.

## Fleet monitoring after the first five chats

The first five curated reviewer assignments have submitted technical findings. Use `node bin/vs-agent.mjs fleet-status` on an authorized local checkout (do not publish its operational output) to see a read-only, Git-commit-pinned snapshot of assignments, submitted reviews, mismatches and orphaned resource locks. See [pilot monitor](docs/PILOT_MONITOR.md). Submitted reviews await independent approval; the monitor does not merge PRs or create new development tasks.

## Wave 2: two first developer agents

The first five reviewer tasks are submitted (pending independent review). **Two supervised write tasks** are now in the curated queue: `astrological-functions#5` (ESM provider consumer smoke) and `astrological-charts#25` (axis canvas browser smoke). They are restricted to exact new files and each uses a separate exclusive resource partition. Use [docs/LAUNCH_DEVELOPERS_WAVE2.md](docs/LAUNCH_DEVELOPERS_WAVE2.md) to launch two independent GitHub-connected developer chats; never have either agent push to an existing active PR branch or modify production.

## Audit developers' stacked PRs before accepting handoff

The private Node CLI now supports `audit-pr OWNER/REPO ISSUE PR_NUMBER`. It reads the actual GitHub PR changed-file list, verifies the submitted draft is stacked onto the approved upstream PR branch, and rejects out-of-scope, renamed, missing, or modified files in wave 2. For a developer (`access:write`), `submit --pr PR_NUMBER --confirm` **re-runs the scope audit** and saves the audited head SHA before releasing the task. Submitted work still awaits independent code and test review; no auto-merge is authorized. See [PR scope audit](docs/PR_SCOPE_AUDIT.md).

## Submission freshness monitoring

The private `fleet-status` command now **rechecks live developer PR metadata and file scope** against the immutable `submitted` record. If a developer pushes after handoff, the upstream branch moves or the current changed files violate the curated scope, it reports `stale-submission` rather than continuing to present the recorded audit as current. Historical/manual write markers remain `needs-scope-audit`; reviewer-only submissions are unaffected. The monitor is GET-only and does not approve or merge PRs. See [pilot monitor](docs/PILOT_MONITOR.md).

## Detect competing PRs before developer handoff

Use `node bin/vs-agent.mjs audit-collisions OWNER/REPO ISSUE` to find multiple open PRs touching the same curator-approved resource paths. The wave-2 Charts task has two competing draft tests (#27 and #28) for one file. The local CLI now requires both `audit-pr` (path/base) and this overlap check before `submit --pr ... --confirm` can mark a write task delivered. No PR is automatically closed or merged. See [PR collisions](docs/PR_COLLISIONS.md).

## Private review gates for submitted developer PRs

The `fleet-status` CLI now combines the live PR scope/head audit with a scan of open PRs touching the same approved resource partition. For each submitted write task it reports `pr_check`, `collision_check`, and explicit `review_gates.blockers`; the monitored `integration_ready` and `merge_authorized` values remain `false` until independent test evidence and human review are completed. The command is GET-only and does not alter existing submissions. See [review gates](docs/REVIEW_GATES.md).

## Run the full native private-pilot checks without git clone

On a **trusted local** Windows/macOS/Linux machine with Node.js 20+, use an authenticated GitHub **Contents: read** token to execute `npm run verify:private -- --sha CURRENT_FEATURE_BRANCH_SHA`. The new [pinned native validation guide](docs/NATIVE_VALIDATION.md) explains how the read-only CLI resolves one private branch commit, checks all Git blob SHA-1 hashes, rejects unsafe paths/truncated snapshots, builds an isolated temporary directory and then runs **actual** `npm run check` with GitHub tokens removed from the npm child environment. Public GitHub Actions now run the complete Node suite without project secrets; manual SHA-pinned snapshot validation remains an optional additional check. No merge or deploy.

## Record native validation evidence without sharing tokens

The manual private snapshot CLI now supports `--receipt ./result.json` to record an **unsigned, SHA-pinned** JSON result after real `npm run check`; its `--verify-receipt ./result.json --sha COMMIT_SHA` mode checks that report offline without GitHub or credentials. Receipts never overwrite an existing file and **do not prove an independent reviewer reran the tests or authorize a merge**. See [validation receipts](docs/VALIDATION_RECEIPTS.md). Exact-source Node 22 tests passed 9/9 for receipts and 11/11 for the native snapshot verifier (20/20 total). The current feature branch has also passed full Node tests on GitHub Actions; unsigned local receipts remain optional evidence, not approval.

## Native coordinator test status — 2026-11-12

The **complete Node test suite** has now been executed on a local, hash-verified mirror of **all 36 current runtime/test/config/CLI files** from private commit `f3736003b01af0ab5e12f21283719bd1412cf25d`: `npm run check` **120/120 PASS** with Node 22.16.0. One incorrectly ordered release-guard test assertion was corrected and a missing-resource-after-handoff regression was added. The mirror intentionally omitted docs/templates, so this is not a full-tree `verify:private` run; see [native validation evidence](docs/NATIVE_VALIDATION.md). PR #1 stays draft, without merge approval.

## Public GitHub Actions — Node.js CI

The public feature-branch PR is now checked automatically by [GitHub Actions](https://github.com/Cesare-ml/virgostars-development-orchestrator/actions) on push and pull request. The [workflow](.github/workflows/node-ci.yml) uses read-only permissions and pinned Node 24-runtime official Actions, while validating `npm run check` on application Node **20** and **22**. The latest verified workflow run passed **127/127 tests on each Node version** with no failures. This is **not** authorization to merge or deploy. See [public transition and operational privacy](docs/PUBLIC_TRANSITION.md).

## Public-only discovery (no token)

External readers can run `node bin/vs-agent.mjs public-discover` **without GitHub credentials**. It reads only the strict public catalog `config/fleet.json` and outputs a read-only preview of projects awaiting owner approval. It cannot acquire tasks, expose private-pilot claim data, deploy, or merge. The older `discover` / `claim` / `submit` commands remain part of the owner-operated legacy workflow and **must not be used as public onboarding**. See [Public Discovery](docs/PUBLIC_DISCOVERY.md) and the [public/private migration plan](docs/PUBLIC_TRANSITION.md).

## Security gate: legacy owner-only coordination is paused

The historical `coordination/claims` branch lives in this now-**public** repository. The Node CLI therefore **refuses legacy owner-only commands by default**, using live GitHub private-visibility verification and a fresh preflight for every ledger read/write. The old claim store must be migrated to a private repository/backend with owner approval before these commands can safely be re-enabled. Do not put new private task records into the public branch via ChatGPT connectors either: the CLI guard cannot stop direct API writes. `public-discover`, `session` and `--help` remain tokenless and usable. See [PUBLIC_TRANSITION.md](docs/PUBLIC_TRANSITION.md).

## Read-only private ledger destination check

For the owner-controlled migration, `node bin/vs-agent.mjs check-private-destination OWNER/PRIVATE-REPO` validates an independently selected private GitHub repository through read-only metadata **without** reading claim contents or enabling any writes. It always reports `ready_to_migrate:false`; the legacy public claim store remains blocked. See [private destination preflight](docs/PRIVATE_LEDGER_PREFLIGHT.md).

## Public-to-private ledger cutover dry run

An owner can now run `node bin/vs-agent.mjs plan-private-cutover OWNER/PRIVATE-REPO` on a trusted local checkout. It compares aggregate historical public-ledger counts with a **separately verified private** destination, detects branch movement and lists non-authorizing blocker codes. It does not fetch record contents, migrate data or enable writes. See [PRIVATE_CUTOVER_PLAN.md](docs/PRIVATE_CUTOVER_PLAN.md). The public CI runs only synthetic tests, never private credentials.

## Offline backup reconciliation rehearsal

For owner-held local record exports, `node bin/vs-agent.mjs rehearse-private-cutover LOCAL_BACKUP.json` verifies every listed record's Git blob SHA-1 and produces **counts-only** differences, safety blockers and a human rollback sequence. It uses no GitHub token or network and cannot migrate, overwrite, release locks or modify a repo. The result explicitly **cannot** establish that the backup contains the complete Git tree or matches a current remote commit. Keep real backup files private. See [OFFLINE_CUTOVER_REHEARSAL.md](docs/OFFLINE_CUTOVER_REHEARSAL.md).
