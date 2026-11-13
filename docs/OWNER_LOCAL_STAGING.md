# Owner-only local staging of missing historical submissions

This is the last **offline file preparation step** before a separately approved, manually performed private-ledger cutover. The command creates a **NEW local directory** containing the exact byte-for-byte historical submitted markers that are missing from an independently reviewed private backup snapshot. It does NOT open GitHub, create a private repository, copy files into a Git repository, perform migration, or authorize any remote change.

## Before you stage anything

Follow [VERIFIED_LOCAL_LEDGER_EXPORT.md](VERIFIED_LOCAL_LEDGER_EXPORT.md) to export and verify the owner's confidential manifest. Run [OFFLINE_LEDGER_COPY_PLAN.md](OFFLINE_LEDGER_COPY_PLAN.md) to inspect the missing/identical/conflicting marker counts first.

The input backup must represent the immutable seven-submission public source and an **existing** PRIVATE coordination branch in the local snapshot. The offline plan must have no conflicts, extra destination-only submissions or active claim/resource records. A separately complete and verified Git mirror backup of both repositories remains mandatory.

The backup itself contains session IDs, issue numbers, repository identifiers and handoff information. Never upload it, its contents, or the staging directory to this public orchestrator, an issue/PR, a public CI job or a chat.

## Windows PowerShell

Keep the local backup and new staging directory OUTSIDE the public Git checkout and all synchronized/shared folders. Set SHA-256 to the **exact reviewed value** printed by the preceding plan-ledger-copy command.

~~~powershell
node bin/vs-agent.mjs plan-ledger-copy "C:\VirgoStarsPrivate\ledger-record-backup.json"
$env:VS_PRIVATE_BACKUP_APPROVED_SHA256="<EXACT-LOWERCASE-64-HEX-CHAR-SHA256>"
node bin/vs-agent.mjs stage-ledger-copy "C:\VirgoStarsPrivate\ledger-record-backup.json" --output "C:\VirgoStarsPrivate\staging-2026-11-13" --confirm
~~~

The staging directory must **not already exist**. Its parent must already exist and have no symlink/junction components; protect it with Windows NTFS ACLs and preferably full-disk encryption. The tool creates directories with owner-only permissions where supported and files with exclusive no-overwrite writes; on Windows verify ACLs yourself.

All staged files appear only in their original relative paths, e.g. submissions/owner__repo/issue-N.json, but **the command does not print these paths**. Files already byte-identical in the local private snapshot are NOT staged a second time. No extra README, ledger metadata, secrets or token files are generated.

## Security and failure rules

- Explicit --confirm and VS_PRIVATE_BACKUP_APPROVED_SHA256 are both mandatory; a changed manifest fails before staging.
- The exact frozen historic public Git commit/tree, seven submission markers and every Git blob SHA are checked again.
- Existing destination records with different bytes, destination-only records, active locks, an absent destination branch or zero missing records block staging.
- Stage destination must be absolute, outside the public checkout, absent, and have no symlinks in its parent ancestry. The original backup is never modified.
- After writing, every staged file is checked for exact original byte length and Git SHA. Errors trigger removal of the newly created staging directory; if cleanup fails, an explicit warning requires manual inspection.
- The JSON CLI report contains aggregate counts and approval digest only. It explicitly says github_requests: 0, remote_import_performed: false, live_private_visibility_verified: false and permission_to_import_granted: false.

## After staging

The private files in the new directory are **not yet imported**. Before an owner-approved copy into a private Git repository, recheck current LIVE private visibility, permissions, branch HEAD, source freeze and existing record hashes. Preserve the original seven markers without overwriting any target file. Run verify-private-activation after the actual authorized copy. Review and activate the local SHA-approved NEW task catalog, then use alpha-doctor and start just two independent developer chats.

A green local staging result is not authorization to skip the real GitHub gates, full Git mirror backup, code review, or manual owner approval. Do not activate the old public coordination branch.
