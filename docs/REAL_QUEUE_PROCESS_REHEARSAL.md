# Offline real-queue cross-process rehearsal

The existing local-process rehearsal in draft PR #96 establishes operating-system
file exclusivity but does not call the coordinator's queue. This follow-up
runs **the actual `claimNext`, `handoff`, and `release` functions in two
independent Node.js processes**, using a deliberately tiny, synthetic,
parent-owned GitHub-Contents-like adapter via Node IPC.

## Run (Node.js 20+)

```powershell
node scripts/rehearse-real-queue-processes.mjs
node --test test/real-queue-processes.test.mjs
```

The parent deliberately creates just one synthetic write task, so the two
children race for the same resource and issue. The adapter supports atomic
create-if-absent and compare-and-swap update/delete. Success requires:

- Exactly one acquisition; the other process reports contention.
- Both the issue claim and write-resource lock are present together.
- The original owner can resume; the non-owner cannot release its claim.
- After a factual handoff and release, the previously blocked process can
  acquire the task; the former owner cannot release that successor claim.
- The successor also hands off and releases, leaving zero local locks.

The script uses fixed fake identifiers. The children inherit no GitHub token,
private-ledger or local task-file environment variables. Standard output is
an aggregate JSON report only; the tests deliberately inject fake secrets to
check that they cannot propagate into the output. Extra CLI arguments and
standalone worker invocation are rejected.

## Security and acceptance boundary

This **does not contact GitHub** or create or modify real issues, PRs, claims,
submissions or private repositories. Parent IPC is a synchronous in-process
stand-in, not a real multi-machine transaction or proof of atomic GitHub API
behavior. The exercise demonstrates real coordinator queue logic in separate
OS processes, **not two browser chats**, durable restart recovery, a signed
result, a private-ledger cutover or readiness for public volunteer onboarding.

The exercise intentionally releases a synthetic task without marking it
submitted; re-claiming *after a valid release* is expected. For a completed
real task, the established submit-before-release protocol remains mandatory.
Do not merge, deploy, migrate or enroll real agents based on this report alone.

**Next acceptance gate:** independently review the staged Alpha branches,
approve a separate private coordination destination, preserve the seven
historical submissions, then supervise two live chat sessions with fresh
session IDs and disjoint curated work. Scale beyond two only after that gate.
