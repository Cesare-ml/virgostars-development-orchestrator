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

## Limits and next milestone

The simulation uses a single Node process and synthetic GitHub API behavior; the groups are sequential arrival *phases*, not timed/background conversations. It cannot guarantee that two real browsers, GitHub API concurrent requests, network failures or owner permissions behave the same way.

**Never** direct new owner-only agents to the historical public coordination branch. Real operation requires a separately approved private ledger, preservation of historical submissions, a reviewed new task catalog, the `alpha-doctor` preflight, and an owner-supervised two-agent live pilot. See [FIRST_OWNER_ALPHA.md](FIRST_OWNER_ALPHA.md) and [OFFLINE_FLEET_STRESS.md](OFFLINE_FLEET_STRESS.md). No automatic merge or deployment is permitted.
