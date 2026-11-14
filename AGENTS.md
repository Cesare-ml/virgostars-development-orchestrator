# AGENTS.md — VirgoStars agent coordination

**Every agent (ChatGPT, Codex or other) follows [`AGENT_START.md`](AGENT_START.md).** It defines the work cycle, claims, review, merge gate and hard rules. The registered repositories and limits are in [`config/agent-fleet.json`](config/agent-fleet.json). The owner authorized this workflow on 2026-11-14.

## Working on this repository itself

- This repository is priority 9 in the fleet: work here only on issues labelled `bug` or `fleet-blocker`. Product repositories come first.
- Changes to `AGENT_START.md`, `config/agent-fleet.json`, `AGENTS.md`, `.github/workflows/**` or licenses are **owner-merged only**. Never weaken the hard rules in §7 of the runbook.
- Run `npm run check` (Node 20/22) and keep `test/agent-work.test.mjs` in sync with the runbook: the selector in `src/agent-work.mjs` is the executable form of the ladder.
- The legacy private-pilot code under `src/` and the guides in `docs/legacy/` stay working and tested. Do not delete them without an owner issue.

## Legacy ledger

The historical `coordination/claims` branch is read-only history. Never write to it, and never reassign the seven historical submissions recorded there. New claims go only to the `agent-ledger` branch, as described in `AGENT_START.md`. The legacy owner-only CLI commands (`claim`, `claim-next`, `submit`, `alpha-doctor`…) still refuse the public repository and require a separately verified PRIVATE ledger. See [`docs/legacy/`](docs/legacy/README.md).
