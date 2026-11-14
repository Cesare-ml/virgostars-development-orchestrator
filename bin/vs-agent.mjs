#!/usr/bin/env node
import { makeGitHubClient } from '../src/github.mjs';
import { loadPilotConfig, loadPilotTasks } from '../src/registry.mjs';
import {loadPublicDiscovery} from '../src/public-discovery.mjs';
import {inspectPrivateDestination} from '../src/private-ledger-preflight.mjs';
import {planPrivateCutover} from '../src/private-cutover-plan.mjs';
import {rehearseLocalBackupFile} from '../src/offline-cutover-rehearsal.mjs';
import {assertPrivateLedger,guardLegacyLedgerClient} from '../src/ledger-visibility.mjs';
import { newSession, claim, status, release, handoff, discover } from '../src/claims.mjs';
import { claimNext } from '../src/queue.mjs';
import { submit } from '../src/submissions.mjs';
import { auditFleet } from '../src/fleet-status.mjs';
import { auditTaskPullRequest } from '../src/pr-audit.mjs';
import { auditOpenPullRequestCollisions } from '../src/pr-collisions.mjs';

const usage = [
  'VirgoStars private pilot — Node.js 20+',
  'node bin/vs-agent.mjs public-discover  # read-only, no token, public repos only',
  'node bin/vs-agent.mjs check-private-destination OWNER/REPO  # GET-only, token required',
  'node bin/vs-agent.mjs plan-private-cutover OWNER/PRIVATE-REPO  # metadata-only, no migration',
  'node bin/vs-agent.mjs rehearse-private-cutover LOCAL_BACKUP.json  # offline, no token/writes',
  'node bin/vs-agent.mjs session [--kind chat|codex]',
  'node bin/vs-agent.mjs discover',
  'node bin/vs-agent.mjs fleet-status  # read-only, all five repositories',
  'node bin/vs-agent.mjs audit-pr OWNER/REPO ISSUE PR_NUMBER  # read-only scope audit',
  'node bin/vs-agent.mjs audit-collisions OWNER/REPO ISSUE  # read-only shared file audit',
  'node bin/vs-agent.mjs claim-next --session chat-UUID --role reviewer [--repo OWNER/REPO]',
  'node bin/vs-agent.mjs status OWNER/REPO ISSUE',
  'node bin/vs-agent.mjs claim OWNER/REPO ISSUE --session chat-UUID --role reviewer',
  'node bin/vs-agent.mjs handoff OWNER/REPO ISSUE --session chat-UUID --summary "Actual work"',
  'node bin/vs-agent.mjs release OWNER/REPO ISSUE --session chat-UUID --confirm',
  'node bin/vs-agent.mjs submit OWNER/REPO ISSUE --session chat-UUID --confirm [--pr PR_NUMBER for write tasks]',
  'Set GITHUB_TOKEN privately in your environment; never paste it into chat.'
].join('\n') + '\n';

