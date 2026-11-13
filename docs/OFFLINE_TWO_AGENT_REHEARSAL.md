# Rehearse two VirgoStars developer agents entirely offline

This is a **synthetic, in-memory regression rehearsal**, not a connected multi-chat deployment. It executes the real Node claim/queue/handoff/submission/release and PR scope/collision audit functions against a fake GitHub adapter that enforces exclusive file creation and compare-and-swap SHA updates.

It is useful **before** the separately owner-approved PRIVATE coordination ledger exists. Never enter credentials, production repository IDs, real issue titles or private metadata.

## Run it

On any trusted Windows/macOS/Linux machine with Node.js 20+ and a checkout of the reviewed feature-branch stack:

~~~powershell
node bin/vs-agent.mjs rehearse-two-agents
~~~

No setup or environment variables needed: the command works without GITHUB_TOKEN and ignores VS_PRIVATE_LEDGER_REPO, VS_PRIVATE_TASKS_FILE and other owner-only private options.

## What the command exercises

1. Two independent synthetic agents call the actual claim-next implementation concurrently against two approved synthetic developer tasks in distinct simulated repositories.
2. The code verifies exclusive issue AND resource locks for both agents. A third agent must receive no-task rather than steal any lock.
3. Two synthetic stacked draft PR metadata records are provided, and the agents hand off their exact synthetic PR head SHA through the real handoff function.
4. An overlapping fake third PR is inserted on the first agent's exact approved test file. The actual submission collision audit must block submission and retain the original owner's claim. After removing the mock collision, the same owner submits successfully and releases both locks.
5. The second agent's synthetic submission is persisted, but one simulated GitHub compare-and-swap release fails. The submission marker, claim and resource lock must remain intact until the **same original owner** retries. The retry submits without duplicating a marker and releases both locks.
6. A second injected release fault occurs **after** the issue claim is deleted but before the resource lock is deleted. An identical original-owner `submit --confirm` retry uses the already-persisted, scope-audited submission to recover the orphaned resource; no new claim/marker is created.
7. Two submitted markers remain, no issue or resource locks remain, and a third agent must not be offered already-submitted work.

The output is a compact JSON report with **aggregate figures only**, such as agents_started_in_parallel, independently_claimed_tasks, competing_pr_submission_blocked, original_owner_retry_succeeded, submitted_markers, and remaining_resource_locks. It deliberately includes flags github_requests: 0, real_private_ledger_verified: false and real_multi_agent_pilot_proven: false.

## Guarantees and non-goals

- This does not create a PR, issue, GitHub branch, real task claim, real submission, hosted scheduler, or actual code changes.
- No network activity, tokens, file writes or private data are needed for the simulation.
- Synthetic PR metadata represents a proposed developer PR, **not actually compiled code or a tested GitHub branch**.
- The in-memory adapter models GitHub Contents create-if-absent and SHA compare-and-swap semantics; it does **not** prove atomic safety across live GitHub operations, independent browser chats or multiple machines.
- A successful rehearsal is a useful functional regression check, **not** authorization to turn on the legacy public coordination branch, merge PRs, deploy, onboard public volunteers or run 40 concurrent agents.

## After the rehearsal

Use [FIRST_OWNER_ALPHA.md](FIRST_OWNER_ALPHA.md) to provision and independently approve an owner-only PRIVATE ledger, preserve the seven historical submitted markers and connect a local SHA-approved task catalog. Run [alpha-doctor](ALPHA_READINESS.md) against that **real PRIVATE destination**, then supervise two genuinely independent ChatGPT/Codex developer sessions with disjoint scopes. Compare their actual GitHub issues, draft PRs, test logs, resource locks and submissions; retain owner-controlled recovery procedures. Do not claim a live fleet is proven until this real test passes.
