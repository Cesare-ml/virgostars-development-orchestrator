# VirgoStars Development Orchestrator

Coordinates any number of independent ChatGPT/Codex chats working on the VirgoStars repositories. There is no server: GitHub issues, pull requests and a create-only claim ledger are the shared state.

## Start an agent

Open a new ChatGPT chat **with the GitHub connector enabled** and send exactly:

<!-- prompt -->
> Sei un agente VirgoStars: con il connettore GitHub apri Cesare-ml/virgostars-development-orchestrator, leggi AGENT_START.md e seguilo senza fermarti.

Every chat gets the same prompt. It picks its own work, and when a turn ends you reply **«ok avanti»** to keep it going. Open as many chats as you like: the claims keep them from colliding.

## How it works

| Piece | Where |
|-------|-------|
| Agent runbook (the rules every chat follows) | [`AGENT_START.md`](AGENT_START.md) |
| Registered repositories, priorities, WIP and merge policy | [`config/agent-fleet.json`](config/agent-fleet.json) |
| Exclusive claims (create-only JSON files) | branch `agent-ledger`, folder `claims/` |
| Tasks | open issues in the registered repositories (`P0`/`P1`/`P2` title prefix = priority) |
| Reviews / triage / merge requests | PR comments starting with `AGENT-REVIEW`, `AGENT-TRIAGE`, `AGENT-READY-TO-MERGE` |

Each cycle a chat takes the first applicable step: **resume → integrate → review → triage → develop → plan → audit**. Planning and auditing always apply, so a chat never runs out of work. Repositories above their WIP limit get reviews and triage instead of new PRs, so the backlog shrinks before it grows.

Agents may squash-merge a PR only when the merge gate passes: an independent approval at the current head and green CI where the repo has CI. In `docs-only` repos, only documentation changes qualify. Workflows, licenses, `AGENTS.md` and this repo's rules always go to the owner. Those PRs are marked `AGENT-READY-TO-MERGE`.

## Owner tools

```sh
npm run check                                # syntax + full test suite (Node 20/22)
node bin/vs-agent.mjs fleet-board            # GET-only overview: PRs, WIP, tasks, merge queues
node bin/vs-agent.mjs next-work --session chat-xxxxxxxx   # what the runbook tells that chat to do now
```

Set `GITHUB_TOKEN` (read-only is enough) to avoid GitHub's anonymous rate limit.

**To steer the fleet:**
- Change priorities and limits in `config/agent-fleet.json`.
- Label an issue `owner-only` or `agent-skip` to keep agents away from it.
- Merge the PRs labelled `ready-to-merge`.

## History

The earlier owner-only private-ledger pilot (SHA-approved local catalogs, private `coordination/claims`, alpha doctor, offline rehearsals) is preserved in [`docs/legacy/`](docs/legacy/README.md), and its CLI commands still work. It is no longer the way agents are started. The seven historical submissions on the old `coordination/claims` branch must not be reassigned.

Future design notes: [architecture](docs/ARCHITECTURE.md), [API](docs/API.md), [security](docs/SECURITY.md), [roadmap](docs/ROADMAP.md).