function parse(tokens) {
  const positionals=[],flags={};
  for(let i=0;i<tokens.length;i++) {
    const item=tokens[i];
    if (!item.startsWith('--')) {positionals.push(item);continue;}
    const name=item.slice(2);
    if(!['kind','session','role','branch','summary','head-sha','confirm','repo','pr'].includes(name))
      throw new Error('Unknown option ' + item);
    if(name==='confirm') {flags.confirm=true;continue;}
    const next=tokens[++i];
    if(!next || next.startsWith('--')) throw new Error('Missing option value for ' + item);
    flags[name]=next;
  }
  return {positionals,flags};
}
async function main() {
  const [command,...rest]=process.argv.slice(2);
  if(!command || command==='--help' || command==='help') {process.stdout.write(usage);return;}
  const {positionals,flags}=parse(rest);
  if(command==='session') {
    if(positionals.length) throw new Error('Session takes no target.');
    process.stdout.write(newSession(flags.kind||'chat')+'\n');return;
  }
  if(command==='public-discover') {
    if(positionals.length || Object.keys(flags).length)
      throw new Error('Public-discover takes no arguments.');
    const discovery=await loadPublicDiscovery();
    process.stdout.write(JSON.stringify(discovery,null,2)+'\n');
    return;
  }
  if(command==='rehearse-private-cutover') {
    if(positionals.length!==1 || Object.keys(flags).length)
      throw new Error('rehearse-private-cutover requires exactly LOCAL_BACKUP.json.');
    const report=await rehearseLocalBackupFile(positionals[0]);
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    return;
  }
  if(command==='check-private-destination') {
    if(positionals.length!==1 || Object.keys(flags).length)
      throw new Error('check-private-destination requires exactly OWNER/REPO.');
    const api=makeGitHubClient({token:process.env.GITHUB_TOKEN});
    const report=await inspectPrivateDestination({api,destination:positionals[0]});
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    return;
  }
  if(command==='plan-private-cutover') {
    if(positionals.length!==1 || Object.keys(flags).length)
      throw new Error('plan-private-cutover requires exactly OWNER/PRIVATE-REPO.');
    const api=makeGitHubClient({token:process.env.GITHUB_TOKEN});
    const plan=await planPrivateCutover({api,destination:positionals[0]});
    process.stdout.write(JSON.stringify(plan,null,2)+'\n');
    return;
  }
  // Fail closed BEFORE any legacy ledger reads or writes. The historical
  // branch is PUBLIC; config labels never prove private GitHub visibility.
  const config=await loadPilotConfig();
  const baseApi=makeGitHubClient({token:process.env.GITHUB_TOKEN});
  await assertPrivateLedger({api:baseApi,config});
  const api=guardLegacyLedgerClient({api:baseApi,config});
  let result;
  if(command==='discover') {
    if(positionals.length) throw new Error('Discover takes no target.');
    result=await discover({api,config,tasks:await loadPilotTasks()});
  } else if(command==='fleet-status') {
    if(positionals.length) throw new Error('Fleet-status takes no positional target.');
    result=await auditFleet({api,config,tasks:await loadPilotTasks()});
  } else if(command==='audit-collisions') {
    if(positionals.length!==2) throw new Error('Audit-collisions expects OWNER/REPO ISSUE.');
    const [repo,rawIssue]=positionals;
    if(!/^[1-9]\d*$/.test(rawIssue)) throw new Error('Expected positive issue number.');
    result=await auditOpenPullRequestCollisions({api,tasks:await loadPilotTasks(),
      repo,issue:Number(rawIssue)});
  } else if(command==='audit-pr') {
    if(positionals.length!==3) throw new Error('Audit-pr expects OWNER/REPO ISSUE PR_NUMBER.');
    const [repo,rawIssue,rawPr]=positionals;
    if(!/^[1-9]\d*$/.test(rawIssue)||!/^[1-9]\d*$/.test(rawPr))
      throw new Error('Audit-pr requires positive issue and PR numbers.');
    result=await auditTaskPullRequest({api,tasks:await loadPilotTasks(),repo,
      issue:Number(rawIssue),prNumber:Number(rawPr)});
  } else if(command==='claim-next') {
    if(positionals.length) throw new Error('Claim-next takes no positional target.');
    result=await claimNext({api,config,tasks:await loadPilotTasks(),
      session:flags.session,role:flags.role,repository:flags.repo||null});
  } else {
    if(positionals.length!==2) throw new Error('Expected OWNER/REPO and ISSUE.');
    const [repo,raw]=positionals;
    if(!/^[1-9]\d*$/.test(raw)) throw new Error('Invalid issue number.');
    const issue=Number(raw);
    const common={api,config,repo,issue};
    if(command==='status') result=await status(common);
    else if(command==='claim') result=await claim({...common,tasks:await loadPilotTasks(),
      session:flags.session,role:flags.role,branchName:flags.branch});
    else if(command==='handoff') result=await handoff({...common,session:flags.session,
      summary:flags.summary,branchName:flags.branch,headSha:flags['head-sha']});
    else if(command==='release') result=await release({...common,session:flags.session,
      confirm:flags.confirm});
    else if(command==='submit') result=await submit({...common,session:flags.session,
      tasks:await loadPilotTasks(),prNumber:flags.pr===undefined?null:Number(flags.pr),
      confirm:flags.confirm});
    else throw new Error('Unknown command ' + command);
  }
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(result?.result==='busy'||result?.result==='no-task'||result?.verdict==='blocked'||result?.status==='conflict') process.exitCode=2;
}
main().catch(error=>{
  process.stderr.write('ERROR: '+error.message+'\n');
  process.exitCode=1;
});
