# GitHub Organization repository migration (owner-controlled)

This guide covers **repository ownership transfers**, not the Orchestrator's experimental public-to-private coordination ledger cutover. The two must remain separate.

## Mandatory identity checks

1. Record the **exact target organization login**. GitHub usernames and organization names share a global namespace: a similarly named personal account is not the organization.
2. Authenticate the source owner using GitHub CLI. Confirm that GitHub resolves the target as `type: Organization`, record its numeric ID, and verify the source account has `role: admin` and `state: active` in that organization.
3. Before transfer, record each repository's canonical full name, numeric ID, visibility, default branch, existing PRs, protections and installed integrations. Keep private inventories and tokens outside this public repository.
4. Stop for any owner/type mismatch, permission error, repository name collision, unexpected visibility or unverified destination. A GitHub 404 may also mean an inaccessible private repository.
5. A GitHub App installed on a personal account is **not automatically installed on the destination organization**. Plan its installation and permissions separately.

### Read-only GitHub CLI examples

Run from an authenticated maintainer environment. Replace TARGET_ORG with the *verified* organization login; do not guess it from the VirgoStars brand.

```shell
gh auth status
gh api user --jq '.login'
gh api orgs/TARGET_ORG --jq '{login: .login, type: .type, id: .id}'
gh api user/memberships/orgs/TARGET_ORG --jq '{state: .state, role: .role, org: .organization.login}'
```

Do not transfer anything if these checks fail. Once the correct organization is authorized, carry out a separate read-only repository-ID preflight. Never commit private repository lists into the public Orchestrator.

## Controlled transfer sequence

1. Freeze affected automated writes and identify any active agent PRs or locks.
2. Start with one low-risk public repository. Use GitHub's official **Transfer ownership** flow, without making a clone or a new GitHub repository.
3. Verify that canonical owner, repository ID and visibility match the approved plan before continuing.
4. Recheck pull requests, branch rules, Actions environments/secrets, webhooks, GitHub Apps, Pages, packages, external links and build integrations. Redirects preserve many links but do not repair every dependency or permission.
5. Transfer subsequent approved repositories one at a time, checking each independently.
6. Update local Git remotes and repository references only after verifying the canonical transferred repository. Historical links to unrelated personal repositories must remain unchanged.
7. Reconnect agents and resume schedules only after testing permissions and repo paths.

Do not make private repositories public as part of this process. No deployment, automatic PR merge, production migration or private coordination-ledger write is authorized by this document.

## Separate public/private safety gate

The Orchestrator is currently a public repository with a separate planned private coordination destination. This repository transfer must **not** implicitly move, resume or publish coordination claims, locks, agent secrets or private user data. See the open privacy/cutover issues and review the stacked draft PRs before any Orchestrator ownership change.

**Status:** preflight code and tests proposed on a draft PR; no repositories transferred, no destination selected, no integration reconfigured.


## Runnable read-only gate

The repository includes an independently testable Node.js pre/post transfer identity checker. It only invokes GitHub CLI **GET** endpoints. The expected repository ID and visibility must be supplied explicitly, and an Organization-type account with active owner membership must be verified before a transfer can be considered.

Requirements: Node.js 20+, GitHub CLI, authenticated maintainer account with access to the organization and all its repositories. Do not paste secrets or private repository names into public issues.

For the first proposed source repository, after replacing `EXACT_ORGANIZATION` with the **actual verified Organization login**:

```powershell
gh auth login --web --scopes repo,read:org
node scripts/transfer-readonly-gate.mjs --org EXACT_ORGANIZATION --repo astrological-assets --id 1451635822 --visibility public --stage pre
```

A zero-blocker report only means `ready_for_manual_transfer: true`: **it does not transfer anything or authorize a transfer**. It checks the authenticated user, organization type/ID, active organization-owner membership, source repository ID, visibility, administration access, and fully paginated accessible organization-repository listing for name collisions. If any read fails, the process blocks; a bare 404 is not taken as proof that a private repository is absent.

After the owner executes a separately reviewed manual transfer of this specific repository, run the same command with `--stage post`. That check compares the destination's canonical owner, numeric repository ID, visibility and administrative permission. Do not continue with other repositories until the previous one passes and GitHub App access, dependencies, branch rules and CI have been reviewed.

Run local synthetic unit tests:

```powershell
node --test test/transfer-readonly-gate.test.mjs
```

**Limitations:** local synthetic tests do not establish live GitHub credentials, prove complete repository visibility, or authorize an Organization transfer. This checker makes no attempt to update Git remotes, branch protections, automation tasks or the separate private coordination ledger.
