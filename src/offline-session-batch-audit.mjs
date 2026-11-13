import {isDeepStrictEqual} from 'node:util';
import {prepareOfflineSessionBatch} from './offline-session-batch.mjs';

/** Validate original unmodified preparation records from separate offline waves.
 * Nothing here authenticates actual chats, assignments or live session ownership.
 * No session IDs, messages, filenames or tokens are returned.
 */
export function auditOfflineSessionBatches(batches) {
  if(!Array.isArray(batches)||batches.length<2||batches.length>20)
    throw new Error('batch_count_invalid');

  const allIds=new Set();
  let total=0,chat=0,codex=0;
  for(const batch of batches) {
    if(!batch||typeof batch!=='object'||Array.isArray(batch)||
       !Array.isArray(batch.sessions)||
       !Number.isSafeInteger(batch.sessions_prepared)||
       batch.sessions_prepared<2||batch.sessions_prepared>40||
       batch.sessions.length!==batch.sessions_prepared||
       !['chat','codex'].includes(batch.session_kind))
      throw new Error('batch_schema_invalid');

    const ids=batch.sessions.map(item=>item?.session_id);
    let offset=0;
    let expected;
    try {
      expected=prepareOfflineSessionBatch({
        count:batch.sessions_prepared,
        kind:batch.session_kind,
        uuid:()=>{
          const id=ids[offset++];
          const prefix=batch.session_kind+'-';
          return typeof id==='string'&&id.startsWith(prefix)?id.slice(prefix.length):'';
        }
      });
    } catch {
      throw new Error('batch_schema_invalid');
    }
    // Replaying the original generator detects modified safety flags/prompts,
    // unknown fields, slot gaps, duplicate IDs and incorrect kind/prefix.
    if(!isDeepStrictEqual(batch,expected))
      throw new Error('batch_schema_invalid');

    for(const id of ids) {
      const uuid=id.slice(batch.session_kind.length+1);
      if(allIds.has(uuid))throw new Error('duplicate_session_across_batches');
      allIds.add(uuid);
    }
    total+=ids.length;
    if(total>40)throw new Error('combined_capacity_exceeded');
    if(batch.session_kind==='chat')chat+=ids.length;
    else codex+=ids.length;
  }

  return {
    schema_version:'1-offline-session-batch-audit',
    batches_checked:batches.length,
    unique_sessions:total,
    chat_sessions:chat,
    codex_sessions:codex,
    cross_batch_duplicate_ids:0,
    github_requests:0,
    chats_verified_live:0,
    tasks_claimed:0,
    private_ledger_verified:false,
    owner_review_required:true,
    safe_to_launch:false
  };
}
