# Confirm handoff persistence before reporting success

In the supervised owner alpha, a chat records an issue handoff before it
submits or releases the claim. A successful GitHub Contents update response
does not prove the new handoff is durably readable on the current PRIVATE
coordination branch.

The `handoff` implementation now performs two separate conservative checks.

## Before writing

- Read the current owner claim, including its Git blob SHA.
- Read a fresh status that independently validates issue ownership and its
  associated write-resource lock, if applicable.
- Require the two reads to agree **exactly** on blob SHA and the claim JSON.
  A changed/ambiguous issue record stops the update.

## After writing

- Read status **again**, including the write-resource verification.
- Require a nonempty **changed** claim blob SHA and an exact match to the
  intended `state: "in_progress"`, branch and complete
  `last_handoff` object (time, summary and PR head SHA).
- Return `handoff-saved` only when the fresh record matches. Missing,
  stale, unreadable, forged or inconsistent data raises an error and
  requires owner reconciliation.

On an ambiguous post-write read, a handoff MAY actually exist in GitHub.
It is not safe to immediately repeat edits, erase the claim, or assume
the PUT failed. Inspect the persisted PRIVATE issue/resource records
with the same session identity before retrying.

The change does **not** make separate GitHub requests atomic, prevent a
future owner-ledger change, or authorize merging/deployment. The existing
claim/claim-next, submitted-marker readback, exclusive resource locks,
SHA-approved private catalog checks and independent review remain in force.

The accompanying native synthetic regressions cover read-only/write
handoffs, success without persistence, stale/missing/read errors,
foreign ownership, changed handoff content, stale blob IDs, mismatched
resource locks and HTTP 409 races.

No PRIVATE GitHub ledger records, tasks, or branch permissions were
changed by preparing this draft PR. The first two real independent chat
sessions still require an approved owner catalog and verified full backup.
