# Offline chat-batch continuity rehearsal

**Status:** synthetic, tokenless feature on a stacked draft PR. This is not a live scheduler, hosted service or proof of real cross-machine GitHub atomicity.

## Why

A single concurrency stress run of 20 agents cannot directly demonstrate what happens if **ten chats start, keep their tasks, and then ten more start later**. The batch mode rehearses that precise lifecycle without completing the first set before the second arrives.

## Run locally (Node.js 20+)

```powershell
node bin/vs-agent.mjs stress-fleet --batches 10,10
node bin/vs-agent.mjs stress-fleet --agents 40 --batches 5,10,10,15
node --test test/offline-chat-batches.test.mjs
```

Batches are **ordered, positive integers**, at least two groups, with a total of **2–40 agents**. If `--agents` is supplied, it must equal the sum of the group sizes. The existing `stress-fleet --agents 20` and no-argument defaults remain unchanged.

## What the rehearsal verifies

1. The first wave gets a distinct, resource-locked task per synthetic chat, using the real `claimNext` function and the same in-memory mock ledger.
2. Without releasing those locks, the next wave arrives and obtains only the remaining independent tasks. The run verifies counts of *all* live issue and resource locks.
3. Every earlier chat attempts `claimNext` again using **its original session ID**. It must receive `already-owned` for the **same repository, issue and resource partition**, with **no extra locks**.
4. Later waves repeat the checks. Only after *all* groups coexist does the existing synthetic handoff → PR scope/collision audit → submit → release lifecycle execute.
5. All submitted markers remain, zero locks remain, and no submitted task can be re-offered. Malformed batch input fails before any simulated work.

Output is limited to aggregate counts such as `arrival_batch_sizes`, `earlier_session_resumes_verified` and `earlier_claims_preserved`. No task identities, session IDs, private filenames, tokens or repository names are printed.

## Reconstructing the coordinator between waves (issue #88)

To rehearse a restart of the **synthetic** coordinator after wave 1, with ten sessions still active:

```powershell
node bin/vs-agent.mjs stress-fleet --batches 10,10 --reopen-after-wave 1
node bin/vs-agent.mjs stress-fleet --agents 40 --batches 5,10,10,15 --reopen-after-wave 2
node --test test/offline-wave-reopen.test.mjs
```

`--reopen-after-wave` is **optional**. Its value is a 1-based wave index between 1 and the penultimate wave, and it requires `--batches`. The original no-reopen stress mode behaves as before; invalid boundaries exit without starting the rehearsal.

At the selected boundary, the simulator captures a deep copy of all in-memory ledger records, synthetic pull-request metadata (including changed files and PR heads), and SHA/write counters, then creates a **new adapter instance with independent Maps**. It checks that every issue claim, resource lock and submission marker is identical, then invokes the real `claimNext` using only each older session ID. Every resumed session must get its original repository, issue and resource partition without creating another lock or changing the snapshot. Later waves still arrive, and all sessions still hand off, submit and release with zero residual locks.

The opt-in report contains **aggregate-only** `reopened_after_wave`, `restored_session_resumes_verified`, `restored_live_issue_claims`, `restored_live_resource_locks`, `restored_submission_markers`, `restored_synthetic_pr_records` and `restored_ledger_entries_preserved`. It never serializes identifiers, repositories or private tasks.

**Limit:** This is an in-memory reconstruction test within a single process. It does **not** demonstrate persistence or durability of a real external database, GitHub ledger, filesystem, network or browser chats. No private data, token, network calls or real coordination writes are used.

## Limits and next milestone

The simulation uses a single Node process and synthetic GitHub API behavior; the groups are sequential arrival *phases*, not timed/background conversations. It cannot guarantee that two real browsers, GitHub API concurrent requests, network failures or owner permissions behave the same way.

**Never** direct new owner-only agents to the historical public coordination branch. Real operation requires a separately approved private ledger, preservation of historical submissions, a reviewed new task catalog, the `alpha-doctor` preflight, and an owner-supervised two-agent live pilot. See [FIRST_OWNER_ALPHA.md](FIRST_OWNER_ALPHA.md) and [OFFLINE_FLEET_STRESS.md](OFFLINE_FLEET_STRESS.md). No automatic merge or deployment is permitted.
