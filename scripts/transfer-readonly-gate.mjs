#!/usr/bin/env node
// Read-only GitHub Organization transfer gate. NEVER moves repositories.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const login = /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const name = /^[a-z\d_.-]{1,100}$/i;

export function argsOf(argv) {
  if (argv.length === 1 && argv[0] === '--help') return { help: true };
  const obj = { source: 'Cesare-ml', stage: 'pre' };
  const seen = new Set();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (!['org', 'repo', 'id', 'visibility', 'source', 'stage'].includes(key) || !argv[i]?.startsWith('--') || !argv[i+1] || seen.has(key)) throw new Error('Invalid or duplicate argument');
    obj[key] = argv[i+1]; seen.add(key);
  }
  if (!login.test(obj.org ?? '') || !login.test(obj.source) || !name.test(obj.repo ?? '') || !/^\d+$/.test(obj.id ?? '') || !Number.isSafeInteger(Number(obj.id)) || Number(obj.id) <= 0 || !['public','private'].includes(obj.visibility) || !['pre','post'].includes(obj.stage) || same(obj.org, obj.source)) throw new Error('Invalid or missing required arguments');
  obj.id = Number(obj.id);
  return obj;
}

export function verify(o, data) {
  const failed = [];
  const need = (ok, key) => { if (!ok) failed.push(key); };
  need(same(data.actor?.login, o.source), 'SOURCE_LOGIN');
  need(same(data.org?.login, o.org) && data.org?.type === 'Organization' && Number.isSafeInteger(data.org?.id) && data.org.id > 0, 'TARGET_ORGANIZATION_IDENTITY');
  need(same(data.member?.organization?.login, o.org) && data.member?.role === 'admin' && data.member?.state === 'active', 'ORG_OWNER_MEMBERSHIP');
  const repo = o.stage === 'pre' ? data.source : data.destination;
  const owner = o.stage === 'pre' ? o.source : o.org;
  need(same(repo?.full_name, owner + '/' + o.repo) && same(repo?.owner?.login, owner) && repo?.owner?.type === (o.stage === 'pre' ? 'User' : 'Organization') && repo?.id === o.id, 'REPOSITORY_IDENTITY');
  need(repo?.visibility === o.visibility && repo?.private === (o.visibility === 'private'), 'REPOSITORY_VISIBILITY');
  need(repo?.permissions?.admin === true, 'REPOSITORY_ADMIN');
  if (o.stage === 'pre') {
    const pages = data.pages;
    need(Array.isArray(pages) && pages.every(page => Array.isArray(page) && page.every(item => typeof item?.name === 'string')), 'COMPLETE_DESTINATION_LISTING');
    need(Array.isArray(pages) && !pages.some(page => Array.isArray(page) && page.some(item => same(item.name, o.repo))), 'DESTINATION_NAME_COLLISION');
  }
  return { stage: o.stage, organization: o.org, organization_id: data.org?.type === 'Organization' ? data.org.id : null, repository: o.repo, repository_id: o.id, expected_visibility: o.visibility, blockers: failed, ready_for_manual_transfer: o.stage === 'pre' && failed.length === 0, verified_after_transfer: o.stage === 'post' && failed.length === 0, writes_performed: false };
}

function api(path, paginated = false) {
  const command = ['api', '--method', 'GET'];
  if (paginated) command.push('--paginate', '--slurp');
  command.push(path);
  try { return JSON.parse(execFileSync('gh', command, {encoding:'utf8', stdio:['ignore','pipe','pipe'], timeout:30000, maxBuffer:20000000})); }
  catch { throw new Error('GitHub read failed; check gh auth, access and connectivity'); }
}

export function collect(o, read = api) {
  const data = { actor: read('user'), org: read('orgs/' + o.org), member: read('user/memberships/orgs/' + o.org) };
  if (o.stage === 'pre') {
    data.source = read('repos/' + o.source + '/' + o.repo);
    data.pages = read('orgs/' + o.org + '/repos?type=all&per_page=100', true);
  } else data.destination = read('repos/' + o.org + '/' + o.repo);
  return verify(o, data);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const opts = argsOf(process.argv.slice(2));
    if (opts.help) console.log('node scripts/transfer-readonly-gate.mjs --org EXACT_ORG --repo astrological-assets --id 1451635822 --visibility public [--stage pre|post]');
    else { const result = collect(opts); console.log(JSON.stringify(result, null, 2)); if (result.blockers.length) process.exitCode = 2; }
  } catch (e) { console.error('Blocked: ' + e.message + '. No changes made.'); process.exitCode = 2; }
}
