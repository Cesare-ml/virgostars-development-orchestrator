#!/usr/bin/env node
import {makeGitHubClient} from '../src/github.mjs';
import {loadHistoricalPilotTasks} from '../src/owner-task-catalog.mjs';
import {inspectApprovedPrivateGitHubCatalog}
  from '../src/private-github-catalog-preflight.mjs';

async function main() {
  if(process.argv.length!==2)
    throw new Error('No CLI arguments are accepted.');
  if(!process.env.GITHUB_TOKEN)
    throw new Error('Owner-local GitHub token missing.');
  const report=await inspectApprovedPrivateGitHubCatalog({
    api:makeGitHubClient({token:process.env.GITHUB_TOKEN}),
    repository:process.env.VS_PRIVATE_LEDGER_REPO,
    acknowledgedRepository:process.env.VS_PRIVATE_LEDGER_APPROVED_REPO,
    approvedMainSha:process.env.VS_OWNER_CATALOG_APPROVED_MAIN_SHA,
    approvedSha256:process.env.VS_OWNER_CATALOG_APPROVED_SHA256,
    legacyTasks:await loadHistoricalPilotTasks()
  });
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
}

main().catch(()=>{
  // Do not disclose repo names, owner task IDs, approved hashes,
  // local credential contents or private API response bodies.
  process.stderr.write('ERROR: private catalog preflight blocked; owner must review the private checkpoint.\n');
  process.exitCode=2;
});
