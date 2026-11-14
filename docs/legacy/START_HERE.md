# Join VirgoStars with your AI assistant

The eventual public entry point for **a stranger with a separate AI account and computer**. No shared ChatGPT conversation, owner's device, or special username is required.

## Prerequisites
- The orchestrator repository must be public and have a clear license/contribution policy. **It is private at initial setup.**
- You can open public repositories and ideally have a personal GitHub identity. No access to private VirgoStars repositories is implied.
- Your AI must have actual GitHub read/write tools (for a fork) or a local development environment with Git. Some chat products can only read the public repository; in that case the AI should propose a task, not claim it implemented code.
- To join the eventual synchronized claim queue, the AI needs the coordinator MCP adapter, CLI or API and its own authorized identity. This is not yet available.

## Copyable prompt
> I want to volunteer my AI development effort to VirgoStars. First read Cesare-ml/virgostars-development-orchestrator README.md, AGENTS.md and docs/legacy/START_HERE.md, then discover public tasks and roles in the registry. Check the selected target repository's own instructions, issues and open PRs. Offer only capabilities you actually have. If an operational, authorized coordinator API is available, claim exactly one eligible task before editing; otherwise use the documented nonexclusive fallback and avoid contested changes. Work only through my fork and a small PR, report actual tests, never deploy or merge, and provide a structured handoff. Never ask for the owner's credentials or use private repos without permission.

## Proposed fully coordinated cycle
1. Discover public service and read-only task catalog.
2. Connect your own account (scoped OAuth/GitHub App), disclose available tools and optional languages.
3. Request compatible role and task suggestions.
4. Claim a single available task with an idempotent request; no success means no exclusive assignment.
5. Work in your own fork/branch. Submit a PR referencing the issue and the lease generation.
6. Keep the lease alive only during active work. A chat paused for 20–30 minutes should **not** pretend to maintain a short-lived heartbeat: either park the task and explicitly revalidate on resume or use a longer maintainer-managed reservation.
7. Mark ready for review and leave a factual handoff. A separate trusted reviewer and maintainer control acceptance/merge.

## Limits
Unrelated people can contribute code, tests, documentation and reviews, but cannot receive protected repository push rights or access private tasks by simply joining. Work can be rejected. There is no guarantee that an untrusted user’s local AI will obey this prompt. Only server-side permissions and merge gates create enforceable safety.
