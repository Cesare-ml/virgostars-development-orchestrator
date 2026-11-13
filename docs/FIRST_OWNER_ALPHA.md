# First owner-operated alpha: private ledger activation

**Status: reviewable stacked draft, not merged, deployed or open to public agent writes.** This is a manual GitHub-backed multi-chat pilot, not a hosted scheduler or permission service.

The old coordinator repository is now PUBLIC. Never create another private task claim, resource lock or submission on its historical coordination/claims branch. The code refuses that repository. Public GitHub Actions use synthetic tests only, without a private token or ledger.

## Operator prerequisites (outside this public repository)

1. Independently audit the old public branch and history, and retain a complete verified backup. Check for sensitive metadata or credentials; rotate any exposed credentials.
2. Provision a **separate PRIVATE GitHub repository** under owner control. The orchestrator cannot create it or choose its name. Grant narrowly scoped GitHub permissions to trusted owner-operated sessions.
3. Back up the private repository independently and establish its coordination/claims branch. From a trusted checkout, copy **all seven historical submissions/.../issue-*.json records byte-for-byte** from the frozen public branch into the private branch. Do not copy active claims/resource locks, change existing record bytes, delete old evidence or publish private logs.
4. Freeze the old public branch for coordination, confirm no client continues writing there and independently approve the reconciliation and rollback plan in PUBLIC_TRANSITION.md and OFFLINE_CUTOVER_REHEARSAL.md. The frozen source has zero claims, zero resource locks, seven submitted markers and one README. A source change blocks this alpha until manual review.
5. Store your GitHub token privately with public source and appropriate private ledger read permissions, plus private ledger Contents write permissions for actual task claims. Do not paste tokens or private destination names into public issues, PRs, CI or chat prompts.

To prepare a local record-only comparison backup without manually transcribing seven submitted records, see [VERIFIED_LOCAL_LEDGER_EXPORT.md](VERIFIED_LOCAL_LEDGER_EXPORT.md). The exporter writes only a newly created protected LOCAL file after GitHub GET-only checks; a separate full Git mirror backup and an independently approved private copy-only migration remain mandatory.

Before any manual private copy, use the verified owner-local record backup with the offline, no-write [copy-only plan](OFFLINE_LEDGER_COPY_PLAN.md). It counts seven expected submitted markers and blocks existing different bytes or destination-only records. **This does not transfer records or certify current private GitHub state.**

## Run the read-only activation check

From a trusted checkout of the reviewed stacked feature branch with Node.js 20 or newer:

~~~powershell
node bin/vs-agent.mjs --help
node bin/vs-agent.mjs check-private-destination OWNER/PRIVATE-REPOSITORY
node bin/vs-agent.mjs plan-private-cutover OWNER/PRIVATE-REPOSITORY
node bin/vs-agent.mjs verify-private-activation OWNER/PRIVATE-REPOSITORY
~~~

These commands do not write. The final check requires real private visibility, a stable frozen public ref, an existing verified private branch and **SHA-identical copies of all seven historic submissions**. It rechecks branch references and returns only aggregate readiness: no session IDs, record names, token values or private repository names. Missing/changed historical submissions, public active locks, source drift, malformed Git metadata, missing branch, permissions errors and race conditions block activation.

A passing check is not a migration or automatic owner approval. Actual backups, access review and a controlled client cutover remain mandatory.

## Select the approved private store locally

Only after the owner has approved the reviewed migration, set two matching local variables. Both placeholders must represent the exact same owner-held PRIVATE repository:

~~~powershell
$env:VS_PRIVATE_LEDGER_REPO="OWNER/PRIVATE-REPOSITORY"
$env:VS_PRIVATE_LEDGER_APPROVED_REPO="OWNER/PRIVATE-REPOSITORY"
# Supply GITHUB_TOKEN via a trusted local credential manager.
node bin/vs-agent.mjs fleet-status
node bin/vs-agent.mjs discover
# After configuring the SHA-approved local queue, verify launch readiness:
node bin/vs-agent.mjs alpha-doctor
node bin/vs-agent.mjs session --kind codex
~~~

The duplicated repo name is an explicit operator acknowledgement, **not an authentication secret**. Do not commit it. Every protected CLI invocation performs live visibility and source/submission preservation checks before using the private branch; each ledger operation also verifies private visibility. The legacy default continues to reject the old public repository.

The five original reviewer tasks and two developer tasks are already submitted. Preserving their seven markers means these old READY catalog entries must not become eligible again. Before assigning more development work, review and approve **new** tasks with unique issues and disjoint resource scopes. See [OWNER_TASK_QUEUE.md](OWNER_TASK_QUEUE.md): the operator may keep this queue outside the public checkout and approve its exact SHA-256 locally. Public discovery must never read it. Existing overlapping Charts draft PRs must also be reconciled.

## Launch two independent agent sessions after approved cutover

- Curate two new small non-overlapping issues with explicit role, access, allowed root paths and base PR dependencies. Review these catalog edits in a feature branch; do not automatically dispatch arbitrary issues.
- Give each ChatGPT/Codex conversation its own fresh UUID. Local Codex can run the Node CLI. GitHub-connected ChatGPT can reproduce the claim protocol only with explicitly authorized access to the new private ledger; never use the historic public claim branch.
- The working loop is discovery, exclusive claim, exact resource lock validation, draft PR, actual tests, factual handoff, submitted marker, verified release. Missing locks or overlapping open PRs mean stop, not override.
- Keep reviews, merges, deployments, licenses and releases under human control. Run npm run check and live scope/collision audits before integration.

## Limits

No central API is deployed. There is no transactional multi-resource scheduler, automatic stale-lock recovery, community authentication or proven 40-chat capacity. GitHub Contents API exclusivity is cooperative, not a strong isolation boundary against untrusted writers.

The next acceptance milestone is: independently reviewed private migration, read-only readiness passing against a real private ledger, all seven historic submissions preserved, and **two new disjoint agents** completing the entire claim-to-handoff lifecycle safely.

### Owner-only staging before any private import

Use [OWNER_LOCAL_STAGING.md](OWNER_LOCAL_STAGING.md) after the reviewed record-only export and offline copy plan to prepare exact missing submissions locally, with an explicit reviewed manifest SHA-256 and exclusive, non-overwriting output directory. This command does not write to any GitHub repository or prove live private permissions. Obtain complete Git mirror backups and independently approve any eventual copy into the actual PRIVATE coordination branch.
