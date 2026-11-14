# Claim creation: verify the PRIVATE GitHub receipt before starting work

GitHub's REST Contents API can acknowledge a file creation while another
agent acts concurrently or a subsequent read returns a stale, missing or
inconsistent snapshot. A HTTP 2xx alone is **not** enough evidence that an
agent controls both its task and its write-resource partition.

This patch adds a **post-create readback** to the core \`claim\` path, which
also protects automatic \`claim-next\` selections:

1. Keep the existing preclaim checks, including the optional live PR
   collision gate for owner-approved GitHub catalogs.
2. For a write task, create the exclusive resource record before the issue
   claim. For a read task, only the issue claim is required.
3. When the issue-claim Contents create returns success, immediately read
   the actual current PRIVATE coordination records via \`status\`.
4. Return \`result:"acquired"\` **only** when a nonempty Git claim blob,
   exact repository/issue/session/role/access, declared resource ID and
   sorted roots, timestamp, branch and initial state match the fresh
   submission. The existing \`status\` validates the corresponding resource
   lock and checks there is no immutable submission marker.
5. If that readback is missing, stale, malformed, foreign, ambiguous or
   interrupted, **do not return acquired**. In that case do not
   automatically delete the possibly valid resource or issue claim: the
   original owner must inspect and reconcile the private records before
   retrying. Never begin code edits based on an uncertain claim.
6. On 409/422 issue-claim contention, a matching session may resume its
   claim only if the role, access and resource partition still agree with
   its approved task; otherwise reconciliation is mandatory.

This is intentionally conservative: GitHub's eventual consistency may
occasionally force a manual recovery even when the underlying write
succeeded. It is safer than acknowledging a resource claim that cannot be
confirmed independently. The private ref and readback remain separate
GitHub requests, not an atomic multi-resource transaction.

All tests are synthetic and tokenless; they exercise the actual \`claim\`
and \`claim-next\` code under simulated successful writes, stale reads,
foreign ownership, forged 422 responses and late PR state conditions.
No private ledger, existing owner claim or production service is changed
by the draft PR. An approved owner catalog and a supervised first two-chat
pilot are still required before claiming operational success.
