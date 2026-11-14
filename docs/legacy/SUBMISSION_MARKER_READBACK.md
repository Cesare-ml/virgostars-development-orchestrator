# Verified PRIVATE submission marker before releasing the issue lock

The final step of the owner alpha is **submitted for independent review**,
not automatically merged or approved. Before a reviewer/developer can release
their current PRIVATE GitHub issue claim and write-resource reservation, the
record at \`submissions/OWNER__REPO/issue-N.json\` must be durable.

## Safety invariant

A successful GitHub Contents API response to creating the submission marker
is not sufficient. The \`submit\` operation now reads the marker again from
the currently selected PRIVATE coordination branch and requires:

- A nonempty blob identity for the saved marker.
- An exact match for the frozen task/session/role/access, last handoff,
  audited PR head/base, scope verdict and collision evidence.
- For a newly acknowledged marker, an **exact match of the full data
  object**, including the timestamp and note, not just selected evidence.
- For a marker that existed before this \`submit\` call, an unchanged blob
  SHA since that first read.
- For an HTTP 409/422 collision with a matching same-session submission,
  a **second independent read** after the collision handler has verified
  its contents.

If the marker is missing, stale, unexpectedly modified, unreadable or
racing, \`submit\` **stops before calling \`release\`**. It does not delete
an issue claim or a write-resource lock. The original session and owner
must inspect and reconcile the PRIVATE ledger before retrying.

The new gate precedes both read-only-task release and write-task release;
write tasks still require the previously existing completed PR scope,
collision, upstream and exact handoff-head checks.

## Limits

This adds defense-in-depth against incorrect acknowledgements and
ambiguous/stale GitHub reads; it is **not an atomic GitHub transaction**.
Another agent could change the PRIVATE branch between the readback and
the SHA-conditional release. The existing fail-closed release and
manual recovery rules continue to apply.

No PRIVATE task catalog is approved here, no real GitHub claim is
created, and no claim or merger is executed by the tests. Native
fixtures use in-memory synthetic GitHub responses and exercise
missing, stale, forged, altered and conflicting submission markers.

This branch is intentionally stacked on the owner claim-resume integrity
work. Merge/review dependencies in order; do not deploy a new agent
wave until an independently approved owner catalog, recoverable
private-ledger backup and supervised two-chat verification are complete.
