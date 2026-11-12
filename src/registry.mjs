import { readFile } from 'node:fs/promises';

export async function loadPilotConfig() {
  const data = JSON.parse(await readFile(new URL('../config/fleet.private.json',import.meta.url),'utf8'));
  if (data.status !== 'PRIVATE_PILOT_NO_PUBLIC_ONBOARDING'
      || data.claim_store?.repo !== 'Cesare-ml/virgostars-development-orchestrator'
      || data.claim_store?.branch !== 'coordination/claims')
    throw new Error('Unexpected private pilot config.');
  return data;
}
export async function loadPilotTasks() {
  const data = JSON.parse(await readFile(new URL('../config/pilot-tasks.json',import.meta.url),'utf8'));
  if (!Array.isArray(data.tasks)) throw new Error('Invalid curated task registry.');
  return data.tasks;
}
