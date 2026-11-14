# Offline admission budget for overlapping chat waves

**Status:** public-safe, tokenless, advisory arithmetic. No live scheduler, private ledger access, authentication, session launch, task claim, GitHub request or auto-merge.

When ten developer chats are active and another ten are requested, no tool should silently assume the original ten have finished, that their PRs were reviewed, or that the review queue can absorb twenty new changes. This standalone Node.js 20+ command conservatively reserves **one review slot per active writer and per newly admitted writer**, in addition to already-pending reviews.

## Windows / macOS / Linux

```powershell
node scripts/plan-offline-admission.mjs --waves 10,10 --active 0 --pending 0 --max-active 10 --max-pending 20
```

This reports **wave 1 admitted, wave 2 blocked** and exits with status `2`. A blocked wave is not partially admitted. Later waves remain `not-evaluated` until the operator deliberately replans. For example, after the first ten have handed off their PRs and are no longer active, the owner can reassess with accurate new counts:

```powershell
node scripts/plan-offline-admission.mjs --waves 5,5 --active 0 --pending 10 --max-active 10 --max-pending 20
node --test test/offline-admission-budget.test.mjs
```

Both five-session waves fit in this revised example. The tool models at least **two new sessions overall**; a one-wave `--waves 10` plan is also valid. A fully admissible two-wave plan looks like:

```powershell
node scripts/plan-offline-admission.mjs --waves 10,10 --active 0 --pending 0 --max-active 20 --max-pending 20
```

Inputs are **aggregate counts only**; do not pass paths, tokens, identities, GitHub issue numbers, task catalogs, or identifiers. Each flag is mandatory and may appear only once:

- `--waves`: ordered comma-separated positive wave sizes, total 2–40 sessions (1–40 waves).
- `--active`: currently active code-writing sessions (0–`--max-active`).
- `--pending`: currently pending PR reviews, **not including** PRs already counted by active writers.
- `--max-active`: owner-chosen limit for simultaneous active writers (1–40).
- `--max-pending`: owner-chosen upper bound on pending reviews plus one future PR per active writer (1–80).

The validator refuses `pending + active > max-pending` even before new admissions. It never assumes that sessions finish or that a PR disappears between arrival waves. Status `0` = all requested complete waves fit, `2` = an ordered wave is blocked, `1` = invalid input. Status `0` describes **only a hypothetical budget**, not real permission to launch chats.

## Explicit limitations

Actual task allocations, GitHub locks, conflict-free file scopes, code review throughput, permissions, performance, GitHub rate limits and real browser/session concurrency are **not** verified. The tool does not inspect any task or PR and cannot know the actual counts: the owner must supply them. In particular, pending PRs and active writers must be disjoint populations for the reservation model to be meaningful. A numerical budget can never bypass per-task exclusive claims and independent PR review.

Before live coordination, follow `docs/FIRST_OWNER_ALPHA.md` and move the historical **public** ledger to a reviewed **private** store. Start with a supervised two-chat pilot. Do not merge, deploy or onboard external agents based on this report.
