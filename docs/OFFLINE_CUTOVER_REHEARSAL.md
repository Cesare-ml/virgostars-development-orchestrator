# Offline ledger backup rehearsal — no migration writes

This increment is stacked on draft [PR #25](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/25), under the owner-controlled migration [issue #19](https://github.com/Cesare-ml/virgostars-development-orchestrator/issues/19).

It compares copies of **local, owner-provided, record-only** Git ledger backup files. It is not a backup creation tool, live GitHub validation, private repository provisioning, data migration, restore execution or permission to deploy.

## Local command

Use a trusted Windows/macOS/Linux computer with Node.js 20+:

```powershell
node bin/vs-agent.mjs rehearse-private-cutover .\local-private-backups.json
```

No `GITHUB_TOKEN` is needed; the command **never contacts GitHub, writes to a repository, or creates/edit/deletes any local backup**. Run it on the machine holding the backups; **do not upload the backup JSON to ChatGPT, this public GitHub repository, a GitHub Action, an issue or a pull request**.

A local backup manifest is a JSON object with *exactly* the following shape (values shown are placeholders, not valid blob hashes or real backup data):

```json
{
  "schema_version": "1-offline-ledger-backups",
  "source": {
    "repository": "Cesare-ml/virgostars-development-orchestrator",
    "head_sha": "40-character lowercase commit SHA",
    "tree_sha": "40-character lowercase Git tree SHA",
    "records": [
      {
        "path": "submissions/placeholder/issue-1.json",
        "git_blob_sha": "40-character lowercase Git blob SHA",
        "content_base64": "base64 of the exact JSON file bytes"
      }
    ]
  },
  "destination": {
    "repository": "owner/private-github-ledger",
    "head_sha": null,
    "tree_sha": null,
    "records": []
  }
}
```

The source head and tree are **claimed by the locally supplied manifest**, not authenticated by this offline command. A destination without a branch uses `head_sha:null`, `tree_sha:null` and **no records**. If its branch exists, both hashes must be valid SHA-1 IDs and the records must be separately exported.

The manifest must be assembled and retained privately by the owner. An owner-local **record-only** authenticated blob exporter is now proposed in [VERIFIED_LOCAL_LEDGER_EXPORT.md](VERIFIED_LOCAL_LEDGER_EXPORT.md). It verifies individual source/destination blob provenance and writes a private local manifest, but it is **not** a complete Git tree or repository mirror backup. A separately verified full Git mirror remains mandatory. The rehearsal only understands the record partitions `claims/`, `resources/` and `submissions/`; **other tracked files and historical Git commits are NOT included** in these record-only exports.

## What is verified

- Strict schema, repository identities, canonical record paths, no case-insensitive duplicates, bounded file count and size.
- Every record's decoded bytes match its **Git blob SHA-1** exactly (using Git's `blob {length}\0{bytes}` representation), and contain a valid JSON object.
- Source/destination record paths are compared **only in local memory** to count identical blobs, would-copy entries, conflicting same-path contents and destination-only entries. The command outputs **no record paths, object contents, private repository names, issue numbers or tokens**.
- Active source claims/resource locks, missing submissions, conflicting entries and unmatched destination entries appear as distinct blockers.
- The input is a bounded regular file. The reader refuses symlinks/unsafe paths and will not read a file larger than 2 MB.

The program always reports `ready_to_migrate:false`, `writes_enabled:false`, `migration_performed:false` and `rollback_performed:false`. It also reports `live_head_verified:false`, `full_backup_verified:false`, and `private_visibility_verified:false`: no offline manifest can replace independent live GitHub provenance and inventory verification.

## Mandatory human migration and rollback phases

1. Independently verify live source and target repository visibility, ownership, permissions, commit and full Git tree hashes. Obtain a **complete immutable backup**, not only the record-only export.
2. Freeze new claims and submissions, verify no agents hold locks and reconcile every identifier, record collision and destination-only entry.
3. After owner approval, **copy into staging without deleting the old source**; validate both blob integrity and record identities before any client cutover.
4. Take a separate backup of client settings. Switch clients to the private store only after explicit approval; run smoke tests and verify every agent uses the intended backend.
5. If checks fail, **restore the previous client configuration** and keep both original ledgers intact. Do not automatically delete, overwrite, reset or force-push either repository.
6. Only after independent audit and an agreed retention plan may the owner decide how to archive the historic source. Public Git history cannot be made secret retroactively by deleting recent files.

No actual destination has been selected or accessed by this feature. Green public CI jobs use **synthetic backup fixtures only**, with no private GitHub credentials, data, paths or network fetches. The [cutover comparison plan](PRIVATE_CUTOVER_PLAN.md) and [destination preflight](PRIVATE_LEDGER_PREFLIGHT.md) remain separate read-only steps.
