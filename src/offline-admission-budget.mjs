// Public-safe advisory arithmetic only: no file, network or GitHub access.
const required = Object.freeze([
  'waves','active','pending','maxActive','maxPending'
]);

function integer(value, name, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`Invalid offline admission ${name}: expected integer ${min}..${max}.`);
  }
  return value;
}

/**
 * Advisory capacity gate. Each currently active or admitted writer reserves
 * exactly one future review slot. An existing pending PR consumes a slot too.
 * It never guesses when any writer or PR finishes, and never partially admits
 * a wave. This is not a scheduler or a live GitHub review/claim check.
 */
export function planOfflineAdmission(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options) ||
      Object.keys(options).some(key => !required.includes(key)) ||
      required.some(key => !Object.hasOwn(options, key))) {
    throw new Error('Offline admission requires exactly waves, active, pending, maxActive and maxPending.');
  }
  const {waves, active, pending, maxActive, maxPending} = options;
  integer(maxActive, 'maxActive', 1, 40);
  integer(maxPending, 'maxPending', 1, 80);
  integer(active, 'active', 0, maxActive);
  integer(pending, 'pending', 0, maxPending);
  if (!Array.isArray(waves) || waves.length < 1 || waves.length > 40) {
    throw new Error('Offline admission waves must be a nonempty array of at most 40 groups.');
  }
  let total = 0;
  for (const size of waves) {
    integer(size, 'wave size', 1, 40);
    total += size;
  }
  integer(total, 'total new sessions', 2, 40);
  if (pending + active > maxPending) {
    throw new Error('Offline admission has insufficient review slots for existing active writers and pending PRs.');
  }

  let activeReserved = active;
  let admitted = 0;
  let blocked = false;
  const decisions = waves.map((size, index) => {
    const activeSlots = maxActive - activeReserved;
    const reviewSlots = maxPending - (pending + activeReserved);
    const admissibleNow = Math.max(0, Math.min(activeSlots, reviewSlots));
    let status = 'not-evaluated';
    if (!blocked) {
      if (size <= admissibleNow) {
        status = 'admitted';
        activeReserved += size;
        admitted += size;
      } else {
        status = 'blocked';
        blocked = true;
      }
    }
    return {
      wave_number: index + 1,
      requested_sessions: size,
      status,
      admitted_sessions: status === 'admitted' ? size : 0,
      max_admissible_before_wave: admissibleNow
    };
  });
  return {
    schema_version: '1-offline-admission-budget',
    mode: 'offline-aggregate-only',
    requested_new_sessions: total,
    requested_wave_sizes: [...waves],
    initial_active_writers: active,
    initial_pending_review_prs: pending,
    max_active_writers: maxActive,
    max_pending_review_prs: maxPending,
    admitted_new_sessions: admitted,
    deferred_new_sessions: total - admitted,
    wave_decisions: decisions,
    requires_fresh_owner_counts_to_resume: blocked,
    real_github_requests: 0,
    real_task_claims_acquired: 0,
    real_chat_sessions_launched: 0,
    automatic_merges_or_deploys: 0,
    verdict: blocked ? 'capacity-blocked' : 'all-waves-admissible'
  };
}
