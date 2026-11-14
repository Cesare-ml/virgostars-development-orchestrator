# Local worker-crash safety rehearsal (owner-only alpha)

This extension is **stacked on the independent OS-process contention rehearsal**. It intentionally tests a different safety property: when a worker holding a synthetic claim dies unexpectedly, neither a rival worker nor a replacement with the same synthetic owner label may reclaim or release that claim. The owner must review orphaned claims instead of accepting an automatic lease expiry.

## Run (Node.js 20+, Windows PowerShell)

From the reviewed stacked feature branch:

```powershell
node scripts/rehearse-local-process-crash.mjs
node --test test/local-process-crash-rehearsal.test.mjs
```

The command creates a uniquely named temporary local directory, starts three independent Node processes (two initial workers and a same-label replacement), uses the existing synthetic `wx` file-claim worker, terminates the original owner, and checks that exactly one claim survives until the **test sandbox** is destroyed in `finally`. Competing and restarted workers cannot steal or release it. No stale-claim cleanup logic is added to the production coordinator.

Child workers receive only a short allowlist of essential platform environment variables. CLI arguments are rejected; output contains only fixed aggregate booleans and counts. No GitHub tokens, private task catalog, approved repository data, live claims, actual task assignments or network access are involved.

## Important boundaries

- `fs.open('wx')` proves an exclusive local test-file create, **not** GitHub Contents race semantics, network share locking, or distributed fencing. The worker's owner label is deliberately synthetic and not durable authorization.
- A replacement using the same owner *label* does not have authority to delete an orphaned lock. Real recovery needs a separately reviewed owner-mediated protocol; this command intentionally supplies none.
- Destroying the isolated temporary test sandbox at the end is not a production lock recovery. The report explicitly shows one synthetic orphan **before** sandbox cleanup.
- This does not simulate ChatGPT browser tab crash/relaunch, prove cross-machine persistence, unlock a private ledger, approve PR integration, merge to main, or deploy.

Retain the existing supervised two-agent private-ledger pilot as a separate future acceptance gate. There are no changes to the existing coordination queue, resources, submission marker logic, workflows, or target repositories.
