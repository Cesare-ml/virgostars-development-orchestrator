# Offline failed-chat replacement preparation

**Draft feature. No restart automation, task reassignment, claim transfer, or private-ledger activation.** This operator-only command is intended for an owner who already saved a batch created by "prepare-agent-sessions.mjs" and wants to prepare replacements after some independent ChatGPT/Codex sessions appear to have failed.

## Windows (Node 20+)

Run from the reviewed feature branch. Save the original batch **outside the public repository**; do not paste its contents into an issue or PR.

~~~powershell
node scripts/prepare-agent-sessions.mjs 10 chat > "$env:USERPROFILE\Documents\vs-old-batch.json"
node scripts/plan-offline-session-restarts.mjs "$env:USERPROFILE\Documents\vs-old-batch.json" "$env:USERPROFILE\Documents\vs-replacements.json" --slots 2,7
node --test test/offline-session-restart.test.mjs
~~~

The new output file is private owner-local JSON, created with exclusive non-overwriting file access (POSIX mode 0600, Windows permissions remain subject to the filesystem ACL). It contains **only requested slots**, original and fresh replacement session IDs, and regenerated safe initial prompts. Each new chat gets a **different** v4 session ID, never the failed chat's old ID, while its initialization text is identical apart from the new ID. Keep both files private and protect backups. The CLI prints only aggregate counts and booleans, never paths, IDs, prompts, task records or tokens. It reads no GitHub token and makes no network requests. Counts of prepared replacements are not counts of started chats.

The source must be an untouched "1-offline-session-batch" file. Every original prompt, slot, ID and safety flag is validated by replaying the original generator. Reject any tampering, duplicate or unsorted --slots values, reused UUID, input/output path in the public checkout, symlinks, bad/oversized JSON, and existing output. Input/output must be **absolute paths**. The tool will not silently overwrite an earlier restart plan. Use a new output file for a separate plan.

## Required human reconciliation

1. Confirm which old browser tab/conversation actually failed, whether it has completed a handoff, and whether any issue/resource claim is still held. A browser tab disappearing is **not** evidence its claim expired.
2. Keep the old session ID and its claim history intact. Do not run a second chat under the original session ID; a replacement conversation receives its **own** new ID. A still-active claim requires owner-supervised recovery under the verified private coordination protocol, never a silent reassignment.
3. Independently verify owner-approved **PRIVATE** ledger activation and permitted task catalog before a newly started session may attempt claim-next. A newly generated initial prompt is not authorization to claim anything.

The output deliberately contains "old_sessions_closed_verified:false", "old_claims_reconciled_verified:false", "private_ledger_verified:false", "owner_review_required:true" and "ready_to_launch:false". **An operator must not interpret this output as permission to launch, acquire a claim or merge code.** A separate browser tab manager may eventually act after a verified owner decision, but this CLI does not launch, close or reopen tabs.

## Limitations

This does not test real ChatGPT browser continuity, two-machine mutual exclusion, durable GitHub/PostgreSQL fencing, real task handoff, exact visibility of historical claims, or throughput for 40 live sessions. The supplied source batch's UUID labels are not authentication. Reusing the same *prompt template* is safe preparation; reusing a failed session's **identity and lock ownership** is not. No production data or public coordination files are changed.
