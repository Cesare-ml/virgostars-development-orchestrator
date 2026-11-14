# Synthetic local OS-process crash rehearsal

This **offline, tokenless** drill extends the independent OS-process contention experiment from draft PR #96. It is **not** crash recovery for a production VirgoStars coordinator or a real GitHub ledger.

## Windows PowerShell / Node.js 20+

From the reviewed feature-branch checkout:

```powershell
node scripts/rehearse-local-process-crash.mjs
node --test test/local-process-crash.test.mjs
```

No GitHub token, private task catalog, network service or extra dependency is needed. macOS and Linux use the same commands.

## Exact scenario

1. Start two independent Node workers with fixed synthetic IDs in a freshly created local temporary directory; only one worker acquires an exclusive `wx` claim.
2. Kill the owner at the OS-process level, **without** a cooperative release call. Verify the claim file remains and the other process still sees `busy`. Nonowners cannot release it.
3. Inspect the synthetic claim's narrow schema and owner; then perform one **test-harness-only manual reset** by deleting the known claim in that unique disposable sandbox.
4. Verify the surviving contender can acquire; start a new process using the original owner ID, which must not be able to release the successor or acquire a duplicate claim.
5. Have the new owner release normally; verify zero remaining synthetic claims. Shut down every worker and delete the sandbox even on failure.

The report exposes only fixed aggregate counts, flags and an explicit `production_crash_recovery_implemented: false`. A CLI argument is rejected; child workers receive an allowlisted minimal OS environment rather than GitHub/private variables.

## Safety boundaries

- A stale local `wx` file **does not expire automatically** when the owning process crashes. This test demonstrates that absence of liveness is not evidence of permission to take over.
- The manual reset is safe only inside a freshly created, isolated, synthetic test directory where the runner controls all participants. **Never apply the file deletion to real tasks or coordination ledgers.** A real recovery protocol needs authenticated owner decisions, durable fencing generations and consistency checks before takeover.
- Local file `wx` semantics are not equivalent to GitHub Contents API creation, remote PostgreSQL transactions, network filesystems, browser chat sessions or crash-proof distributed locks.
- No real claim, resource lock, historical submission, private metadata, network call, deploy, merge, workflow change or production onboarding is performed. Passing this check cannot authorize the first private pilot or 40 independent live agents.
- This isolated PR uses **new files only** and remains draft pending independent review and exact-head Node 20/22 validation.
