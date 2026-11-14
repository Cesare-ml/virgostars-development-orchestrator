# GitHub-pinned PRIVATE owner catalog: no local task JSON

This optional **read-only** alpha preflight is for the owner who wants
ChatGPT-connected agents to receive **new**, explicitly approved VirgoStars
tasks (including orchestrator self-development) without distributing a local
JSON file or downloading it onto the agents' computers.

It does **not** replace the privately approved queue in the current CLI,
provide a hosted service, automatically open chats, establish an exclusive
claim, or prove that an owner truly reviewed a commit. Security still depends
on owner-controlled GitHub permissions and a reviewed PRIVATE main branch.

## Two independent approvals; no candidate becomes ready on its own

1. Prepare a task proposal only in the **separate PRIVATE coordination
   repository**, never on the public source's historic coordination branch.
   Do not merge the proposal until reviewed. A proposal with
   `status: "proposal-awaiting-owner-approval"` is intentionally
   **invalid** as an executable catalog.
2. The owner reviews the tasks, checks original historic submissions
   remain intact, verifies the upstream PRs and path scopes and approves
   **two disjoint tasks**. On a separately reviewed private PR, publish
   **exactly** `owner-catalog/approved.json` with the strict existing
   envelope: `schema_version: "1-owner-task-catalog"`,
   `status: "owner-curated-local"`, and
   `tasks: [...]`. Do not put any token, session or claim record there.
3. The owner merges that reviewed PR to PRIVATE `main` under
   owner-controlled write restrictions. Separately record the **exact private
   main commit SHA (40 hex)** and the **SHA-256 of the exact UTF-8 JSON file
   bytes (64 lowercase hex)**. These are explicit, independently reviewed
   inputs, not values the agent may invent, guess, or accept from a different
   branch. A SHA pins bytes, **not identity/authorization**; unprotected private
   main or broadly shared write credentials invalidate the intended trust.
4. The read-only inspector verifies the actual current private main HEAD
   equals the approved SHA, reads its pinned Git tree, checks one canonical
   ordinary-file blob at `owner-catalog/approved.json`, validates
   canonical base64, Git SHA-1 and independently approved SHA-256, parses the
   same curated task schema and rejects all seven historical submitted tasks.
   It also runs the existing private-ledger activation check **before and after**
   that inspection, including exact preservation of the seven historic
   submissions. Any movement or mismatch requires a new independent review.

## Optional read-only CLI (owner or remote operator, not every agent)

With Node.js 20+ in a trusted runtime and a privately configured GitHub
credential:

```powershell
$env:VS_PRIVATE_LEDGER_REPO = 'OWNER/PRIVATE-LEDGER'
$env:VS_PRIVATE_LEDGER_APPROVED_REPO = 'OWNER/PRIVATE-LEDGER'
$env:VS_OWNER_CATALOG_APPROVED_MAIN_SHA = '<owner-reviewed-exact-private-main-commit>'
$env:VS_OWNER_CATALOG_APPROVED_SHA256 = '<owner-reviewed-file-sha256>'
# Keep GITHUB_TOKEN in a private credential manager; never post it publicly.
node scripts/check-private-github-catalog.mjs
```

This command is read-only and emits only aggregate counts, safe boolean
checks and explicit remaining requirements. Failure is exit code 2 with a
generic error. It must **not** print task titles, commit SHAs, file hashes,
private repository names, paths or credential values.

## ChatGPT with GitHub connector and no PC installation

A connected ChatGPT chat may use authorized GitHub **read** tools to inspect
the pinned PRIVATE `main` commit, inspect the approved task file, verify
the requested task, its target issue, upstream PR and GitHub changed files,
and propose an exact next step. No local JSON download is necessary.

However **a chat must not interpret the presence of a catalog file as
exclusive authorization**. Owner must explicitly authorize the chosen
catalog checkpoint; connector-only chats do not automatically execute this
Node validator. Before any code change, they must independently enforce
private ledger visibility, seven historic immutable submissions, task/PR
freshness and **resource-first exclusive creation** on the PRIVATE
`coordination/claims` branch. A 409/422 or uncertain create means
**no ownership**, and overlapping scope means stop. Avoid publishing private
catalog contents, session IDs and approval hashes in public issues/PRs.

Actual live workflow: **owner approval → approved catalog on PRIVATE main →
GET-only readiness and collision checks → owner authorizes a two-chat pilot →
distinct session IDs → resource lock → issue claim → scoped draft PR → real
tests → factual handoff → immutable private submission → checked release →
independent review**.

## Current strict limits

- This component is a **verification building block**, not a running
  remote allocator or an OAuth authentication service.
- It does not update the current local-only `loadOwnerTasks` CLI
  selection, and does not mark `ready_to_launch` true.
- GitHub's Contents API cooperative creation is not a transactional
  multi-resource lock and does not automatically reclaim stale locks.
- The first live trial has not been proven; no increase to 20, 40 or
  100 concurrently working chats follows from synthetic or CI success.
- The existing private proposal for the first two tasks remains an
  **unapproved draft** until the owner reviews and promotes it.
