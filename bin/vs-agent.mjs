#!/usr/bin/env node
// Public discovery must not evaluate or resolve owner-only pilot modules.
// Keep its entire dependency graph independent of GitHub tokens/private data.
import {loadPublicDiscovery} from '../src/public-discovery.mjs';

const usage = [
  'VirgoStars private pilot — Node.js 20+',
  'node bin/vs-agent.mjs public-discover  # read-only, no token, public repos only',
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
    const {newSession}=await import('../src/claims.mjs');
    process.stdout.write(newSession(flags.kind||'chat')+'\n');return;
  }
  if(command==='public-discover') {
    if(positionals.length || Object.keys(flags).length)
      throw new Error('Public-discover takes no arguments.');
    const discovery=await loadPublicDiscovery();
    process.stdout.write(JSON.stringify(discovery,null,2)+'\n');
    return;
  }
  // Protected modules are intentionally loaded only AFTER public-discover
  // has returned. Public discovery can operate without any private files.
  const [{loadPilotConfig,loadPilotTasks},{makeGitHubClient},
    {assertPrivateLedger,guardLegacyLedgerClient}]=await Promise.all([
    import('../src/registry.mjs'),
    import('../src/github.mjs'),
    import('../src/ledger-visibility.mjs')
  ]);
  // Fail closed BEFORE loading owner-only task handlers or accessing any
  // historical ledger. Config labels do not prove private GitHub visibility.
  const config=await loadPilotConfig();
  const baseApi=makeGitHubClient({token:process.env.GITHUB_TOKEN});
  await assertPrivateLedger({api:baseApi,config});
  const api=guardLegacyLedgerClient({api:baseApi,config});
  const [
    {claim,status,release,handoff,discover},
    {claimNext},{submit},{auditFleet},
    {auditTaskPullRequest},{auditOpenPullRequestCollisions}
  ]=await Promise.all([
    import('../src/claims.mjs'),
    import('../src/queue.mjs'),
    import('../src/submissions.mjs'),
    import('../src/fleet-status.mjs'),
    import('../src/pr-audit.mjs'),
    import('../src/pr-collisions.mjs')
  ]);
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
