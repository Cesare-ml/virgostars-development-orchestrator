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
