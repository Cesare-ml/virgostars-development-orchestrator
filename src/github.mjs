import {createHash} from 'node:crypto';
import {TextDecoder} from 'node:util';

const SHA_1=/^[0-9a-f]{40}$/i;
const LEDGER_NAMESPACES=new Set(['claims','resources','submissions']);
const ENCODED_REPO=/^[A-Za-z0-9][A-Za-z0-9._-]*__[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ISSUE_FILE=/^issue-([1-9][0-9]*)\.json$/;
const RESOURCE_FILE=/^[a-z][a-z0-9_-]{0,63}\.json$/;

/**
 * Git trees may contain symlinks, subtrees and case-colliding names. Never
 * silently omit these from an owner-only coordination snapshot: a hidden
 * claim or lock must block startup rather than look like an unclaimed task.
 */
export function inspectLedgerTreeEntries(tree) {
  if(!Array.isArray(tree) || tree.length>2000)
    throw new Error('Ledger Git tree missing or exceeds inspection limit.');
  const records=[],seen=new Set();
  for(const entry of tree) {
    if(!entry || typeof entry.path!=='string')
      throw new Error('Invalid ledger Git tree entry metadata.');
    const parts=entry.path.split('/');
    const root=parts[0]?.toLowerCase();
    if(!LEDGER_NAMESPACES.has(root)) continue;
    const folded=entry.path.toLowerCase();
    if(seen.has(folded))throw new Error('Duplicate or case-conflicting ledger path.');
    seen.add(folded);
    if(parts[0]!==root || parts.length>3 || parts.some(x=>!x||x==='.'||x==='..'))
      throw new Error('Unexpected ledger record path.');
    if(parts.length===1 || parts.length===2) {
      if(parts.length===2 && !ENCODED_REPO.test(parts[1]))
        throw new Error('Unexpected ledger repository directory.');
      if(entry.type!=='tree' || entry.mode!=='040000' || !SHA_1.test(entry.sha||''))
        throw new Error('Unexpected ledger directory object.');
      continue;
    }
    const file=parts[2];
    const match=root==='resources'?RESOURCE_FILE.test(file):ISSUE_FILE.exec(file);
    if(!ENCODED_REPO.test(parts[1]) || !match ||
       (root!=='resources' && !Number.isSafeInteger(Number(match[1]))))
      throw new Error('Noncanonical ledger record path.');
    if(entry.type!=='blob' || entry.mode!=='100644' ||
       !SHA_1.test(entry.sha||'') || !Number.isSafeInteger(entry.size) ||
       entry.size<1 || entry.size>65536)
      throw new Error('Invalid or unsafe ledger record object.');
    records.push(entry);
    if(records.length>250)
      throw new Error('Ledger contains too many entries for the pilot.');
  }
  return records;
}

function decodeLedgerRecord(blob,entry) {
  if(blob?.encoding!=='base64' || typeof blob.content!=='string' ||
     blob.content.length>90000 || !SHA_1.test(blob.sha||'') ||
     blob.sha.toLowerCase()!==entry.sha.toLowerCase() ||
     blob.size!==entry.size)
    throw new Error('Invalid Git blob metadata for ledger record.');
  const base64=blob.content.replace(/\s/g,'');
  if(!base64 || base64.length%4!==0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))
    throw new Error('Malformed ledger record base64.');
  const raw=Buffer.from(base64,'base64');
  if(raw.length!==entry.size || raw.toString('base64')!==base64)
    throw new Error('Ledger record content length or encoding mismatch.');
  const digest=createHash('sha1').update('blob '+raw.length+'\0').update(raw).digest('hex');
  if(digest.toLowerCase()!==entry.sha.toLowerCase())
    throw new Error('Ledger record Git blob hash mismatch.');
  let data;
  try {data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));}
  catch {throw new Error('Invalid ledger JSON record.');}
  if(!data || typeof data!=='object' || Array.isArray(data))
    throw new Error('Ledger JSON record must be an object.');
  return data;
}

export class GitHubError extends Error {
  constructor(status) {
    super('GitHub request failed (HTTP ' + status + ')');
    this.name = 'GitHubError';
    this.status = status;
  }
}

