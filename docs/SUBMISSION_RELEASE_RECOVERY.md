# Recover an interrupted submitted write-resource release

**Owner-only PRIVATE ledger.** These instructions apply only after the separate PRIVATE coordination repository has passed the owner-approved migration and activation gates. Never operate on the historical PUBLIC coordination branch.

## Problem

GitHub Contents creates/deletes issue claim and write-resource lock files in separate commits. A successful submission and issue-claim deletion can be followed by a network failure or HTTP 409 while deleting the resource lock. The immutable `submitted` marker must stay present, and a new session must **not** steal the resource.

## Same-owner retry

After independently inspecting the PRIVATE ledger, the **same original session ID** may retry the existing write-task submit command with the **original PR number**:

```powershell
node bin/vs-agent.mjs status OWNER/TARGET-REPO ISSUE
node bin/vs-agent.mjs submit OWNER/TARGET-REPO ISSUE --session chat-ORIGINAL-UUID --pr ORIGINAL_PR_NUMBER --confirm
```

The idempotent recovery path only removes a stranded write-resource lock if all of the following hold: an immutable submitted marker belongs to that session, issue and repository; the associated issue claim is **absent**; the marker carries previously verified PR head/base, handoff and collision evidence; the approved curated task identity and exact resource roots have not changed; the caller supplies the original PR number; the resource lock is owned by that same session/task/scope; and a second read shows unchanged submission SHA with no new active claim. The delete uses the exact resource blob SHA.

If the resource lock was already released, return the standard `already-submitted` result without rewriting or deleting any record. A successful orphan-only cleanup returns `recovered_resource_lock: true`. The marker remains untouched and submission is **not** approval to merge the PR.

## Failure and uncertainty

Any foreign owner, changed PR evidence, changed catalog/resource scope, new issue claim, missing/malformed submission evidence or uncertain GitHub response **must stop** for maintainer reconciliation. Do not use a new session ID to release an old session's lock. Never delete locks manually or automatically expire them without explicit evidence. Preserve the original submitted marker and the locked resource until the owner has verified what occurred.

This is not a transactional lease/fencing protocol and does not enable automatic background chat restart, remote deployment or public contributor write access.
