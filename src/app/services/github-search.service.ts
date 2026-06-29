import { Injectable } from '@angular/core';
import { GitHubIssueSearchItem, GitHubSearchIssuesResponse } from '../models/pull-request.model';

export interface GitHubSearchResult {
  items: GitHubIssueSearchItem[];
  incompleteResults: boolean;
}

@Injectable({ providedIn: 'root' })
export class GitHubSearchService {
  async fetchAllSearchItems(query: string, token: string): Promise<GitHubSearchResult> {
    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'Authorization': `token ${token}`
    };
    const allItems: GitHubIssueSearchItem[] = [];
    let incompleteResults = false;

    for (let page = 1; page <= 10; page++) {
      const params = new URLSearchParams({ q: query, per_page: '100', page: String(page) });
      const url = `https://api.github.com/search/issues?${params.toString()}`;
      const response = await fetch(url, { headers });
      if (!response.ok) {
        let errorMessage = response.statusText
          ? `GitHub search failed: ${response.status} ${response.statusText}`
          : `GitHub search failed: ${response.status}`;
        try {
          const errorBody = await response.json() as { message?: string };
          if (errorBody.message) { errorMessage = errorBody.message; }
        } catch { /* non-JSON body */ }
        throw new Error(errorMessage);
      }
      const data = await response.json() as GitHubSearchIssuesResponse;
      allItems.push(...data.items);
      if (data.incomplete_results) {
        incompleteResults = true;
      }
      const reachedTotalCount = allItems.length >= data.total_count;
      const noMoreItems = data.items.length === 0;
      if (reachedTotalCount || noMoreItems) {
        break;
      }
      // Reached the 10-page (1000-result) cap with more results remaining
      if (page === 10) {
        incompleteResults = true;
      }
    }

    return { items: allItems, incompleteResults };
  }
}
