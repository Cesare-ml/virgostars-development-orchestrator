# Owner-only orchestrator self-development task eligibility

**Scope:** supervised owner alpha, not a new unattended scheduler or public contributor enrollment.

The owner task catalog can now target the orchestrator's **public source
repository** itself. This does **not** permit coordination claims on that public
repository: the exclusively approved claim/submit/resource ledger MUST remain a
different, verified **PRIVATE** GitHub repository.

## Why

During the first two-chat alpha, a ChatGPT agent should be able to receive an
explicitly approved task to improve the coordinator itself, not just the five
original downstream VirgoStars projects. A self-target is a **normal development
target**, never a claim ledger and never a wildcard permission.

The original five enabled target repositories remain enabled; the sixth entry
is the canonical \`Cesare-ml/virgostars-development-orchestrator\` source.
Only that exact spelling is eligible for new self-work catalog tasks. The
historical seven submitted task identities remain permanently excluded.

## Safe selection

A self-task must be a **new, existing, open GitHub issue** with an owner-approved
\`developer\` or \`tester\` role; \`access:"write"\`; a single strictly scoped
resource partition; a reviewed still-open upstream PR/branch; and exact approved
file roots. It must be in the owner-local, exact SHA-256-approved task catalog
outside the public Git checkout.

For example, a task to add one new test under
\`test/new-alpha-example.test.mjs\` should use only that path as both \`scope\`
and \`resource_scope.roots\`. This is an illustrative path, not an approved real
issue; do not claim work from this documentation.

Before any self-task claim:
1. Run the existing read-only \`verify-private-activation\` and
   \`alpha-doctor\` checks against the owner's separate PRIVATE ledger.
2. Ensure the owner-approved catalog includes a **real** issue and a reviewed
   current upstream PR, with no overlapping currently open PR changes.
3. Create the resource lock first in the PRIVATE ledger, then create the issue
   claim exclusively for a distinct chat UUID; recheck both before modifying
   code. Never write new claims to the public source branch.
4. Create a scoped draft PR on a **new branch**, never overwrite peer or main
   branches. Run actual tests, store an accurate owner handoff, create a
   private immutable submission marker and release only the original session's
   locks after the documented live scope and collision audits.

Two chats may both improve this repository only if their exact approved
partitions are independent. If either edit spans common files (for example
\`src/claims.mjs\`), owner should serialize work or place it in one partition
rather than create competing owners.

## Limits and follow-up

This release changes **eligibility only**. It does not create an issue, assign
a task, give a GitHub token, edit the ledger, claim existing public branches,
launch browser tabs, perform a merge or show the two-chat real pilot has passed.

The current owner source CLI uses a protected locally SHA-approved task catalog.
Connector-only ChatGPT chats with no local Node installation still need the
owner to supply an explicitly approved task and verify PRIVATE ledger
ownership before any write. Do not treat the historical on-disk catalog as a
live queue or bypass these checks because the chat has a GitHub connector.

Run the first two independent chats under manual observation. Scale to 20,
40 and eventually 100 only after the measured real pilot, queue/backpressure
review and separate capacity controls permit it.
