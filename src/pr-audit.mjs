import {validateTaskCatalog} from './resources.mjs';

const SHA = /^[0-9a-f]{40}$/i;
const MAX_PR_FILES = 200;
const reason = (code, description) => ({code, description});

function safePath(path) {
  return typeof path === 'string' && path.length <= 300
    && !path.startsWith('/') && !path.includes('\\')
    && !path.split('/').some(s => !s || s === '.' || s === '..');
}
function inScope(path, root) {
  return root.endsWith('/') ? path.startsWith(root) : path === root;
}

/** No merge/approval decisions. A machine-checkable, conservative PR scope review. */
export function inspectTaskPullRequest(task, pr, upstream, files) {
  validateTaskCatalog([task]);
  if (task.access !== 'write' || task.role !== 'developer' ||
      !Number.isSafeInteger(task.upstream_pr) || task.upstream_pr < 1 ||
      !task.upstream_branch || typeof task.upstream_branch !== 'string')
    throw new Error('This task is not configured for a scoped stacked developer PR.');
  if (!pr || !upstream || !Array.isArray(files))
    throw new Error('Missing GitHub PR evidence; cannot audit.');
  const issues = [];
  const flag = (code, message) => issues.push(reason(code, message));
  if (pr.state !== 'open' || pr.draft !== true)
    flag('NOT_OPEN_DRAFT','The delivery pull request must be open and draft.');
  if (upstream.state !== 'open')
    flag('UPSTREAM_NOT_OPEN','The target upstream pull request is not open.');
  if (pr.head?.repo?.full_name !== task.repository ||
      pr.base?.repo?.full_name !== task.repository)
    flag('CROSS_REPO_BRANCH','Both PR head and base must belong to the designated repository.');
  if (pr.base?.ref !== task.upstream_branch ||
      upstream.head?.ref !== task.upstream_branch)
    flag('WRONG_BASE_BRANCH','Stacked PR must target the current upstream PR feature branch.');
  if (!SHA.test(pr.head?.sha || '') || !SHA.test(pr.base?.sha || '') ||
      !SHA.test(upstream.head?.sha || ''))
    flag('INVALID_COMMIT_SHA','GitHub PR head/base SHA metadata is missing or malformed.');
  if (pr.head?.sha === pr.base?.sha || pr.head?.ref === pr.base?.ref ||
      pr.head?.ref === 'main')
    flag('NOT_SEPARATE_BRANCH','Delivery must be made from its own feature branch.');
  if (pr.base?.sha !== upstream.head?.sha)
    flag('UPSTREAM_MOVED','Delivery PR base does not match the current upstream PR head.');
  if (!Number.isSafeInteger(pr.changed_files) || pr.changed_files !== files.length ||
      files.length < 1 || files.length > MAX_PR_FILES)
    flag('INCOMPLETE_FILE_LIST','Changed-file metadata does not match the complete fetched file list.');
  const names = new Set();
  const allowedRoots = task.resource_scope.roots;
  for (const file of files) {
    const path = file?.filename;
    if (!safePath(path) || names.has(path)) {
      flag('INVALID_FILE_PATH','PR includes a malformed or duplicate changed filename.');
      continue;
    }
    names.add(path);
    if (!allowedRoots.some(root => inScope(path,root)))
      flag('OUTSIDE_APPROVED_SCOPE','Out-of-scope path: '+path);
    if (task.pilot_wave === 2 && file.status !== 'added')
      flag('NOT_A_NEW_FILE','Wave-2 permits only added files: '+path);
    if (file.status === 'renamed' || file.previous_filename)
      flag('RENAMED_FILE','Renamed files are not authorized in this pilot: '+path);
  }
  if (task.pilot_wave === 2) {
    for (const root of allowedRoots) {
      if (!names.has(root)) flag('MISSING_REQUIRED_FILE','Expected new file not found in diff: '+root);
    }
  }
  return {
    task:task.repository+'#'+task.issue,
    pull_request:pr.number ?? null,
    pull_request_head:SHA.test(pr.head?.sha||'')?pr.head.sha:null,
    upstream_head:SHA.test(upstream.head?.sha||'')?upstream.head.sha:null,
    base_branch:pr.base?.ref ?? null,
    changed_files:files.map(f=>({path:f.filename,status:f.status})),
    verdict:issues.length ? 'blocked':'scope-clean',
    reasons:issues,
    independently_tested:false,
    approved:false,
    caveat:'This is metadata/scope validation, not runtime testing, a diff-content proof, or merge authorization.'
  };
}

export async function auditTaskPullRequest({api,tasks,repo,issue,prNumber}) {
  validateTaskCatalog(tasks);
  if(!Number.isSafeInteger(prNumber) || prNumber < 1)
    throw new Error('Expected a positive pull request number.');
  const task=tasks.find(t=>t.repository===repo&&t.issue===issue);
  if(!task) throw new Error('Issue is not a curated private pilot task.');
  if(task.access!=='write') throw new Error('This read-only task must not produce code PRs.');
  const [pr,upstream]=await Promise.all([
    api.getPullRequest(repo,prNumber),api.getPullRequest(repo,task.upstream_pr)
  ]);
  if (!pr || !upstream || !Number.isSafeInteger(pr.changed_files) ||
      pr.changed_files < 1 || pr.changed_files > MAX_PR_FILES)
    throw new Error('PR metadata is incomplete or has too many files for the pilot.');
  const files=await api.getPullRequestFiles(repo,prNumber);
  return inspectTaskPullRequest(task,pr,upstream,files);
}
