# Unsigned native validation receipts — private pilot

## Purpose

A local native test result should refer to one precise Git commit and tree. The manually executed verifier can now save a **versioned, UNSIGNED JSON receipt** after it runs actual `npm run check`. This is a self-reported local result, **not** authenticated evidence, a CI check, scientific validation, code approval or permission to merge.

## Produce a receipt on a trusted Windows/PowerShell machine

Use a local Node.js 20+ checkout with an existing privately configured `GITHUB_TOKEN` (Contents: read for the private coordinator). Never paste this token in a chat, issue or source file.

```powershell
$sha = "FULL_40_CHARACTER_FEATURE_BRANCH_HEAD_SHA"
node scripts/verify-pilot.mjs --sha $sha --receipt "./pilot-check-$($sha.Substring(0,12)).json"
```

The fixed repository is `Cesare-ml/virgostars-development-orchestrator` on branch `feat/distributed-agent-coordination-v0`. GitHub is accessed through GET only. The downloaded tree and blobs are checked against Git SHA-1; unsafe paths, symlinks and incomplete snapshots fail closed. The child npm process does **not** inherit the GitHub token. The receipt is written only after a native test exit status exists. Failed tests produce `tests_passed:false` with their real nonzero exit code. GitHub fetch or runner errors never fabricate a passing receipt.

Receipts use **atomic no-overwrite** publication: a private same-directory temporary file is hard-linked into place and the temporary file is removed. Choose a new `.json` filename per run; the parent directory must exist. On Windows, choose a local filesystem that supports hard links (e.g. NTFS).

## Offline receipt inspection, without GitHub or a token

```powershell
node scripts/verify-pilot.mjs --verify-receipt ./pilot-check-abc123.json --sha FULL_40_CHARACTER_COMMIT_SHA
```

Offline review checks the exact expected commit SHA, schema, repository/branch, tree hash syntax, bounded file/byte counts, Node version, native command `npm run check`, exit code/result consistency, timestamp, and explicit fields `unsigned:true`, `independent_review:"pending"`, `merge_authorized:false`. Extra fields or a JSON file larger than 4 KiB fail. The reader uses **bounded** I/O. It exits 0 only if a structurally consistent receipt **claims** success; exit 0 does not independently establish that anyone ran the tests.

## Example schema (illustrative, not actual test evidence)

```json
{
  "schema": "virgostars-native-validation-receipt/v1",
  "repository": "Cesare-ml/virgostars-development-orchestrator",
  "branch": "feat/distributed-agent-coordination-v0",
  "head_sha": "40-character lowercase commit SHA",
  "tree_sha": "40-character lowercase tree SHA",
  "verified_files": 50,
  "verified_bytes": 250000,
  "node_version": "v22.16.0",
  "command": "npm run check",
  "exit_code": 0,
  "tests_passed": true,
  "completed_at": "2026-11-12T18:00:00.000Z",
  "unsigned": true,
  "independent_review": "pending",
  "merge_authorized": false
}
```

## Independent acceptance gate

An independent reviewer must compare the receipt's head SHA to the **current** GitHub feature head and re-run the native suite on a trusted checkout, or reproduce the pinned snapshot against independently obtained GitHub bytes. A receipt can be forged or edited: it is not cryptographically signed and cannot prove who ran the suite. New commits make old receipts stale. Continue to check scoped PRs, conflicting branches, actual target-repository tests and reviewer approval before considering integration. Never publish private repo metadata or tokens in public issues.

## Actual tests run, and the remaining blocker

Executed Node.js 22.16.0 on exact Git blob matching copies: **9/9** native receipt tests and **11/11** existing native snapshot verifier tests, **20/20 total**. Covered signed-off SHA matching, failed status, forged/extra fields, atomic non-overwrite, malformed/large JSON, credential omission and offline CLI subprocesses. The older snapshot verifier also launches genuine `npm run check` on a small three-file synthetic checkout.

**Not executed:** a complete `npm run check` against the full real private coordinator branch via authenticated GitHub snapshot. Its native acceptance gate is still pending. No GitHub Actions, auto-merge, deployment or release were added.
