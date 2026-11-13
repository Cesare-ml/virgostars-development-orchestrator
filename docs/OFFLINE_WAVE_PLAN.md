# Prepare independent owner-only chat waves (offline)

This optional, dependency-free Node 20+ operator command prepares **2–40 distinct chat startup prompts** in a local file. It does not start chats, connect to GitHub, reserve resources, claim issues, send prompts, update the coordination ledger, or authorize source edits. A generated `chat-<UUID v4>` is only a proposed session identity, not an authenticated identity or lock.

## Safety boundary

The Orchestrator repository is **PUBLIC**, and its historical `coordination/claims` branch must **not** receive new owner-only records. The private-ledger migration and independent approval remain pending. Use this generator only on a trusted owner computer after curating tasks separately. Do not put real manifest/output files, prompts, session IDs, sensitive task details, or private repository coordinates in this repository, public issues, pull requests, CI logs, or chat messages other than the single intended authorized chat.

The input and output must both be **absolute paths outside the public repository**. Input must be a regular file (no symlink), at most 128 KiB. Output must be a new file in an existing directory; it is never overwritten. The output is created with mode `0600` on POSIX; Windows users must separately verify the destination directory's NTFS ACLs (file mode is not an ACL guarantee). Do not place it in OneDrive/shared folders or publicly synchronized locations. The CLI prints only the aggregate number of prompts; input errors do not echo file contents.

## Synthetic example (NOT an approved task catalog)

Create a JSON file in your secure local directory, **not in this repository**:

```json
{
  "schema_version": 1,
  "wave_id": "example-wave",
  "tasks": [
    { "repository": "example-org/example-a", "issue": 10, "role": "developer", "roots": ["src/moon/"] },
    { "repository": "example-org/example-a", "issue": 11, "role": "developer", "roots": ["src/clock/"] },
    { "repository": "example-org/example-b", "issue": 12, "role": "reviewer", "roots": [] }
  ]
}
```

Run in a trusted checkout:

```powershell
node scripts/plan-agent-wave.mjs "C:\OwnerPrivate\wave-input.json" "C:\OwnerPrivate\wave-output.json"
node --test test/plan-agent-wave.test.mjs
```

Open `wave-output.json` **locally** and paste each individual `prompt` into exactly one separate owner-authorized chat. Never paste the entire output into multiple chats, because that would reuse session IDs. The generator rejects duplicate issue keys (case-insensitively) and overlapping developer directory roots in the same repository, including nested/case-aliased roots. Review-only tasks have no write scope. A generated plan must be regenerated if the curated task list, issue state, PRs or roots change; old session IDs must not be recycled.

## Independent live gates remain mandatory

1. Confirm owner approval, actual task catalog, private ledger migration, current GitHub visibility and source scope before starting work. An output file does not constitute an approval or a valid lease.
2. Each chat must independently inspect its issue, AGENTS.md, competing PRs and current upstream HEAD, then acquire and verify the documented private resource-first and issue claim where required. Do **not** write new claims into this public repository.
3. If another agent owns a resource, an issue is submitted/closed, an authorized directory changes, or a PR overlaps, **stop**. Never allow a queued prompt to override live coordinator truth.
4. Retain the same session ID only for follow-ups in that exact chat. Report actual branch, draft PR, tests and owner handoff; no automatic approval, release, merge or deploy.

The static directory-root check is intentionally conservative but cannot detect files changed by existing PRs, GitHub permissions, renamed files, cross-repository API interactions or time-of-check/time-of-use races. Real 2–40 agent concurrency has **not** been established by generating prompts. Run the existing alpha doctor, PR scope/collision checks, independent native tests and owner review before attempting a live pilot.
