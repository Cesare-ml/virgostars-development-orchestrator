# VirgoStars Development Orchestrator — owner alpha activation

**Updated 2026-11-14.** The owner CLI and private migration *preparation* commands have been merged to `main`; the service is not deployed and real ChatGPT multi-session operation has **not** been proven. The source repository is PUBLIC. Keep all private work records in a **different PRIVATE** GitHub repository, never in its historical `coordination/claims` branch.

## 1. Local smoke (no GitHub secrets or private ledger)

With Node.js 20/22 from a fresh source checkout:

```powershell
npm run check
node bin/vs-agent.mjs public-discover
node bin/vs-agent.mjs rehearse-two-agents
node scripts/verify-public-alpha-smoke.mjs
node scripts/rehearse-local-processes.mjs
```

These tests cover an in-memory two-agent run and local OS process contention, **not actual independent browser chats**, remote lock durability, automatic chat recovery or distributed fencing.

## 2. Owner creates the separate PRIVATE ledger

1. In the owner GitHub account, create a repository with **Private** visibility and minimal collaborators; use a distinct name such as `OWNER/virgostars-coordination-private`. Neither this source code nor its public CI can create or authorize it.
2. Independently back up the full Git history of the historical public source and the new private destination, and review any previously exposed sensitive information; rotate exposed credentials.
3. Establish its `coordination/claims` branch via a reviewed owner procedure. Freeze the old public coordination branch, and do not create new public owner-only claims.
4. Store GitHub credentials in the local credential manager or protected environment only. Never paste tokens, session IDs or the local record manifest into public PRs/issues or prompts.

## 3. Verify the destination and prepare an exact local backup

Use a trusted local Windows PowerShell shell. Change the placeholder to your actual PRIVATE repository and select a **new** backup file path in an existing protected folder outside the public checkout:

```powershell
$env:VS_PRIVATE_LEDGER_APPROVED_REPO = 'OWNER/virgostars-coordination-private'
# Supply GITHUB_TOKEN through your private credential manager.
node bin/vs-agent.mjs check-private-destination OWNER/virgostars-coordination-private
node bin/vs-agent.mjs plan-private-cutover OWNER/virgostars-coordination-private
node bin/vs-agent.mjs export-verified-ledger OWNER/virgostars-coordination-private --output 'C:\VirgoStarsPrivate\ledger-record-backup.json' --confirm
node bin/vs-agent.mjs plan-ledger-copy 'C:\VirgoStarsPrivate\ledger-record-backup.json'
```

`export-verified-ledger` fetches Git data with GET requests and creates a **local owner-private file** containing the historic records. The copy planner reads it offline, checks canonical Git blob bytes, the frozen source commit/tree and an independent seven-blob inventory hash, then reports counts and blockers. **Neither command writes to GitHub, stages an import nor creates a private branch.** A backup of seven records is not a full Git mirror.

An absent private coordination branch, unexpected active locks, inconsistent or additional records, changed historical source, unverifiable private visibility, token/permission errors, symlinks or unsafe local paths must stop the process. Follow [the export guide](VERIFIED_LOCAL_LEDGER_EXPORT.md) and [copy planner guide](OFFLINE_LEDGER_COPY_PLAN.md) for precise rules.

## 4. Manual owner-approved migration and readiness

Only after reviewing the private backup and its blockers, copy the seven historical `submitted` records **byte-for-byte** into the private `coordination/claims` branch, without overwriting conflicting data or copying old active locks. Re-verify exact remote state, then:

```powershell
node bin/vs-agent.mjs verify-private-activation OWNER/virgostars-coordination-private
$env:VS_PRIVATE_LEDGER_REPO = 'OWNER/virgostars-coordination-private'
$env:VS_PRIVATE_LEDGER_APPROVED_REPO = 'OWNER/virgostars-coordination-private'
# Put new owner-curated task JSON outside the public checkout.
node bin/vs-agent.mjs fingerprint-tasks 'C:\VirgoStarsPrivate\owner-tasks.json'
# Set VS_PRIVATE_TASKS_FILE and VS_PRIVATE_TASKS_APPROVED_SHA256 privately.
node bin/vs-agent.mjs alpha-doctor
```

The old seven tasks are already submitted and **must never be re-offered**. Use two entirely new, small, disjoint, explicitly approved developer tasks, with a pinned upstream PR and exact allowed files. The local catalog must be owner-reviewed and its SHA-256 explicitly approved. The readiness doctor is **GET-only** and does not claim or authorize a merge.

Before the remote `alpha-doctor`, run the zero-network local setup guard once the owner-private task file and its reviewed SHA-256 are configured:

```powershell
node scripts/check-owner-alpha-local.mjs
```

The local report must show two **ready developer tasks in independent resource partitions** to be eligible to run the remote check. A local pass cannot verify a PRIVATE repository, actual GitHub permission, seven copied records or real chat operation. See [owner local check](OWNER_ALPHA_LOCAL_CHECK.md).

## 5. First two independent ChatGPT sessions

Start two different GitHub-connected owner-controlled chats, each with its own durable UUID/session ID and exactly one ready task. For write tasks, acquire the approved exclusive resource lock **before** the issue claim. Verify lock ownership and current PR HEAD/scope, develop on separate draft branches, record actual test results, create immutable submitted handoff markers and release only one's own locks. Stop on any 409/422 ambiguity, stale source, already-submitted task, duplicate active session or resource overlap. Have an independent reviewer inspect both outcomes and the private ledger.

Only after a **measured two-chat end-to-end pilot** with zero duplicate ownership and zero stranded locks should owner expand to 5–10, then 20, then 40 active real sessions. There is no automatic browser/chat launcher or guaranteed crash-safe cross-machine scheduler. See [first owner alpha](FIRST_OWNER_ALPHA.md), [operator task queue](OWNER_TASK_QUEUE.md) and [resource locks](RESOURCE_LOCKS.md).

## Release gates

| Capability | Current status |
| --- | --- |
| Base CLI, GitHub guarded commands and Node test suite | Integrated on `main`; integration-head CI successful |
| Offline two-agent and local-process rehearsals | Integrated; synthetic/local only |
| Private ledger read/visibility/historical export/copy plan | CLI integrated; actual private destination **not verified** |
| Private ledger import and owner approval | **Not performed** |
| First two real independently connected chats | **Not performed** |
| Automatic 40-chat orchestration and crash recovery | **Not implemented/proven** |

No automatic merge, deploy, access change or live private write is authorized merely by this guide.
