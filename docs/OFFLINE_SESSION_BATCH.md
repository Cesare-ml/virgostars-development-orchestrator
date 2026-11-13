# Prepare 2–40 independent agent sessions offline

**Status: proposed draft feature, not merged or deployed.** This is an owner-local setup helper, not a chat launcher, scheduler, task dispatcher, authentication mechanism or private-ledger activation command.

## Windows (Node 20+)

From a reviewed checkout including this feature:

~~~powershell
node scripts/prepare-agent-sessions.mjs 2 chat
node scripts/prepare-agent-sessions.mjs 20 chat
node scripts/prepare-agent-sessions.mjs 10 codex
node --test test/offline-session-batch.test.mjs
~~~

The CLI prints one JSON report to standard output. Each slot includes a fresh UUIDv4 session ID and a safe initial prompt to copy into **one distinct** ChatGPT or Codex conversation. Choose one slot per chat. Do not reuse the same slot, session ID or transcript for independent chats. If the process fails, discard the entire output and rerun it; a new invocation creates a **new set** of IDs. No output file is created automatically.

IDs are labels used by the coordination protocol; they are **not** credentials, proof of a human identity, or permissions. Treat them and any saved JSON as owner-local operational material; never paste session manifests into public issues, PRs, GitHub Actions logs or unrelated chats. The command does not read GITHUB_TOKEN, private task files, repository identities or real issue data, and never makes network requests or writes a task claim.

## Required gate before any actual assignment

The JSON always reports chats_started: 0, tasks_claimed: 0, github_requests: 0, private_ledger_verified: false and owner_review_required: true. **Prepared does not mean active.** The script does not open browser tabs or start model sessions; an owner must copy the desired prompt into separate sessions manually or use a separately approved launcher.

Before any session attempts claim-next or changes code, follow [FIRST_OWNER_ALPHA.md](FIRST_OWNER_ALPHA.md): independently approve the PRIVATE ledger cutover, preserve all historic submitted records, set the locally SHA-approved task catalog outside this public checkout, and pass the live alpha-doctor check. Each individual agent must then independently obtain its exclusive issue and (for write tasks) resource claim and verify task scope/PR collisions. If there are only two approved tasks, generating 40 session prompts does **not** create 40 approved work items. If the private gate fails, no claim or code edit is authorized.

## Limitations

- Offline UUID uniqueness inside one generated batch is enforced. It is **not** a global registry across different invocations or machines, nor a distributed session lock.
- No safety guarantee against two clients deliberately copying the same ID, leaked ID impersonation, stale tasks or concurrent GitHub writes. The existing owner-only protocol must still check live ledger state.
- This is a preparation tool for the first two independent agents and potential later 5–40 agent trials; throughput and real multi-chat concurrency are **not verified**.
- No merges, releases, deployments, private records, secret credentials or public volunteer onboarding are involved.