export function makeGitHubClient({ token, fetchImpl = fetch, baseUrl = 'https://api.github.com' } = {}) {
  if (!token) throw new Error('GITHUB_TOKEN is required; keep credentials out of chats and GitHub files.');
  if (!baseUrl.startsWith('https://')) throw new Error('HTTPS GitHub API required.');
  async function request(method, path, body) {
    const response = await fetchImpl(baseUrl + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'VirgoStars-private-pilot',
        ...(body === undefined ? {} : {'Content-Type':'application/json'})
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    if (!response.ok) throw new GitHubError(response.status);
    return response.status === 204 ? null : response.json();
  }
  const contentUrl = (repo,path) => '/repos/' + repo + '/contents/' + path.split('/').map(encodeURIComponent).join('/');
  return {
    async getRepository(repo) {
      if(typeof repo!=='string'|| !/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(repo))
        throw new Error('Invalid GitHub repository identifier.');
      return request('GET','/repos/'+repo);
    },
    async getBranchRef(repo,branch) {
      if(typeof repo!=='string'|| !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repo)||
         branch!=='coordination/claims')
        throw new Error('Invalid private destination branch request.');
      return request('GET','/repos/'+repo+'/git/ref/heads/'+branch);
    },
    // Only the reviewed PRIVATE repository's main branch is an eligible
    // owner-catalog approval source. No ref supplied by an agent is accepted.
    async getOwnerCatalogRef(repo) {
      if(typeof repo!=='string'||
         !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repo))
        throw new Error('Invalid owner catalog repository.');
      return request('GET','/repos/'+repo+'/git/ref/heads/main');
    },
    async getGitCommit(repo,sha) {
      if(typeof repo!=='string'|| !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repo)||
         !/^[a-f0-9]{40}$/i.test(sha))
        throw new Error('Invalid private destination commit request.');
      return request('GET','/repos/'+repo+'/git/commits/'+sha);
    },
    async getGitTree(repo,sha) {
      if(typeof repo!=='string'|| !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repo)||
         !/^[a-f0-9]{40}$/i.test(sha))
        throw new Error('Invalid private destination tree request.');
      return request('GET','/repos/'+repo+'/git/trees/'+sha+'?recursive=1');
    },
    async getGitBlob(repo,sha) {
      if(typeof repo!=='string'||
         !/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repo)||
         !/^[a-f0-9]{40}$/i.test(sha))
        throw new Error('Invalid pinned Git blob request.');
      return request('GET','/repos/'+repo+'/git/blobs/'+sha);
    },
    async getLedgerSnapshot(repo, branch) {
      // Pin every file to ONE Git tree; separate Contents branch reads can be stale.
      const ref=await request('GET','/repos/'+repo+'/git/ref/heads/'+branch);
      const head=ref?.object?.sha;
      if(!/^[0-9a-f]{40}$/i.test(head||'')) throw new Error('Invalid ledger branch head.');
      const commit=await request('GET','/repos/'+repo+'/git/commits/'+head);
      const treeSha=commit?.tree?.sha;
      if(!/^[0-9a-f]{40}$/i.test(treeSha||'')) throw new Error('Invalid ledger tree.');
      const listing=await request('GET','/repos/'+repo+'/git/trees/'+treeSha+'?recursive=1');
      if(listing?.truncated || !Array.isArray(listing?.tree))
        throw new Error('Ledger tree is truncated or malformed; status cannot be trusted.');
      const relevant=inspectLedgerTreeEntries(listing.tree);
      const entries=await Promise.all(relevant.map(async e=>{
        const blob=await request('GET','/repos/'+repo+'/git/blobs/'+e.sha);
        return {path:e.path,sha:e.sha,data:decodeLedgerRecord(blob,e)};
      }));
      // A correct pinned tree is not a current ledger snapshot if the branch
      // moved while blobs were being inspected.
      const finalRef=await request('GET','/repos/'+repo+'/git/ref/heads/'+branch);
      if(finalRef?.object?.type!=='commit' ||
         finalRef.object.sha!==head)
        throw new Error('Ledger branch moved during snapshot read.');
      return {head,entries};
    },
    async getClaim(repo, path, branch) {
      const ref = await request('GET', '/repos/' + repo + '/git/ref/heads/' + branch);
      const tip = ref?.object?.sha;
      if (!/^[0-9a-f]{40}$/i.test(tip || '')) throw new Error('Invalid Git branch head.');
      try {
        const f = await request('GET', contentUrl(repo,path) + '?ref=' + encodeURIComponent(tip));
        if (f.type !== 'file' || !f.sha || !f.content) throw new Error('Unexpected GitHub claim file.');
        return { sha: f.sha, data: JSON.parse(Buffer.from(f.content.replace(/\s/g,''),'base64').toString('utf8')) };
      } catch (error) {
        if (error instanceof GitHubError && error.status === 404) return null;
        throw error;
      }
    },
    async createClaim(repo,path,branch,data) {
      return request('PUT',contentUrl(repo,path),{
        message:'coordination: claim ' + data.target_repository + '#' + data.issue_number,
        branch, content:Buffer.from(JSON.stringify(data,null,2)+'\n').toString('base64')
      });
    },
    async updateClaim(repo,path,branch,sha,data) {
      return request('PUT',contentUrl(repo,path),{
        message:'coordination: handoff ' + data.target_repository + '#' + data.issue_number,
        branch,sha,content:Buffer.from(JSON.stringify(data,null,2)+'\n').toString('base64')
      });
    },
    async deleteClaim(repo,path,branch,sha,data) {
      return request('DELETE',contentUrl(repo,path),{
        message:'coordination: release ' + data.target_repository + '#' + data.issue_number,
        branch,sha
      });
    },
    async getIssue(repo,number) {
      return request('GET','/repos/' + repo + '/issues/' + number);
    },
    async getPullRequest(repo,number) {
      if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid PR number.');
      return request('GET','/repos/' + repo + '/pulls/' + number);
    },
    async getOpenPullRequests(repo) {
      // Explicit finite pagination: an incomplete listing cannot certify no conflicts.
      const output=[];
      for(let page=1;page<=3;page++) {
        const chunk=await request('GET','/repos/' + repo +
          '/pulls?state=open&per_page=100&page=' + page);
        if(!Array.isArray(chunk) || chunk.length>100)
          throw new Error('Malformed GitHub open PR listing.');
        output.push(...chunk);
        if(output.length>200)
          throw new Error('Too many open PRs for private pilot collision audit.');
        if(chunk.length<100) return output;
      }
      throw new Error('Open PR pagination exceeds private pilot limit.');
    },
    async getPullRequestFiles(repo,number) {
      if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid PR number.');
      const files=[];
      for(let page=1;page<=3;page++) {
        const next=await request('GET','/repos/' + repo + '/pulls/' + number +
          '/files?per_page=100&page=' + page);
        if (!Array.isArray(next) || next.length>100)
          throw new Error('Malformed GitHub PR changed-file response.');
        files.push(...next);
        if (files.length>200) throw new Error('Too many changed files for pilot scope audit.');
        if (next.length<100) return files;
      }
      throw new Error('Changed-file pagination did not end within the private pilot limit.');
    }
  };
}
