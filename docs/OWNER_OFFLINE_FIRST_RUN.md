# Owner offline first-run gate

This **offline smoke test** is the fastest safe command to run in a new Node.js 20+ checkout **before** configuring a GitHub token or private ledger:

```powershell
npm run smoke:owner-local
```

It launches two separate fixed-purpose subprocesses with an allowlisted environment (system paths and temp directories only). The first validates tokenless public discovery and the complete in-memory two-agent claim → handoff → submission → release flow. The second runs two **actual independent Node operating-system processes** against one isolated temporary filesystem claim, including exclusive creation, loser rejection, owner-only release and safe re-acquisition. No GitHub API or real browser chat is invoked.

## Interpreting the result

The single JSON summary deliberately includes **aggregate counts and blocker codes only**. A successful result is `offline-checks-pass-live-pilot-blocked`, **not** `ready`. It reports three checks, zero live GitHub requests, zero real chats, and the remaining five manual steps. Failed evidence, unexpected subprocess output or unsafe command arguments result in a nonzero exit without echoing private paths or child stderr.

The command does **not** read the private ledger, evaluate the current remote claim store, validate historical migration, approve the local task catalog, create a PR, or measure throughput for 40 live chats. In particular, distinct local processes racing on `wx` files do **not** establish distributed GitHub Contents API serialization. It must not become an authorization check for deployment or automatic merges.

## Next owner-operated steps

1. Independently provision and confirm a PRIVATE GitHub coordination repository, keeping credentials outside this checkout.
2. Back up and migrate the seven frozen historical submission records under an independently reviewed copy-only plan; run `check-private-destination`, `export-verified-ledger`, `plan-ledger-copy` and `verify-private-activation` per their operator guides.
3. Create an owner-approved task catalog outside the public repository and approve its SHA-256 fingerprint.
4. Run `alpha-doctor` on the privately configured ledger and task queue. A blocked result is a stop signal.
5. Supervise two separate live chats, each with a different session ID, and review factual claim/handoff/release evidence before expanding.

Related: [MVP activation](MVP_ACTIVATION.md), [first owner alpha](FIRST_OWNER_ALPHA.md), [offline local process test](LOCAL_PROCESS_REHEARSAL.md) if available, and [public transition](PUBLIC_TRANSITION.md). No private repository configuration or token belongs in a public issue or PR.
