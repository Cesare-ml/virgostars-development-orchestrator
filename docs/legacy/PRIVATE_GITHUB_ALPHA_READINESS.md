# Owner alpha: GitHub-only private catalog + live readiness doctor

This optional **GET-only** command composes the vetted PRIVATE GitHub
catalog with the existing exact live \`alpha-doctor\` checks. It is intended
for a manually operated two-ChatGPT-session pilot without distributing a
local owner task JSON file to agent computers. **It is not a scheduler or a
ChatGPT browser/tab launcher**.

## Setup and approval

1. Owner independently confirms the separate PRIVATE ledger and a **full
   independent Git history backup**. The seven historic submitted records
   must remain byte-identical and unassigned.
2. Owner reviews a new catalog proposal privately. The **proposal branch,
   draft PR, or file with proposal status are NOT approved inputs**.
3. Owner independently approves a canonical
   \`owner-catalog/approved.json\` on the **current PRIVATE main** branch.
   The file uses exactly \`1-owner-task-catalog\`, status
   \`owner-curated-local\`, and two or more new, scoped tasks. The exact
   private main commit SHA and exact file SHA-256 require deliberate,
   independent human approval.
4. The owner sets these environment variables in a **trusted private
   runtime** only. Never publish them to the public repository, Actions
   artifacts, issues, PRs or chat messages:

\`\`\`powershell
$env:VS_PRIVATE_LEDGER_REPO = 'OWNER/PRIVATE-REPO'
$env:VS_PRIVATE_LEDGER_APPROVED_REPO = 'OWNER/PRIVATE-REPO'
$env:VS_OWNER_CATALOG_APPROVED_MAIN_SHA = '<reviewed-current-private-main-commit>'
$env:VS_OWNER_CATALOG_APPROVED_SHA256 = '<reviewed-exact-file-sha256>'
# Provide GITHUB_TOKEN privately through the local credential manager.
node scripts/check-private-github-alpha.mjs
\`\`\`

The CLI requires Node.js 20+ **where the owner runs this optional
validation**, not on each ChatGPT agent computer. It reads a private GitHub
catalog and performs actual GitHub read-only checks using the same
\`inspectAlphaLaunch\` doctor already used by the local catalog workflow.
The owner can also reproduce the sequence through an authorized GitHub
connector; **mere connector access does not execute these Node validators**.

## Exact checks

- Two matching owner-selected PRIVATE ledger variables; real private
  visibility, verified historical seven submissions and stable frozen
  source; no public claims.
- Current PRIVATE \`main\` equals the explicitly approved commit; verified
  canonical catalog Git blob SHA-1, raw-byte SHA-256, strict schema, no
  historical task reuse; the main ref is checked again after the doctor.
- Target issues are genuinely open, not PRs. Every developer task has
  an open upstream PR with unchanged branch/HEAD.
- Complete open PR lists and changed paths must not overlap the declared
  write resource scope. No active private claims, resource locks or newly
  submitted tasks. At least two distinct eligible developer partitions.
- Output is aggregate-only. No private repository names, task IDs,
  owner identities, task text, file locations, approved hashes or session
  IDs are printed.

Any missing approval, stale PR, drift, duplicate scope, closed issue,
contended resource or unknown state blocks. A failed readiness check
returns exit status \`2\`; malformed/private API errors also fail closed
without printing sensitive response bodies.

## What success actually means

\`live_readiness_prerequisites_passed: true\` means the current, observed
read-only prerequisites passed. The command **always** reports
\`ready_to_launch:false\`, \`owner_final_launch_approval_required:true\`
and \`work_claimed:false\`. It cannot authenticate the human approval
of a Git SHA, ensure branch protection, certify disaster recovery, or
prevent another independent chat racing the next exclusive resource
creation. It **does not** promote the catalog or grant access.

Only after an independent owner signoff can two authorized agents start
with distinct fresh UUIDs, claim their separate resource partitions
**before** claiming each issue on the PRIVATE ledger, recheck ownership,
produce disjoint draft PRs, run tests, hand off, submit immutable records
and release exactly their own claims. No automatic merges/deployments.

The first two real chats, their failures and lock cleanup must be
measured before expanding to 5–10, 20 or 40 chats. See
\`docs/legacy/MVP_ACTIVATION.md\`, \`docs/legacy/ALPHA_READINESS.md\` and
\`docs/legacy/PRIVATE_GITHUB_OWNER_CATALOG.md\`.

This branch is stacked on the still-draft private GitHub catalog PR,
which is itself stacked on the owner self-task eligibility PR. The
two-task PRIVATE proposal remains unapproved and must never be
silently rewritten as an approved catalog to obtain a green check.
