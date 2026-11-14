#!/usr/bin/env node
import { makeGitHubClient } from '../src/github.mjs';
import { validateLegacyCliInvocation } from '../src/cli-command-policy.mjs';
import { loadPilotConfig } from '../src/registry.mjs';
import {inspectOwnerTaskFile,loadHistoricalPilotTasks} from '../src/owner-task-catalog.mjs';
import {loadPublicDiscovery} from '../src/public-discovery.mjs';
import {inspectPrivateDestination} from '../src/private-ledger-preflight.mjs';
import {planPrivateCutover} from '../src/private-cutover-plan.mjs';
import {rehearseLocalBackupFile} from '../src/offline-cutover-rehearsal.mjs';
import {assertPrivateLedger,guardLegacyLedgerClient} from '../src/ledger-visibility.mjs';
import {assertPrivateLedgerActivation} from '../src/private-ledger-activation.mjs';
import {inspectAlphaLaunch} from '../src/alpha-doctor.mjs';
import {inspectPrivateGitHubAlphaReadiness}
  from '../src/private-github-alpha-readiness.mjs';
import {
  selectOwnerTaskSource,loadApprovedPrivateTaskSource,
  guardPinnedOwnerCatalogWrites
} from '../src/approved-private-task-source.mjs';
import {runOfflineTwoAgentRehearsal} from '../src/offline-two-agent-rehearsal.mjs';
import {exportVerifiedLocalLedgerBackup} from '../src/verified-local-ledger-export.mjs';
import {planLocalCopyOnlyImport} from '../src/offline-ledger-copy-plan.mjs';
import { newSession, claim, status, release, handoff, discover } from '../src/claims.mjs';
import { claimNext } from '../src/queue.mjs';
import { submit } from '../src/submissions.mjs';
import { auditFleet } from '../src/fleet-status.mjs';
import { auditTaskPullRequest } from '../src/pr-audit.mjs';
import { auditOpenPullRequestCollisions } from '../src/pr-collisions.mjs';
import {assertLiveWriteTaskAdmission} from '../src/live-write-admission.mjs';
import { readFile } from 'node:fs/promises';
import { nextWork, fleetBoard, SESSION_RE } from '../src/agent-work.mjs';
import { makeGet, loadSnapshot } from '../src/agent-github.mjs';

