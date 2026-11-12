# VirgoStars Development Orchestrator

**Current priority: PRIVATE, owner-only pilot across five VirgoStars repositories.** The repository is private. External volunteers and public registration are deferred until explicitly approved.

**Start here:** [Private pilot instructions](docs/PRIVATE_PILOT.md), [agent instructions](AGENTS.md), [five-repository registry](config/fleet.private.json).

The initial objective is to let many independent ChatGPT and Codex conversations coordinate via a shared GitHub-backed task/claim ledger. Roles are dynamically chosen from planner, developer, tester, reviewer, auditor and integrator. GitHub task claims use exclusive creation of one file per issue in the separate `coordination/claims` branch. This is a **limited pilot mechanism**: it does not yet provide cross-task resource locks, automatic expiration or transactionally fenced code writes.

## Future design

- [General onboarding](docs/START_HERE.md) — for a possible future public community.
- [Coordination protocol](docs/PROTOCOL.md) — proposed long-term workflow.
- [Architecture](docs/ARCHITECTURE.md) and [API proposal](docs/API.md) — future service/backend design.
- [Security](docs/SECURITY.md), [Roadmap](docs/ROADMAP.md).
- [Public-safe example registry](config/fleet.json). **Do not publish the private pilot registry or private repository data.**

The current pilot uses GitHub tools available to authorized agents. No network service, database, hosted API, automatic merges, CI changes or deployment has been implemented.

## First runnable private-agent pilot

The initial Node.js 20+ CLI is in `bin/vs-agent.mjs`, with no external runtime packages. Read `docs/CLI_PRIVATE_PILOT.md` for local Codex commands and GitHub-connected ChatGPT equivalent actions. `config/pilot-tasks.json` curates exactly five initial **read-only PR review tasks**, one for each target repository. The CLI supports session creation, discovery, issue claim, status, factual handoff and explicit owner-controlled release. It is not a hosted API; other task types will be opened only after scope review.


### Automatic task pickup (private pilot)

The CLI now supports `claim-next --session chat-UUID --role reviewer [--repo OWNER/REPO]`. It resumes a task already owned by that session, otherwise tries approved ready tasks in order and skips busy or closed issues. It never creates tasks from unreviewed issues. A normal release requires an owner-authored handoff to prevent silent loss of progress. See [CLI instructions](docs/CLI_PRIVATE_PILOT.md).

## Cooperative write-resource locks

Private pilot write tasks now require a **single approved resource partition**, acquired before the issue claim. Different issues sharing that partition cannot both become writers; disjoint declared partitions may be worked on concurrently. Catalog scopes are validated for overlapping paths. The five initial eligible tasks remain read-only reviews; this does not automatically authorize new coding work. See [resource lock protocol](docs/RESOURCE_LOCKS.md). There is no multi-resource transaction, automatic stale lock recovery or enforcement of actual file edits outside the declared scope.

## Ready to launch the first private chats

**[Open the single-prompt pilot launch guide](docs/LAUNCH_PRIVATE_MVP.md).** Start with 3–5 ChatGPT chats using their connected GitHub tools. All five initial tasks are read-only reviews. Each agent claims one task via `coordination/claims`, posts its findings in the target issue, stores its handoff and creates a private `submissions/OWNER__REPO/issue-N.json` marker **before** releasing the issue claim. Submitted work is not automatically reassigned and is *not* considered approved. The executable Node CLI supports `claim-next`, `handoff`, and `submit --confirm`. Do not confuse the feature branch with `main`.

## Fleet monitoring after the first five chats

The first five curated reviewer assignments have submitted technical findings. Use `node bin/vs-agent.mjs fleet-status` on a private, authenticated checkout to see a read-only, Git-commit-pinned snapshot of assignments, submitted reviews, mismatches and orphaned resource locks. See [pilot monitor](docs/PILOT_MONITOR.md). Submitted reviews await independent approval; the monitor does not merge PRs or create new development tasks.

## Wave 2: two first developer agents

The first five reviewer tasks are submitted (pending independent review). **Two supervised write tasks** are now in the curated queue: `astrological-functions#5` (ESM provider consumer smoke) and `astrological-charts#25` (axis canvas browser smoke). They are restricted to exact new files and each uses a separate exclusive resource partition. Use [docs/LAUNCH_DEVELOPERS_WAVE2.md](docs/LAUNCH_DEVELOPERS_WAVE2.md) to launch two independent GitHub-connected developer chats; never have either agent push to an existing active PR branch or modify production.
