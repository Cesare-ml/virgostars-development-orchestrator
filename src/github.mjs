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
    }
  };
}
