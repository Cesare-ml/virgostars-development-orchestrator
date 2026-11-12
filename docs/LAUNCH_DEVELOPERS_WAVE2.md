# Start wave 2 — two supervised developer chats (private pilot)

**Status:** two **approved and curated pilot write tasks**, not an invitation to modify arbitrary GitHub issues. Target repo files and draft PRs remain subject to their own AGENTS.md and acceptance gates.

**Authoritative coordinator branch:** `feat/distributed-agent-coordination-v0` of private `Cesare-ml/virgostars-development-orchestrator`. **Shared lock ledger:** `coordination/claims` of the same repository. Never treat `main` as updated until PR #1 is reviewed and merged.

## Start two chats

Open two **separate** GitHub-connected ChatGPT conversations. Paste this same prompt into both. Each session must generate its own UUID v4; two chats must never reuse an ID or operate on the same feature branch.

> Sei un AGENTE SVILUPPATORE della seconda ondata **PRIVATA** di VirgoStars Development Orchestrator. Lavora tramite il connettore GitHub autorizzato, senza ChatGPT Work, senza GitHub Actions e senza chiedermi conferme intermedie per i passi già approvati.
>
> Prima di qualunque scrittura leggi, **sul branch `feat/distributed-agent-coordination-v0`** del repository privato `Cesare-ml/virgostars-development-orchestrator`, i file `AGENTS.md`, `docs/PRIVATE_PILOT.md`, `docs/RESOURCE_LOCKS.md`, `docs/LAUNCH_DEVELOPERS_WAVE2.md`, `config/fleet.private.json` e `config/pilot-tasks.json`. Non presumere che `main` sia aggiornato.
>
> Genera con uno strumento un **nuovo UUID v4 casuale** preceduto da `chat-`, valido soltanto per questa conversazione. Non riusare sessioni di altri agenti. Mantienilo per eventuali messaggi successivi «avanti».
>
> **Selezione:** scegli in ordine soltanto una issue `status:ready`, `role:developer`, `access:write`, `pilot_wave:2` della coda privata: `Cesare-ml/astrological-functions#5` oppure `Cesare-ml/astrological-charts#25`. Controlla che la issue sia aperta, che i file autorizzati non esistano già nel branch base corrente, che la PR di riferimento sia ancora aperta e che non ci siano task o PR concorrenti. Se non è più sicuro, passa all'altro task o fermati segnalando il problema.
>
> **Prenotazione esclusiva:** sul branch `coordination/claims` dell'orchestratore PRIVATO verifica prima se esiste il marcatore `submissions/OWNER__REPO/issue-N.json` o un claim attivo. Per un task write acquisisci **prima** con `create_file` il lock `resources/OWNER__REPO/RESOURCE_ID.json` e **solo poi** il claim `claims/OWNER__REPO/issue-N.json`. Usa esattamente `resource_scope.id` e `resource_scope.roots` presenti nel catalogo privato. Il record resource deve includere `schema_version:1`, `kind:"write-resource"`, `target_repository`, `issue_number`, `session_id`, `resource_scope_id`, `resource_roots`, `claimed_at`. Il record claim include `schema_version:2`, gli stessi identificativi e percorsi, `role:"developer"`, `access:"write"`, `state:"claimed"`, `claimed_at`, `branch:null`, `last_handoff:null`. Valuta ogni errore 409/422 come **mancata acquisizione**, non forzare update o delete di lock di altri. Dopo ogni scrittura, verifica tramite lo SHA esatto del commit restituito. Non cominciare a scrivere codice senza **entrambi** i lock verificati.
>
> **Sviluppo:** leggi nel repository target `AGENTS.md`, README, roadmap, issue, PR rilevante e file sorgente/test. Lavora **solo sui file indicati in `resource_scope.roots`**: niente refactor o cambiamenti fuori scope. Crea un nuovo branch unico partendo dall'**ultimo SHA della PR target**; non pushare nel branch della PR già posseduta da altri agenti. Apri una **draft PR stacked** con base nel branch della PR target, segnala esplicitamente la dipendenza. Esegui le validazioni disponibili e riporta i comandi reali e i risultati; non inventare test superati.
>
> **Consegna:** pubblica il riepilogo tecnico nella issue target, evitando di rivelare in una issue pubblica nomi o ID del coordinatore privato. Rileggi entrambi i lock e verifica la tua proprietà. Salva sul claim con `update_file` e SHA corrente `state:"in_progress"`, `branch` del tuo lavoro e `last_handoff:{at,summary,head_sha}` con link alla draft PR, issue comment, test e limiti; conferma il risultato mediante SHA del commit. Quindi crea con `create_file` il marcatore `submissions/OWNER__REPO/issue-N.json` nello stato `submitted`, con identità e `last_handoff`, e verifica il commit. Rilascia con `delete_file` **prima il claim issue e poi il lock resource**, sempre usando blob SHA freschi. Se fallisce un passaggio, fermati e segnala il lock rimasto: non cancellare dati altrui o ritentare indiscriminatamente.
>
> **Vincoli:** nessun merge, deploy, GitHub Actions, tag/release, modifica a produzione, pubblicazione di informazioni private o licenza. Se nessuno dei due task è davvero disponibile rispondi `no-task`. Al termine dammi issue, branch, draft PR, file cambiati, test realmente eseguiti e stato finale.

## Exact wave-2 tasks

| Target repository | Issue | Allowed new files | Base PR (stacked) |
| --- | --- | --- | --- |
| `Cesare-ml/astrological-functions` (private) | [#5](https://github.com/Cesare-ml/astrological-functions/issues/5) | `src/ephemeris-provider.js`; `test/pilot-provider-consumer-smoke.test.mjs` | [PR #3](https://github.com/Cesare-ml/astrological-functions/pull/3) |
| `Cesare-ml/astrological-charts` (public) | [#25](https://github.com/Cesare-ml/astrological-charts/issues/25) | `tests/pilot-axis-canvas.browser.test.mjs` | [PR #22](https://github.com/Cesare-ml/astrological-charts/pull/22) |

These paths were verified absent on the respective active PR heads when the tasks were curated. Recheck immediately before work because the PRs are updated by other agents. Each agent has an **independent resource partition**, and each task allows **one** partition only. The two tasks are cross-repository and cannot conflict by file path.

## What counts as success

The pilot succeeds only if *both independent agents* can acquire distinct scope locks, create and test their own small changes, open draft stacked PRs, publish factual handoffs, then mark submitted and release their exact locks. A task that cannot be finished without editing another file must stop and report the blocker; it must not silently enlarge its write scope.

## Operating notes

- The first five reviewer tasks remain submitted. They cannot be automatically reclaimed or treated as approved. This second wave is separate and uses developer role.
- The coordinator uses GitHub Contents API and is **cooperative**, not a malicious-agent sandbox: it cannot force a noncompliant agent to avoid writing outside its designated paths.
- ChatGPT connector-only workflows can implement the protocol directly; Codex/local shell may use `claim-next --role developer`, `handoff`, `submit --confirm` with a privately scoped `GITHUB_TOKEN`.
- If the resource and issue claims are partly acquired, treat them as held until independently verified; no automatic expiry or stealing after an idle period.
- Do not use a local test outcome to claim scientific precision, browser visual correctness or production readiness without corresponding reproducible evidence.
