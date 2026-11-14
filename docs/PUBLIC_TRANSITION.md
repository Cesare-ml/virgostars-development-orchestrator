# Public repository transition and CI boundary

**Status (2026-11-12):** `Cesare-ml/virgostars-development-orchestrator` is **public**. The existing prototype was originally developed as an owner-only private pilot. Public repository visibility **does not** mean that every pilot configuration, coordination marker or planned integration is safe for public distribution, nor that external agents have permission to operate on private target projects.

## GitHub Actions now authorized for public repositories

The owner has authorized GitHub Actions on **public VirgoStars repositories**. This repository uses [Node CI](../.github/workflows/node-ci.yml):

- Triggers: PRs, pushes to `main` and the current feature branch, and manual `workflow_dispatch`.
- Runs the real `npm run check` suite on Ubuntu with Node.js **20 and 22**.
- Uses GitHub-hosted public-source checkout, pinned official `actions/checkout@v6` and `actions/setup-node@v6` commit SHAs, minimal `contents: read` permissions, and `persist-credentials: false`.
- Does **not** use a personal access token, project secrets, private repository checkout, external services, private coordination commands, CI artifacts, workflow writes, deployment, releases, or automated merges.
- Fork PRs must never receive private credentials. Do not change the event to `pull_request_target` or run untrusted PR code with privileged tokens. Changes to workflow permissions or actions need independent review.

**CI result:** a successful workflow run proves the configured Node test job passed at its recorded commit; it does not prove human code review, secure operation against private targets, license clearance or approval to merge.

## Legacy private pilot data in a now-public repository

The existing feature-branch history contains files originally intended for a private pilot, including `config/fleet.private.json`, `config/pilot-tasks.json` and owner-only operational notes. There is also a `coordination/claims` branch that previously stored task claims and submission markers.

**Visibility is repository-wide:** do not assume any file, branch, past commit, issue or operational state inside this public repository remains private. Merely deleting a file from a future commit does **not** remove historical copies, forks or caches. Do not copy operational data from these records into GitHub Actions logs, public registries, new issues or PR comments.

**Owner-controlled migration still required before external onboarding:**

1. Review all accessible branches, Git history and attachments for credentials, private project details and other nonpublic information. If actual credentials were ever committed, rotate them at the provider rather than relying on a deletion. Do not post secrets or sensitive findings in public issues.
2. Create a separate **private** workspace/repository or authenticated backend for operational claims, submissions and owner-only task catalogs, or explicitly choose a public-only task model that does not reference private projects.
3. Make the public repository consume only a public-safe task registry. Keep private target URLs, internal scope labels and owner/session metadata out of public CI and dashboards.
4. Plan the transition of existing claims with a deliberate reconciliation/checkpoint: retain original evidence safely, update clients, verify the new ledger, then retire the public coordination path. Do not automatically delete or overwrite existing claims.
5. Independently review repository licensing and contributor policy. **The public repository currently has no LICENSE file**; visibility by itself does not grant an open-source license or third-party reuse rights.
6. Enable outside contributors only after the owner explicitly approves the public scope and documentation. Public CI does **not** enable public write-task claiming or auto-merge.

The repository's `config/fleet.private.json` and `docs/PRIVATE_PILOT.md` are **legacy owner-only pilot descriptions**, not evidence that the repository itself is still private. Current pilot code has not yet been migrated to a privacy-safe public coordinator.

## Maintainer release and safety policy

Public GitHub Actions for test-only workflows are permitted. The permission **does not** extend to other private repositories without a separate explicit decision. The working rules remain: separate feature branches, bounded changes, independent tests, human review, and **no automatic merge, release, secret exposure or production deployment**.

A PR is not merge-ready solely because both Node matrix jobs are green. Recheck file scope, concurrency claims and public/private metadata before any integration.

## Verified public CI checkpoint — 2026-11-12

GitHub Actions run [43297389118](https://github.com/Cesare-ml/virgostars-development-orchestrator/actions/runs/43297389118), for feature commit `90ab31c32b46e3a7c965705b86df0cf1f9edd6e8`, completed successfully for both Node 20 and Node 22 jobs: **127 tests passed, 0 failed** per version. The log no longer reports deprecated Node 20 **Actions runtime** warnings after upgrading both pinned official Actions to v6 (their own runtime is Node 24). The repository's app/test compatibility matrix deliberately remains Node 20/22.

The CI-only scope is independently protected by `test/ci-policy.test.mjs`; `test/public-registry.test.mjs` checks that public discovery metadata cannot include entries marked nonpublic in the legacy catalog. These checks do not retroactively hide existing git branches/history. The private-state migration in [issue #19](https://github.com/Cesare-ml/virgostars-development-orchestrator/issues/19) is still required before general public multi-agent onboarding.

## First public-only interface (issue #20)

The new `node bin/vs-agent.mjs public-discover` command reads **only** the safe `config/fleet.json` preview and works anonymously without GitHub tokens or network requests. It returns a fixed `1-public-discovery` schema with `write_claims_enabled:false`, owner approval required and no auto merge/deploy. Malformed/nonpublic/unapproved entries are rejected before display. The seven additional native test cases are run automatically on both Node versions by GitHub Actions. See [PUBLIC_DISCOVERY.md](PUBLIC_DISCOVERY.md). This interface is a **read-only stepping stone**, not a migration of past claims, a public scheduler or owner approval for volunteers. Issue #19 remains open until the owner-only ledger is separated safely.

## Legacy CLI visibility preflight (issue #21)

**The legacy owner-only CLI cannot safely operate on this repository's public `coordination/claims` branch.** Before any legacy command runs, the CLI now asks the GitHub REST API for the configured ledger repository's **current** visibility and requires `private:true`, `visibility:"private"` and exact repository identity. Missing permissions, incorrect metadata, public/internal visibility or GitHub errors **stop the command**. Every direct legacy ledger read/write performs a second live check so visibility changing after startup also fails closed. GitHub visibility and Contents writes are not transactional, so this is a safety gate, **not a substitute for a server-enforced private backend**.

The existing `config/fleet.private.json` still names a claim store in this now-public repository. Therefore **legacy `discover`, `fleet-status`, `status`, `claim`, `claim-next`, `handoff`, `submit`, `release` and PR audit commands are intentionally unavailable through this public CLI** until the owner authorizes migration to a truly private claim store and changes the reviewed configuration. `session`, `--help` and tokenless `public-discover` remain available. Do not add an emergency environment bypass or reactivate the public claim store.

This guard protects **only the Node CLI**. GitHub connector agents or direct REST callers bypassing the CLI can still manipulate the public historical branch. Existing historical submissions and previous commit contents remain visible; no file or branch was deleted or migrated. **Stop creating new owner-only claim/submission records in this public repo**. See [issue #19](https://github.com/Cesare-ml/virgostars-development-orchestrator/issues/19) for the owner-controlled private-store migration plan.

## Owner-selected private destination preflight (issue #22)

A new strictly GET-only `node bin/vs-agent.mjs check-private-destination OWNER/REPO` command verifies that a proposed **different** GitHub ledger repository is actually private, checks the `coordination/claims` branch and counts existing private records using Git **tree metadata only**. It returns no private blob contents or paths and never authorizes writes or migration; every outcome requires human reconciliation. This provides a safe step toward issue #19, not a solution for historical public visibility. See [PRIVATE_LEDGER_PREFLIGHT.md](PRIVATE_LEDGER_PREFLIGHT.md).
