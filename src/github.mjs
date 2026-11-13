import {createHash} from 'node:crypto';

const RECORD_FILE=/^(?:claims|submissions)\/[A-Za-z0-9][A-Za-z0-9_.-]*__[A-Za-z0-9][A-Za-z0-9_.-]*\/issue-[1-9][0-9]*\.json$|^resources\/[A-Za-z0-9][A-Za-z0-9_.-]*__[A-Za-z0-9][A-Za-z0-9_.-]*\/[a-z][a-z0-9_-]*\.json$/;
const RECORD_DIR=/^(?:claims|resources|submissions)(?:\/[A-Za-z0-9][A-Za-z0-9_.-]*__[A-Za-z0-9][A-Za-z0-9_.-]*)?$/;
const SHA40=/^[a-f0-9]{40}$/i;
const B64=/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function validatedLedgerTreeEntries(listing) {
  if(listing?.truncated!==false || !Array.isArray(listing.tree))
    throw new Error('Ledger tree is truncated or malformed; status cannot be trusted.');
  const paths=new Set(),files=[];
  for(const item of listing.tree) {
    if(typeof item?.path!=='string')throw new Error('Ledger tree contains malformed entry.');
    const path=item.path;
    const lower=path.toLowerCase();
    if(!/^(claims|resources|submissions)(\/|$)/.test(lower))continue;
    if(paths.has(lower))throw new Error('Ledger contains duplicate or case-conflicting records.');
    paths.add(lower);
    if(item.type==='tree' && RECORD_DIR.test(path) && item.mode==='040000')continue;
    if(item.type!=='blob' || !RECORD_FILE.test(path) || item.mode!=='100644' ||
       !SHA40.test(item.sha||'') || !Number.isSafeInteger(item.size) ||
       item.size<1 || item.size>65536)
      throw new Error('Ledger contains unexpected record path, mode or metadata.');
    files.push(item);
  }
  if(files.length>250)throw new Error('Ledger contains too many entries for the pilot.');
  return files;
}

function decodeLedgerBlob(blob,entry) {
  if(blob?.encoding!=='base64'||typeof blob.content!=='string' ||
     !SHA40.test(blob.sha||'') || blob.sha.toLowerCase()!==entry.sha.toLowerCase() ||
     !Number.isSafeInteger(blob.size)||blob.size!==entry.size)
    throw new Error('Git blob metadata differs from pinned ledger tree.');
  const normalized=blob.content.replace(/\s/g,'');
  if(!B64.test(normalized))throw new Error('Invalid Git blob base64 encoding.');
  const bytes=Buffer.from(normalized,'base64');
  if(bytes.length!==entry.size||bytes.toString('base64')!==normalized)
    throw new Error('Git blob bytes differ from pinned ledger tree size.');
  const digest=createHash('sha1')
    .update(Buffer.from('blob '+bytes.length+'\0'))
    .update(bytes).digest('hex');
  if(digest!==entry.sha.toLowerCase())
    throw new Error('Git blob content does not match pinned SHA-1.');
  let data;
  try {
    data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  } catch {
    throw new Error('Ledger record is not valid UTF-8 JSON.');
  }
  if(data===null||typeof data!=='object'||Array.isArray(data))
    throw new Error('Ledger record must be a JSON object.');
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
    async getLedgerSnapshot(repo, branch) {
      // Pin every file to ONE Git tree; separate Contents branch reads can be stale.
      const ref=await request('GET','/repos/'+repo+'/git/ref/heads/'+branch);
      const head=ref?.object?.sha;
      if(!/^[0-9a-f]{40}$/i.test(head||'')) throw new Error('Invalid ledger branch head.');
      const commit=await request('GET','/repos/'+repo+'/git/commits/'+head);
      const treeSha=commit?.tree?.sha;
      if(!/^[0-9a-f]{40}$/i.test(treeSha||'')) throw new Error('Invalid ledger tree.');
      const listing=await request('GET','/repos/'+repo+'/git/trees/'+treeSha+'?recursive=1');
      const relevant=validatedLedgerTreeEntries(listing);
      const entries=await Promise.all(relevant.map(async entry=>{
        const blob=await request('GET','/repos/'+repo+'/git/blobs/'+entry.sha);
        return {path:entry.path,sha:entry.sha,data:decodeLedgerBlob(blob,entry)};
      }));
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
