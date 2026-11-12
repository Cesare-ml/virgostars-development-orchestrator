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
