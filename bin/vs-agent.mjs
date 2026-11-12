#!/usr/bin/env node
import { makeGitHubClient } from '../src/github.mjs';
import { loadPilotConfig, loadPilotTasks } from '../src/registry.mjs';
import { newSession, claim, status, release, handoff, discover } from '../src/claims.mjs';

const usage = [
  'VirgoStars private pilot — Node.js 20+',
  'node bin/vs-agent.mjs session [--kind chat|codex]',
  'node bin/vs-agent.mjs discover',
  'node bin/vs-agent.mjs status OWNER/REPO ISSUE',
  'node bin/vs-agent.mjs claim OWNER/REPO ISSUE --session chat-UUID --role reviewer',
  'node bin/vs-agent.mjs handoff OWNER/REPO ISSUE --session chat-UUID --summary "Actual work"',
  'node bin/vs-agent.mjs release OWNER/REPO ISSUE --session chat-UUID --confirm',
  'Set GITHUB_TOKEN privately in your environment; never paste it into chat.'
].join('\n') + '\n';

function parse(tokens) {
  const positionals=[],flags={};
  for(let i=0;i<tokens.length;i++) {
    const item=tokens[i];
    if (!item.startsWith('--')) {positionals.push(item);continue;}
    const name=item.slice(2);
    if(!['kind','session','role','branch','summary','head-sha','confirm'].includes(name))
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
  const config=await loadPilotConfig();
  const api=makeGitHubClient({token:process.env.GITHUB_TOKEN});
  let result;
  if(command==='discover') {
    if(positionals.length) throw new Error('Discover takes no target.');
    result=await discover({api,config,tasks:await loadPilotTasks()});
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
    else throw new Error('Unknown command ' + command);
  }
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(result?.result==='busy') process.exitCode=2;
}
main().catch(error=>{
  process.stderr.write('ERROR: '+error.message+'\n');
  process.exitCode=1;
});
