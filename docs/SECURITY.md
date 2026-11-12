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

## Public-release gate
The orchestrator starts PRIVATE. Before it becomes public the owner must approve repository visibility, choose/verify applicable open-source license and contributor terms, scan files/history for secrets and private data, confirm safe public target registry, and approve the onboarding wording. This repository cannot make private projects open source merely by listing their names.
