# Offline copy-only plan for seven historical submissions

This owner-only command performs a **local, read-only comparison** of an already exported record backup. It plans which immutable historical submissions still need to be copied into an independently approved PRIVATE GitHub coordination ledger. **It does not copy anything, access GitHub, approve a migration or change any files.**

## Windows steps

First complete the approved preparation in [VERIFIED_LOCAL_LEDGER_EXPORT.md](VERIFIED_LOCAL_LEDGER_EXPORT.md). Keep both the exported record backup and a **complete independent Git mirror backup** in a trusted private location outside the public Git checkout.

With Node.js 20+:

~~~powershell
node bin/vs-agent.mjs plan-ledger-copy "C:\VirgoStarsPrivate\ledger-record-backup.json"
~~~

No GITHUB_TOKEN or owner environment variables are needed. The command only reads the indicated local file, validates every record's Git blob bytes and emits a **small summary**: the manifest SHA-256 fingerprint, already-identical submissions, missing submissions, conflicts, extra target records and blocker codes. It does not print private repository names, session IDs, issue numbers, file paths or record contents.

### Interpretation

- **7 to copy, 0 identical:** valid expected case when a new PRIVATE coordination branch already exists but contains no submitted markers. This does not mean the seven records have been copied.
- **3 to copy, 4 identical:** partial byte-exact staging; missing markers can be preserved without overwriting the four identical records. Re-run live privacy/branch checks before any approved import.
- **0 to copy, 7 identical:** the *local backup* indicates complete record preservation, but only a fresh live GitHub verification such as verify-private-activation can confirm the actual remote state.
- **Different bytes on an existing submission path:** fail with DIFFERENT_BYTES_AT_EXISTING_SUBMISSION_PATH. Never overwrite the existing marker without explicit manual reconciliation.
- **Additional destination-only submissions:** fail with UNREVIEWED_DESTINATION_ONLY_SUBMISSIONS. The destination may contain independently started work, and automatic import could collide with it.
- **Private branch does not yet exist:** exit 2, blocker PRIVATE_COORDINATION_BRANCH_NOT_YET_CREATED. The tool never creates the branch. The owner must establish it separately after review.

The planner enforces the immutable historical public Git commit AND tree identity, exactly seven historical submissions, no active source or destination lock records, valid Git hashes for every record, valid submission state and correspondence between its target repository/issue number and filename.

### Independent seven-blob checkpoint binding

The **file/CLI entry point** also verifies a fixed SHA-256 commitment over the **seven exact Git path + blob-SHA pairs** from the public historical tree `892d39e23da8f6b4b16c9f2a8099df717b4221e7`. The commitment was calculated from that independently inspected Git tree, not from the local backup. Each path is case-normalized and each line is `path:git_blob_sha` followed by LF, sorted lexically, before hashing.

This prevents an internally self-consistent but invented seven-submission backup from passing merely by asserting the expected public commit and tree SHA. A mismatch exits 1 without printing record identities. Synthetic examples may still pass the pure `planCopyOnlyImport()` comparison helper; **only the owner-facing `planLocalCopyOnlyImport()` / CLI enforces the external historic-blob commitment**.

The stronger local check does **not** establish live public/private branch stability, current repository permissions, a complete Git mirror backup or migration approval. Only a fresh separate authenticated read of the actual repositories can establish live state. Public test fixtures include path/SHA metadata, not record contents or session identifiers.

It returns exit 0 for a conflict-free *offline plan* and exit 2 for review blockers; invalid file contents, mismatched checkpoint or unsafe filesystem paths exit 1. Exit 0 is **not** a migration authorization or evidence that remote GitHub is ready.

The backup input must be an absolute local regular JSON file outside this public checkout. Symlinks, oversized/malformed files, tampered Git blobs and changed files during the read are rejected. The planner leaves the input unchanged and creates no output files.

## After planning

The next phases are separate and still require your active review:

1. Independently validate full Git repository backups, historical public branch freeze and the current PRIVATE repository visibility, ACLs, active locks and branch HEAD.
2. Approve a copy-only transfer of the required missing submissions *byte for byte*, without deleting or overwriting source files and without silently reactivating any old READY tasks.
3. Run verify-private-activation against the live PRIVATE branch; stop on any missing SHA, unexpected record, changed Git HEAD or access failure.
4. Activate the separate SHA-approved owner task catalog, run alpha-doctor, then test just **two real developer chats** with exclusive claim/submit/release before considering 40.

The public repository contains only this checker and synthetic test records. Never commit, publish or paste the actual local backup.
