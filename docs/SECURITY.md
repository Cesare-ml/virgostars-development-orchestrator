# Security, community trust and supply-chain safeguards

## Contribution tiers
- **Anonymous reader:** may read public docs/tasks, no claim or write.
- **Verified public volunteer:** uses own identity, may claim low-risk public tasks through coordinator when operational, work in fork and create upstream PR; no privileged scopes.
- **Trusted contributor:** separately approved permissions for additional tasks/reviews.
- **Maintainer/owner:** protected merges, security-sensitive changes, release and deployment approvals.

Agents must never be trusted just because a user gave them a good prompt. Require server-enforced authn/authz, GitHub permissions, identity-to-session binding, per-task policy, throttling and audit logging. Sybil identities, malicious task descriptions and GitHub PRs are realistic risks.

## Least privilege
Do not request an owner's personal access token for external volunteers. Never expose private repo metadata in the public registry. No credentials in issues, PR descriptions, screenshots, handoffs, logs or code. No execution of untrusted pull requests with project secrets or privileged GitHub tokens. Do not authorize fork PRs to edit CI, publishing, access controls or package credentials without independent maintainer inspection.

## Human control
No automatic merging of external contributions. Protect main with reviews and checks where supported. Independent review for security-sensitive changes and new dependencies; perform malware, dependency provenance and license review. Report findings through repository-approved private security reporting, not public exploit details.

## Public repository transition — outstanding security work
The repository has already become **PUBLIC** by owner decision (2026-11-12). The prior private-release checklist was **not** a completed safety audit. Review files, refs and history for secrets/nonpublic metadata, move owner-only coordination to a private location, and choose a LICENSE before describing it as open source. Removing a file in a new commit does not remove its public history. See [PUBLIC_TRANSITION.md](legacy/PUBLIC_TRANSITION.md). Listing private targets does not make them open source.

## Pinned native test execution (manual only)

The private `scripts/verify-pilot.mjs` supports a manual operator workflow with authenticated GitHub Contents:read access. It pins the exact GitHub branch commit, validates blob hashes and file paths before writing a temporary checkout, and removes credentials from the spawned `npm run check` process. Run only trusted commits from the fixed private repository: Git object integrity is not a sandbox and npm scripts may execute arbitrary code. Only test-only, read-only GitHub Actions in this public repository are authorized. No background agent scheduler, private fleet access, automatic merge or deployment. Never put tokens in prompts, issue comments, logs or repository files. [Native validation procedure](legacy/NATIVE_VALIDATION.md).

## Unsigned local test evidence

The pinned private native verifier may optionally write a bounded local JSON receipt using `--receipt`. The receipt is an **allowlisted, UNSIGNED, SELF-REPORTED** record containing only commit/tree SHA, counts, runtime version and native npm exit outcome; it excludes tokens, arbitrary environment variables and downloaded blob contents. The writer rejects overwrite and the offline reader limits input to 4 KiB. Do not treat a receipt as an authenticated signature, third-party review, GitHub CI result or permission to merge. See [VALIDATION_RECEIPTS.md](legacy/VALIDATION_RECEIPTS.md).

## Read-only public discovery

The public CLI command `public-discover` is isolated from the legacy owner-pilot registry and claim store. It requires no GitHub token, consumes only `config/fleet.json`, strictly validates public-only project fields and rejects automatic claim/merge/deploy policy. It displays pending-owner-approval projects only and never issues write claims. See [PUBLIC_DISCOVERY.md](legacy/PUBLIC_DISCOVERY.md). Do not run owner-pilot claim commands to onboard untrusted public participants; the historical public Git ledger is not private. A public discovery listing is not a grant of source licenses or repository permissions.

## CLI refuses legacy coordination on a public ledger

The owner-only Node CLI now requires a **live GitHub visibility preflight** before any legacy pilot command and before each ledger read/write. The configured ledger currently resides in this **public** repository, so these commands intentionally fail closed until a separate **verified private** ledger is selected and its records and clients are reconciled. A YAML/JSON setting that says "private" does not prove GitHub repository visibility. The `public-discover`, `session` and help commands remain independent and tokenless.

This gate does **not** hide historical Git data or prevent a ChatGPT connector/third-party client from writing directly to the public branch. Agents must not create new confidential claims there. Migration is tracked under [issue #19](https://github.com/Cesare-ml/virgostars-development-orchestrator/issues/19); never publish credentials or detailed old operational records as part of that work.
