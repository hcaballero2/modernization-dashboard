import { Injectable } from '@angular/core';

export interface GitTreeEntry {
  path: string;
  type: 'blob' | 'tree' | 'commit';
}

interface GitTreeResponse {
  tree: GitTreeEntry[];
  truncated: boolean;
}

interface RepoResponse {
  default_branch: string;
}

/**
 * Low-level, READ-ONLY GitHub REST client. Every method issues a GET request;
 * this service intentionally exposes no mutating verbs so the dashboard cannot
 * write to any repository, regardless of the token's scopes.
 */
@Injectable({ providedIn: 'root' })
export class GitHubApiService {
  private readonly base = 'https://api.github.com';

  private headers(token: string, accept = 'application/vnd.github+json'): HeadersInit {
    return { Accept: accept, Authorization: `token ${token}` };
  }

  /** GET a file's raw text from the default branch. Returns null on 404. */
  async getRawFile(owner: string, repo: string, path: string, token: string): Promise<string | null> {
    const url = `${this.base}/repos/${owner}/${repo}/contents/${path}`;
    const res = await fetch(url, { headers: this.headers(token, 'application/vnd.github.raw') });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await this.errorMessage(res, `GET ${path}`));
    return res.text();
  }

  /** GET the repo's default branch name. */
  async getDefaultBranch(owner: string, repo: string, token: string): Promise<string> {
    const url = `${this.base}/repos/${owner}/${repo}`;
    const res = await fetch(url, { headers: this.headers(token) });
    if (!res.ok) throw new Error(await this.errorMessage(res, `GET repo ${repo}`));
    return ((await res.json()) as RepoResponse).default_branch;
  }

  /** GET the recursive file tree for a branch. Returns paths of blobs. */
  async getTreePaths(owner: string, repo: string, branch: string, token: string): Promise<string[]> {
    const url = `${this.base}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
    const res = await fetch(url, { headers: this.headers(token) });
    if (!res.ok) throw new Error(await this.errorMessage(res, `GET tree ${repo}`));
    const data = (await res.json()) as GitTreeResponse;
    return data.tree.filter((e) => e.type === 'blob').map((e) => e.path);
  }

  private async errorMessage(res: Response, ctx: string): Promise<string> {
    let msg = `${ctx} failed: ${res.status}${res.statusText ? ' ' + res.statusText : ''}`;
    try {
      const body = (await res.json()) as { message?: string };
      if (body.message) msg = `${ctx}: ${body.message}`;
    } catch {
      /* non-JSON body */
    }
    return msg;
  }
}
