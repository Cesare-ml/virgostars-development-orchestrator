# First alpha — read-only launch readiness check

The owner-operated Alpha uses a **separate PRIVATE** coordination ledger and a **locally approved** task queue. The new command checks whether conditions for a two-developer pilot have been met. It **never claims a task, edits a PR, publishes a record, migrates history, merges or deploys**.

For a tokenless, synthetic two-agent claim→submit→release regression check before the private ledger is ready, see [OFFLINE_TWO_AGENT_REHEARSAL.md](OFFLINE_TWO_AGENT_REHEARSAL.md). That rehearsal cannot substitute for this live readiness gate.

## Preflight steps on Windows

1. Follow [FIRST_OWNER_ALPHA.md](FIRST_OWNER_ALPHA.md). Independently provision and review a PRIVATE GitHub coordination repository, reconcile the historical seven submitted markers **byte-for-byte**, and verify the frozen public ledger no longer has active claims.
2. Keep new owner tasks outside the public checkout, following [OWNER_TASK_QUEUE.md](OWNER_TASK_QUEUE.md). For the first two-developer pilot, curate at least **two distinct open development issues**, each explicitly `status: ready`, `role: developer`, `access: write`, with exact nonoverlapping file scopes and actively open upstream PRs. Never reuse the original seven completed issue identities.
3. Use a trusted local terminal, privately configure a minimum-scope GITHUB_TOKEN and the following environment variables (replace all placeholders with values from your own controlled environment):

~~~powershell
$env:VS_PRIVATE_LEDGER_REPO="OWNER/PRIVATE-REPOSITORY"
$env:VS_PRIVATE_LEDGER_APPROVED_REPO="OWNER/PRIVATE-REPOSITORY"
$env:VS_PRIVATE_TASKS_FILE="C:\VirgoStarsPrivate\owner-tasks.json"
$env:VS_PRIVATE_TASKS_APPROVED_SHA256="<SHA256-OF-EXACT-APPROVED-LOCAL-FILE>"
node bin/vs-agent.mjs alpha-doctor
~~~

The command does not print task names, private repository identities, session IDs, record paths or commit hashes. It reports an aggregate count and neutral blocker codes with status:

- ready_for_manual_pilot: true only if the private ledger has been independently verified, the seven historical submissions are preserved, there are no active claims/resource locks, there are at least two open issues, two nonoverlapping eligible **developer** scopes (two tester tasks, or one tester and one developer, are insufficient), no competing open PRs touching those scopes, and no completed new task is being silently re-offered. Every curated repository must also exist exactly once in the approved private-pilot fleet and have `pilot_enabled: true`.
- ready_for_manual_pilot: false with blockers when a reviewed requirement is missing. Exit status is 2. A malformed or unauthorized GitHub response fails closed with status 1.
- `TWO_ELIGIBLE_DEVELOPER_TASKS_REQUIRED` means fewer than two distinct developer write partitions passed the live issue/PR/head checks; `write_tasks_without_pr_overlap` may still count eligible tester write tasks. Use `eligible_developer_tasks` and `independent_developer_partitions` to distinguish them. A task that is not `ready` is rejected before GitHub access.
- The doctor rejects missing, malformed, duplicated, disabled or unlisted fleet repository entries **before making a GitHub request**. These checks use the locally reviewed `active_repositories` configuration, not user-supplied issue text; they do not change permissions or enable any repository.
- The local queue must be approved with an exact SHA-256. A changed or missing catalog is blocked *before* any GitHub API access; an absent or public owner-only ledger is always rejected.

Example aggregate fields (not a real current fleet result):

~~~json
{
  "schema_version": "1-owner-alpha-doctor",
  "mode": "read-only",
  "ready_for_manual_pilot": false,
  "configured_tasks": 2,
  "blockers": ["TWO_DISJOINT_WRITE_TASKS_REQUIRED"],
  "work_claimed": false,
  "merge_authorized": false
}
~~~

## When the result is green

A passing doctor is **not an exclusive task reservation**. Two agents can still race between the report and the first claim. Every agent must re-check its own issue, resource scope and live PR inventory, then exclusively create its private resource and issue lock in the correct order before writing code. Use the same session ID when continuing an existing chat, never share one ID between chats.

Start just two disjoint development chats, have them create draft stacked PRs and report actual test results, then save the handoff, submit and release their respective locks. Have an independent maintainer check PR evidence and collisions before any integration decision. Do not add 40 agents on the basis of green static tests.

## Privacy and CI boundary

The public Node CI runs entirely with synthetic fixture data and no private GitHub token. The owner-only doctor requires actual live GitHub read permissions when used on the operator's local machine. Neither it nor the public repository is a hosted scheduler or authentication service. Never paste private ledger files, local catalog JSON or access tokens into GitHub issues/PRs or chat prompts.

If the private ledger does not yet exist or access has not been approved, **no live launch is authorized**; it is safe to run the offline fingerprint command and review synthetic tests in the meantime.
