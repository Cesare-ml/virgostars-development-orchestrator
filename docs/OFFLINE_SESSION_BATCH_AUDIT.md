# Audit multiple saved offline session batches

**Owner-local, read-only, tokenless.** The companion audit to [OFFLINE_SESSION_BATCH.md](OFFLINE_SESSION_BATCH.md) compares two to twenty saved preparation manifests created by `scripts/prepare-agent-sessions.mjs`. It checks no UUIDv4 coordination label was reused *across* separate batches (even between chat and codex), replays the original prompt generator to reject edited prompts/flags/slots, and enforces at most 40 total prepared sessions.

## Example: two separate waves of ten (Windows PowerShell)

Use a private folder outside the public Git checkout; keep it off GitHub, CI and shared agent chat. Create the folder yourself with appropriate permissions. On PowerShell 7+, use no-clobber output so previously prepared session manifests are not overwritten:

~~~powershell
New-Item -ItemType Directory -Path "C:\VirgoStarsPrivate\sessions" -Force | Out-Null
node scripts/prepare-agent-sessions.mjs 10 chat | Out-File -FilePath "C:\VirgoStarsPrivate\sessions\wave-1.json" -Encoding utf8 -NoClobber
node scripts/prepare-agent-sessions.mjs 10 chat | Out-File -FilePath "C:\VirgoStarsPrivate\sessions\wave-2.json" -Encoding utf8 -NoClobber
node scripts/audit-offline-session-batches.mjs "C:\VirgoStarsPrivate\sessions\wave-1.json" "C:\VirgoStarsPrivate\sessions\wave-2.json"
~~~

For Windows PowerShell 5.1, use `-Encoding utf8` and `-NoClobber` as above; the reader accepts the UTF-8 BOM. Never use shell redirects that silently truncate an existing manifest. Retain prior manifests: re-running the generator does *not* magically preserve earlier output. Inspect each locally and manually copy a distinct initial prompt to each independently launched chat. Do not upload the manifests or session IDs into this PUBLIC repository.

## Output and failures

The success report is aggregate only: number of batches, unique chat/codex IDs, no cross-batch duplicates. It always says `github_requests:0`, `chats_verified_live:0`, `tasks_claimed:0`, `private_ledger_verified:false`, `safe_to_launch:false`, and `owner_review_required:true`. It never prints UUIDs, prompts, absolute file paths or owner-private repository data. Exit 0 means **locally consistent saved files**, not live or authorized sessions. Exit 2 means invalid, missing, modified, duplicate or unsafe input. The CLI deliberately prints only a generic blocker so local paths do not leak. `--help` needs no files.

The audit refuses relative paths, symlink files, directories, checkout-internal files, oversized/corrupt manifests, repeated input paths, modified safety statements, invalid v4 UUIDs, duplicate IDs or more than 40 total sessions. Files must be regular owner-local JSON and should stay under owner-controlled private permissions. It does not compare against manifests that were not supplied, other computers, unrecorded identities, or currently running chats; concurrent edits can still race a separate operator action after the audit. It does not authenticate ID ownership, authorize GitHub work, monitor lock state, grant task access, launch a browser, perform actual claims, merge or deploy.

The private-ledger migration, SHA-approved task queue and live `alpha-doctor` checks in [FIRST_OWNER_ALPHA.md](FIRST_OWNER_ALPHA.md) remain mandatory before any real task claim. For technical regressions run:

~~~powershell
node --test test/offline-session-batch-audit.test.mjs
~~~