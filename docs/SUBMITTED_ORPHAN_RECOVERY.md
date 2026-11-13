# Owner-only recovery: submitted task with an orphan resource lock

GitHub Contents changes to an issue claim and its resource lock are **not atomic**.
A completed write task may have a valid persisted `submissions/...` marker, no
`claims/...` issue lock, but an orphaned `resources/...` partition lock if
the second deletion failed. Subsequent developer tasks must **not** claim this
partition until ownership is reconciled.

## Narrow recovery path

On the reviewed feature-branch stack, use the same guarded `submit` command
from the **original agent session**, with the exact previously submitted draft
PR number and explicit confirmation:

```powershell
node bin/vs-agent.mjs submit OWNER/REPO ISSUE --session chat-UUID --pr PR_NUMBER --confirm
```

The CLI must first pass the existing PRIVATE-ledger activation gate and read
the owner-approved local task catalog. It never enables the historical public
coordination ledger. If the issue claim still exists, ordinary submission
retry logic applies instead.

If the original claim is absent but a resource remains, recovery checks:

1. The persisted submitted record belongs to that same session, target
   repository and issue, and contains the original scoped PR evidence.
2. The operator supplied that **same PR number** and the local curated task
   still declares the **same partition and exact resource roots**.
3. The orphan lock matches the record's original session, issue, scope ID and
   sorted roots; a foreign lock is never removed.
4. A final fresh read finds no active issue claim and unchanged submission and
   resource blob SHAs before attempting GitHub's SHA-checked resource delete.

On success, output uses `result: "recovered-submitted-resource"`. The submitted
marker stays intact and the work is **still awaiting independent review**.
If the resource was already removed, retry returns `already-submitted`.
A conflict, stale evidence, changed catalog or unknown GitHub error fails
closed and requires manual reconciliation.

## Restrictions

- Never use a different session ID or PR to force an unlock.
- Never remove an orphaned reservation from an **unsubmitted** task using this
  recovery path. Manual owner review is still required for those.
- Never edit or copy real private ledger contents into the public repository,
  public CI, a chat or an issue.
- GitHub does not provide a multi-file transaction: the repeated read and
  per-file SHA compare-and-swap are protective checks, not global atomicity.
- Do not interpret submission or successful cleanup as permission to merge,
  deploy, close an issue, or activate unsupervised agents.

See [RESOURCE_LOCKS.md](RESOURCE_LOCKS.md) and
[FIRST_OWNER_ALPHA.md](FIRST_OWNER_ALPHA.md) for the wider safety model.
