# Pinned private ledger snapshot integrity

The owner-operated coordinator reads a **single, pinned Git commit** of the private coordination ledger for fleet monitoring and alpha readiness. A successful GitHub API response is not sufficient to prove that every claim/resource/submission record was included correctly.

## Read-only validation

`getLedgerSnapshot()` now:

- Requires a non-truncated recursive Git tree and checks every item inside the reserved `claims/`, `resources/` and `submissions/` namespaces, instead of silently skipping non-blobs.
- Accepts only expected per-repository directories and regular `100644` JSON records. Rejects unexpected nesting, symbolic links, gitlinks, unexpected entries and case-insensitive path collisions.
- Enforces the 250-record and 64 KiB-per-record pilot limits **before** downloading the record bodies.
- Requires each Git blob response to match the tree-listed SHA and byte count, validates canonical base64, and independently recalculates the Git blob SHA-1 using `blob <length>\\0<bytes>`.
- Decodes UTF-8 strictly, rejects invalid JSON and requires a JSON object. A failed check aborts the entire read. It cannot silently turn a broken ledger into an apparently empty fleet.

This uses GET requests only. It never creates, modifies or releases a live lock, creates a private repository, or exports coordination data. All tests use synthetic GitHub response objects and **no private token**.

## Validation

Run `npm run check` on the reviewed stacked branch, or inspect the test-only GitHub Actions result for Node 20 and Node 22. `test/ledger-blob-integrity.test.mjs` covers valid nested tree entries, invalid reserved paths, symlinks, gitlinks, case-alias collisions, wrong hashes, malformed base64, invalid UTF-8/JSON and truncation.

The hash check is a consistency verification for an already pinned Git object. It is **not** a digital signature, not an independent authentication of the private repository, and not a guarantee that the branch has not moved after the read. The existing private-visibility, historical submission preservation and branch recheck gates remain mandatory.

## Recovery

If snapshot integrity fails, stop the affected read/claim/monitor workflow and investigate on a trusted machine. Do not delete suspect records, force-unlock another session, bypass private visibility or publish actual ledger records in public logs/PRs. A positive integrity check never authorizes merging, deployment or public agent enrollment.
