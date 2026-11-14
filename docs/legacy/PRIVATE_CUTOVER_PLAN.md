# Metadata-only private cutover plan

This preparatory tool supports [private ledger migration issue #19](https://github.com/Cesare-ml/virgostars-development-orchestrator/issues/19) without changing **either** GitHub repository. It is stacked on the earlier [destination preflight PR #23](https://github.com/Cesare-ml/virgostars-development-orchestrator/pull/23).

## Usage

On a trusted machine with Node.js 20 or 22, and a locally configured `GITHUB_TOKEN` with read access to the owner-selected private repository:

```powershell
node bin/vs-agent.mjs plan-private-cutover OWNER/PRIVATE-REPO
```

Do not paste tokens or private repository names into public issues, comments, Actions logs or shared transcripts. **Public GitHub Actions exercises only synthetic tests:** it does not receive private credentials or inspect actual private repositories.

## Read-only checks

The command inspects the **fixed historical public source** (`Cesare-ml/virgostars-development-orchestrator`, branch `coordination/claims`) and a distinct owner-selected private destination. It verifies:

1. Actual GitHub metadata confirms the old source remains public and the proposed destination is private, active and separately controlled.
2. The original source ref points to a valid commit/tree. The tool summarizes **only the count** of `claims/`, `resources/` and `submissions/` blobs, along with a count of unexpected files. It does not read blob bodies or disclose file paths in the result.
3. The private destination is checked with the same strict [private preflight](PRIVATE_LEDGER_PREFLIGHT.md). If its `coordination/claims` branch exists, the tool checks only its Git metadata and aggregates its record counts. It rejects symlinks, unsafe paths, incomplete/truncated data and duplicate names.
4. Branch refs and repository visibility are fetched again during and after the comparison. Any observed movement or visibility change **fails closed**.

The report has schema `1-private-cutover-plan`, `mode:metadata-only`, `ready_to_migrate:false`, `writes_enabled:false`, `historical_data_moved:false` and `independent_review:pending`. The output contains counts and generic blocker codes only; it has no token, branch commit SHA, private filenames, issue numbers or session metadata.

## Blocker codes

| Code | Meaning |
| --- | --- |
| `SOURCE_HAS_ACTIVE_LOCKS` | Old source still contains `claims/` or `resources/` blobs; never move or delete while active |
| `SOURCE_UNCLASSIFIED_BLOBS_REQUIRE_REVIEW` | Source tree contains files outside the three known record partitions |
| `SOURCE_HAS_NO_HISTORICAL_SUBMISSIONS` | No submission record is visible; do not assume the source inventory is complete |
| `DESTINATION_BRANCH_NOT_CONFIGURED` | Proposed private destination has no coordination branch |
| `DESTINATION_CONTAINS_EXISTING_RECORDS` | Existing private entries require an explicit conflict-by-conflict reconciliation |
| `DESTINATION_EMPTY_REQUIRES_OWNER_APPROVAL` | Empty verified private destination is **not** a transfer authorization |
| `OWNER_APPROVAL_AND_PRIVATE_LEDGER_CUTOVER_REQUIRED` | Always present until a separately approved and validated human migration plan exists |

This is **not a backup** and cannot establish an atomic snapshot of two repositories. It double-checks branch heads to detect observable changes, but data may change after the command returns. A real cutover would require approved ownership, private permissions, a write freeze, a verified backup, identity reconciliation and independent post-migration audits.

## Safety boundary

- No private repository is created, configured, scanned with real credentials in the public CI, or modified by this development task.
- No claims/submissions are copied, published or destroyed.
- The former owner-only CLI remains deliberately blocked on the historical **public** branch.
- Public-source history already visible on GitHub cannot be made confidential merely by deleting future commits.
- No merge, deploy, external agent write onboarding or new license is authorized by a green run.

## Tests

`test/private-cutover-plan.test.mjs` covers matching count summaries, source locks, existing/missing private branches, branch drift, malformed/truncated/symlink entries, private-visibility failures, permission errors and CLI separation. `test/private-ledger-preflight.test.mjs` additionally verifies re-reading destination refs and the race where a previously absent branch appears mid-check. Both run in the public read-only Node 20/22 GitHub Actions matrix using entirely fabricated metadata.
