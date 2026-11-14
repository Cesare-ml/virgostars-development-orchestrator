#!/usr/bin/env node
import {
  PILOT_BRANCH,PILOT_REPO,createReadOnlyGitHubApi,validatePinnedSnapshot
} from '../src/native-check.mjs';
import {
  buildNativeValidationReceipt,saveNativeValidationReceipt,readNativeValidationReceipt
} from '../src/validation-receipt.mjs';

export function parseVerificationArgs(args) {
  let expectedSha=null,keep=false,receiptPath=null,reviewPath=null;
  for(let i=0;i<args.length;i++) {
    const arg=args[i];
    if(arg==='--help'||arg==='-h')return {help:true};
    if(arg==='--keep'){keep=true;continue;}
    if(['--sha','--receipt','--verify-receipt'].includes(arg)) {
      const value=args[i+1];
      if(!value||value.startsWith('--'))throw new Error(arg+' requires a value.');
      if(arg==='--sha') {
        if(expectedSha!==null)throw new Error('--sha provided twice.');
        expectedSha=value;
      } else if(arg==='--receipt') {
        if(receiptPath!==null)throw new Error('--receipt provided twice.');
        receiptPath=value;
      } else {
        if(reviewPath!==null)throw new Error('--verify-receipt provided twice.');
        reviewPath=value;
      }
      i++;continue;
    }
    throw new Error('Unexpected argument: '+arg);
  }
  if(expectedSha!==null&&!/^[0-9a-f]{40}$/i.test(expectedSha))
    throw new Error('--sha expects a full 40-character Git SHA.');
  if(reviewPath!==null) {
    if(expectedSha===null)throw new Error('--verify-receipt requires --sha COMMIT_SHA.');
    if(receiptPath!==null||keep)
      throw new Error('Offline receipt review cannot download or retain snapshots.');
  }
  return {expectedSha,keep,receiptPath,reviewPath};
}

const usage=[
  'Manual private GitHub snapshot validation (no Git clone, no GitHub Actions)',
  '',
  'Run with locally configured GITHUB_TOKEN (Contents: read):',
  '  node scripts/verify-pilot.mjs --sha HEAD_SHA --receipt ./pilot-result.json',
  'Offline examination of an UNSIGNED receipt (no GitHub token needed):',
  '  node scripts/verify-pilot.mjs --verify-receipt ./pilot-result.json --sha HEAD_SHA',
  'Use --keep only to retain a local test checkout for debugging.',
  '',
  'Fixed source: '+PILOT_REPO+' at '+PILOT_BRANCH+'.',
  'The auth token is never forwarded to npm or written into the receipt.',
  'Receipts are unsigned/self-reported and never authorize merging.'
].join('\n');

try {
  const parsed=parseVerificationArgs(process.argv.slice(2));
  if(parsed.help) {
    process.stdout.write(usage+'\n');
  } else if(parsed.reviewPath!==null) {
    // Offline metadata check: no GitHub requests and no token needed.
    const reviewed=await readNativeValidationReceipt(parsed.reviewPath,{
      expectedSha:parsed.expectedSha});
    process.stdout.write(JSON.stringify(reviewed,null,2)+'\n');
    if(!reviewed.recorded_tests_passed)process.exitCode=1;
  } else {
    const api=createReadOnlyGitHubApi({token:process.env.GITHUB_TOKEN});
    const result=await validatePinnedSnapshot({api,
      expectedSha:parsed.expectedSha,keep:parsed.keep});
    if(parsed.receiptPath!==null) {
      const receipt=buildNativeValidationReceipt(result);
      result.receipt_file=await saveNativeValidationReceipt(parsed.receiptPath,receipt);
    }
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if(!result.tests.passed)process.exitCode=1;
  }
} catch(error) {
  const raw=error instanceof Error?error.message:String(error);
  const token=process.env.GITHUB_TOKEN||'';
  // Defense-in-depth: redact the exact local token even on unexpected errors.
  const safe=token?raw.split(token).join('[REDACTED]'):raw;
  process.stderr.write('Native snapshot validation failed: '+safe+'\n');
  process.exitCode=1;
}
