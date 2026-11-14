# Read-only owner backup-reference checkpoint

This optional operator-only check compares the **exact Git commit identity** of
a reviewed backup branch with the active private coordination ledger. It runs
the existing private activation verifier first, including byte-for-byte
preservation of the seven historical submissions. It rejects a changed
branch ref, active private claim, incorrect private visibility or a backup
that does not match the active coordination commit.

From a trusted Node.js 20+ checkout, use a private credential manager and
set these variables **only in your local shell**:

```powershell
$env:VS_PRIVATE_LEDGER_REPO = 'OWNER/PRIVATE-REPO'
$env:VS_PRIVATE_LEDGER_APPROVED_REPO = 'OWNER/PRIVATE-REPO'
$env:VS_PRIVATE_LEDGER_BACKUP_REF = 'backup/reviewed-checkpoint'
# GITHUB_TOKEN must be set privately; do not paste it into logs or chat.
node scripts/check-private-backup-ref.mjs
```

Success returns an aggregate JSON report with
`backup_ref_matches_active_commit: true` and
`historical_submissions_preserved: 7`. It never returns the private
repository name, branch name, tokens, paths, commit IDs or record contents.
The command performs **GET-only** operations. A mismatch or any uncertainty
fails closed and returns exit code 2.

This is a *single-repository branch checkpoint*, **not** evidence of a full
independent history backup, disaster recovery, offsite storage or the absence
of formerly exposed secrets. A matching branch can be deleted or moved by
anyone with sufficient repository permissions. Preserve a separately reviewed
full Git bundle/mirror and independent restoration evidence before live use.

Run `verify-private-activation` and `alpha-doctor` under the
existing owner activation procedure. Do not turn a successful backup reference
check into permission to create tasks, launch chats, merge code or bypass any
other owner approvals. If an active ledger commit changes after the backup
checkpoint, this check should fail until a **new** backup is independently
reviewed; never silently advance a frozen backup to make the report green.
