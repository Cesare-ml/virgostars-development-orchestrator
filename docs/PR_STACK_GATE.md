# Read-only stacked pull request integrity gate

This standalone Node.js 20+ program checks whether the **public** VirgoStars Orchestrator draft PRs still form the expected branch chain. It is intended for the owner before planning integration. It **does not merge, approve, update branches, run private tasks or access the private coordination ledger**.

## Run on Windows, macOS or Linux

From a reviewed checkout containing this script, execute:

    node scripts/verify-pr-stack.mjs 1 23 25 27 30 33 35

The arguments are ordered **from the PR targeting main to the newest stacked PR**. As of 13 November 2026 the original chain is #1 → #23 → #25 → #27 → #30 → #33 → #35. Pass a revised explicit ordered list if new draft PRs appear. The script has no baked-in mutable list and accepts only numeric PR numbers. Its target is fixed to the public repository Cesare-ml/virgostars-development-orchestrator.

It uses GitHub's public **GET** pull-request metadata endpoint without authentication, with **two consecutive complete sweeps**. No token, connector, npm installation or private repository is needed. Public rate limits and network errors cause fail-closed exits.

## What is checked

- Every expected PR exists, is open and has valid branch/commit metadata.
- Every PR head and base belongs to the same expected public repository, not a fork or private destination.
- The oldest PR targets main.
- Each later PR's **base branch name and base commit SHA** match the preceding PR's current head.
- The chain contains no repeated PR numbers or repeated head branches.
- PR metadata is unchanged between the two complete read-only sweeps.
- Output reports aggregate counts and neutral blocker codes, not branch names, session IDs or commit IDs.

Exit codes: **0** means structurally consistent at the time of scan; **2** means one or more structural blockers; **1** means malformed input, API failure or untrusted/incomplete metadata.

## Human acceptance and limitations

A green chain check is **not proof of code quality, native tests, conflict freedom, branch-protection compliance, security/privacy review or merge approval**. Both merge_authorized and tests_approved remain false even for a perfectly consistent chain. GitHub metadata cannot offer an atomic cross-PR snapshot and branches may move immediately afterward.

Before any merge, independently inspect each PR's changed files and current CI run, review cumulative changes and sensitive history, resolve reviewer concerns, verify any branch protections and explicitly approve the integration order. Do not automatically merge stacked PRs based solely on this report.

Only synthetic fixture data is used by test/verify-pr-stack.test.mjs. Public GitHub Actions require no credentials. The command never touches coordination/claims, the owner catalog, tokens or the future private ledger.
