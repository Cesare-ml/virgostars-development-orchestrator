# Live admission gate before GitHub-approved write claims

The optional PRIVATE GitHub owner catalog makes new tasks selectable in the
normal owner CLI. **A correctly approved catalog is not proof that its
upstream pull request and file scope are still safe at the instant of claim.**

The additional live gate on this branch runs for **new** write assignments
through both \`claim\` and \`claim-next\` when the catalog is loaded from the
owner-approved PRIVATE GitHub main commit.

Immediately before requesting the first write-resource lock, the CLI now:

1. Reads the current required upstream PR and requires the exact reviewed
   PR number, open state, branch, valid head SHA and base SHA.
2. Reads the **complete** open-PR inventory and changed-file metadata through
   the existing conservative collision audit, including moved/renamed files.
   Unknown PR states, incomplete pagination, stale HEAD or overlapping paths
   stop the assignment.
3. Reads the required upstream PR **again**, rejecting changes to the
   HEAD/base/ref during the audit. Rechecks the target issue number and
   verifies it is an actual open issue, not a pull request.
4. Only after passing those checks does the usual private, resource-first
   exclusive GitHub Contents creation begin. The existing approved PRIVATE
   main SHA is separately rechecked before each create/update/delete,
   and private visibility is still checked by the original client wrapper.

If GitHub returns an error, a PR changes or an unknown state appears, the
admission routine **fails closed before creating any new claim or lock**.
It does not silently skip the blocked task and start editing another file
outside its reviewed scope. It emits a generic error without including
private task names, ledger paths or catalog contents.

## Why it is deliberately limited

- This is a **fresh preclaim snapshot, not an atomic transaction** with the
  subsequent GitHub resource/issue create. Agents still need a successful
  exclusive lock and must recheck ownership before editing.
- It applies to new write claims in the **remote approved catalog mode**.
  Existing claimed work may be resumed by its current session without
  creating another resource; agents must still independently review
  current issue/PR state before resuming actual code changes.
- The original seven historic tasks remain submitted. Read-only tasks have
  no write resource to preclaim. Local-SHA owner catalogs keep their
  current guarded behavior until a separate owner-approved change extends
  this policy to that mode.
- The mechanism does not modify PRIVATE files itself, grant credentials,
  authorize merges, schedule ChatGPT tabs or activate a pending catalog.
- An independent full Git mirror backup, owner approval and two **real**
  ChatGPT sessions are still required for the first live owner alpha.

Run the native Node 20/22 tests and inspect the actual GitHub PR changed
files before integrating. See \`docs/legacy/PRIVATE_GITHUB_CLI_TASKS.md\` and
\`docs/legacy/PRIVATE_GITHUB_ALPHA_READINESS.md\`.
