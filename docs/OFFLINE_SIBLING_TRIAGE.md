# Offline triage of sibling PR overlap reports

This is an **operator-only planning aid** for the first VirgoStars Orchestrator alpha. Parallel drafts currently share a base branch and sometimes edit the same files. The GET-only sibling checker in [PUBLIC_SIBLING_PR_OVERLAPS.md](PUBLIC_SIBLING_PR_OVERLAPS.md) produces a stable, full pairwise report. This follow-up groups its confirmed **filename-overlap edges** into connected review groups without pretending to select the correct PR.

## PowerShell (Node.js 20+)

First run the public read-only scanner **from a reviewed checkout** and save its complete JSON output. Since overlapping files cause exit code 2, redirect stdout to a local JSON file and do not treat a non-zero overlap exit as a broken report.

```powershell
node scripts/inspect-sibling-pr-overlaps.mjs 41 45 47 48 49 50 > "$env:TEMP\vs-sibling-overlap.json"
node scripts/triage-sibling-overlap-report.mjs "$env:TEMP\vs-sibling-overlap.json"
```

Only **public PR numbers** from the selected stable audit are printed. This script does not use a GitHub token, issue/task catalog, coordination ledger, repository changes, or network access. It only reads the one explicitly provided absolute regular JSON file (maximum 256 KiB) and writes a JSON summary to stdout.

## Output and review process

- `overlapping_review_groups`: connected components of PRs with at least one reported shared path (directly or transitively). An edge **does not** prove an actual Git merge conflict.
- `isolated_pull_requests`: members with no filename overlap **within this input selection only**. This does **not** show that they are safe to merge or semantically independent.
- `manual_overlap_review_required`: true if at least one component has an overlap edge.
- `merge_authorized` and `pr_selection_authorized`: **always false**.

The validator refuses stale/synthetic (not live-stable) inputs, incomplete or repeated pairs, inconsistent totals, unexpected PR identifiers and authorization flags. It does not accept a hand-edited partial selection as a clean inventory.

**Exit status:** 0 = complete report and no overlapping paths among the selected siblings; 2 = complete report with manual overlap review groups; 1 = invalid/incomplete input. Neither 0 nor 2 authorizes integration.

For each review group, inspect the changed files and choose whether edits should be combined, rewritten or held; have an independent reviewer check branch ancestry, exact current SHA, test results and compatibility. Re-run the live audits immediately before any owner-approved integration. No PR is automatically selected, rebased, closed or merged. Do not use public tools for the owner-only PRIVATE ledger or historical submitted-task migration.

This feature is stacked on the **draft #68** sibling audit and is not part of `main` until separately reviewed and integrated. It does not replace the private two-developer alpha checks or real concurrent-agent trial.
