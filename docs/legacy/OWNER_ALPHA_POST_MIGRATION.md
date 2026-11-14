# Owner alpha: post-migration checkpoint and first real sessions

**Observed on 2026-11-14.** This is an operator guide, not a claim/merge authorization. Do not place private task catalogs, session identities, credentials, local backup files, or operational records in this public repository.

## Independently observed, read-only GitHub facts

- The separately owner-created destination reports **PRIVATE** visibility, with a default `main` branch containing a bootstrap README.
- Its dedicated `coordination/claims` branch exists.
- The historical PUBLIC `coordination/claims` branch still points to the expected frozen commit defined by `FROZEN_PUBLIC_LEDGER_HEAD`.
- Exactly **seven historical submitted Git blobs** appear at the same seven paths in the private destination. Their Git blob IDs match the public frozen snapshot **one-for-one**. No private claim, resource lock or unclassified record appears in the inspected tree. The private branch has a permitted root README.
- A separate owner-maintained backup branch exists, but **its existence alone is not proof of an independently reviewed, recoverable full backup**.

These facts are a time-bound metadata-and-object inventory observation, **not** execution of the repository's authenticated `verify-private-activation`, `alpha-doctor`, or any independent live ChatGPT-agent claim. The source/target branch tips can change; rerun the commands below on the operator's machine before taking any action.

## Step 1 — trusted Windows terminal, read-only remote checks

From an up-to-date local checkout of the PUBLIC orchestrator source with Node.js 20 or 22:

```powershell
npm run check
# Configure GITHUB_TOKEN privately through your trusted credential manager.
$env:VS_PRIVATE_LEDGER_REPO = 'OWNER/PRIVATE-REPOSITORY'
$env:VS_PRIVATE_LEDGER_APPROVED_REPO = 'OWNER/PRIVATE-REPOSITORY'
node bin/vs-agent.mjs check-private-destination OWNER/PRIVATE-REPOSITORY
node bin/vs-agent.mjs verify-private-activation OWNER/PRIVATE-REPOSITORY
```

Use the **actual** owner-selected private repository for both the variables and the positional arguments. Never use this PUBLIC source repository as the ledger. The checks are GitHub GET-only; preserve the report locally and do not publish private identifiers or credentials. A successful result checks live visibility, frozen source and exact historical submission bytes, but **does not prove independent backups, authorize migration writes, or assign a task**.

## Step 2 — complete the outstanding owner approval

Verify the full backups and recovery plan independently. Review destination collaborators and access policy, confirm the public historical branch is frozen, and approve using the private store. Do not recopy the seven preserved markers, overwrite records, or clear an ambiguous claim. Do not assume the historical submission tasks are available: they remain **submitted**.

Create a **new owner-private local JSON catalog** with exactly two reviewed, distinct, open developer tasks, each with an explicit upstream PR/branch and nonoverlapping write scope. Keep the file outside the public checkout. The public example catalog is synthetic; do not reuse any of the seven completed task identities.

```powershell
node bin/vs-agent.mjs fingerprint-tasks 'C:\VirgoStarsPrivate\owner-tasks.json'
# Review the exact SHA-256 printed by the command before approving it locally.
$env:VS_PRIVATE_TASKS_FILE = 'C:\VirgoStarsPrivate\owner-tasks.json'
$env:VS_PRIVATE_TASKS_APPROVED_SHA256 = 'OWNER-REVIEWED-64-CHAR-HEX-SHA256'
node scripts/check-owner-alpha-local.mjs
node bin/vs-agent.mjs alpha-doctor
```

Local check must find **two distinct ready developer partitions**. The remote doctor must report `ready_for_manual_pilot: true`. Any missing prerequisites, source/PR drift, stalled resource locks or status mismatch means **STOP**; do not bypass the safety guards.

## Step 3 — only two owner-controlled live agents

Launch two GitHub-authorized sessions manually, each with a distinct session identity. Give each one exactly one reviewed task. Require **resource lock first**, then issue claim, then scope/PR collision checks, new draft PR, truthful native test evidence, immutable submission, factual handoff and release of its own claim and resource. A failure must not prompt automatic takeover by a replacement chat.

After both finish, use the read-only fleet monitor and inspect the two GitHub PRs/branch tips and the private ledger. Record whether there were duplicate owners, orphaned locks, stale PR heads or inconsistent submissions. Treat any nonzero anomaly as a blocking incident, not a reason to launch more agents. Independent PR review and explicit owner merge decisions remain mandatory.

## Gate for expanding beyond two

**Not demonstrated as of this checkpoint:** an actual pair of independent chats completing the whole claim → scoped PR → submission → release lifecycle. Do not claim reliable 10-, 20- or 40-session operation, browser auto-launch, automated failover or unattended merges. See [MVP_ACTIVATION.md](MVP_ACTIVATION.md), [FIRST_OWNER_ALPHA.md](FIRST_OWNER_ALPHA.md), [OWNER_TASK_QUEUE.md](OWNER_TASK_QUEUE.md), and [ROADMAP.md](../ROADMAP.md).
