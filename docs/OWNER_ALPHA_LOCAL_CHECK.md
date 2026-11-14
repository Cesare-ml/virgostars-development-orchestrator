# Owner alpha: one-command local setup check (Windows, Node 20+)

The live coordinator needs a separate owner-controlled **PRIVATE** GitHub ledger,
an exact approved task catalog outside the public checkout, and local GitHub
credentials. Before making **any** remote request, inspect only your local
configuration from a trusted checkout of this PR:

```powershell
node scripts/check-owner-alpha-local.mjs
```

The command emits a bounded **aggregate-only JSON** report. Exit code `0`
means all *local* prerequisites are structurally present; code `2` lists
safe blocker codes for missing or invalid setup; code `1` is a generic error.
It never prints token values, private GitHub identities, file paths, task
names, session IDs or approved hash values. It never accesses the network.

It checks Node 20+, two matching locally selected private ledger identifiers
(the historic public repository is rejected), presence **only** of a token,
and the actual already-existing `loadOwnerTasks` reader's local-file safety,
schema and SHA-256 approval. It requires at least two **ready developer write tasks with distinct repository/resource partitions**, matching the stricter remote `alpha-doctor` launch policy. Two tester tasks, duplicate partitions or one developer plus one tester are not sufficient.
A token being present does **not** mean the token is valid or sufficiently
permissioned. No GitHub data or existing coordination records are read.

## When the report says `local-preflight-pass`

1. Independently create and back up the PRIVATE destination; review the
   historical public ledger and keep the seven submitted markers immutable.
2. Follow [MVP activation](MVP_ACTIVATION.md) to export, reconcile and manually
   copy **all seven** historical submissions byte-for-byte into the private
   `coordination/claims` branch. Do not copy live locks or overwrite a record.
3. Verify the real destination using the existing GitHub **GET-only** commands:

   ```powershell
   node bin/vs-agent.mjs verify-private-activation OWNER/PRIVATE-REPO
   node bin/vs-agent.mjs alpha-doctor
   ```

4. Only if `alpha-doctor` passes and an owner independently approves the
   launch, supervise two real ChatGPT/Codex sessions with distinct IDs,
   exclusive resource-first claims, scoped draft PRs and explicit handoffs.

A local pass means **eligible to run the remote readiness doctor**, not that
the private repo exists, historical submissions are preserved, tasks are free,
two browser chats work, a merge is approved or a live launch is safe. The
report always includes `ready_to_launch:false`.

## Privacy and rollback

Keep `GITHUB_TOKEN`, `VS_PRIVATE_TASKS_FILE`, the owner task JSON and private
ledger identifiers in local protected configuration. Never commit or paste
them in issues, public CI or ChatGPT transcripts. This check only reads the
approved local task file; it creates no GitHub record, lock, PR, session,
backup, migration, auto-launch or deployment. Stop on any blocker and do
not attempt to bypass the public-ledger visibility gate.

The accompanying native tests use synthetic tokens and task data only.
