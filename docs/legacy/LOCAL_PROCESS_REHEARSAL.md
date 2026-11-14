# Independent OS-process contention rehearsal (owner alpha)

This adds a **real local process-boundary test** to the existing synthetic in-memory VirgoStars Orchestrator rehearsal. It does **not** implement or authorize a production coordinator.

## Run (Windows PowerShell, Node.js 20+)

From the reviewed feature-branch checkout:

```powershell
node scripts/rehearse-local-processes.mjs
node --test test/local-process-rehearsal.test.mjs
```

No GitHub account, token, private task catalog or environment variables are needed. On macOS and Linux, the same commands work.

## What is actually exercised

- A fresh sandbox directory is created with `mkdtemp` under the system temporary directory, and removed at the end.
- Two **separate Node operating-system processes** receive fixed, synthetic IDs and race to create the exact same test claim using the filesystem's exclusive `wx` create flag.
- Exactly one succeeds; the other gets an existing-claim result and cannot release the winner's claim.
- The winner releases its own claim, the losing process acquires the now-free claim, and the former owner cannot release its successor's claim. The successor releases it and zero test claims remain.
- Worker subprocesses inherit only essential platform environment variables. Public output contains booleans/counts, no task names, GitHub paths, session IDs, credentials or output files.

## Limits / why this is not a remote scheduler

- Atomic file creation applies to this **local temporary filesystem demonstration only**. Do not use it as proof of GitHub Contents API transactions, NFS/network-share safety, fencing or distributed process arbitration.
- The worker's in-memory ownership flag is a test harness, **not durable agent identity**. The test does not implement restart recovery, crash consistency, lease expiry, private authorization or a transactionally fenced release across machines.
- No live GitHub request, real task assignment, PR review, branch merge, deployment or browser-chat launch occurs. It is not a test of 10+10 remote ChatGPT sessions.
- A successful run is **supplemental evidence** alongside the separate tokenless public smoke gate, offline two-agent GitHub mock rehearsal, native tests and owner-private alpha readiness. A real approved private ledger, current GitHub PR audit, independent review and live two-chat proof remain necessary.

This PR is intentionally isolated to new files and the existing public, test-only Node 20/22 CI. `main`, production clients, older public coordination branches and private records remain untouched.
