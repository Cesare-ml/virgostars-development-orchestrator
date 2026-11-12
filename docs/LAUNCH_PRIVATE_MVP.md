# Launch the FIRST private MVP with 3–5 ChatGPT chats

**Entry branch:** `feat/distributed-agent-coordination-v0` in `Cesare-ml/virgostars-development-orchestrator`. The `main` branch does NOT contain the MVP yet. Use the **connected GitHub app/tool**, not public web search, to read the private orchestrator.

**Shared ledger:** branch `coordination/claims` in the same private repository. This branch is data, never merge it into `main`.

**Starting scope:** exactly five curated **read-only reviewer** tasks; no coding, release, main merge, GitHub Actions, production edits or license/visibility changes are permitted by these tasks.

## Start now

1. Open **three to five separate ChatGPT chats**, each with working GitHub connector permissions to the private orchestrator and the five target repositories.
2. Paste the following **same prompt** into each chat. The agent must generate a different session UUID for each chat. Wait for the claim evidence before trusting that a task was reserved.
3. If one chat is paused, resume **that same conversation** instead of creating another chat pretending to own its session. Its first action must be to reread the claim and issue.
4. When an agent reports `submitted`, do not interpret it as approval. Review the published finding. The task is removed from automatic pickup until a maintainer explicitly triages it again.

## Copy/paste prompt for each chat

> Sei un AGENTE REVISORE della prima MVP PRIVATA di VirgoStars Development Orchestrator. Esegui adesso un solo incarico reale senza chiedermi conferme intermedie e non usare ChatGPT Work né GitHub Actions. Usa il connettore GitHub autorizzato.
>
> **Prima di lavorare:** leggi sul branch `feat/distributed-agent-coordination-v0` di `Cesare-ml/virgostars-development-orchestrator`: `AGENTS.md`, `docs/PRIVATE_PILOT.md`, `docs/LAUNCH_PRIVATE_MVP.md`, `config/fleet.private.json`, `config/pilot-tasks.json`, `docs/RESOURCE_LOCKS.md`. Non leggere `main` come se fosse già aggiornato. Se non riesci ad accedere al repository privato, fermati e segnala il problema.
>
> **Sessione:** crea un UUID v4 casuale con uno strumento disponibile, prefissato `chat-`, e usalo esclusivamente in questa conversazione. Non riutilizzare gli ID degli esempi o di altre chat. Memorizzalo nel contesto di questa chat per i follow-up.
>
> **Selezione:** considera soltanto i task `status=ready`, `role=reviewer`, `access=read` del catalogo privato. Per ciascuno, in ordine, verifica che la issue target sia aperta, che il file `submissions/OWNER__REPO/issue-N.json` NON esista e che il file `claims/OWNER__REPO/issue-N.json` NON sia già prenotato sul branch `coordination/claims` dell'orchestratore. Se è già prenotato o consegnato, prova il prossimo. Non inventare nuove issue o task.
>
> **Lock:** acquisisci il task tramite l'azione GitHub `create_file`, NON `update_file`, sul branch `coordination/claims` del repository privato `Cesare-ml/virgostars-development-orchestrator`, al percorso `claims/OWNER__REPO/issue-N.json`. Il JSON deve contenere `schema_version:2`, `target_repository`, `issue_number`, `session_id`, `role:"reviewer"`, `access:"read"`, `resource_scope_id:null`, `resource_roots:null`, `state:"claimed"`, `claimed_at` ISO UTC, `branch:null`, `last_handoff:null`. Solo il successo di `create_file` assegna l'incarico; errori 409/422 non sono successi. Verifica il file creato tramite il SHA del commit restituito. Non scrivere codice né commentare la issue prima del lock.
>
> **Lavoro:** leggi le istruzioni `AGENTS.md`, la roadmap, la issue scelta e le PR pertinenti del repository target. Esegui la revisione concreta e limitata richiesta dalla issue. Controlla davvero codice e test disponibili, separa i fatti verificati dai controlli non eseguiti, individua problemi e passi successivi. Non modificare codice, non approvare la tua PR, non fare merge/deploy. Pubblica un commento tecnico sintetico nella issue target, senza inserire ID di sessione o informazioni del registro privato nelle issue pubbliche.
>
> **Consegna:** rileggi il claim privato verificando che la tua sessione sia ancora proprietaria, poi usa `update_file` con lo SHA del blob corrente per salvare `state:"in_progress"` e `last_handoff:{at,summary,head_sha:null}`, collegando nel testo il commento tecnico pubblicato. Verifica il risultato usando il SHA esatto del commit aggiornato (non una lettura potenzialmente obsoleta del branch).
>
> **Chiusura senza duplicazioni:** crea con `create_file` sul branch `coordination/claims` il marcatore `submissions/OWNER__REPO/issue-N.json` con `schema_version:1`, `state:"submitted"`, gli stessi `target_repository`, `issue_number`, `session_id`, `role:"reviewer"`, `access:"read"`, `resource_scope_id:null`, `submitted_at`, una copia del `last_handoff` e `note:"Awaiting independent review; not automatically approved or DONE"`. Verificalo. **Solo dopo** rimuovi il claim dell'issue con `delete_file` e lo SHA corrente del suo blob; non cancellare marker di consegna. Se una fase fallisce, fermati e segnala esattamente quali file esistono: non forzare nulla.
>
> **Risultato:** riferisci repository, issue, ruolo, prova dell'assegnazione, sintesi delle verifiche, link al commento e stato finale (`submitted` oppure bloccato). Se tutti i task sono prenotati o già consegnati, scrivi `no-task` e fermati; non creare lavoro aggiuntivo. A ogni mio successivo «avanti», rileggi lo stato remoto prima di qualunque azione.

## Five first tasks

The exact IDs and scope are in `config/pilot-tasks.json`. At pilot bootstrap:

| Repository | Issue | Mode |
| --- | --- | --- |
| `Cesare-ml/VirgoStars-Ephemeris` | #85 | review |
| `Cesare-ml/VirgoStars-Event-Ephemeris` | #10 | review |
| `Cesare-ml/astrological-charts` | #23 | review |
| `Cesare-ml/astrological-functions` | #4 | review, private |
| `Cesare-ml/virgostars-desktop` | #34 | review, private |

## Codex/local CLI alternative

On Windows PowerShell, check out the **feature branch** (the main branch is not ready):

```powershell
git clone https://github.com/Cesare-ml/virgostars-development-orchestrator.git
cd virgostars-development-orchestrator
git switch feat/distributed-agent-coordination-v0
npm run check
node bin/vs-agent.mjs session --kind codex
```

Then set your own scoped `GITHUB_TOKEN` **privately** through your system's credential handling and run `node bin/vs-agent.mjs claim-next --session <SESSION_FROM_COMMAND> --role reviewer`, followed by the actual review, `handoff`, and `submit --confirm`. Never paste a token into ChatGPT.

## Current limits

This pilot coordinates cooperative agents using GitHub: it does **not** run chats in the background or automatically spawn agents. The five tasks are review-only, not proof of safe concurrent code writing. GitHub metadata can be briefly stale; when uncertain, stop. An interrupted submission can leave both a submission marker and an active issue claim; the original owner or maintainer must reconcile it, not another agent. Future expansion to many developers needs an audited assignment/approval process and actual validation under load.
