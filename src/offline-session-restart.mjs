import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {prepareOfflineSessionBatch} from './offline-session-batch.mjs';

/** An offline packet for manually replacing failed independent conversations.
 * This never proves a tab has closed or transfers the old session's claims.
 */
export function planOfflineSessionRestarts(batch, slots, {uuid=randomUUID}={}) {
  if(!batch || typeof batch!=='object' || Array.isArray(batch) ||
     !['chat','codex'].includes(batch.session_kind) ||
     !Number.isSafeInteger(batch.sessions_prepared) ||
     batch.sessions_prepared<2 || batch.sessions_prepared>40 ||
     !Array.isArray(batch.sessions) || batch.sessions.length!==batch.sessions_prepared)
    throw new Error('source_batch_invalid');

  let offset=0, expected;
  try {
    expected=prepareOfflineSessionBatch({
      count:batch.sessions_prepared,kind:batch.session_kind,
      uuid:()=>{
        const id=batch.sessions[offset++]?.session_id;
        const prefix=batch.session_kind+'-';
        return typeof id==='string' && id.startsWith(prefix)?id.slice(prefix.length):'';
      }
    });
  } catch { throw new Error('source_batch_invalid'); }
  if(!isDeepStrictEqual(batch,expected)) throw new Error('source_batch_invalid');

  if(!Array.isArray(slots) || slots.length<1 || slots.length>batch.sessions_prepared ||
     slots.some(slot=>!Number.isSafeInteger(slot) || slot<1 || slot>batch.sessions_prepared) ||
     new Set(slots).size!==slots.length ||
     slots.some((slot,index)=>index>0 && slot<=slots[index-1]))
    throw new Error('restart_slots_invalid');

  // Replay the fixed initial prompt generator: only the fresh label may differ.
  // Generate the whole replacement batch to enforce v4 syntax and uniqueness.
  const fresh=prepareOfflineSessionBatch({
    count:batch.sessions_prepared,kind:batch.session_kind,uuid
  });
  const oldUuids=new Set(batch.sessions.map(s=>s.session_id.split('-').slice(1).join('-').toLowerCase()));
  if(fresh.sessions.some(s=>oldUuids.has(s.session_id.slice(batch.session_kind.length+1))))
    throw new Error('old_session_id_reused');

  return {
    schema_version:'1-offline-session-restart-plan',
    source_schema_version:batch.schema_version,
    session_kind:batch.session_kind,
    replacements_prepared:slots.length,
    replacements:slots.map(slot=>({
      slot,
      previous_session_id:batch.sessions[slot-1].session_id,
      replacement_session_id:fresh.sessions[slot-1].session_id,
      initial_prompt:fresh.sessions[slot-1].initial_prompt,
      claim_transfer_attempted:false
    })),
    chats_started:0,
    tasks_claimed:0,
    github_requests:0,
    old_sessions_closed_verified:false,
    old_claims_reconciled_verified:false,
    private_ledger_verified:false,
    owner_review_required:true,
    ready_to_launch:false
  };
}
