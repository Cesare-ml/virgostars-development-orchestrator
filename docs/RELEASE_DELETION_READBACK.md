# Verify private issue/resource deletion before declaring release

This draft hardens the last part of the supervised owner claim lifecycle.
GitHub Contents can acknowledge a DELETE even when a subsequent read of
the current PRIVATE coordination branch returns the record, a stale version
or a network error. A positive HTTP response alone is not proof that a
task/resource is available for another chat.

## Normal release

The original session must still pass the owner, handoff and confirmation
checks. The updated operation additionally:

1. Requires the initial claim and the independently validated live
   \`status\` read to match on **both blob SHA and complete JSON**.
2. Executes the SHA-conditional issue-claim delete.
3. **Re-reads the issue path** from the PRIVATE branch and requires it to
   be absent before attempting to delete any write-resource lock.
4. If this was a write task, validates the resource's original owner/scope,
   executes its SHA-conditional delete and **re-reads that resource path**.
   If the deleted record still appears or GitHub cannot be queried,
   the operation does not report \`released\`.
5. Rechecks the task state at the end: either still **submitted** with
   its original immutable marker or **unclaimed** if no marker existed.

A missing, stale or unavailable issue-deletion readback intentionally
leaves the write resource reserved. The original owner must reconcile
that uncertain outcome, not retry a blind DELETE or work without a lock.

## Submitted orphan resource recovery

When the issue claim was removed after a valid submission but its
write-resource lock remained, the existing original-session recovery path
now also verifies the response after deleting that resource.

It requires the resource and issue paths to remain absent and the
previously pinned submission blob to remain unchanged before returning
\`recovered_resource_lock:true\`. It never deletes an active or foreign
claim. Unknown readback results do not count as recovery success.

## Limits

This is a conservative **readback**, not a transactional guarantee.
GitHub branch HEAD may change between independent GET requests or after
the final check; actual agents still need exclusive resource-first
claim acquisition, private repository approval and revalidation before
editing. A failed post-delete readback can mean the delete succeeded but
the operation remains uncertain, so manual owner reconciliation is
required.

The native tests use an in-memory GitHub adapter to simulate acknowledged
but unpersisted deletes, lagging reads, network failures, foreign claim
appearance, altered submission marker, and clean success. They do not
execute actual PRIVATE ledger writes or prove real two-chat readiness.

No automation, merge, deployment, public coordination write or
modification of the historical submitted records is authorized here.
