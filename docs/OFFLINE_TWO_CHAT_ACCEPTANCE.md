# Offline two-chat owner-alpha acceptance checklist

**Draft implementation for issue #120.** This is an **offline self-reported consistency checker**, not a verification of live GitHub claims, PR approvals, private-ledger provenance, real browser coordination or a scale-up authorization.

It is designed for the **first two real, independently connected ChatGPT/Codex developer chats**, *after* the owner has separately created an actually PRIVATE coordination repository and reconciled the seven historical submitted markers. Until the owner finishes that migration, do **not** create new sensitive claim/lock/submission files in the old public repository.

## Run locally (Node.js 20+, Windows PowerShell)

Prepare an owner-only JSON evidence file **outside the public repository checkout**, for example:

```powershell
node --version
node scripts/check-two-chat-acceptance.mjs 'C:VirgoStarsPrivateowner-alpha-evidence.json'
```

The script reads **one local absolute regular file, at most 32 KiB**, rejects symlinks and paths that resolve inside this public checkout, never calls GitHub, never writes any file and never reads tokens. Output contains only fixed blocker codes and aggregate counts. Do not upload the evidence file to this public repository, a PR, an issue, CI logs, ChatGPT conversations or a shared directory.

Exit status: **0** means all **owner-entered declarations** are consistent, **1** means one or more declarations are explicitly blocking, **2** means an invalid/unreadable/missing file. **None of these statuses is proof of live success or permission to scale.** The output always says `live_github_verified:false`, `ready_to_scale:false`, and `operator_review_required:true`.

## Exact v1 file shape (synthetic example, never actual session IDs)

```json
{
  "schema": "virgostars.owner-alpha-evidence.v1",
  "owner_checks": {
    "private_ledger_verified": true,
    "historic_seven_submissions_verified": true
  },
  "fleet_counters": {
    "active_claims": 0,
    "orphan_resource_locks": 0,
    "ambiguous_claims": 0,
    "stale_submissions": 0
  },
  "agents": [
    {
      "session_id": "11111111-1111-4111-8111-111111111111",
      "task_id": "synthetic-task-1",
      "resource_scope_id": "synthetic-scope-1",
      "pr_number": 101,
      "pr_head_sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "exclusive_claim_verified": true,
      "draft_pr_verified": true,
      "scope_audit_verified": true,
      "no_competing_prs": true,
      "head_sha_current": true,
      "native_tests_verified": true,
      "handoff_published": true,
      "submission_marker_verified": true,
      "claim_released": true,
      "resource_released": true,
      "independent_review_recorded": true
    },
    {
      "session_id": "22222222-2222-4222-8222-222222222222",
      "task_id": "synthetic-task-2",
      "resource_scope_id": "synthetic-scope-2",
      "pr_number": 102,
      "pr_head_sha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "exclusive_claim_verified": true,
      "draft_pr_verified": true,
      "scope_audit_verified": true,
      "no_competing_prs": true,
      "head_sha_current": true,
      "native_tests_verified": true,
      "handoff_published": true,
      "submission_marker_verified": true,
      "claim_released": true,
      "resource_released": true,
      "independent_review_recorded": true
    }
  ]
}
```

All keys are mandatory, all unknown keys rejected. UUIDs must be valid UUIDv4 values. Task IDs and resource scopes are **opaque synthetic labels** (not repository paths). Both session IDs, task IDs, resource IDs, PR numbers and PR commit SHAs must be distinct (case-insensitively where applicable). No secrets or private repo names should be stored in the file. Each `true` is an *owner-entered observation* that the maintainer must substantiate separately with current private ledger and actual PR review/test evidence. Never mechanically turn an unreviewed agent's self-attestation into a checked `true`.

## What is and is not proven

This only catches contradictory, incomplete or duplicated information **within the supplied local checklist**. It cannot query GitHub, verify the owner actually has access to a private ledger, prove SHA provenance, validate a scope audit, verify native tests, authenticate independent reviewers, verify that locks truly were released, ensure a genuine session was opened, or show 2/10/20/40-chat throughput. Those remain separately supervised human acceptance steps under [MVP activation](MVP_ACTIVATION.md), [first owner alpha](FIRST_OWNER_ALPHA.md) and [roadmap](ROADMAP.md).

The standard full native test command is `npm run check`, which discovers `test/offline-two-chat-acceptance.test.mjs` through `node --test`. Do not add owner-private fixtures to tests or public Actions.
