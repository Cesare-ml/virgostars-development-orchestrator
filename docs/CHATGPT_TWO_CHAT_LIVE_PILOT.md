# First two real GitHub-connected ChatGPT agents — owner-run field guide

> **Manual owner pilot, not an autonomous launcher.** The source repository is PUBLIC. All coordination records must remain in a **separately approved PRIVATE** repository. This guide does not authorize claims, merge, deployment or public volunteer access.

This guide addresses the practical gap between a successful synthetic rehearsal and **two genuinely independent GitHub-connected ChatGPT sessions**. The historical seven tasks are terminal submissions, not an available queue.

## Gate 0 — before opening the two chats

Use Node.js 20+ from the reviewed Orchestrator checkout on the owner's trusted computer. Keep a minimum-scope `GITHUB_TOKEN`, the private repository selection and a SHA-approved task JSON **outside this public checkout and outside public chat messages**.

1. Make an independent full-history backup of the legacy source and PRIVATE ledger; review historic public exposure and access permissions. A seven-record JSON export is not a full repository backup.
2. Review the frozen historical seven `submissions/` records and preserve them **byte-for-byte** in the new PRIVATE `coordination/claims` branch. Never bring forward abandoned live claims or resources.
3. Confirm the live private destination and exact history with the existing GET-only checks:

   ```powershell
   node bin/vs-agent.mjs check-private-destination OWNER/PRIVATE-REPO
   node bin/vs-agent.mjs verify-private-activation OWNER/PRIVATE-REPO
   ```

4. Approve **two NEW, open, distinct developer issues** from the permitted fleet, each with `access:write`, a separate resource partition, exact non-overlapping file roots, a reviewed open upstream PR, and a stable upstream branch. No old issue may be reused. Store this in the owner's **local** task catalog, outside Git.
5. Approve the exact task file SHA-256 and run the local and remote gates:

   ```powershell
   node bin/vs-agent.mjs fingerprint-tasks 'C:\PrivateOwnerData\owner-tasks.json'
   # Independently set the local VS_PRIVATE_TASKS_* and VS_PRIVATE_LEDGER_* variables.
   # Load GITHUB_TOKEN from a trusted credential manager; never paste it into chats.
   node scripts/check-owner-alpha-local.mjs
   node bin/vs-agent.mjs alpha-doctor
   node bin/vs-agent.mjs fleet-status
   ```

If **any** step is missing or `alpha-doctor` does not report `ready_for_manual_pilot:true`, **STOP**. Its read-only result is not a reservation: a claim can still race after the check.

## Operator launch — two separate conversations

- Start **two different ChatGPT conversations** with GitHub access explicitly granted by the owner. Never reuse a session ID when a chat is replaced. Generate one UUIDv4 per chat, e.g. from `node bin/vs-agent.mjs session --kind chat`, and keep each ID bound to that same chat.
- Give Agent A only reviewed task A; give Agent B only reviewed task B. Supply the authorized target issue, upstream PR/branch, exact allowed paths and resource ID. Do **not** paste a token, local task JSON, ledger dump or backup file.
- If the agent can operate the reviewed Node CLI in an owner-controlled local environment, prefer `claim-next --session chat-UUID --role developer` because the CLI implements resource-first acquisition and verification. A GitHub-connector-only ChatGPT must manually reproduce the same strict protocol with the explicitly authorized PRIVATE destination and must report when it cannot verify a condition.
- **Do not open 5, 10 or 40 chats yet.** Neither a synthetic stress test nor a browser tab count proves real cross-chat coordination.

### Copyable instruction to give each of the two chats

Replace the placeholders **privately**, with owner-reviewed values. The prompt is a workflow instruction, not a claim or proof of authorization:

