# Private ledger destination preflight (read-only)

This is a preparatory tool for [issue #19](https://github.com/Cesare-ml/virgostars-development-orchestrator/issues/19), the owner-controlled separation of historical coordination data from the **public** VirgoStars Development Orchestrator. It is **not** a migration, an approval to create a private repository, or an instruction to reopen the legacy owner-only CLI.

## Usage

On a trusted local checkout with Node.js 20+ and a GitHub token configured **locally** with the minimum read access necessary to inspect a proposed private repository:

```powershell
node bin/vs-agent.mjs check-private-destination OWNER/PRIVATE-REPO
```

Never paste the token or private GitHub repository data into ChatGPT, a public GitHub issue, CI output, logs or documentation. The public GitHub Actions workflow runs only synthetic mock tests for this code and does **not** receive any private credential.

## What the command verifies

1. The proposed ledger is a **different** GitHub repository from the public orchestrator, with an exact recognized repository name.
2. Its actual GitHub metadata reports `private: true`, `visibility: "private"`, and a matching `full_name`, and the repository is not archived or disabled. Any GitHub 403, 404, malformed response or visibility mismatch fails closed.
3. The `coordination/claims` branch either does not yet exist or resolves to a valid pinned Git commit/tree.
4. If the branch exists, the tool inspects **only tree metadata**, not claim/resource/submission blob contents, and returns **counts** by kind plus `unclassified_blobs`, never private filenames, records, IDs, target names, tokens or SHA values. An optional root `README.md` is permitted as a bootstrap file. Other blobs outside `claims/`, `resources/` and `submissions/` count as unclassified, so a branch containing only foreign files is **not** reported as empty.
5. It checks private visibility again after the scan to detect visibility changes during a run.

The output is a constrained `1-private-destination-preflight` JSON object. It always contains:

- `ready_to_migrate: false`
- `write_enabled: false`
- `requires_owner_reconciliation: true`

Possible statuses are `private_branch_needs_setup`, `empty_branch_needs_owner_approval`, and `existing_records_need_reconciliation`. An activation verification additionally rejects any nonzero `unclassified_blobs`, even when all seven historical submissions are intact. All require an explicit human decision. **A successful preflight does not authorize writes, branch creation, migration or public volunteer task claiming.**

## Next migration gates

A maintainer must select and provision the private destination, independently review ownership and GitHub permissions, reconcile historic claims/submissions from the old **public** branch with its existing records, ensure all agents use the approved private store, and obtain a signed-off cutover plan. Legacy history remains public and cannot be made confidential merely by deleting files from a later commit. If secrets are found in history, rotate them at the provider.

The existing legacy CLI still refuses the public ledger, and this preflight does **not** bypass that safeguard. No automatic transfer, deletion, merge, deployment or license change is performed.

## Testing

The companion `test/private-ledger-preflight.test.mjs` uses fabricated repository metadata. It checks fail-closed authorization and visibility, SHA/tree consistency, duplicate paths and unsupported objects, no private blob retrieval, read-only GitHub GET requests, no-token public CLI behavior and blocked unauthorized commands. It is included in the public Node 20/22 GitHub Actions suite. Running synthetic tests does not prove that a specific private destination exists or is suitable.
