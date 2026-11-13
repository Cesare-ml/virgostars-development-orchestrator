import {randomUUID} from 'node:crypto';

const UUID_V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Prepare local, unassigned identity labels for independent owner-operated chats.
 * This pure helper never reads a task queue, contacts GitHub or acquires locks.
 * Session identifiers are coordination labels, NOT authentication credentials.
 */
export function prepareOfflineSessionBatch({count,kind='chat',uuid=randomUUID}={}) {
  if(!Number.isSafeInteger(count)||count<2||count>40)
    throw new Error('Expected an integer session count between 2 and 40.');
  if(kind!=='chat'&&kind!=='codex')
    throw new Error('Session kind must be chat or codex.');
  if(typeof uuid!=='function')
    throw new Error('Invalid UUID source.');

  const seen=new Set();
  const sessions=[];
  for(let index=1;index<=count;index++) {
    const value=uuid();
    if(typeof value!=='string'||!UUID_V4.test(value))
      throw new Error('UUID source did not produce a valid v4 identifier.');
    const sessionId=kind+'-'+value.toLowerCase();
    if(seen.has(sessionId))
      throw new Error('Duplicate session identifier: discard the entire batch.');
    seen.add(sessionId);
    sessions.push({
      slot:index,
      session_id:sessionId,
      initial_prompt:[
        'You are an independent VirgoStars Orchestrator owner-pilot agent.',
        'Use this unique coordination session ID for this conversation only: '+sessionId+'.',
        'Read AGENTS.md and the applicable target repository instructions before work.',
        'Do not claim a task or write to the historical PUBLIC coordination ledger.',
        'Only after owner-approved PRIVATE ledger activation and task-catalog approval may you attempt claim-next with this exact ID.',
        'Verify the exclusive task and resource locks before code changes; stay within your approved scope.',
        'Use a separate feature branch and draft PR; report actual checks. Never auto-merge or deploy.',
        'If activation, ownership or scope cannot be verified, stop and report the blocker.'
      ].join(' ')
    });
  }
  return {
    schema_version:'1-offline-session-batch',
    session_kind:kind,
    sessions_prepared:sessions.length,
    chats_started:0,
    tasks_claimed:0,
    github_requests:0,
    private_ledger_verified:false,
    owner_review_required:true,
    session_ids_are_authentication:false,
    sessions
  };
}
