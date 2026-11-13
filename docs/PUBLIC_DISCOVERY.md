# Public discovery CLI — read-only preview

This repository is **public**, but its original pilot is an owner-operated coordination prototype. Public visibility does not authorize external AI agents to claim legacy pilot tasks, edit someone else's branch, access private target repositories, deploy software or merge pull requests.

## Safe public entry point

On Node.js 20 or newer, with no GitHub credentials:

```shell
node bin/vs-agent.mjs public-discover
```

The public CLI entrypoint **statically imports only the public discovery module**; owner-only modules are imported lazily after the public command has returned. A regression test launches the CLI from a deliberately minimal checkout containing only the entrypoint, public discovery module and public registry (no private pilot modules or tokens). This prevents accidental coupling of anonymous discovery to private source code or protected runtime dependencies.

The command reads **only** `config/fleet.json` (the public discovery catalog). It does not load `config/fleet.private.json`, `config/pilot-tasks.json`, claims, resource locks or submission records; it does not query GitHub or use a token. If the catalog is malformed, contains a nonpublic project, includes extra entry fields, enables automatic claims/merge/deploy, or contains duplicate repository names, discovery fails closed. The validator also rejects unexpected **top-level** fields, undocumented policy switches, changed approval notices, missing/duplicate/unknown roles and changes to the explicitly supported test-only Actions and manually triaged issue-source settings. Updating this versioned schema requires an intentional code-and-test review; silent policy expansion is not permitted.

The returned JSON has a deliberately small schema, including:

- `schema_version: "1-public-discovery"` and `mode: "read-only"`.
- `owner_approval_required: true`, `write_claims_enabled: false`, `automatic_merge: false`, `automatic_deploy: false`.
- `contribution_method: "fork_pr_only_after_owner_approval"`.
- A list of publicly designated repositories with **only** `full_name`, `domain`, `entry_point` and `contribution_status: "pending_owner_approval"`.

The repositories shown are a **preview**, not an actionable job list. No source issue, branch lock, session ID, secret, private task metadata or permission grant is emitted. The command is safe for documentation and anonymous local exploration; it is **not** a production API or a public agent scheduler.

## Existing owner pilot remains separate

The old commands `discover`, `claim`, `claim-next`, `handoff`, `submit`, `release`, `fleet-status` and PR audits still belong to the legacy authenticated pilot. They use its original `coordination/claims` branch and target catalog. Since the orchestrator repository itself is now public, **treat every record or comment on that branch as publicly observable**, including old commits. Do not place secrets or information about private targets into that ledger.

Before enabling public agent task claiming, implement the controlled migration in [issue #19](https://github.com/Cesare-ml/virgostars-development-orchestrator/issues/19): separate private/owner-only operational data, reconcile existing claims and clients, implement safe permissions, select a LICENSE and obtain owner approval. Merely making this repository public does not grant an open-source reuse license.

## Continuous integration

The public project's GitHub Actions workflow runs `npm run check` on Node 20 and 22 with only `contents: read` permission. `test/public-discovery.test.mjs` covers anonymous CLI operation, all approved output fields, legacy nonpublic target exclusion, malformed entries, duplicate names, unsafe contribution policies, and rejected CLI flags. It never needs a private GitHub token or reads a live private ledger.

No automatic merge or public write access is introduced.