> You are one developer in the supervised VirgoStars Orchestrator first two-chat pilot. Your persistent session ID is `chat-<UUIDv4>`. Your only owner-approved task is `<TARGET_REPO>#<NEW_ISSUE>`; role `developer`, access `write`, resource partition `<PARTITION>`, authorized roots `<EXACT_PATHS>`, upstream PR `#<UPSTREAM_PR>` and branch `<UPSTREAM_BRANCH>`. Read the target AGENTS.md, issue, roadmap and current PRs. The coordinator's source repository is public and **must never receive private claims or task records**. Use only the independently approved private ledger and its `coordination/claims` branch. First verify the task is not submitted, then create the resource lock exclusively, verify ownership and create the issue claim exclusively; verify both before any code write. If a lock exists, an operation is ambiguous, visibility cannot be checked, a scope conflicts or an upstream head changes, stop and report; never steal, overwrite or time-expire locks. Work only in the authorized paths on a new branch and a stacked **draft** PR. Run available tests and describe actual outcomes. Before submission, recheck current PR files and collisions, store a factual handoff, create the immutable submission marker and only then release your own issue and resource locks in that order. No merge, deployment, release or automatic recovery. Report the PR URL, commits, validation and blockers.

## Connector-only minimum evidence, before writing code

The operator or each agent must explicitly verify the live PRIVATE repository visibility and approved task catalog. For **write** tasks the sequence is:

1. Re-read the selected target issue, its AGENTS.md, upstream PR, the PRIVATE submission path and both existing lock paths.
2. Create `resources/OWNER__REPO/PARTITION.json` with GitHub's **create-new-file** operation, not update/overwrite. Include the same issue, session, sorted authorized roots and resource ID that will appear in the issue claim. Re-read the created record and confirm ownership.
3. Only then create `claims/OWNER__REPO/issue-N.json`, also create-only. Confirm its session, issue, role, resource ID, paths and current Git state. For the exact records, use `src/claims.mjs` and `src/resources.mjs` as the reference. Do not improvise fields from this guide.
4. A 409/422, timeout or uncertain result is **not** permission to try an overwrite. Re-read the records and stop if ownership cannot be proved. A newly acquired orphan resource must not be silently reclaimed after a crash.
5. After actual work, run/record native checks where possible, inspect the complete changed-file inventory and competing open PRs, save an issue handoff with PR HEAD SHA, then create the `submissions/` marker **before** releasing the issue claim and resource. A submitted marker means *delivered for review*, never approved or merged.

The actual coordinator CLI contains extra snapshot, scope and idempotency guards. A manual connector sequence is **not equivalent to a passing full CLI audit**; report every unrun check. See [resource locking](RESOURCE_LOCKS.md), [PR audit](PR_SCOPE_AUDIT.md), [collision gate](PR_COLLISIONS.md), [submission safeguards](SUBMISSION_RELEASE_RECOVERY.md) and [first owner alpha](FIRST_OWNER_ALPHA.md).

## Evidence required after both chats

Capture owner-private evidence for **each** chat: distinct session ID, approved issue and partition, exclusive lock ownership, branch and draft PR, PR base/head SHAs, complete changed file scope, real validation results, handoff, immutable submission and verified release. Independently reconcile the PRIVATE ledger: seven preserved historical submissions, the two new submitted records, and **zero** residual issue/resource locks. Review PR heads again if they move.

An optional offline acceptance consistency checker may help organize operator-entered evidence; it cannot independently authenticate real GitHub activity. Do not report the two-chat pilot complete if either chat is only a synthetic rehearsal, left an orphan lock, reused a historical issue, lacked native validation or skipped independent review.

## If a chat fails

A browser tab disappearing does **not** release its task. Keep its claim and resource blocked until the maintainer inspects the current ledger, branch, PR and handoff. A replacement chat receives a **new session ID** and must **not** assume the old identity or task. Do not delete a submitted marker, bypass owner review or use the public historical ledger for recovery.

## What this guide does **not** do

It does not install a browser extension, programmatically open chats, create the private ledger, copy records, inspect local credentials, select owner tasks, reserve resources, launch agents, make GitHub writes, run tests, approve PRs, merge branches or scale to forty users. Those steps each have separate owner-controlled gates.
