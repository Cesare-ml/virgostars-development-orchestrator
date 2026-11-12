# Validate stacked developer PRs before submission

This document applies to the **PRIVATE owner-only VirgoStars agent pilot**, especially wave-2 write tasks in `config/pilot-tasks.json`. It is a deterministic changed-file and branch-scope check, not a security sandbox, code correctness proof or automatic approval.

## Read-only scope audit

On a local Node.js 20+ checkout of `feat/distributed-agent-coordination-v0` with privately configured `GITHUB_TOKEN` (read permission for target PR metadata, write permission only for coordinator claims if you later submit):

```powershell
node bin/vs-agent.mjs audit-pr Cesare-ml/astrological-functions 5 PR_NUMBER
node bin/vs-agent.mjs audit-pr Cesare-ml/astrological-charts 25 PR_NUMBER
```

Replace `PR_NUMBER` with the **actual newly opened stacked draft PR number**. There are no hardcoded or fabricated wave-2 PR numbers. The audit performs only GET calls to GitHub, reading both the submitted PR and the current upstream PR, plus the **complete** changed-file list (max 200 files; bounded pagination).

Output `verdict: "scope-clean"` means the **metadata and actual changed file names** match the catalog: correct repository, open draft PR, fresh upstream feature branch, separate head branch and allowed file paths. For wave 2, **all** specified files must appear as `added` with no unrelated changes, deletions or renames. GitHub return values are checked for complete file counts; permission errors, missing or incomplete evidence fail closed.

A result of `verdict: "blocked"` includes reason codes such as `OUTSIDE_APPROVED_SCOPE`, `MISSING_REQUIRED_FILE`, `WRONG_BASE_BRANCH`, `UPSTREAM_MOVED` or `NOT_OPEN_DRAFT`. CLI returns exit status **2** when blocked, **1** on fatal/API error and **0** when metadata is scope-clean. Neither exit 0 nor `scope-clean` means tests passed, code was independently reviewed, scientific validity is established or merge is permitted.

## Make a write submission (local CLI)

For wave-2 developer tasks, publishing a factual handoff is still required. Include the actual draft PR HEAD commit SHA in the handoff, and do not misrepresent unrun tests:

```powershell
node bin/vs-agent.mjs handoff Cesare-ml/astrological-functions 5 --session YOUR_SESSION_ID --summary "Draft stacked PR + exact tests and remaining gaps" --head-sha ACTUAL_PR_HEAD_SHA
node bin/vs-agent.mjs audit-pr Cesare-ml/astrological-functions 5 ACTUAL_PR_NUMBER
node bin/vs-agent.mjs submit Cesare-ml/astrological-functions 5 --session YOUR_SESSION_ID --pr ACTUAL_PR_NUMBER --confirm
```

The CLI **re-audits** at `submit` time, compares the PR HEAD against any recorded handoff HEAD SHA and refuses to write the `submitted` marker if checks fail. A successful marker records `pull_request`, `audited_head_sha`, `audited_base_sha`, `scope_verdict: "scope-clean"` and the handoff, then releases issue/resource locks. This marker is **awaiting independent review** only. A future commit to the PR invalidates this snapshot and requires a new audit.

If the write-submission audit fails, **do not delete or steal either lock**, do not change approved path roots to make the diff appear clean, and ask for independent scope/PR review. Fixing scope violations requires a new explicit task decision.

## GitHub-connected ChatGPT chats without local Node

A connected chat cannot invoke the Node CLI automatically. Its issue owner must compare `config/pilot-tasks.json`, current upstream PR HEAD, the newly created draft PR **head/base metadata** and every file returned by the GitHub PR changed-files endpoint. Before writing the private submission marker, report any missing/out-of-scope path and stop. Record the exact PR URL and reviewed HEAD SHA in the handoff and private marker. A manually created marker is **not proof** that the CLI audit ran. Never claim otherwise.

## Known limits

The audit looks at PR branch/base metadata and changed **file paths/statuses**, not the correctness or safety of code inside those files. It does not run npm, Angular/Playwright, Rust, TypeScript or Python tests, and cannot stop a noncompliant chat from pushing directly to its GitHub branch. It cannot atomically fence direct source pushes against a PR head mutation between the audit and marker creation. An independent reviewer must recheck PR HEAD/diff and actual test evidence before any merge; the orchestrator never merges to main automatically.

No GitHub Actions, deployment, production source changes, license or visibility changes were introduced by this audit.
