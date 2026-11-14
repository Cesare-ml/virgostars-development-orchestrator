/**
 * Owner-only legacy coordination must never read or write a PUBLIC ledger.
 * This preflight checks GitHub's live visibility, not a config assertion.
 * It does NOT make historical public commits confidential or stop external
 * connector sessions from bypassing this local CLI.
 */

const REPO=/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

function ledgerRepository(config) {
  const repo=config?.claim_store?.repo;
  if(config?.repository_visibility_required!=='private'||
     typeof repo!=='string'||!REPO.test(repo)||
     config?.claim_store?.branch!=='coordination/claims')
    throw new Error('Owner-only coordination requires a configured private GitHub ledger.');
  return repo;
}

export function inspectPrivateLedger({config,metadata}) {
  const repo=ledgerRepository(config);
  if(metadata?.full_name!==repo ||
     metadata?.private!==true ||
     metadata?.visibility!=='private' ||
     metadata?.archived===true ||
     metadata?.disabled===true)
    throw new Error(
      'Legacy coordination is disabled: its GitHub ledger is not verified PRIVATE. '+
      'Do not use the public historical claims branch; migrate only after owner approval.'
    );
  return {repo,private:true,verified:true};
}

export async function assertPrivateLedger({api,config}) {
  const repo=ledgerRepository(config);
  if(typeof api?.getRepository!=='function')
    throw new Error('Cannot verify private ledger visibility through GitHub.');
  // 403/404/rate-limit/network failures propagate and never grant access.
  const metadata=await api.getRepository(repo);
  return inspectPrivateLedger({config,metadata});
}

/**
 * A second live check protects every CLI ledger operation, even if repository
 * visibility changes after the initial preflight. GitHub visibility and
 * Contents commits are not atomic; server-side repository policy remains
 * necessary for any real production coordinator.
 */
export function guardLegacyLedgerClient({api,config}) {
  const expected=ledgerRepository(config);
  const guarded={...api};
  for(const method of [
    'getLedgerSnapshot','getClaim','createClaim','updateClaim','deleteClaim'
  ]) {
    if(typeof api?.[method]!=='function')
      throw new Error('Legacy GitHub ledger client is missing '+method+'.');
    guarded[method]=async (repo,...args)=>{
      if(repo!==expected)
        throw new Error('Legacy ledger target differs from the reviewed claim store.');
      await assertPrivateLedger({api,config});
      return api[method](repo,...args);
    };
  }
  return guarded;
}
