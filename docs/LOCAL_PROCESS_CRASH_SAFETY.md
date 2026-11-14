# Crash-stop orphan claim safety (offline, synthetic only)

This demonstration extends the separate local OS-process contention rehearsal from draft PR #96. It deliberately **does not** build an automatic recovery or lease mechanism. It checks the safer default: a synthetic local claim must remain unavailable when its owner process is forcefully terminated without an orderly release.

## Run (Node 20+, Windows PowerShell or macOS/Linux)

```powershell
node scripts/verify-local-process-crash.mjs
node --test test/local-process-crash-safety.test.mjs
```

The command takes no arguments, credentials, repository identifiers, private ledger settings or task IDs. It creates and removes a fresh OS temporary directory and forks independent, isolated Node workers with a minimal platform environment.

## Bounded checks

1. Original process exclusively creates the synthetic `wx` claim; a second process is denied.
2. The owner process is forcibly terminated without releasing; the file's exact bytes remain unchanged.
3. The still-running competitor cannot claim or release it.
4. A **new OS process** using the original synthetic owner *label* cannot release or claim it, because the local worker's in-memory ownership flag does not survive restart.
5. The rehearsal records exactly one deliberately orphaned synthetic claim **before teardown**. All test workers and the temporary sandbox are then removed by the harness, not by a task-recovery routine.

The report contains only aggregate fixed evidence and explicit `false` flags for private-ledger verification, real crash recovery, distributed safety, merge and deployment authority. CLI errors do not include paths, session IDs, tokens or task details.

## Limitations and operating rule

- This is **not** a distributed lease, durable lock, GitHub operation, production recovery procedure, or proof of OS crash consistency across different filesystems. The harness intentionally never steals or heals a claim.
- Process death here is an explicit forced termination, **not** a power-loss/fsync, network partition, or database transaction test.
- A file may survive an owner crash while its owner cannot authorize safe release. In a real owner-private coordinator the operator must review the authoritative ledger, original owner evidence, conflicting resource locks and submissions before a separately approved recovery.
- No private claim, live GitHub write, ChatGPT browser session, external volunteer access, main merge or deploy is performed.

Stack this new-file-only draft on PR #96, leaving the underlying worker and existing rehearsal unchanged. Do not combine it with alternate overlapping PRs without integration review.
