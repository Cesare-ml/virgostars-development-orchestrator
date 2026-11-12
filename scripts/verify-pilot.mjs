#!/usr/bin/env node
import {
  PILOT_BRANCH,PILOT_REPO,createReadOnlyGitHubApi,validatePinnedSnapshot
} from '../src/native-check.mjs';

function options(args) {
  let expectedSha=null,keep=false;
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--keep'){keep=true;continue;}
    if(args[i]==='--sha') {
      if(expectedSha!==null||!args[i+1])throw new Error('--sha needs one commit SHA.');
      expectedSha=args[++i];continue;
    }
    if(args[i]==='--help' || args[i]==='-h')return {help:true};
    throw new Error('Unexpected argument: '+args[i]);
  }
  if(expectedSha!==null && !/^[0-9a-f]{40}$/i.test(expectedSha))
    throw new Error('--sha expects a full 40-character Git SHA.');
  return {expectedSha,keep};
}

const usage=[
  'Manual private GitHub snapshot validation (no Git clone, no GitHub Actions)',
  '',
  'Set GITHUB_TOKEN in your current shell, then run:',
  '  node scripts/verify-pilot.mjs --sha YOUR_CURRENT_FEATURE_HEAD_SHA',
  '  node scripts/verify-pilot.mjs --keep   # optional debug checkout',
  '',
  'The fixed source is '+PILOT_REPO+' at '+PILOT_BRANCH+'.',
  'Every blob is hash-verified before npm run check executes.',
  'The auth token is never forwarded to the npm child process.'
].join('\n');

try {
  const parsed=options(process.argv.slice(2));
  if(parsed.help) {
    process.stdout.write(usage+'\n');
  } else {
    const api=createReadOnlyGitHubApi({token:process.env.GITHUB_TOKEN});
    const result=await validatePinnedSnapshot({api,
      expectedSha:parsed.expectedSha,keep:parsed.keep});
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if(!result.tests.passed)process.exitCode=1;
  }
} catch(error) {
  const raw=error instanceof Error?error.message:String(error);
  const token=process.env.GITHUB_TOKEN||'';
  // A final defense even for unexpected errors returned by external adapters.
  const safe=token?raw.split(token).join('[REDACTED]'):raw;
  process.stderr.write('Native snapshot validation failed: '+safe+'\n');
  process.exitCode=1;
}