const usage = [
  'VirgoStars agent fleet — Node.js 20+ (agents follow AGENT_START.md)',
  'node bin/vs-agent.mjs fleet-board  # GET-only overview of all registered repos (GITHUB_TOKEN recommended)',
  'node bin/vs-agent.mjs next-work [--session chat-xxxxxxxx]  # GET-only: what AGENT_START.md says this chat should do now',
  '',
  'Legacy owner-only private pilot (docs/legacy/):',
  'node bin/vs-agent.mjs public-discover  # read-only, no token, public repos only',
  'node bin/vs-agent.mjs check-private-destination OWNER/REPO  # GET-only, token required',
  'node bin/vs-agent.mjs plan-private-cutover OWNER/PRIVATE-REPO  # metadata-only, no migration',
  'node bin/vs-agent.mjs verify-private-activation OWNER/PRIVATE-REPO  # read-only, preserves submitted work',
  'node bin/vs-agent.mjs rehearse-private-cutover LOCAL_BACKUP.json  # offline, no token/writes',
  'node bin/vs-agent.mjs session [--kind chat|codex]',
  'node bin/vs-agent.mjs fingerprint-tasks ABSOLUTE_LOCAL_FILE.json  # offline; no token or task data printed',
  'node bin/vs-agent.mjs alpha-doctor  # owner-local OR SHA-approved private GitHub catalog, GET-only',
  'node bin/vs-agent.mjs rehearse-two-agents  # offline synthetic claim→handoff→submit→release',
  'node bin/vs-agent.mjs export-verified-ledger OWNER/PRIVATE-REPO --output ABSOLUTE_BACKUP.json --confirm  # GitHub GET-only; private LOCAL file',
  'node bin/vs-agent.mjs plan-ledger-copy ABSOLUTE_BACKUP.json  # offline copy-only comparison, never writes',
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
    if(!['kind','session','role','branch','summary','head-sha','confirm','repo','pr','output'].includes(name))
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
  if(command==='fleet-board' || command==='next-work') {
    if(positionals.length) throw new Error(command+' takes no positional arguments.');
    if(flags.session && !SESSION_RE.test(flags.session)) throw new Error('Session must look like chat-xxxxxxxx (8 hex).');
    const fleet=JSON.parse(await readFile(new URL('../config/agent-fleet.json',import.meta.url),'utf8'));
    const snapshot=await loadSnapshot({fleet,get:makeGet(),session:flags.session||'chat-00000000'});
    const result=command==='fleet-board'
      ? {generated_at:new Date(snapshot.now).toISOString(),repos:fleetBoard(snapshot),
         live_claims:Object.keys(snapshot.claims).length,next_for_new_chat:nextWork(snapshot)}
      : nextWork(snapshot);
    process.stdout.write(JSON.stringify(result,null,2)+'\n');return;
  }
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
  if(command==='fingerprint-tasks') {
    if(positionals.length!==1 || Object.keys(flags).length)
      throw new Error('fingerprint-tasks requires exactly one absolute local JSON path.');
    const report=await inspectOwnerTaskFile(positionals[0],{
      legacyTasks:await loadHistoricalPilotTasks()
    });
    process.stdout.write(JSON.stringify({
      schema_version:'1-local-task-fingerprint',
      sha256:report.sha256,
      tasks:report.count,
      read_tasks:report.read_tasks,
      write_tasks:report.write_tasks,
      approved:false,
      private_file_uploaded:false
    },null,2)+'\n');
    return;
  }
  if(command==='plan-ledger-copy') {
    if(positionals.length!==1||Object.keys(flags).length)
      throw new Error('plan-ledger-copy requires one absolute local JSON manifest path.');
    const report=await planLocalCopyOnlyImport(positionals[0]);
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    if(!report.eligible_for_independent_owner_review)process.exitCode=2;
    return;
  }
  if(command==='export-verified-ledger') {
    if(positionals.length!==1||Object.keys(flags).some(k=>!['output','confirm'].includes(k))||
       typeof flags.output!=='string'||flags.confirm!==true)
      throw new Error('export-verified-ledger requires OWNER/PRIVATE-REPO --output ABSOLUTE_BACKUP.json --confirm.');
    const api=makeGitHubClient({token:process.env.GITHUB_TOKEN});
    const result=await exportVerifiedLocalLedgerBackup({
      api,destination:positionals[0],
      acknowledgedDestination:process.env.VS_PRIVATE_LEDGER_APPROVED_REPO,
      output:flags.output,confirm:flags.confirm
    });
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    return;
  }
  if(command==='rehearse-two-agents') {
    if(positionals.length||Object.keys(flags).length)
      throw new Error('rehearse-two-agents takes no arguments.');
    const report=await runOfflineTwoAgentRehearsal();
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    return;
  }
  if(command==='alpha-doctor') {
    if(positionals.length || Object.keys(flags).length)
      throw new Error('alpha-doctor takes no arguments.');
    const selection=selectOwnerTaskSource();
    if(selection.mode==='historical-submitted-only')
      throw new Error('alpha-doctor requires an approved local owner task catalog or approved private GitHub catalog.');
    const config=await loadPilotConfig();
    const api=makeGitHubClient({token:process.env.GITHUB_TOKEN});
    if(selection.mode==='owner-private-github') {
      let report;
      try {
        report=await inspectPrivateGitHubAlphaReadiness({
          api,config,
          repository:process.env.VS_PRIVATE_LEDGER_REPO,
          acknowledgedRepository:process.env.VS_PRIVATE_LEDGER_APPROVED_REPO,
          approvedMainSha:selection.approvedMainSha,
          approvedSha256:selection.approvedSha256,
          legacyTasks:await loadHistoricalPilotTasks()
        });
      } catch {throw new Error('Owner GitHub alpha readiness blocked; private checkpoint must be reviewed.');}
      process.stdout.write(JSON.stringify(report,null,2)+'\n');
      if(!report.live_readiness_prerequisites_passed)process.exitCode=2;
    } else {
      const tasks=(await loadApprovedPrivateTaskSource({api,config})).tasks;
      const report=await inspectAlphaLaunch({api,config,tasks});
      process.stdout.write(JSON.stringify(report,null,2)+'\n');
      if(!report.ready_for_manual_pilot)process.exitCode=2;
    }
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
  if(command==='verify-private-activation') {
    if(positionals.length!==1 || Object.keys(flags).length)
      throw new Error('verify-private-activation requires exactly OWNER/PRIVATE-REPO.');
    const api=makeGitHubClient({token:process.env.GITHUB_TOKEN});
    const report=await assertPrivateLedgerActivation({api,config:{
      repository_visibility_required:'private',
      claim_store:{repo:positionals[0],branch:'coordination/claims'}
    }});
    process.stdout.write(JSON.stringify(report,null,2)+'\n');
    return;
  }
  validateLegacyCliInvocation(command,positionals,flags);
  // Fail closed BEFORE any legacy ledger reads or writes. The historical
  // branch is PUBLIC; config labels never prove private GitHub visibility.
  const config=await loadPilotConfig();
  const baseApi=makeGitHubClient({token:process.env.GITHUB_TOKEN});
  await assertPrivateLedger({api:baseApi,config});
  // Any new owner-selected private ledger must preserve ALL seven submitted
  // historical tasks byte-for-byte. A fresh/empty branch cannot reactivate
  // old READY tasks and silently assign them to another chat.
  if(config.claim_store.repo!=='Cesare-ml/virgostars-development-orchestrator')
    await assertPrivateLedgerActivation({api:baseApi,config});
  // Only commands that actually require a task catalog load its contents.
  // Status, handoff and owner-only release remain available for safe recovery
  // if a reviewed catalog was superseded while a claim was active.
  const taskCommands=new Set([
    'discover','fleet-status','audit-collisions','audit-pr',
    'claim-next','claim','submit'
  ]);
  const source=taskCommands.has(command)
    ? await loadApprovedPrivateTaskSource({api:baseApi,config})
    : null;
  const tasks=source?.tasks;
  const api=guardLegacyLedgerClient({api:baseApi,config});
  if(source?.mode==='owner-private-github') {
    // Preserve the original live PRIVATE visibility guard for all modes.
    // The pinned wrapper captures the original methods in a separate object
    // before substitution, so the forwarding calls cannot recurse.
    const pinned=guardPinnedOwnerCatalogWrites({
      api:{...api},refApi:baseApi,
      repository:config.claim_store.repo,
      approvedMainSha:source.approvedMainSha
    });
    for(const method of ['createClaim','updateClaim','deleteClaim'])
      api[method]=pinned[method];
  }
  // New resource-owning tasks from a remote approved catalog receive
  // a live PR/issue collision audit before any new GitHub lock is created.
  // It is not a replacement for the resource-first exclusive write itself.
  const beforeClaim=source?.mode==='owner-private-github'
    ? task=>task.access==='write'
      ? assertLiveWriteTaskAdmission({api,tasks,task})
      : undefined
    : null;
  let result;
  if(command==='discover') {
    if(positionals.length) throw new Error('Discover takes no target.');
    result=await discover({api,config,tasks:tasks});
  } else if(command==='fleet-status') {
    if(positionals.length) throw new Error('Fleet-status takes no positional target.');
    result=await auditFleet({api,config,tasks:tasks});
  } else if(command==='audit-collisions') {
    if(positionals.length!==2) throw new Error('Audit-collisions expects OWNER/REPO ISSUE.');
    const [repo,rawIssue]=positionals;
    if(!/^[1-9]\d*$/.test(rawIssue)) throw new Error('Expected positive issue number.');
    result=await auditOpenPullRequestCollisions({api,tasks:tasks,
      repo,issue:Number(rawIssue)});
  } else if(command==='audit-pr') {
    if(positionals.length!==3) throw new Error('Audit-pr expects OWNER/REPO ISSUE PR_NUMBER.');
    const [repo,rawIssue,rawPr]=positionals;
    if(!/^[1-9]\d*$/.test(rawIssue)||!/^[1-9]\d*$/.test(rawPr))
      throw new Error('Audit-pr requires positive issue and PR numbers.');
    result=await auditTaskPullRequest({api,tasks:tasks,repo,
      issue:Number(rawIssue),prNumber:Number(rawPr)});
  } else if(command==='claim-next') {
    if(positionals.length) throw new Error('Claim-next takes no positional target.');
    result=await claimNext({api,config,tasks:tasks,
      session:flags.session,role:flags.role,repository:flags.repo||null,beforeClaim});
  } else {
    if(positionals.length!==2) throw new Error('Expected OWNER/REPO and ISSUE.');
    const [repo,raw]=positionals;
    if(!/^[1-9]\d*$/.test(raw)) throw new Error('Invalid issue number.');
    const issue=Number(raw);
    const common={api,config,repo,issue};
    if(command==='status') result=await status(common);
    else if(command==='claim') result=await claim({...common,tasks:tasks,
      session:flags.session,role:flags.role,branchName:flags.branch,beforeClaim});
    else if(command==='handoff') result=await handoff({...common,session:flags.session,
      summary:flags.summary,branchName:flags.branch,headSha:flags['head-sha']});
    else if(command==='release') result=await release({...common,session:flags.session,
      confirm:flags.confirm});
    else if(command==='submit') result=await submit({...common,session:flags.session,
      tasks:tasks,prNumber:flags.pr===undefined?null:Number(flags.pr),
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
