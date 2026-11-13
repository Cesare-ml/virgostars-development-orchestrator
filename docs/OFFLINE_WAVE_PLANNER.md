# Offline multi-chat wave planner (owner-only)

The standalone `scripts/plan-wave.mjs` command prepares **advisory** assignments for 2–40 ChatGPT sessions, based solely on the owner's existing SHA-256-approved local task catalog. It performs **no network access, GitHub read/write, real claims, resource reservation, merges, deployments or chat launches**. It does not check whether an issue is still open, whether a PR has moved or whether another session is already active.

Run on a trusted local Node.js 20+ machine **after** reviewing the private catalog and recording its SHA-256 with `fingerprint-tasks`:

```powershell
$env:VS_PRIVATE_TASKS_FILE = 'C:\Private\virgostars-tasks.json'
$env:VS_PRIVATE_TASKS_APPROVED_SHA256 = '<exact reviewed 64-character lowercase digest>'
node scripts/plan-wave.mjs --agents 2 --role developer --output 'C:\Private\vs-wave-01.json'
```

The output file must be a **new absolute path outside the public repository**. It is created exclusively and never overwritten. The CLI prints **only aggregate counts**, not file paths, task identities, sessions or private configuration. Keep the JSON output private, protect the destination directory (especially on Windows), and never commit, upload or paste the plan into a public issue/PR. A fresh run creates fresh chat session IDs and does **not** reconcile previous plans.

The planner cycles across repositories, selects only `ready` tasks with the requested role (default `developer`, or use `any` for a mixed wave) and refuses to schedule two write tasks sharing a repository/resource partition. It errors rather than silently shrinking the requested wave. These are **static catalog checks**, not a substitute for live conflict checks.

For each chosen slot, start a separate chat using its unique `session_id`. Before any coding, verify the private ledger activation, current target issue, upstream PR, resource overlap and actual open PR conflicts, then acquire the exclusive resource lock and issue claim with the existing `claim-next`/claim protocol. A planned slot has no priority or authority to claim a busy task. Never reuse a session ID for a different chat. Stop if any live check fails; do not interpret this file as an authorization to activate 40 agents.

The first usable live owner alpha still requires preserving all seven historical submissions in a separately reviewed PRIVATE coordination ledger. Consult `FIRST_OWNER_ALPHA.md`, `ALPHA_READINESS.md`, `OWNER_TASK_QUEUE.md` and the target repository's `AGENTS.md`. This script is a dry-run capacity planning aid only.
