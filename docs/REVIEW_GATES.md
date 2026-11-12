# Read-only integration blockers — private VirgoStars fleet

**Scope:** the private pilot; currently seven curated task records (five initial reviews and two write-task deliveries). This is a maintainer review aid, **not** an automatic review or merge system.

Run from a checkout of branch `feat/distributed-agent-coordination-v0`, with a privately configured GitHub token that can read all five target repositories:

```powershell
npm run check
node bin/vs-agent.mjs fleet-status
```

Each **submitted write task** now provides these additional structured fields:

| Field | Meaning |
| --- | --- |
| `pr_check` | Current upstream/delivery HEAD SHAs versus recorded submission SHA; live metadata and exact changed-file scope |
| `collision_check` | Current open competing PRs touching the same approved resource roots, including their numbers and head SHAs |
| `review_gates.blockers` | Machine-readable unresolved integration conditions |
| `review_gates.integration_ready` | Always `false` for this supervised pilot; independently run tests and human approval are still required |
| `review_gates.native_tests` | `unverified` — a self-reported handoff or bare GitHub status is not independent native/visual test evidence |
| `review_gates.merge_authorized` | Always `false` — there is no authorization or automatic merge here |

The top-level task `status` retains the existing meaning (`stale-submission`, `needs-scope-audit`, `submitted`, etc.). A collision is reported separately so it **cannot obscure** the original stale/unaudited evidence. Any warning also appears in `alerts`.

## Blocker codes

- `STALE_DELIVERY_OR_UPSTREAM`: delivery PR HEAD changed, upstream branch moved or current scope no longer meets the approved task
- `INDEPENDENT_SCOPE_AUDIT_REQUIRED`: the marker is manual-only, missing exact audit metadata or otherwise unverified
- `OVERLAPPING_OPEN_PULL_REQUESTS`: two or more open PRs touch the same approved resource
- `DELIVERY_PR_NOT_UNIQUE_OPEN_CANDIDATE`: the recorded submitted PR is not the sole currently open matching candidate
- `DELIVERY_PR_NOT_RECORDED`: submitted marker has no usable PR number
- `LIVE_COLLISION_SCAN_NOT_POSSIBLE`: no PR number is available to anchor the collision scan; never assert `no conflict`
- `INDEPENDENT_NATIVE_TESTS_NOT_VERIFIED`: no independent Node/npm/browser/visual test result is established by the monitor
- `INDEPENDENT_CODE_REVIEW_PENDING`: approval remains a human/independent task
- `CLAIM_RELEASE_PENDING`: a submission marker and its active issue claim both remain present; investigate before scheduling further work

## Observed wave-2 evidence at initial review

- **Functions #5, PR #6:** new ESM provider adapter and Node consumer smoke, only two authorized additions, correct upstream base at review; `scope_verdict:manual-reviewed` and **native Node tests still not run**. Further independent test and code review required.
- **Charts #25, PR #27:** one authorized browser-test file, but upstream PR #22 advanced after original base; overlapping PR #28 adds the exact same path. Browser/WebGL tests **not run** against the actual Angular demo. A unique PR and refreshed upstream need an explicit maintainer decision.
- **Charts PR #28** is another draft alternative, not a second task submission. The monitor reports it as a live competing candidate when it remains open.

These conditions change with GitHub HEADs. **Run the command again** before any decision; old handoff comments or screenshots are not proof of a currently valid PR.

## Accuracy and limitations

The private `coordination/claims` ledger is read from **one Git commit**, but current GitHub PR metadata is read live and is not transactionally locked. The underlying `audit-pr` rereads HEADs after pagination, and `audit-collisions` rereads the open-PR inventory at the end. GitHub 403, truncated data, ambiguous PR changes and incomplete file lists **fail closed** rather than asserting no blockers.

No automatic GitHub Actions, CI inference, checkout test execution, PR approval, merge, deployment, forced lock release, branch modification or changes to public repos. Even an entirely empty blocker list would **not** itself authorize merging: an independent reviewer must examine code, test evidence, dependencies and integration plan.

The module `src/review-gates.mjs` has 10 isolated exact-source V8 test cases, and the enhanced `fleet-status` has 13 isolated exact-source tests. These are **not** native `node --test` from a full checkout; execute `npm run check` locally as the next gate.
