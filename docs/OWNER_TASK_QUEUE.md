# Locally approved task queue for the first owner alpha

This optional capability is for **the owner on a trusted machine** after the separately reviewed PRIVATE coordination ledger is live. It does not create issues, grant GitHub permissions, reserve locks, dispatch agents, merge work, change visibility or publish operational task records.

The committed config/pilot-tasks.json contains seven historic submitted pilot tasks. Do not reuse those task identities. For the first real alpha, put **new** tasks in a JSON file **outside this public Git checkout**, stored in an owner-controlled location.

## New catalog schema

Create a separate local JSON file, e.g. C:\VirgoStarsPrivate\owner-tasks.json. The example below is **synthetic**: replace the issue and upstream PR with real, reviewed, open issues/PRs from your authorized first-five-repository fleet; do not try claiming fictitious issue #99999.

~~~json
{
  "schema_version": "1-owner-task-catalog",
  "status": "owner-curated-local",
  "tasks": [
    {
      "repository": "Cesare-ml/astrological-charts",
      "issue": 99999,
      "status": "ready",
      "role": "developer",
      "access": "write",
      "pilot_wave": 3,
      "title": "Example scoped test only",
      "scope": ["tests/owner-alpha-smoke.test.mjs"],
      "resource_scope": {
        "id": "owner-alpha-smoke",
        "roots": ["tests/owner-alpha-smoke.test.mjs"]
      },
      "upstream_pr": 22,
      "upstream_branch": "feat/planet-interactions-transit-aspects-20261110",
      "instructions": "A new stacked draft PR, strictly one test file; do not touch production."
    }
  ]
}
~~~

The local schema supports at most 40 reviewed tasks and only the five repositories from the original owner pilot. Each task must be ready, use explicit read/write access and valid role/scope, and **must not reuse any of the original seven submitted issues**. Write tasks require an explicit upstream PR/branch and exactly one nonoverlapping resource partition. The runtime still checks live target issues, claims and concurrent PRs; a fingerprint is not proof that an issue is safely available.

## Offline review and approval (PowerShell)

On your trusted Windows computer with Node.js 20+ and a checkout of the reviewed code, run:

~~~powershell
node bin/vs-agent.mjs fingerprint-tasks "C:\VirgoStarsPrivate\owner-tasks.json"
~~~

The command prints an exact SHA-256 of the local file bytes, task count and read/write counts **only**. It never needs GITHUB_TOKEN, uploads no task data, and cannot claim an issue.

After reviewing the exact local JSON file, copy its SHA-256 into the **local-only** environment and keep the path outside Git:

~~~powershell
$env:VS_PRIVATE_TASKS_FILE="C:\VirgoStarsPrivate\owner-tasks.json"
$env:VS_PRIVATE_TASKS_APPROVED_SHA256="<paste-exact-64-char-SHA256-from-above>"
~~~

Do not commit private file bytes, its absolute path, a private ledger name or access token. Do not put this operator-only configuration in public CI, issue comments, screenshots or prompts to untrusted agents.

The CLI reads the JSON afresh on each protected invocation and **refuses to load any changed file** until its new exact SHA-256 has been deliberately approved. It also rejects relative paths, symlinks, directories, files inside this public repository, files larger than 128 KiB, malformed JSON, unexpected task keys, duplicate issue identities, and overlapping write partitions.

## Execute after approved private-ledger cutover only

All three variables for an operator run are independent: VS_PRIVATE_TASKS_FILE, VS_PRIVATE_TASKS_APPROVED_SHA256, and the pair VS_PRIVATE_LEDGER_REPO/VS_PRIVATE_LEDGER_APPROVED_REPO (plus a private GITHUB_TOKEN credential). Merely setting these variables does **not** activate a private ledger or bypass its repeated visibility and historical-submission integrity checks.

After verifying the private ledger with verify-private-activation:

~~~powershell
node bin/vs-agent.mjs fleet-status
node bin/vs-agent.mjs discover
node bin/vs-agent.mjs alpha-doctor
node bin/vs-agent.mjs session --kind codex
# Use the returned session ID, then claim only an explicitly ready, safe task:
node bin/vs-agent.mjs claim-next --session codex-YOUR-UUID --role developer
~~~

For a real claim, follow all existing first-alpha release, scope, PR audit and collision rules in FIRST_OWNER_ALPHA.md and AGENTS.md. A submitted task is not approved, and CI success is not authorization to merge.

## Public modes remain separate

The tokenless public-discover command reads **only** config/fleet.json; it never inspects the owner file or any legacy private pilot task data. Public GitHub Actions run **synthetic** fixtures of this feature and never receive the owner's file or GitHub credentials.

If you cannot verify a private coordination ledger and submit two new nonoverlapping test tasks, the first alpha is **not** operational yet. Do not revert to public coordination just to make a demo run.
