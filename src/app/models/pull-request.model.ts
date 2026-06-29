export type CiStatus = 'success' | 'failure' | 'pending' | 'unknown';

export interface GitHubUser {
  login: string;
  avatar_url: string;
}

export interface GitHubLabel {
  id: number;
  node_id: string;
  url: string;
  name: string;
  color: string;
  description: string | null;
  default: boolean;
}

export interface CheckRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | null;
  html_url: string;
}

export interface GitHubIssueSearchItem {
  id: number;
  number: number;
  title: string;
  html_url: string;
  repository_url: string;
  user: GitHubUser;
  created_at: string;
  labels: GitHubLabel[];
}

export interface GitHubSearchIssuesResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubIssueSearchItem[];
}

export interface GitHubPullRequestDetails {
  commits: number;
  head: { sha: string };
}

export interface GitHubRepository {
  allow_squash_merge: boolean;
  allow_merge_commit: boolean;
  allow_rebase_merge: boolean;
}

export interface GitHubCheckRunsResponse {
  total_count: number;
  check_runs: CheckRun[];
}

export interface GitHubCombinedStatusResponse {
  state: 'success' | 'failure' | 'pending' | 'error';
}

export interface PullRequest {
  id: number;
  number: number;
  title: string;
  html_url: string;
  user: GitHubUser;
  created_at: string;
  labels: GitHubLabel[];
  repoOwner: string;
  repoName: string;
  head: { sha: string };
  isModified: boolean;
  ciStatus: CiStatus;
  checkRuns: CheckRun[];
  isProcessing: boolean; // For button loading states
  workflowStatus: CiStatus;
  commits?: number; // Number of commits in the PR
  allowSquashMerge?: boolean;
  allowMergeCommit?: boolean;
  allowRebaseMerge?: boolean;
}

export interface PrGroup {
  title: string;
  prs: PullRequest[];
  aggregateCiStatus: 'success' | 'failure' | 'pending' | 'mixed' | 'unknown';
  isExpanded: boolean;
  workflowSummary: { success: number; pending: number; failed: number };
}
