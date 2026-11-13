# Offline fleet stress: 2 to 40 synthetic development agents

This is a **bounded, tokenless, single-process simulation**, not a deployed multi-agent platform or a live GitHub concurrency test. It runs the actual Node task queue, issue/resource claim, handoff, scoped PR audit, collision scanner and submit/release functions against an isolated **in-memory** mock GitHub ledger.

## Windows/macOS/Linux usage

From a checked-out reviewed feature stack with Node.js 20+:

~~~powershell
node bin/vs-agent.mjs stress-fleet --agents 2
node bin/vs-agent.mjs stress-fleet --agents 10
node bin/vs-agent.mjs stress-fleet --agents 40
~~~

Omitting the flag runs a 40-agent simulation. Only whole agent counts from 2 through 40 are accepted. No token, private repository, GitHub setup or local catalog is read or required; credentials and owner task environment variables are intentionally ignored.

## What is exercised

- N independent synthetic developer sessions compete simultaneously for N curated tasks, spread over five **fictional** repositories, each with a distinct issue and resource scope
- Only one session may own an issue or a resource; every successful claim must be unique; three extra contenders must all report no-task while the slots are occupied
- Each owner performs a synthetic handoff with its exact draft PR head SHA, then the existing live-code PR scope/collision audit path and submission code executes against **mock** metadata
- Every task ends with a submitted marker and zero lingering issue or resource locks; subsequent contenders cannot reassign any submitted work
- The tool refuses malformed sizes and prints only aggregate counts, never session IDs, file paths or repository names

The command exits successfully with verdict synthetic-stress-pass only when all assertions pass. A failed check raises an error and exits nonzero. Public GitHub Actions runs 2, 5, 10 and 40 agent scenarios using synthetic fixtures on Node 20/22.

## Strict limits

The mock's exclusive create and compare-and-swap behaviors execute **inside one Node process**. No actual GitHub Contents writes, network latency, API conflicts, rate limits, simultaneous independent browsers, durable crash recovery or private repository permissions are tested. No real PRs, source commits, deployments, releases or merges are created. The stress result reports real_github_requests=0 and real_multi_chat_concurrency_proven=false explicitly.

This synthetic load does **not** authorize a 40-chat deployment. Start a genuine owner-held pilot with **two chats first** only after the privacy-preserving cutover in [FIRST_OWNER_ALPHA.md](FIRST_OWNER_ALPHA.md), a vetted private local task queue in [OWNER_TASK_QUEUE.md](OWNER_TASK_QUEUE.md) and a green [alpha-doctor](ALPHA_READINESS.md) readiness report. Review real PRs and lock ownership independently, and expand gradually only after observed live GitHub results.

For collision and interrupted-release recovery specifically, first run [rehearse-two-agents](OFFLINE_TWO_AGENT_REHEARSAL.md).
