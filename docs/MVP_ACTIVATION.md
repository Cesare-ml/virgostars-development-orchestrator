# MVP activation and integration — 2026-11-14

**Status: candidate for integration, not deployed.** The first goal is two independent, GitHub-connected ChatGPT sessions, not 40 automatic browser tabs. This public repository does not contain an authorized private operational task ledger.

## Available immediately after source integration

From a trusted local clone, with Node.js 20 or 22:

```sh
npm run check
node bin/vs-agent.mjs --help
node bin/vs-agent.mjs public-discover
```

`public-discover` is tokenless, read-only and does **not** claim tasks. Synthetic offline commands are available only if their separate PRs have been integrated. There is no hosted scheduler, automatic chat launcher, production deployment, auto-merge or cross-browser session recovery.

## Before any real private claims

1. Owner creates or chooses a **separate PRIVATE GitHub repository** for coordination records, with least-privilege access; a public repository branch is not a private store.
2. Owner reviews public Git history and safely reconciles legacy records with local backup/cutover tooling. Never copy private records into public issue comments, workflow logs or commits. Rotate any historically exposed credentials.
3. Update the private operator configuration to use the exact reviewed private destination, and verify it with the CLI visibility gate at time of use. Do not bypass the guard. The old public `coordination/claims` branch must receive **no new private claims**.
4. Select two ready issues with disjoint write partitions and no competing active PRs; generate one unique durable session ID per chat.
5. Test the real sequence for both chats: exclusive resource lock (when writing) → issue claim → scoped feature branch/draft PR → head/scope audit → factual handoff → immutable submitted marker → owner-checked release. On 409/422, uncertain claims, stale SHA or orphaned locks, stop for maintainer review.
6. Independently review both results; only then expand to 5–10 real sessions, followed by separately verified 20- and 40-session waves.

**Current blocking gates:** private operational ledger not confirmed, real two-chat claim-to-release not proven, automatic browser/chat launch and durable distributed recovery not implemented. A successful merge to main does not satisfy these conditions.

## PR integration policy

- Merge parent before child in stacked PR chains. Check exact head SHA, changed files, branch ancestry and Node 20/22 results on the candidate revision. Retarget only after recalculating its diff and CI evidence.
- Choose one canonical implementation for overlapping changes. The competing recovery PRs #91, #94 and #95 must **not** all be merged. Multiple audit and submission-guard drafts also overlap.
- Prioritize the base CLI PR #1 and a minimal offline two-agent rehearsal chain. Keep privacy migration and live activation separately gated by owner review.
- Green synthetic tests do not prove real distributed locking or 40 live ChatGPT sessions. Do not merge all drafts to reduce the queue count. No automatic deploy or auto-merge.

## Go/no-go checklist

| Gate | Requirement | State at plan creation |
| --- | --- | --- |
| MVP source on main | Reviewed base PR + passing exact-head checks | Pending |
| Safe public commands | `npm run check` and tokenless preview | Feature branch only |
| Offline two-agent proof | Test results on integrated code | Draft PRs only |
| Private claims | Separate private destination and reviewed migration | Blocked |
| Live two-chat run | Two distinct IDs, exclusive claims, audited handoff and release | Not proven |
| 5, 10, 20, 40 live chats | Measured concurrency and safe recovery | Not proven |

## Interrupted sessions

Never delete another chat's lock. Keep the session ID and GitHub commit evidence private, take a fresh read-only snapshot, and permit owner-mediated recovery only after ownership and submitted records have been reconciled. Synthetic snapshot reload is not durable crash recovery.
