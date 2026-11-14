/**
 * Read-only audit of cross-repository session ownership in the NEW public
 * VirgoStars agent-ledger format. No GitHub I/O, locks or authorization.
 *
 * Per-task create-only claims cannot prove per-session global exclusivity.
 */
const SESSION = /^chat-[0-9a-f]{8}$/;
const REPOSITORY = /^[a-z\d][a-z\d_.-]*\/[a-z\d][a-z\d_.-]*$/i;
const NUMBERED = {
  develop: /^issue-[1-9]\d*$/,
  review: /^review-pr-[1-9]\d*-[a-f0-9]{7}$/,
  merge: /^merge-pr-[1-9]\d*$/,
  triage: /^triage-pr-[1-9]\d*$/,
  plan: /^plan-(\d{4})(\d{2})(\d{2})(\d{2})$/
};
const STEPS = Object.keys(NUMBERED);

function fail(message) {
  throw new Error('Agent session claim audit blocked: ' + message);
}
function timestamp(value) {
  if (typeof value !== 'string') fail('invalid claim timestamp');
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);
  if (!match) fail('claim timestamp must be UTC ISO-8601');
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) fail('invalid claim timestamp');
  const normalized = match[1] + '.' + (match[2] || '').padEnd(3,'0') + 'Z';
  if (new Date(millis).toISOString() !== normalized) fail('calendar-invalid claim timestamp');
  return millis;
}
function validKey(step, key) {
  const re = NUMBERED[step];
  if (!re || !re.test(key)) return false;
  if (step !== 'plan') return true;
  const m = re.exec(key);
  const utc = m[1]+'-'+m[2]+'-'+m[3]+'T'+m[4]+':00:00.000Z';
  try { return new Date(Date.parse(utc)).toISOString() === utc; }
  catch { return false; }
}

/**
 * Diagnostic of an already fetched ledger snapshot.
 * claims: {"owner__repo/key": [{...record, attempt}]}
 * TTLs: fleet.limits.claim_ttl_minutes
 * A clean report NEVER authorizes a new claim or proves concurrency safety.
 */
export function inspectSessionClaimSnapshot({ claims, session, ttlMinutes, now } = {}) {
  if (!SESSION.test(session || '') || !Number.isSafeInteger(now) || now < 0 ||
      !claims || typeof claims !== 'object' || Array.isArray(claims) ||
      !ttlMinutes || typeof ttlMinutes !== 'object' || Array.isArray(ttlMinutes))
    fail('missing or malformed audit inputs');
  for (const step of STEPS) {
    const value = ttlMinutes[step];
    if (!Number.isSafeInteger(value) || value <= 0 || value > 10080)
      fail('missing or invalid claim TTL');
  }
  if (Object.keys(claims).length > 10000) fail('oversized claim inventory');
  const live = [];
  let total = 0;
  for (const [path, records] of Object.entries(claims)) {
    if (!Array.isArray(records) || records.length < 1 || records.length > 1000)
      fail('incomplete or oversized claim attempt history');
    const slash = path.indexOf('/');
    if (slash <= 0 || slash === path.length - 1) fail('malformed ledger claim key');
    const dir = path.slice(0, slash), key = path.slice(slash + 1);
    if (!/^[a-z\d_.-]+__[a-z\d_.-]+$/i.test(dir))
      fail('invalid claim directory');
    // Git tree listing may place 10.json before 2.json; never mutate source.
    const ordered = [...records].sort((a,b)=>a?.attempt-b?.attempt);
    let prevTime = null;
    for (let i = 0; i < ordered.length; i++) {
      const item = ordered[i];
      if (!item || typeof item !== 'object' || Array.isArray(item) ||
          item.attempt !== i+1 || !REPOSITORY.test(item.repo || '') ||
          item.repo.replace('/','__') !== dir || item.key !== key ||
          !SESSION.test(item.session || '') || !validKey(item.step,key))
        fail('invalid attempt, identity or key/step mapping');
      const at = timestamp(item.claimed_at);
      if (at > now + 300000 || (prevTime !== null && at < prevTime))
        fail('future or retrograde claim timestamp');
      prevTime = at;
    }
    total++;
    const latest = ordered[ordered.length-1];
    if (latest.session === session &&
        timestamp(latest.claimed_at)+ttlMinutes[latest.step]*60000 > now)
      live.push({repo:latest.repo,key:latest.key,step:latest.step,attempt:latest.attempt});
  }
  live.sort((a,b)=>(a.repo+'/'+a.key).localeCompare(b.repo+'/'+b.key));
  return {
    schema_version:'1-agent-session-claim-audit',
    session,
    audited_task_keys:total,
    live_assignments:live,
    status:live.length>1?'duplicate-live-assignments':
      live.length===1?'one-live-assignment':'no-live-assignment',
    duplicate_live_claims:live.length>1,
    globally_exclusive_session_proven:false,
    new_claim_authorized:false,
    note:'GET-only structural audit. Completion markers, remote freshness, global fences and atomic contention are not verified.'
  };
}
