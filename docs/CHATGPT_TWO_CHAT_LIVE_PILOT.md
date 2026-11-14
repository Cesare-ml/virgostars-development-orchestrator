# First two real GitHub-connected ChatGPT agents — owner-run field guide

> **Manual owner pilot, not an autonomous launcher.** The source repository is PUBLIC. All coordination records must remain in a **separately approved PRIVATE** repository. This guide does not authorize claims, merge, deployment or public volunteer access.

This guide addresses the practical gap between a successful synthetic rehearsal and **two genuinely independent GitHub-connected ChatGPT sessions**. The historical seven tasks are terminal submissions, not an available queue.

**Choose one approval path; do not combine their evidence.** This document covers the *implemented, locally SHA-approved Node CLI path*. An owner-proposed **GitHub-connector-only / no-local-CLI alternative** is tracked in [draft PR #137](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/137). That separate proposal has different private manifest/policy gates, is **not yet an implemented connector-hosted feature**, and must not be treated as live simply because the two tasks exist. Stacked draft [#156](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/156) adds a **PRIVATE GitHub task source to the existing Node CLI**, but still needs a trusted runtime; it does not run Node automatically in a browser-only ChatGPT chat. In particular, a GitHub-only agent cannot assert that it ran the local `alpha-doctor` or SHA-approved file loader; owner review, pinned manifest approval and a separate trustworthy live ledger check are required before any connector-only claim.

## Browser-only route — proposed, not activated

For an owner who does **not** want to install Node, download a catalog, use a local token or run Work, a **manual GitHub-connector-only alternative** is under review. This is a separate trust and approval path, **not** the locally approved CLI running inside ChatGPT.

1. **Choose one PRIVATE manifest governance model before any claim.** [PR #147](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/147) proposes a strict independent manifest contract kept in a different PRIVATE repository from the ledger; [stacked PRs #148](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/148) and [#153](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/153) propose an owner-approved SHA-256-pinned catalog on the PRIVATE ledger repository's `main`, with claims/resources restricted to its separate `coordination/claims` branch. **Those are competing, not interchangeable policies.** Neither silently overrides the existing PRIVATE catalog restriction; a reviewable, explicit owner policy decision is required.
2. **Do not read the proposal as authorization.** The candidate two-task PRIVATE manifest is still marked `owner_approved:false`, its tasks are `proposed`, and its dynamic shared-chat startup prompt points to a proposal branch. A draft PR, a passing JSON parser, a private repo connection, or a manifest that merely asserts approval cannot authenticate an independently reviewed owner decision. Verify the *exact immutable approved commit*, actual private repository visibility and the current upstream PR HEAD before using it.
3. **Do not substitute synthetic tests for live evidence.** A GitHub-connected chat can inspect GitHub objects through its connector but does not automatically execute Node scripts. Stacked PR #153 integrates a GET-only GitHub catalog with the live `alpha-doctor` logic **for a trusted Node runtime**, but has not deployed a scheduler or approved the catalog. A connector-only agent must explicitly report which checks were independently completed and which cannot be established; uncertainty is a **STOP** before creating any claim.
4. **Confirm all launch blockers independently:** full *independent* Git mirror/restore evidence (a matching GitHub backup branch is insufficient), seven unchanged historical submission blobs, no active **issue claims or orphaned resource locks**, complete and fresh upstream/competing-PR scope audit, and a valid owner-reviewed unambiguous manifest. The read-only backup-reference draft [#133](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/133) needs an orphan-resource negative test; [#148](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/148) needs strict duplicate-JSON-key handling before treating an ambiguous raw file as independently reviewed.

The first two tasks are **proposals only**: Orchestrator issue [#136](https://github.com/Cesare-ml/virgostars-development-orchestrator/issues/136) and Event Ephemeris issue [#13](https://github.com/Cesare-ml/VirgoStars-Event-Ephemeris/issues/13). They use distinct paths and resource partitions and must be rechecked at launch. The owner's proposed universal prompt lives in the PRIVATE protocol; **do not paste a token, private manifest, approval proof or session UUID into a public issue/PR**. Opening a chat with that prompt is not a task assignment. No actual agent is running in the background.

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
- **Choose one launch protocol.** The owner-local CLI can use independently reviewed, explicitly scoped task instructions. In the **browser-only universal-prompt proposal**, the owner opens both chats with the **same exact short prompt** from the PRIVATE protocol; task selection is dynamic from an independently approved pinned catalog, never an A/B task assignment in the prompt. Do **not** paste a token, catalog dump, ledger data, approval hash or session UUID into a public comment.
- If the agent can operate the reviewed Node CLI in an owner-controlled local environment, prefer `claim-next --session chat-UUID --role developer` because the CLI implements resource-first acquisition and verification. A GitHub-connector-only ChatGPT must manually reproduce the same strict protocol with the explicitly authorized PRIVATE destination and must report when it cannot verify a condition.
- **Do not open 5, 10 or 40 chats yet.** Neither a synthetic stress test nor a browser tab count proves real cross-chat coordination.

### One universal startup prompt in the browser-only proposal

The proposed canonical **identical initial prompt for every agent/chat** is stored in the PRIVATE `pilot/AGENT_START.md` (private proposal PR #1); it is **not** individualized with task A/B, role, issue, resource or an externally assigned session ID. Use that exact prompt only after the owner has independently approved the governing PRIVATE protocol and immutable task catalog. **While the current file is still a proposal, opening a chat does not grant task ownership and must not cause any claim or code write.** Do not copy an old per-chat issue-specific instruction and call it the universal-prompt pilot.

Each independently opened ChatGPT conversation generates its own UUIDv4 *after* the approved preflight and keeps that ID across `ok avanti`; no two conversations share an ID, and the same conversation must not acquire a second active task. Assignment remains **create-only resource first, issue claim second**, verified on the PRIVATE ledger; losing a race means no ownership. Direct `claim` and concurrent `claim-next` currently have an unresolved cross-task same-session exclusivity gap ([issue #159](https://github.com/Cesare-ml/virgostars-development-orchestrator/issues/159)); do not treat successful issue-scoped locks as proof of global session uniqueness. This is a launch blocker, not a workaround request.

For a *separate* owner-local CLI pilot, give reviewed task-specific instructions only in an owner-controlled channel and do not report its outcome as acceptance of the universal-prompt GitHub-only protocol.

## Connector-only minimum evidence, before writing code

The operator or each agent must explicitly verify the live PRIVATE repository visibility and approved task catalog. Draft [#160](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/160) adds a fresh preclaim PR/issue admission gate to the **GitHub-approved Node CLI mode**, but it is not a browser-only verifier and does not fix the open cross-task session lock issue #159 or file/ancestor collision issue [#150](https://github.com/Cesare-ml/virgostars-development-orchestrator/issues/150). Independently inspect **every** path for existing files, ancestor files/child directories, and current competing PRs; refuse a new claim when any check is missing. For **write** tasks the sequence is:

1. Re-read the selected target issue, its AGENTS.md, upstream PR, the PRIVATE submission path, both existing lock paths and **all curated claims for the same chat UUID**. A submitted but unreleased claim, duplicate session or malformed claim requires owner reconciliation; do not claim a second task.
2. Require the target resource path to be **absent** before first acquisition. A pre-existing `resources/OWNER__REPO/PARTITION.json` without its matching issue claim is an **orphan**, even if its chat UUID, issue and roots match the current request. **STOP** for owner reconciliation; never reinterpret the old resource as a new reservation. This edge case is documented on [draft PR #162](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/162), because its current resource matcher does not compare original claim timestamps. Only when unoccupied, create the resource with GitHub's **create-new-file** operation (not update/overwrite), including the task's exact issue, session, resource ID and sorted approved roots. Re-read and verify the newly created record before attempting the issue claim.
3. Only then create `claims/OWNER__REPO/issue-N.json`, also create-only. **Read back both new records** from the current PRIVATE Git snapshot, ensuring the issue and resource records describe the **same original acquisition** (including timestamp, owner session, issue, scope ID and frozen roots), with no submitted marker. An issue claim with `claimed_at=T2` must not be paired with an orphaned resource from `T1`, even for the same UUID. On missing, mismatched or ambiguous readback, report **unknown ownership**, stop and request owner reconciliation; never assert `acquired` merely because GitHub returned PUT success. For the exact schema, consult `src/claims.mjs` and `src/resources.mjs`; do not improvise fields from this guide.
4. A 409/422, timeout or uncertain result is **not** permission to try an overwrite. Re-read the records and stop if ownership cannot be proved. A newly acquired orphan resource must not be silently reclaimed after a crash.
5. After actual work, run/record native checks where possible, inspect the complete changed-file inventory and competing open PRs, save an issue handoff with PR HEAD SHA, then create the `submissions/` marker **before** releasing the issue claim and resource. A submitted marker means *delivered for review*, never approved or merged.

The actual coordinator CLI contains extra snapshot, scope and idempotency guards. A manual connector sequence is **not equivalent to a passing full CLI audit**; report every unrun check. See [resource locking](RESOURCE_LOCKS.md), [PR audit](PR_SCOPE_AUDIT.md), [collision gate](PR_COLLISIONS.md), [submission safeguards](SUBMISSION_RELEASE_RECOVERY.md) and [first owner alpha](FIRST_OWNER_ALPHA.md).

## Independent Integrator role — future, separately gated

The user allows **conditional** merge automation after genuine independent verification; this does **not** authorize a developer agent to merge its own PR. [Draft policy PR #137](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/137) and [read-only Integrator evaluator PR #154](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/154) describe a future **separately approved Integrator**. It would need an explicit eligible merge task, different ownership from the PR author, current HEAD-pinned CI/reviews, actual protection/rules compliance, branch and stacked-dependency checks, conflict checks and approved exact merge scope. The proposed evaluator **does not execute merges**. No Integrator task is authorized in this initial two-developer pilot, and current `main` policy remains in force until independently changed.

## Review order for current stacked implementation drafts

These are **review dependencies**, not an approved task queue or automatic merge instructions. Every PR mentioned below is still a draft unless GitHub later confirms otherwise. Green test-only CI means the tests at that exact HEAD passed; it does **not** settle missing safety requirements, approve PRIVATE policy or authorize a merge.

| Lane | Stacked review sequence | Evidence and current blockers |
| --- | --- | --- |
| First two developers / owner Node CLI | [#139](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/139) → [#148](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/148) → [#153](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/153) → [#156](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/156) → [#160](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/160) → [#162](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/162) → [#165](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/165) | PRIVATE owner catalog still unapproved; SHA alone cannot prove owner consent. Missing duplicate-JSON-key rejection, file-vs-directory scope collision handling ([#150](https://github.com/Cesare-ml/virgostars-development-orchestrator/issues/150)), **one active task per chat ID** across direct and concurrent claim paths ([#159](https://github.com/Cesare-ml/virgostars-development-orchestrator/issues/159)), complete malformed-claim validation and orphan-resource re-adoption rejection. Recent #162/#165 tests passing does not fix inherited gaps. |
| Conditional independent Integrator (not first pilot) | [#137](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/137) → [#154](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/154) → [#158](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/158) → [#163](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/163) → [#166](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/166) | Owner-authenticated merge task, reviewer/session independence, branch protection, stacked dependencies and final exact-HEAD checks are not fully implemented. Outstanding `CHANGES_REQUESTED` must survive later `COMMENTED` reviews. Block high-risk package-source and Git configuration files (e.g. `.npmrc`, `.yarnrc.yml`, `.gitmodules`, `.gitattributes`) including rename sources. All current helpers remain read-only: **no merge executor**. |

Before an owner-integrator reviews any merge, re-fetch **current** GitHub PR state, exact HEAD CI, review discussion, changed paths (including rename sources), branch protection and all stacked dependency SHAs. Resolve review findings on their respective owner branches. The owner must separately approve the PRIVATE catalog and its governing repository placement policy; the alternative connector-only manifest proposal [#147](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/147) is **not** compatible by default with the PRIVATE-main Node catalog chain. The historical seven submissions are terminal and can never be reissued.

## Evidence required after both chats

Capture owner-private evidence for **each** chat: distinct session ID, approved issue and partition, exclusive lock ownership, branch and draft PR, PR base/head SHAs, complete changed file scope, real validation results, handoff, immutable submission and verified release. Independently reconcile the PRIVATE ledger: seven preserved historical submissions, the two new submitted records, and **zero** residual issue/resource locks. Review PR heads again if they move.

An optional offline acceptance consistency checker may help organize operator-entered evidence; it cannot independently authenticate real GitHub activity. Do not report the two-chat pilot complete if either chat is only a synthetic rehearsal, left an orphan lock, reused a historical issue, lacked native validation or skipped independent review.

## If a chat fails

A browser tab disappearing does **not** release its task. Keep its claim and resource blocked until the maintainer inspects the current ledger, branch, PR and handoff. A replacement chat receives a **new session ID** and must **not** assume the old identity or task. Do not delete a submitted marker, bypass owner review or use the public historical ledger for recovery.

## What this guide does **not** do

It does not install a browser extension, programmatically open chats, create the private ledger, copy records, inspect local credentials, select owner tasks, reserve resources, launch agents, make GitHub writes, run tests, approve PRs, merge branches or scale to forty users. Those steps each have separate owner-controlled gates.
