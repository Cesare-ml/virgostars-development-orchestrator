# Fail-closed same-session claim resumption

In the owner-operated ChatGPT/Codex pilot, a known session ID is not proof
that a previously created claim can safely be resumed. The immutable task
catalog and the current PRIVATE claim record must still agree.

The resume gate now checks the current GitHub claim against the curated
task: exact repository/issue, session, schema version 2, role, access,
`claimed` or `in_progress` lifecycle, original claim timestamp, sensible
branch/handoff metadata and unchanged write-resource partition ID + sorted
roots. Read-only tasks cannot silently inherit write-resource fields.

Both direct `claim` and `claim-next` use the **same** validation. A
`claim-next` caller requesting a different role cannot resume a claim held
under a previous role. Resuming an actual task with status `blocked` in the
newly reviewed catalog remains possible **only** for its original valid
owner and role, to avoid orphaning existing protected work.

The shared `status` parser also rejects invalid JSON record identity,
schema, session ID and lifecycle state as `inconsistent` rather than
treating the corrupted record as an ordinary busy task. It does not
automatically discard records.

If any validation fails, **no new claim or resource is written, released,
or overwritten**. The agent must stop and ask the owner to reconcile the
PRIVATE ledger. The seven historic submitted records remain untouched.

This is a defense against stale/corrupt metadata and session mistakes,
not against a malicious party who knows the session ID and can write to
the PRIVATE ledger. GitHub permissions, private visibility, exclusive
resource-first creation, PR scope/collision review and a supervised real
two-chat pilot remain mandatory. No automatic timeout, reassignment,
merge or deployed scheduler is introduced.

The new tests use only in-memory fake GitHub data. Passing Node checks
does not prove any two live ChatGPT sessions were executed.
