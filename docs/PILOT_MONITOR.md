# Private pilot monitor — fleet-status

**Purpose:** show the current state of the five approved agent tasks, in one place, without editing GitHub data or implying that a submitted review is approved.

The first five real ChatGPT reviewer sessions submitted their tasks on 2026-11-12. Their original `submissions/` files remain on the **private** `coordination/claims` branch. Do not overwrite or delete these records to make the task queue appear empty.

## Run locally (Windows PowerShell or Codex)

From a checkout of branch `feat/distributed-agent-coordination-v0`, with Node.js 20+ and a privately configured scoped `GITHUB_TOKEN`:

```powershell
npm run check
node bin/vs-agent.mjs fleet-status
```

The command prints structured JSON showing the exact Git **commit SHA** of the claim ledger, totals, one entry per curated issue and exceptional conditions. It uses **GET only**: one branch ref, one pinned tree and its claim/submission/resource blobs, plus the five target issues. If GitHub denies access, the tree is truncated or data is inconsistent, it fails closed or emits an explicit alert.

## States

| Status | Meaning | Operator action |
| --- | --- | --- |
| `available` | Approved task has no issue claim or submitted marker | May claim according to AGENTS.md |
| `claimed` | An active session owns task (+ resource, if write task) | Do not take over or modify its branch |
| `submitted` | Work delivered; lock released; awaiting independent review | Inspect the referenced issue comment and PR |
| `submitted-pending-release` | Submission exists but issue lock remains | Original owner/maintainer completes release after inspection |
| `resource-busy` | Write resource held although task issue is not claimed | Check for another task or an orphan; do not delete automatically |
| `inconsistent` | Identity, access, scope, handoff or resource mismatch | Stop, audit, and have maintainer reconcile |
| `closed` | Target issue was closed without a current claim/submission | Check whether closure was legitimate, do not automatically re-open |

The `review` value is always `pending` for submitted tasks; the system **does not approve PRs or decide scientific correctness**. A detected `evidence_url` is a link found in the saved handoff summary, not proof that the linked review is accurate. Both existing `last_handoff` markers from ChatGPT and older CLI `handoff` markers are read without rewriting the ledger; new CLI submissions use `last_handoff`.

## First wave review evidence

These are **reviewers' reported findings**, not maintainer-approved conclusions or reproduced tests. Open the issue comments for full details:

| Repository | Pilot issue | Reported follow-up |
| --- | --- | --- |
| VirgoStars-Ephemeris | [#85](https://github.com/Cesare-ml/VirgoStars-Ephemeris/issues/85#issuecomment-6824603391) | Investigate PR #80 edge-case classification and shared Rust module integration |
| VirgoStars-Event-Ephemeris | [#10](https://github.com/Cesare-ml/VirgoStars-Event-Ephemeris/issues/10#issuecomment-6824652260) | Review dataset license/coverage, branch overlap, and absent native parity checks |
| astrological-charts | [#23](https://github.com/Cesare-ml/astrological-charts/issues/23#issuecomment-6824675671) | Verify WebGL/axis behavior and PR interaction with earlier changes |
| astrological-functions | [#4](https://github.com/Cesare-ml/astrological-functions/issues/4#issuecomment-6824690904) | Investigate runtime/types mismatch, type contract weakening, and error typing |
| virgostars-desktop | [#34](https://github.com/Cesare-ml/virgostars-desktop/issues/34#issuecomment-6824694676) | Review SQLCipher replacement fingerprint validation, scan bounds, and native Windows evidence |

## Safety and limitations

- This is a private operational tool; do not publish the dashboard output or private target repository identities.
- A CLI can inspect the ledger but cannot see whether a paused chat is truly running. No automatic heartbeat, TTL recovery, forced reassignment or GitHub permission fencing exists.
- Only curated task statuses are summarized; unfamiliar claim/submission files are flagged as untracked rather than ignored. Resource locks without an associated active claim are flagged for manual inspection.
- No GitHub Actions, merges, deployments, API key publication, automatic task approvals or changes to the five target repositories.
- Tests added for the monitor use a mocked API. A complete `npm run check` from a fresh checkout remains necessary before claiming a native integration gate.

## Wave 2 work queue

The ledger retains the five wave-1 submitted reviewer markers. Two new curated developer tasks are ready: `astrological-functions#5` and `astrological-charts#25`, each with a single explicit partition and a new-file-only write scope. `fleet-status` now lists seven task records (five submitted, two available before a wave-2 claim) plus any alerts. The live status may change as agents work. Use `docs/LAUNCH_DEVELOPERS_WAVE2.md` for startup prompts, required resource-first claims and stacked-PR rules.

## Scope verification for wave-2 write submissions

A write-task submission lacking a verified CLI audit is displayed as `needs-scope-audit`, with a maintainer alert. This includes connector-only agent handoffs marked `scope_verdict:"manual-reviewed"`. After an agent opens a stacked draft PR, run `node bin/vs-agent.mjs audit-pr OWNER/REPO ISSUE ACTUAL_PR_NUMBER` using the latest PR HEAD, then independently review content and actual tests. `scope-clean` is only a file-path/branch metadata gate, **not** approval or scientific validation. A later commit changes the inspected HEAD and requires a fresh audit.

## Live developer submission freshness (2026-11-12)

For every submitted `access:write` task that names a PR, `fleet-status` now fetches the current draft PR and upstream PR (including their changed-file list), verifies the present file/branch scope, and compares current HEAD SHAs against the marker's `audited_head_sha` and `audited_base_sha`. Its additional `pr_check` object reports recorded/current SHAs and the live scope verdict. It **never rewrites** submission evidence.

| Status | Maintainer action |
| --- | --- |
| `stale-submission` | PR HEAD changed, upstream moved or current file/branch scope is blocked; run a fresh audit and independently review new commits |
| `needs-scope-audit` | Manual/legacy marker has insufficient CLI evidence; inspect actual PR before considering integration |
| `submitted` | Recorded and live scope evidence currently agrees, but code/tests still require independent review |

If the same issue claim remains present, `fleet-status` keeps a more serious `stale-submission` or `needs-scope-audit` status and **also** reports that the owner must finish releasing the claim. Permission errors, inconsistent PR metadata or a commit changing during file pagination stop the read-only audit rather than yielding a false clean verdict. The Git ledger is pinned to one commit, but live PR refs are **not** transactionally pinned across repositories: always recheck before merge decisions. No automated merge or approval exists.
