import {assertPrivateLedger} from './ledger-visibility.mjs';
import {inspectHistoricalSource} from './private-cutover-plan.mjs';
import {
  PUBLIC_COORDINATOR,DESTINATION_BRANCH,inspectPrivateDestination
} from './private-ledger-preflight.mjs';

// Immutable checkpoint of the historical PUBLIC pilot, established by the
// owner-operated 2026-11-13 audit. Any movement needs a NEW manual review.
export const FROZEN_PUBLIC_LEDGER_HEAD='6a6e8f2562b101f6bdfe207397521cf0f5ca1ebf';
export const FROZEN_PUBLIC_SUBMISSIONS=7;

const SHA=/^[0-9a-f]{40}$/i;
const SUBMISSION=/^submissions\/[A-Za-z0-9][A-Za-z0-9_.-]*__[A-Za-z0-9][A-Za-z0-9_.-]*\/issue-[1-9][0-9]*\.json$/;
const REPO=/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;

function blocked(message) {
  throw new Error('Private-ledger activation blocked: '+message);
}

export function validateOperatorSelection({repository,acknowledgedRepository}) {
  // Both variables must be deliberately set to the SAME new destination.
  // The legacy public repository is never a permissible override.
  if(typeof repository!=='string'||!REPO.test(repository)||
     repository.includes('..')||repository.length>200||
     repository.toLowerCase()===PUBLIC_COORDINATOR.toLowerCase()||
     acknowledgedRepository!==repository)
    blocked('set the same distinct private GitHub repository in both local operator variables.');
  return repository;
}

function indexRecords(entries) {
  if(!Array.isArray(entries)||entries.length>250)
    blocked('ledger snapshot records are missing or exceed pilot limits.');
  const records=new Map();
  const folded=new Set();
  for(const entry of entries) {
    if(!entry||typeof entry.path!=='string'||
       !/^(claims|resources|submissions)\//.test(entry.path)||
       entry.path.length>300||entry.path.includes('..')||
       entry.path.includes('\\')||entry.path.includes(':')||
       !/^[\x20-\x7e]+$/.test(entry.path)||
       typeof entry.sha!=='string'||!SHA.test(entry.sha)||
       !entry.data||typeof entry.data!=='object'||Array.isArray(entry.data))
      blocked('invalid ledger snapshot entry.');
    const lower=entry.path.toLowerCase();
    if(folded.has(lower))blocked('duplicate or case-colliding ledger records.');
    folded.add(lower);
    records.set(entry.path,entry);
  }
  return records;
}

/**
 * Compare immutable Git blob identities, not just counts. Never display or
 * return names, sessions, file contents, SHA values or token information.
 * Historic submissions MUST survive the cutover byte-for-byte; this prevents
 * the curated READY queue from silently offering already delivered work.
 */
export function verifyPreservedSubmissions({publicEntries,privateEntries}) {
  const source=indexRecords(publicEntries);
  const target=indexRecords(privateEntries);
  if(source.size!==FROZEN_PUBLIC_SUBMISSIONS)
    blocked('historical submission count changed; review required.');
  for(const [path,entry] of source) {
    if(!SUBMISSION.test(path)||entry.data.state!=='submitted')
      blocked('historical ledger has a non-submission record or malformed submission.');
    if(target.get(path)?.sha!==entry.sha)
      blocked('a historical submission is missing or has different bytes in the private ledger.');
  }
  return {historical_submissions_preserved:source.size};
}

function validHead(ref) {
  const head=ref?.object?.sha;
  if(ref?.object?.type!=='commit'||typeof head!=='string'||!SHA.test(head))
    blocked('invalid GitHub branch reference.');
  return head;
}

/**
 * GET-only verification; each call fetches real metadata and pinned Git
 * snapshots. This is a gate, NOT a migration or a durable transactional lease.
 * Public CI tests use only synthetic data.
 */
export async function assertPrivateLedgerActivation({api,config}) {
  const repository=config?.claim_store?.repo;
  if(!REPO.test(repository||'')||
     repository.toLowerCase()===PUBLIC_COORDINATOR.toLowerCase()||
     config?.claim_store?.branch!==DESTINATION_BRANCH)
    blocked('select an independent private ledger; public legacy ledger remains disabled.');

  await assertPrivateLedger({api,config});
  const historical=await inspectHistoricalSource({api});
  if(historical.head!==FROZEN_PUBLIC_LEDGER_HEAD||
     historical.records.claims!==0||historical.records.resources!==0||
     historical.records.submissions!==FROZEN_PUBLIC_SUBMISSIONS||
     historical.unclassified_blobs!==1)
    blocked('public checkpoint drift, active locks or unexpected historical records.');

  const destination=await inspectPrivateDestination({api,destination:repository});
  if(!destination.branch_exists)
    blocked('the reviewed private coordination branch does not exist.');

  const [sourceSnapshot,destinationSnapshot]=await Promise.all([
    api.getLedgerSnapshot(PUBLIC_COORDINATOR,DESTINATION_BRANCH),
    api.getLedgerSnapshot(repository,DESTINATION_BRANCH)
  ]);
  if(sourceSnapshot?.head!==FROZEN_PUBLIC_LEDGER_HEAD||
     !SHA.test(destinationSnapshot?.head||''))
    blocked('ledger snapshot does not match its expected pinned branch.');

  const preserved=verifyPreservedSubmissions({
    publicEntries:sourceSnapshot.entries,
    privateEntries:destinationSnapshot.entries
  });
  const privateCounts={claims:0,resources:0,submissions:0};
  for(const item of destinationSnapshot.entries) {
    const kind=item.path.split('/')[0];
    if(!Object.hasOwn(privateCounts,kind))
      blocked('unrecognized private ledger entry.');
    privateCounts[kind]++;
  }
  if(Object.keys(privateCounts).some(k=>privateCounts[k]!==destination.records[k]))
    blocked('private branch tree counts differ from the snapshot.');

  const [sourceEnd,destEnd]=await Promise.all([
    api.getBranchRef(PUBLIC_COORDINATOR,DESTINATION_BRANCH),
    api.getBranchRef(repository,DESTINATION_BRANCH)
  ]);
  if(validHead(sourceEnd)!==FROZEN_PUBLIC_LEDGER_HEAD||
     validHead(destEnd)!==destinationSnapshot.head)
    blocked('coordination branch changed during readiness verification.');

  await assertPrivateLedger({api,config});
  return {
    schema_version:'1-private-activation-readiness',
    private_visibility_verified:true,
    historical_source_stable:true,
    ...preserved,
    current_private_claims:privateCounts.claims,
    status:'readiness_verified',
    migration_performed:false,
    approval_or_merge_performed:false,
    note:'Owner must separately configure approved local variables; no public writes are authorized.'
  };
}
