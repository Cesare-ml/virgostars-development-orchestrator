# Offline multi-chat wave verification matrix

**Status:** public-safe, tokenless, synthetic development check. This is not a live multi-chat scheduler, a credentialed private-ledger operation or a deployment gate.

## Run on Node.js 20+

From this stacked feature branch (after installing Node; no npm dependencies):

~~~powershell
node --check src/offline-wave-matrix.mjs
node --check scripts/verify-offline-wave-matrix.mjs
node --test test/offline-wave-matrix.test.mjs
node scripts/verify-offline-wave-matrix.mjs
node scripts/verify-offline-wave-matrix.mjs --repeat
~~~

The command accepts no arguments except the optional literal `--repeat` flag and reads no owner-local task file. A nonzero exit means one of the synthetic scenarios was not verified. Its error message is fixed to avoid inadvertently printing task/session data.

## Fixed scenarios

| Chat arrival sequence | Total simulated sessions | Earlier-owner resume rechecks |
| --- | ---: | ---: |
| 2 | 2 | 0 |
| 10 + 10 | 20 | 10 |
| 5 + 10 + 10 + 15 | 40 | 45 |
| 1 + 39 | 40 | 1 |
| 39 + 1 | 40 | 39 |
| 20 + 20 | 40 | 20 |
| 10 + 10 + 10 + 10 | 40 | 60 |
| 40 waves of 1 | 40 | 780 |
| **Total across eight independent simulations** | **262** | **955** |

Each scenario calls the existing `runOfflineFleetStress` implementation, without a second claim engine. With `--repeat`, all eight scenarios run a second time: each repeat must pass every original safety invariant and produce **exactly the same aggregate simulator report** as its first run. A difference aborts the command before printing a success report. The optional mode reports `repeated_scenarios_verified:8` and `repeat_consistency_verified:true`; ordinary mode reports zero/false. Only 262 distinct scenario-arrival positions are counted (not 524), even though repeat mode performs 16 separate synthetic executions. Repetition is a consistency check of published aggregates, **not proof that hidden per-session assignments are identical across processes**.

Each scenario calls the existing `runOfflineFleetStress` implementation, without a second claim engine. The verifier fails closed unless the result matches its exact declared agent/wave sizes, prior-chat resume count, unique claims and resource partitions, submitted markers, no re-offered submitted task, zero remaining issue/resource locks and zero real GitHub requests. It also requires explicit false assertions for private-ledger verification, real multi-chat proof and automatic merges/deployments. It prints *only* aggregate matrix results.

This matrix is complementary to [the 10+10 continuity rehearsal](OFFLINE_CHAT_BATCHES.md). The independent in-progress state-reopen work (issue #88) can eventually be verified separately; this matrix intentionally does not modify its branch, existing CLI or active simulator.

## Limitations and integration

All eight cases run in a single local Node process against an in-memory mock. They do **not** demonstrate real parallel browser sessions, an external durable database, cross-process GitHub atomicity, safe crash recovery, live permissions or scheduling 40 real ChatGPT chats. No private GitHub identity or token is read, and this tool grants **no** permission to claim or launch live tasks.

Run the native Node suite and inspect the current PR changed-file list and upstream commit before independent review. This work must remain an unmerged stacked draft until validated and explicitly accepted; never use the historical public `coordination/claims` branch for new private coordination records. See [first owner alpha](FIRST_OWNER_ALPHA.md).
