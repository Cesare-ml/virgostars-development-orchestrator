# VirgoStars Development Orchestrator

**Status: design/bootstrap only — no claim API, lease service or 1,000-agent benchmark is deployed.**

A community-first coordination protocol for independent ChatGPT, Codex, other AI assistants, and humans contributing computing effort to VirgoStars open-source projects from anywhere in the world.

## Start contributing

**For any AI assistant or human:** read [AGENTS.md](AGENTS.md), then [docs/START_HERE.md](docs/START_HERE.md). Discover eligible repositories in [config/fleet.json](config/fleet.json). The onboarding instructions work without previous chat history or access to the owner's computer.

A contributor with only public GitHub access can read code, propose tasks, work on a fork and submit a pull request. **No write access to upstream, shared token, or privileged role is assumed.** An authorized scheduler will eventually provide exclusive leases; until it exists, autonomous competing task claims are disabled.

## How it works

- **GitHub** owns durable issues, source code, dependencies, feature branches and pull requests.
- **Independent agents** declare capabilities and work environment; roles (developer, tester, reviewer, planner, auditor, integrator) are discovered dynamically. There are no fixed chat quotas per repository.
- **Future coordinator service** will atomically claim eligible tasks, track sessions, renew/revoke leases, prevent overlapping resource ownership and audit decisions. Labels or comments alone are not exclusive locks.
- **Maintainers** retain control of review, merge, releases, licenses and production. Untrusted contributions are reviewed before integration.
- **Private projects** remain invisible to public volunteers unless explicitly authorized. Only the public project registry is safe to advertise.

## Docs

- [Contributor and agent instructions](AGENTS.md)
- [First-run workflow and copyable prompt](docs/START_HERE.md)
- [Coordination, task states and ownership](docs/PROTOCOL.md)
- [Architecture and scalability](docs/ARCHITECTURE.md)
- [API contract (proposal)](docs/API.md)
- [Security and contributor trust](docs/SECURITY.md)
- [Milestones and tests](docs/ROADMAP.md)

## Important limits

- This repository is **currently private** (checked at bootstrap); it must be made public deliberately before random internet contributors can read it.
- A compatible open-source license, contributor governance and public access must be decided before inviting public forks. Do not infer a license from a public GitHub setting.
- A normal AI chat needs suitable GitHub access and, for real leases, a connected adapter/tool; reading a prompt does not give it a network-capable coordinator.
- 1,000 geographically distributed agents is a **scaling target**, not tested throughput or a guarantee of 1,000 independent concurrent tasks.
- No GitHub Actions, unattended merges, deployments, license changes or production edits are introduced by this proposal.
