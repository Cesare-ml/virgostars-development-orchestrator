# ChatGPT-only owner pilot: 2 → 20 → 40 → 100 chats (proposal)

**Prepared 2026-11-14. State: PLANNED, NOT LAUNCHED.** This is a browser/chat-only operator workflow. No local checkout, Windows installation, downloaded executable, local token, ChatGPT Work, automated tab launcher, background work or auto-merge is required or asserted. **One agent = one explicitly opened ChatGPT conversation with GitHub access.** That chat does work only during its active turns; saying **"ok avanti"** later instructs *the same chat* to re-enter the queue. Opening a new chat creates a new session, not a continuation of the old one.

The existing owner CLI and task validator accept a locally approved catalog limited to five original repositories. **They do not implement this GitHub-only source, Orchestrator self-assignment, or a 100-chat live scheduler.** This document is a proposed *manual connector-only protocol* requiring independent owner review; it does not silently change those CLI guarantees. Do not use the original seven submitted task identifiers. The public Orchestrator source or its historical public `coordination/claims` branch is **never** a coordination destination.

## One common prompt for EVERY ChatGPT chat

The startup message is **identical and no longer than 18 words (currently 15 words on one line)** for the first 2 chats and for all future 20, 40, and 100-chat waves. It does not include a task ID, fixed role, specialization, issue number, preselected target repository, or session ID. The same initial message directs each chat to the **PRIVATE** `pilot/AGENT_START.md` runbook through its authorized GitHub connector. That private runbook contains the literal universal prompt (maximum 18 words) and the dynamic assignment rules. Keep the literal prompt and any private coordination destination **out of this PUBLIC repository**.

Each chat generates its own unique session UUID after reading the runbook, inspects the same owner-approved private manifest, checks live claims, and acquires at most one eligible task through verified exclusive resource-first and issue claims. If two chats race for the first task, only the verified winner continues; the other can try the next eligible ready task after proving it holds no partial lock. On `ok avanti` in the **same chat**, revalidate and resume its assignment or, after submitted/released, request the next approved one. **Never ask the user to craft separate Chat A/Chat B prompts.** A repeated `ok avanti` is a new active turn, not background execution.

## Allowed target set

Owner-authorized first-party projects: `virgo-stars`, `virgostars-desktop`, `VirgoStars-Ephemeris`, `VirgoStars-Event-Ephemeris`, `astrological-functions`, `astrological-charts`, `astrological-assets`, and **`virgostars-development-orchestrator` itself**. Orchestrator changes need the same claim, file-scope, review, and no-auto-merge checks as other repos. This list does not grant public volunteers access to private repositories or expand GitHub permissions.

## Owner-only GitHub-hosted task catalog (proposed manual alpha)

To meet the no-local-file requirement, keep the task catalog **only in an owner-controlled PRIVATE GitHub repository**, on a separate reviewed proposal branch or immutable commit; never in the public source tree, a public issue, a public PR body or `coordination/claims` files. This changes the previous "no catalog in the ledger repository" policy **only after a separate explicit owner-reviewed private repository change**. The existing CLI still uses the local catalog and MUST NOT be described as reading the proposed private catalog.

Each approved entry freezes: exact repository spelling, issue number, role, access, one resource partition ID, exact allowed file paths, upstream PR and head branch, pilot wave, and objective. For the two-agent alpha the owner must inspect the exact Git SHA of the PRIVATE manifest and approve that immutable revision. A chat must read that exact pinned revision through the GitHub connector, confirm its issue is open and its task is eligible, and stop if it cannot verify private visibility, authorisation, history preservation, current claim ledger, or manifest SHA. This manual process is cooperative, not server-enforced identity or transactional GitHub scheduling.

### Two deliberately disjoint pilot tasks

