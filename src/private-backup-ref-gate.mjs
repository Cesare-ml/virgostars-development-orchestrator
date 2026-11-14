import {assertPrivateLedgerActivation, validateOperatorSelection}
  from './private-ledger-activation.mjs';
import {assertPrivateLedger} from './ledger-visibility.mjs';

const SHA = /^[a-f0-9]{40}$/i;
const BACKUP_REF = /^backup\/[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_-]*){0,3}$/i;
const fail = reason => { throw new Error('Private backup checkpoint blocked: ' + reason); };

export function validateBackupRefName(name) {
  if (typeof name !== 'string' || name.length > 120 ||
      !BACKUP_REF.test(name) || name.includes('..'))
    fail('select a reviewed backup/ branch (not a path or arbitrary ref).');
  return name;
}

function commitHead(value) {
  const head = value?.object?.sha;
  if (value?.object?.type !== 'commit' || typeof head !== 'string' ||
      !SHA.test(head)) fail('invalid or missing Git branch commit.');
  return head;
}

/**
 * Proves exact commit equality at two consecutive read-only snapshots.
 * This is not an atomic transaction or an independent full Git mirror.
 */
export function verifyBackupRefPairs(first, second) {
  const activeStart = commitHead(first?.active);
  const backupStart = commitHead(first?.backup);
  const activeEnd = commitHead(second?.active);
  const backupEnd = commitHead(second?.backup);
  if (activeStart !== activeEnd || backupStart !== backupEnd)
    fail('a checked branch moved during the verification.');
  if (activeStart !== backupStart)
    fail('the reviewed backup branch does not match the active ledger commit.');
  return true;
}

/**
 * GET-only additional owner checkpoint AFTER historical source and destination
 * activation checks. The returned aggregate does not include repo/ref names,
 * commit hashes, owner data, task identifiers or private session records.
 */
export async function inspectPrivateBackupRef({
  api, repository, acknowledgedRepository, backupBranch
}) {
  const selected = validateOperatorSelection({
    repository, acknowledgedRepository
  });
  const backup = validateBackupRefName(backupBranch);
  if (!api || typeof api.getBranchRef !== 'function')
    fail('read-only GitHub branch access is unavailable.');

  const config = {
    repository_visibility_required: 'private',
    claim_store: {repo: selected, branch: 'coordination/claims'}
  };
  const activation = await assertPrivateLedgerActivation({api, config});
  if (activation?.status !== 'readiness_verified' ||
      activation?.historical_submissions_preserved !== 7)
    fail('historical private ledger activation has not been verified.');
  if (activation.current_private_claims !== 0)
    fail('active private claims require owner reconciliation.');

  const readPair = async () => {
    const [active, saved] = await Promise.all([
      api.getBranchRef(selected, 'coordination/claims'),
      api.getBranchRef(selected, backup)
    ]);
    return {active, backup: saved};
  };
  const first = await readPair();
  const second = await readPair();
  verifyBackupRefPairs(first, second);
  await assertPrivateLedger({api, config});

  return {
    schema_version: '1-owner-private-backup-ref-check',
    mode: 'get-only',
    private_visibility_verified: true,
    historical_submissions_preserved: 7,
    backup_ref_matches_active_commit: true,
    branch_refs_stable_during_check: true,
    complete_git_history_backup_verified: false,
    independent_offsite_backup_verified: false,
    real_multi_chat_pilot_proven: false,
    private_records_modified: false,
    ready_to_launch: false,
    next_step: 'Approve a full independent backup and owner-curated tasks; run alpha-doctor before supervised real chats.'
  };
}
