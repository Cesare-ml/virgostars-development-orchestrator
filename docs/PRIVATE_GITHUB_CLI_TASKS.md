# Optional SHA-approved private GitHub catalog for the normal owner CLI

This feature makes the **existing** owner-operated `vs-agent` commands use
the same new task catalog verified by the private GitHub catalog preflight.
It is intentionally optional: the historical owner-local SHA-approved file
remains supported. Agents using GitHub-connected ChatGPT **without a local
Node runtime** must instead apply the documented manual connector protocol;
this CLI is not a hosted service or a ChatGPT launcher.

## Exactly one source of truth

The command recognizes precisely three catalog configurations:

- **Legacy no owner task variables:** the frozen seven historical tasks
  remain inspectable, but those already-submitted identities cannot be
  reassigned; there are no newly authorized tasks.
- **Local mode:** both `VS_PRIVATE_TASKS_FILE` and
  `VS_PRIVATE_TASKS_APPROVED_SHA256` must be set. The file is regular,
  off-checkout and verified byte-for-byte each time.
- **GitHub mode:** both
  `VS_OWNER_CATALOG_APPROVED_MAIN_SHA` and
  `VS_OWNER_CATALOG_APPROVED_SHA256` must be set in the trusted
  operator environment, with the two matching
  `VS_PRIVATE_LEDGER_REPO` and
  `VS_PRIVATE_LEDGER_APPROVED_REPO` selections.

Partial modes, both modes enabled together, invalid hashes or a changing
private main HEAD fail closed. **Never** use the public source repo for
the PRIVATE claim store, and never publish owner variables or the private
catalog content in public issues, PRs or workflow logs.

## Commands enabled in GitHub mode

After the owner has reviewed and approved the exact PRIVATE main commit
and file SHA-256, existing CLI commands can use the verified catalog for:

```text
node bin/vs-agent.mjs alpha-doctor
node bin/vs-agent.mjs discover
node bin/vs-agent.mjs fleet-status
node bin/vs-agent.mjs audit-pr OWNER/REPO ISSUE PR_NUMBER
node bin/vs-agent.mjs audit-collisions OWNER/REPO ISSUE
node bin/vs-agent.mjs claim-next --session chat-UUID --role developer
node bin/vs-agent.mjs claim OWNER/REPO ISSUE --session chat-UUID --role developer
node bin/vs-agent.mjs submit OWNER/REPO ISSUE --session chat-UUID --pr PR_NUMBER --confirm
```

Do not invoke `claim` or `claim-next` without separately
passing live target issue/upstream PR freshness, path-scope and collision
review; the static catalog alone does **not** prove an open PR has not
changed since review. The `alpha-doctor` and
`audit-collisions` commands are read-only but may be stale by the time
another chat claims a resource. **Claim requires an actual successful
exclusive resource-first creation** in the PRIVATE GitHub ledger. A 409/422,
timeout, conflicting resource owner, stale approval or uncertain API result
means stop, recheck, and do not edit code.

The GitHub source is verified on every catalog-consuming invocation
using a pinned PRIVATE main commit, exact SHA-256 bytes, the frozen seven
historic submission blobs and strict task schema. For each GitHub Contents
create/update/delete in this mode, a second wrapper checks the approved
main commit **again**, on top of the existing per-operation live PRIVATE
ledger visibility checks.

GitHub cannot atomically verify the `main` ref and write the
separate `coordination/claims` branch. This is a supervised owner
alpha, **not** a transactional multi-agent scheduler.

## Safe recovery

`status`, `handoff` and explicit owner-only
`release` do not reload the task catalog merely to inspect or
clean up an existing claim. They still require the existing PRIVATE ledger
checks and the original session ID; no foreign lock may be deleted. This
is deliberate: revoking a catalog must not make an orphaned lock
inaccessible to the rightful owner.

A catalog change requires reapproval of both immutable owner inputs before
selecting more work. No catalog commit or test result confers automatic
owner approval; no command here merges, deploys, launches chats or
registers untrusted public volunteers.

## Remaining real-world gates

The PRIVATE proposal remains a draft until the owner reviews and promotes
the exact approved file. An independently recoverable Git backup, actual
remote read-only alpha-doctor, distinct real ChatGPT sessions and review
of all private lock lifecycle records are still needed before increasing
concurrent agent capacity beyond the initial two.
