# Fail-closed synthetic process-crash rehearsal

**Status:** standalone, tokenless regression stacked on the draft real-local-process rehearsal (PR #96). This is not an implemented browser restart or a production scheduler.

## Windows / Linux / macOS (Node.js 20+)

Run from the reviewed feature-branch checkout:

```powershell
node scripts/rehearse-local-crash.mjs
node --test test/local-crash-rehearsal.test.mjs
```

The command takes no flags, tokens, private data or target paths. Its JSON output contains fixed aggregate booleans and counts only.

## Failure scenario

1. Start a real Node OS-process worker with a fixed fictional owner label in a newly created, private temporary sandbox.
2. The first worker creates one synthetic local claim using the existing `wx` exclusive-file worker, and the parent verifies the exact file contents.
3. The first worker is **forcibly terminated without release**. The parent verifies the file still exists with identical contents.
4. A second worker with a different fictional owner is blocked from claiming the same synthetic task and cannot release it.
5. A brand-new third process, initialized with **the original owner label**, is also blocked. Simply replaying the original initialization does not prove durable ownership or recover a crashed process.
6. Both competitors are stopped and only the isolated temporary sandbox is cleaned up. No real claim is released.

## Interpretation

An orphaned claim must remain **blocked pending owner reconciliation**, not automatically reassigned after a crash or a guessed TTL. Real recovery needs durable authenticated identities, immutable handoff evidence and an explicit owner-controlled recovery protocol with fencing; this demonstration deliberately implements none of those.

The claim is a file on one local machine, not a GitHub Contents transaction, shared backend, browser tab, ChatGPT session or multi-machine lease. A successful run does not authorize live agent launches, automatic claim takeover, migration, merge or deployment. The historical public `coordination/claims` branch is not safe for new owner-only tasks.

This feature adds new paths only and uses the existing public, test-only Node 20/22 workflow without modifying it. Parent PR #96, its own parent PR #80, and their independent review gates remain prerequisites.