1. **Chat A / Orchestrator** — [issue #136](https://github.com/Cesare-ml/virgostars-development-orchestrator/issues/136); new test file `test/chatgpt-turn-resume.test.mjs`; stack on existing Orchestrator PR #126; resource partition `chatgpt-alpha-resume-test`.
2. **Chat B / Event Ephemeris** — [issue #13](https://github.com/Cesare-ml/VirgoStars-Event-Ephemeris/issues/13); new Python test file `python/tests/test_chatgpt_utc_boundaries.py`; stack on Event Ephemeris PR #5; resource partition `chatgpt-alpha-event-utc-test`.

Both tasks start **proposed, not claimed**. Re-check file absence and **every open PR's changed paths** on the intended upstream HEAD. If the path already exists, an upstream dependency is closed/moved, or an overlapping PR appears, halt and have the owner revise the catalog; do not improvise an alternative filename or branch.

## Preflight before either chat writes

- Owner reviews the PRIVATE ledger visibility and Git references, verifies the seven immutable historical submission records and zero active claims/locks, freezes a rollback snapshot, and independently reviews the remaining backup / previous-public-history exposure risk. **A GitHub rollback branch is not a complete independent Git mirror.** Do not claim full backup verification without one.
- Owner approves a specific immutable private task manifest revision and manually verifies two distinct approved write tasks and resource partitions.
- Confirm both ChatGPT chats have the *authorized* GitHub connector and permission to read/write the approved PRIVATE ledger. Do not ask for or paste a personal token.
- Inspect target `AGENTS.md`, issue, active upstream draft PR, all open PR file paths and the declared allowed roots. Do not claim that `alpha-doctor` or local CLI checks ran when they did not.
- Any missing prerequisite means **STOP / not launched**, not fallback to the public ledger.

## Per-chat protocol (GitHub connector only; no local CLI)

Each new chat creates **one fresh random UUIDv4** prefixed `chat-` (through an available trusted tool), and keeps it for its whole conversation. Do not reuse a UUID in another chat or assign more than one live task to one UUID.

1. Read the exact owner-approved **PRIVATE** manifest commit, applicable instructions, current target issues and PRs, plus the complete PRIVATE ledger tree at a pinned commit. Verify history, absence of this task's prior `submissions/`, resource- and issue-claims. An existing submitted marker is terminal; do not re-open it.
2. For a write task, use GitHub `create_file` on the independently verified PRIVATE `coordination/claims` branch: **first** `resources/OWNER__REPO/PARTITION.json`, **then** `claims/OWNER__REPO/issue-N.json`. Use exactly the catalog's names/paths, session ID and resource roots; preserve the v2 claim and v1 resource schemas described in `docs/RESOURCE_LOCKS.md` and `docs/LAUNCH_DEVELOPERS_WAVE2.md`. After *each* write re-read the new blob and branch state; only the verified owner may continue. A conflicting, ambiguous or permission-denied create is **not an acquired lock**. Do not force overwrite, transfer or stale-lock deletion.
3. Create a **new** feature branch from the exact current upstream PR HEAD. Do not push to the upstream PR's branch or to `main`. Change **only** the approved paths; open a separate draft stacked PR against the upstream PR's branch. Recheck branch/HEAD and *all changed filenames* before handoff.
4. Run only validation actually available in the agent's approved cloud/connector environment; if not executable, explicitly say `not run`. Add factual issue/PR comments (no private ledger metadata) and a handoff with PR, head/base SHA, file list, test commands/results, blockers and next review.
5. Re-verify ownership, update only the agent's own issue claim with a current content SHA and factual handoff, create an **immutable** `submissions/OWNER__REPO/issue-N.json` with PR/HEAD evidence and `scope_verdict:"manual-reviewed"` (not `scope-clean`), verify the committed record, **delete issue claim first**, then its own resource lock with fresh blob SHAs. A failure after submission is `submitted-pending-release` and requires owner reconciliation. Never delete the submission marker.
6. Report completion or a blocker. A draft PR and a submitted marker are **not** independent code approval or a merge authorization.

### Exact meaning of "ok avanti"

On every follow-up in the **same** ChatGPT chat, inspect current PRIVATE ledger state and the last claimed task before taking action:

- **Still holds its claim and matching resource lock:** resume that **same** task; do not acquire another. Revalidate issue, approved manifest revision, PR HEAD and scope.
- **Already submitted but lock remains:** stop coding; only verified owner/recovery may release after auditing state. Do not skip to the next assignment.
- **Submitted and fully released:** terminal task stays submitted forever; attempt **one new task** from the newly owner-approved queue, otherwise reply `no-task`.
- **No task; safe approved new task available:** acquire an eligible task using the same per-chat UUID, with a new issue identity and resource partition.
- **Claim lost, missing lock, conflicting ownership, unexpected ledger record or changed manifest:** halt for manual reconciliation; a new chat cannot steal ownership.

This manual turn-based loop does **not** keep a chat running in the background; availability, rate limits, state drift and GitHub API errors can interrupt it.

## Measured rollout gates — no automatic launch

| Phase | Success criteria BEFORE the next phase |
| --- | --- |
| **2 live chats** | Exactly two distinct UUIDs, two different issue/resource scopes, two draft PRs (or a recorded explicit blocker), two factual handoffs, two immutable new submission records on the PRIVATE ledger, zero duplicate ownership, zero unknown files, zero stranded locks, original seven records unchanged. Independent manual review of code/PR scope. Any blocked or incomplete task means pilot **did not pass**. |
| **20 live chats** | Two-chat pilot accepted by owner; 20 *new* independently reviewed and non-overlapping tasks, actual 20-session run, measurable zero duplicate ownership and unauthorized writes, rate-limit/error statistics, backlog/PR-review capacity and tested stop/recovery. Do not repeat old task IDs. |
| **40 live chats** | Twenty-chat results accepted; measured concurrency, 10+10 overlap and 20→40 task-reentry tests on real sessions; manual resource reconciliation, branch collision audit, GitHub throttling/backpressure and reviewer availability proven. |
| **100 live chats** | Forty-chat results accepted **and** a separately reviewed persistent scheduler/admission-control design or equivalent proven bounded manual process, independent lease/fencing and crash recovery tests, GitHub quota/permission strategy, operational monitoring and explicit owner approval. Never promise 100 simultaneous active workers merely because 100 tabs exist. |

For every phase record count of **real simultaneous active sessions**, task attempts, claims won/lost, PRs created, submitted, orphan locks, duplicates, review wait time, test evidence and manually integrated PRs. Synthetic 40/100/1000-agent tests are useful but **not** substitutes for real concurrent ChatGPT sessions.

## Owner controls and privacy

No forced takeover of orphan locks, automatic task signup, code merges, production changes, deployment, licensing changes, publication of private metadata or new workflow automation. The first two chats are owner-run and trusted, but are still required to obey exact scopes and independent review. The orchestration repository **is itself a valid target** for planner, developer, reviewer and test tasks once registered in the approved PRIVATE catalog.
