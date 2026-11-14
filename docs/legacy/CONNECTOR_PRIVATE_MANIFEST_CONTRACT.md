# Proposal: immutable PRIVATE task manifest for ChatGPT-only alpha

**Design-only proposal, issue #140. NOT an active task scheduler or authorization to create claims.** The owner wants one open ChatGPT conversation per agent, no local installation, and a measured 2 → 20 → 40 → 100 rollout. The existing owner CLI still uses a locally SHA-approved catalog with separate repository policies. This standalone validator does **not** replace the CLI catalog, change the fleet, alter private records, deploy anything or launch chats.

## Mandatory owner policy decision

Select and independently authorize a **separate access-controlled PRIVATE GitHub manifest repository or protected location, distinct from the PRIVATE claim/resource/submission ledger**. The old public coordination/claims branch must never be used for confidential tasks. This proposal does not reverse the existing restriction on storing a task catalog in the ledger repository.

The owner must independently inspect and approve a specific immutable 40-character Git commit SHA holding the private manifest, and record that decision in owner-controlled private governance. Neither a public issue nor the manifest's own owner-approved status can authenticate owner consent. Agents must never use a moving branch name, a self-reported token/flag or their own approval as proof of authorization.

## No-PC preflight for each separately opened ChatGPT chat

1. Read the target AGENTS.md, issue, proposed exact new test-file root, upstream PR and current HEAD. The initial first-two tasks remain proposals until the owner approves them privately.
2. Through authenticated GitHub connector reads, independently verify the PRIVATE manifest repository, owner approval and the exact immutable manifest commit. Do not copy its identity or contents into a public issue, PR, prompt or Actions artifact.
3. Validate exactly **two** developer write tasks, approved repositories, unique task and resource identifiers, distinct scope roots, an existing open upstream PR with pinned branch/HEAD SHA, a new exact file path and no use of any historic submitted task. Compare every active PR changed-file list: scope declarations alone do not prove conflict absence.
4. Independently inspect a pinned PRIVATE coordination tree: seven historic immutable submissions preserved, no competing claims/resources, no unexpected files, correct Git visibility, permissions and owner-approved migration/rollback precautions. Independent full Git mirror backup remains an outstanding owner gate unless separately verified.
5. **STOP** if anything is missing, divergent, stale or ambiguous. Only a separately authorized live pilot may create PRIVATE resources/OWNER__REPO/PARTITION.json **first**, then claims/OWNER__REPO/issue-N.json using create-only GitHub operations and a unique stable chat UUID. Re-read each created blob. Never overwrite, steal, expire or auto-delete another session's lock.
6. After a scoped stacked draft PR, preserve real test/handoff evidence, submit an immutable marker and release only the owner's issue claim first, then resource lock. A same-chat "ok avanti" must re-read its current ownership and role, reusing the same UUID. A new chat gets a new UUID and cannot take over an orphan claim.

## Proposed exact manifest v1 JSON (synthetic only)

The real manifest belongs **only** in owner-private storage. This illustrates the exact field contract using fictional, unclaimable repositories:

~~~json
{
  "schema_version": "virgostars.connector-private-tasks.v1",
  "status": "owner-approved",
  "wave": 2,
  "tasks": [
    {
      "task_id": "pilot-a",
      "repository": "ExampleOrg/repo-one",
      "issue": 10,
      "status": "ready",
      "role": "developer",
      "access": "write",
      "pilot_wave": 2,
      "title": "Synthetic scoped test A",
      "scope": ["test/a.test.mjs"],
      "resource_scope": {"id": "partition-a", "roots": ["test/a.test.mjs"]},
      "upstream_pr": 5,
      "upstream_branch": "feat/a",
      "upstream_head_sha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    },
    {
      "task_id": "pilot-b",
      "repository": "ExampleOrg/repo-two",
      "issue": 11,
      "status": "ready",
      "role": "developer",
      "access": "write",
      "pilot_wave": 2,
      "title": "Synthetic scoped test B",
      "scope": ["python/tests/test_b.py"],
      "resource_scope": {"id": "partition-b", "roots": ["python/tests/test_b.py"]},
      "upstream_pr": 6,
      "upstream_branch": "feat/b",
      "upstream_head_sha": "cccccccccccccccccccccccccccccccccccccccc"
    }
  ]
}
~~~

## Validator boundaries

The standalone source module src/connector-manifest-contract.mjs exports inspectConnectorManifest(rawJson, gate) and parseUniqueManifestJson(raw). It rejects unknown fields, duplicate JSON object keys (including decoded Unicode aliases), invalid/oversized JSON, unpublished target aliases, submitted historical issue re-use, duplicate task/partition/file roots, unapproved role/access/wave, malformed paths and branch/commit identity drift. It takes the allowed repository names and historic submitted task identities only as privately supplied inputs and does not hardcode real project names.

**Critical limitation:** every gate input is merely caller-supplied: fetched_commit_sha, owner_approved_commit_sha, independently approved target allowlist and historic submitted task keys, and Boolean claims that approval/private visibility/separate store/history have been checked. The module cannot authenticate GitHub provenance, access permissions, approval identity, live issues/PRs or claim state. Even on successful structural validation, the result always contains:

- caller_assertions_only: true
- live_github_verified: false
- claim_authorized: false
- ready_to_scale: false
- operator_review_required: true

Output contains only fixed aggregate values, never private repository identities, issue IDs, paths, commit hashes, session IDs or credentials. A future independently reviewed connector adapter must authenticate the immutable manifest and current GitHub facts before **any** claim is authorized. Subsequent 20/40/100 waves require their own newly approved schemas, rate-limit/review gates and evidence from actual chats. Synthetic success is never real concurrency evidence.

## Verification

Run node --test test/connector-manifest-contract.test.mjs and full npm run check on Node 20 and 22 at the exact integration head. Tests are synthetic and tokenless. This PR must remain draft until independent review and explicit integration authorization. No new GitHub Actions workflow, merge, deployment, private claim or access-control change is included.

Related references: docs/legacy/OWNER_TASK_QUEUE.md, docs/legacy/RESOURCE_LOCKS.md, docs/legacy/MVP_ACTIVATION.md, issues #140 and #138, and the separate ChatGPT-only fleet proposal.