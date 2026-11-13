# Public PR topology inventory (owner review only)

The Orchestrator is developed in parallel by independent agents. A collection of green draft PRs can still have ambiguous branch dependencies. This tool makes the **public** draft PR tree visible without touching any private coordination records.

From a reviewed Node.js 20+ checkout, run:

    node scripts/inspect-pr-topology.mjs

No arguments, login or GitHub token are required. The tool performs **GET-only** GitHub API calls for open pull request metadata of the fixed public repository, with at most 200 PRs. It scans the entire inventory twice and refuses incomplete, changing or inaccessible inventories.

## Understanding the JSON report

- checked_open_prs: number of open public PRs included in a stable inventory.
- top_level_prs: public PR numbers directly targeting main.
- parent_child_links: public PR number pairs that identify a stacked branch dependency.
- branching_points: PRs with two or more child draft PRs on the same parent branch; **not** proof of file collision.
- detached_base_prs: open PRs whose base branch is neither main nor a head of another open PR. This could be a previously merged parent; manually inspect before integrating.
- max_observed_chain_depth: longest observed parent chain.
- blockers: duplicate heads, base-SHA mismatch, branch cycles, detached parents, external repo references or inventory movement.
- inventory_stable: true only if two bounded successive public GET scans returned matching metadata.
- file_conflicts_evaluated and merge_authorized: **always false**. The tool does not fetch diffs or inspect actual file conflicts.

A shared parent **does not mean the child PRs necessarily conflict**. When a branching point is reported, an integrator must separately inspect changed-file scopes, stale base commits, native CI evidence and reviewer findings; each branch might be independent and safe to rebase. Never auto-close, auto-rebase or auto-merge siblings.

Exit status is **0** for a structurally consistent snapshot, **2** for structural blockers and **1** for malformed input, API/rate limits or incomplete responses.

## Privacy and production boundaries

This is a **public metadata** auditor only. No GitHub token is required or accepted by the script, no local files are written and no GitHub mutations occur. PR numbers are already publicly visible, but private repositories, tokens, task catalogs, paths, session IDs and claim records must never be included in public CI reports. The script does not access the owner-only private ledger and cannot activate live agents.

Run the more focused scripts/verify-pr-stack.mjs with explicit ordered PR numbers when validating a proposed integration chain. This topology scanner instead enumerates every open public PR and highlights branch structure without pretending to choose which candidate is correct. For a true delivery decision, also run the existing private write-task collision and scope gates **only after owner-approved private-ledger activation** and independent review.
