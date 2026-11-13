import { readFile } from 'node:fs/promises';
import { loadOwnerTasks } from './owner-task-catalog.mjs';
import { validateOperatorSelection } from './private-ledger-activation.mjs';

const LEGACY_PUBLIC_LEDGER='Cesare-ml/virgostars-development-orchestrator';

/**
 * Keep the committed legacy catalog unchanged for historical compatibility.
 * An owner may select a NEW private ledger using two matching local env vars.
 * This does not bypass the live privacy + historical marker gates in the CLI.
 */
export async function loadPilotConfig({
  repository=process.env.VS_PRIVATE_LEDGER_REPO,
  acknowledgedRepository=process.env.VS_PRIVATE_LEDGER_APPROVED_REPO
}={}) {
  const data=JSON.parse(await readFile(
    new URL('../config/fleet.private.json',import.meta.url),'utf8'));
  if(data.status!=='PRIVATE_PILOT_NO_PUBLIC_ONBOARDING'||
     data.repository_visibility_required!=='private'||
     data.claim_store?.repo!==LEGACY_PUBLIC_LEDGER||
     data.claim_store?.branch!=='coordination/claims')
    throw new Error('Unexpected private pilot config.');
  if(repository!==undefined||acknowledgedRepository!==undefined) {
    data.claim_store.repo=validateOperatorSelection({
      repository,acknowledgedRepository
    });
  }
  return data;
}

export async function loadPilotTasks() {
  return loadOwnerTasks();
}
