# Owner-local verified ledger export

**Record-only local backup, not a migration, full Git mirror, deploy or private repository creation.** This GET-only command reads the frozen historical Git records from the now-PUBLIC orchestrator and an independently owner-controlled PRIVATE destination, verifies each exact Git blob SHA, and creates a new protected JSON file on your own computer. It never writes to GitHub.

The public source history remains public: copying the old records elsewhere cannot undo exposure of historical data. Separately audit public history and rotate any exposed credentials.

## Preconditions

1. Provision a **PRIVATE** GitHub repository under owner control and grant a minimally scoped private read token. Never use the public orchestrator repository as the destination.
2. Review the private-ledger preflight, cutover plan, and FIRST_OWNER_ALPHA.md. Freeze old public coordination/claims writes. The approved public checkpoint must contain seven submitted records and zero active claims/resource locks.
3. Make a protected local directory **outside** the public source checkout and all public CI workspaces. It must already exist and must not be a symlink. Protect it with appropriate Windows ACLs and disk encryption.
4. Obtain separate **complete Git mirror backups** of both repositories. The record-only JSON manifest from this command is not a full Git repository backup.

## Windows PowerShell

Replace the placeholders with the *same exact private repository* and use a fresh output filename that does not exist.

~~~powershell
$env:VS_PRIVATE_LEDGER_APPROVED_REPO="OWNER/PRIVATE-REPOSITORY"
# Supply GITHUB_TOKEN through your trusted local credential manager.
node bin/vs-agent.mjs check-private-destination OWNER/PRIVATE-REPOSITORY
node bin/vs-agent.mjs export-verified-ledger OWNER/PRIVATE-REPOSITORY --output "C:\VirgoStarsPrivate\ledger-record-backup.json" --confirm
node bin/vs-agent.mjs rehearse-private-cutover "C:\VirgoStarsPrivate\ledger-record-backup.json"
~~~

The export requires a matching local environment acknowledgement and an explicit --confirm. This confirms only creation of a **LOCAL** output file containing real historical session/handoff records and possibly existing private destination records. Never paste this JSON file, its private record contents, local path, GitHub token or session IDs into ChatGPT prompts, GitHub PRs/issues or public CI.

An absent private coordination/claims branch is represented with null HEAD and tree values and an empty destination inventory, but only after real private visibility checks and repeated absence verification. Existing private records are exported for offline comparison; active destination claims/resources are forbidden until reconciled.

The output is compatible with the existing offline rehearsal backup schema. New files are created exclusively (no overwriting) with owner-only mode where available. On Windows, check the actual NTFS ACL and keep the backup outside cloud sync and shared directories.

## Safety properties

- Public source identity and immutable historic checkpoint are checked, with exactly seven submitted records, no active source locks and no unexpected blob inventory.
- Private repository visibility, branch inventory, metadata and current active locks are checked before exporting.
- Every Git record's raw bytes must reproduce its declared Git blob SHA-1, size, canonical base64 and valid UTF-8 JSON; submissions must have submitted state.
- The output is validated through the existing offline manifest-integrity verifier before saving, and both branch refs/visibility are checked again after reading.
- Output must be an absolute JSON path outside the public checkout, with existing files and symlinked parents rejected. No GitHub write API is involved.
- CLI stdout is aggregate-only. Actual local backup bytes may contain sensitive identities and must remain confidential.

The normal report always states full_git_repository_backup:false, github_writes:0, migration_performed:false and ready_to_cutover:false. This is intentional.

## Next step

With independently verified full backups and the record-only manifest, perform a separately approved **copy-only** transfer of all seven historical submissions byte-for-byte to the new PRIVATE coordination/claims branch. Then use verify-private-activation, load the SHA-approved owner local task queue, run alpha-doctor and supervise two real agent sessions. Never re-enable legacy public ledger writes to shortcut the process.

## Offline copy-only review before any authorized transfer

Once the record-only backup is locally present, run `node bin/vs-agent.mjs plan-ledger-copy ABSOLUTE_BACKUP.json` as documented in [OFFLINE_LEDGER_COPY_PLAN.md](OFFLINE_LEDGER_COPY_PLAN.md). This verifies that the seven historical submitted records have exact byte identities, counts precisely which submissions are missing/identical in the **local** destination snapshot, and blocks conflicting/extra markers. It makes **no GitHub requests or writes**. A green local comparison cannot replace independent live private-ledger verification and explicit owner cutover approval.
