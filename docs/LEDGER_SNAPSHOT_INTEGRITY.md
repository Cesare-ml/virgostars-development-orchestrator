# Fail-closed private ledger snapshot integrity

This document describes a **read-only validation step** for the owner-operated
GitHub coordination ledger. It does not provision, migrate or activate a PRIVATE
ledger. The historical PUBLIC `coordination/claims` branch stays write-blocked.

## Why the stricter reader is needed

A naïve recursive Git tree reader that keeps only entries tagged `blob` can
silently omit a symlink, directory or malformed record at an expected claim,
resource or submission path. An omitted active resource may be mistaken for a
free partition, allowing multiple agents to work on overlapping files.

Before returning a private coordination snapshot, `getLedgerSnapshot` now:

1. Pins the Git branch HEAD and reads its tree using that commit SHA.
2. Inspects **every** tree entry in the `claims`, `resources` and
   `submissions` namespaces, rather than filtering away non-blobs.
3. Rejects unexpected or case-duplicated paths, symlinks, subtrees at a
   record path, executable files, noncanonical issue/resource filenames,
   malformed metadata and oversized listings.
4. Fetches each record as a Git blob, checks the returned blob SHA, exact
   byte length, canonical base64 encoding and independently recalculates
   the standard Git blob SHA-1 over the raw bytes.
5. Parses strict UTF-8 JSON objects only. It refuses corrupt or non-object
   payloads without returning their bytes in the error.
6. Reads the branch ref again after inspection; a changed HEAD causes
   failure instead of reporting a stale snapshot.

Validation failures stop the requesting owner-only command. They do **not**
delete or repair locks, reassign tasks, clear a submission, or grant permission
to merge. Operators should privately investigate the exact pinned snapshot,
preserve a backup and seek explicit maintainer reconciliation.

## Reproduction

From the reviewed feature-branch stack, on Node.js 20 or newer:

~~~sh
node --test test/ledger-snapshot-integrity.test.mjs
npm run check
~~~

The test file uses an entirely synthetic in-memory GitHub HTTP adapter and
checks normal snapshots, symlinks, collisions, invalid paths, tampered blobs,
invalid UTF-8, incomplete Git trees and a branch moving during the read. Public
CI contains **no private GitHub credentials or ledger data**.

## Remaining limits

- A verified Git blob and pinned tree do not authenticate that the operator
  chose the correct PRIVATE GitHub repository. The independent visibility and
  historical submission preservation gates remain mandatory.
- The read-only check cannot prevent writes *after* its final ref check.
  Exclusive resource/issue claims still must be acquired and revalidated.
- This is not a replacement for full archival backup, independent review,
  live two-agent integration tests, distributed transactions or a merge gate.
