#!/usr/bin/env node
import {makeGitHubClient} from '../src/github.mjs';
import {loadPilotConfig} from '../src/registry.mjs';
import {loadHistoricalPilotTasks} from '../src/owner-task-catalog.mjs';
import {inspectPrivateGitHubAlphaReadiness}
  from '../src/private-github-alpha-readiness.mjs';

async function main() {
  if(process.argv.length!==2 || !process.env.GITHUB_TOKEN)
    throw new Error('Owner approval and private GitHub credential required.');
  const config=await loadPilotConfig();
  const report=await inspectPrivateGitHubAlphaReadiness({
    api:makeGitHubClient({token:process.env.GITHUB_TOKEN}),
    config,
    repository:process.env.VS_PRIVATE_LEDGER_REPO,
    acknowledgedRepository:process.env.VS_PRIVATE_LEDGER_APPROVED_REPO,
    approvedMainSha:process.env.VS_OWNER_CATALOG_APPROVED_MAIN_SHA,
    approvedSha256:process.env.VS_OWNER_CATALOG_APPROVED_SHA256,
    legacyTasks:await loadHistoricalPilotTasks()
  });
  process.stdout.write(JSON.stringify(report,null,2)+'\n');
  if(!report.live_readiness_prerequisites_passed)process.exitCode=2;
}
main().catch(()=>{
  // Never print the private repo, approved SHA, task titles or token errors.
  process.stderr.write('ERROR: owner GitHub alpha readiness blocked; inspect the private approved checkpoint.\n');
  process.exitCode=2;
});
