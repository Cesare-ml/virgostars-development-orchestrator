# Integrator security regression: rename sources and UUIDv4 session IDs

This is a **stacked, read-only safety fix** for [issue #157](https://github.com/Cesare-ml/virgostars-development-orchestrator/issues/157) and parent Integrator work [#152](https://github.com/Cesare-ml/virgostars-development-orchestrator/issues/152). It is based on the exact head of parent draft PR #163 (itself on #158, #154 and #137). The owner has not activated the two-chat task catalog.

## Why this is needed

Earlier Integrator checks inspected only `file.filename` and treated an unsafe GitHub rename from, for example, `.github/workflows/release.yml` **to** `src/harmless.mjs` as an ordinary changed file. A separate identifier problem accepted strings like `chat-not-a-v4-id` as valid session identifiers although the actual coordination code requires RFC4122 UUIDv4.

Green CI on the earlier versions could not prove those cases were checked.

## Implementation

- `src/integrator-changed-file-safety.mjs` provides one shared pure `inspectIntegratorChangedFile(file)`, examining GitHub `filename`, `status` and `previous_filename`.
- The v1 Integrator candidate gate and v2 live evidence collector now **both** call that shared classifier, so neither can ignore a sensitive rename source.
- A renamed file must have a valid previous filename; path traversal, malformed or unknown status, duplicate changed paths, invalid old filename and case-only rename are conservative blockers.
- Owner-sensitive paths include `CODEOWNERS` in root/`.github`/`docs`, GitHub workflows, environment/credential directories, deployment and migrations, license/notice/security/governance files, dependency manifests and lockfiles.
- The candidate gate imports the established `assertSession` from `src/claims.mjs` to check the actual `chat-UUIDv4` shape for Integrator identities, and canonical chat/codex UUIDv4 shapes for claimed author/reviewer session identities. This **only validates format**; it cannot prove an authenticated distinct person/agent or an approved private claim.
- `test/integrator-sensitive-path-rename.test.mjs` checks harmless renames, old/new risky names, malformed old paths and session IDs, and verifies both layers still report `merge_authorized:false`.

## How to validate

Run the native suite on the exact branch HEAD via existing public Node 20 and Node 22 CI. No new workflow is required. Check the complete changed-file list, current stacked dependency heads and independent review findings before any merge.

**Never interpret a positive candidate as approval:** the Integrator merge executor is still absent; branch protections, real reviewer GitHub identities, independently owner-approved task/manifest, cross-PR collisions, native tests and correct dependency order are separate required gates. No automatic merge or private ledger write is part of this PR.
