import { ChangeDetectionStrategy, Component, signal, computed, inject, effect } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { SearchFormComponent } from './components/search-form/search-form.component';
import { ModuleMatrixComponent } from './components/module-matrix/module-matrix.component';
import { ReviewQueueComponent } from './components/review-queue/review-queue.component';
import { getSourceRepositoryUrl } from './config/source-repository-url';
import { SessionStorageService, SESSION_KEYS } from './services/session-storage.service';
import { ModuleListService } from './services/module-list.service';
import { ChecklistService } from './services/checklist.service';
import { GitHubSearchService } from './services/github-search.service';
import { parseClosingIssueRefs } from './services/issue-links';
import { ClosingPr, emptyCells, ModuleStatus, ReleasePr } from './models/module-status.model';
import {
  CiStatus,
  GitHubCheckRunsResponse,
  GitHubIssueSearchItem,
  GitHubPullListItem,
} from './models/pull-request.model';

/** Resolved open-PR facts for one repo, shared by the matrix and the review queue. */
interface RepoPrInfo {
  owner: string;
  repo: string;
  releasePr: ReleasePr | null;
  /** issue number -> the minimal closing-PR ref shown in the matrix tooltip. */
  closingByIssue: Map<number, { number: number; url: string }>;
  /** Distinct closing PRs (with CI), covering every matched issue in the repo. */
  closingPrs: ClosingPr[];
}

const RELEASE_PR_RE = /cleanup\s+(?:for\s+)?v?\d+\.\d+\.\d+\s+release/i;

/** An open issue is "modernization-related" if its title or a label matches this. */
const MODERNIZATION_ISSUE_RE =
  /openvox|ruby ?4|\bel ?7\b|\bpdk\b|voxpupuli|puppetlabs_spec_helper|spec_helper|tcpwrappers|blast.?radius|non-destructive|moderniz|reference\.md|puppet ?[89]/i;

/** Terms used to build the repo-scoped GitHub issues search link. */
const MODERNIZATION_TERMS = [
  'openvox', 'pdk', 'voxpupuli-test', 'puppetlabs_spec_helper', 'EL7', 'tcpwrappers',
  '"blast radius"', 'non-destructive', 'REFERENCE.md',
];

@Component({
  selector: 'app-root',
  imports: [SearchFormComponent, ModuleMatrixComponent, ReviewQueueComponent],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  readonly sourceRepositoryUrl = getSourceRepositoryUrl();
  private storage = inject(SessionStorageService);
  private moduleList = inject(ModuleListService);
  private checklist = inject(ChecklistService);
  private githubSearch = inject(GitHubSearchService);
  private doc = inject(DOCUMENT);

  // --- STATE SIGNALS ---
  organization = signal<string>(this.storage.get(SESSION_KEYS.organization) || 'simp');
  token = signal<string>(this.storage.get(SESSION_KEYS.token));
  darkMode = signal<boolean>(this.getInitialDarkMode());
  modules = signal<ModuleStatus[]>([]);
  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);
  searched = signal<boolean>(false);
  progress = signal<{ done: number; total: number }>({ done: 0, total: 0 });

  // --- COMPUTED SIGNALS ---
  formValid = computed(() => this.organization().trim() !== '' && this.token().trim() !== '');

  constructor() {
    effect(() => {
      if (this.darkMode()) {
        this.doc.documentElement.classList.add('dark');
      } else {
        this.doc.documentElement.classList.remove('dark');
      }
    });
  }

  private getInitialDarkMode(): boolean {
    try {
      const stored = localStorage.getItem('theme');
      if (stored) return stored === 'dark';
    } catch {
      /* storage unavailable */
    }
    try {
      if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
    } catch {
      /* matchMedia unavailable */
    }
    return false;
  }

  toggleDarkMode(): void {
    const next = !this.darkMode();
    this.darkMode.set(next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {
      /* storage unavailable */
    }
  }

  // --- SCAN ORCHESTRATION (read-only) ---
  async scanModules(): Promise<void> {
    if (!this.formValid()) {
      this.error.set('Organization and Personal Access Token are required.');
      return;
    }
    this.isLoading.set(true);
    this.error.set(null);
    this.modules.set([]);
    this.searched.set(true);

    const org = this.organization().trim();
    const token = this.token().trim();
    this.organization.set(org);
    this.token.set(token);
    this.storage.set(SESSION_KEYS.organization, org);
    this.storage.set(SESSION_KEYS.token, token);

    try {
      const active = await this.moduleList.fetchActiveModules(org, token);
      this.progress.set({ done: 0, total: active.length });

      // Seed placeholder rows so the matrix renders immediately.
      this.modules.set(
        active.map((m) => ({
          name: m.name,
          repo: m.repo,
          owner: org,
          cells: emptyCells(),
          releasePr: null,
          loading: true,
        })),
      );

      // Derive each module in bounded batches to respect secondary rate limits.
      const BATCH = 8;
      for (let i = 0; i < active.length; i += BATCH) {
        const batch = active.slice(i, i + BATCH);
        const results = await Promise.all(
          batch.map((m) => this.checklist.deriveModule(org, m, token)),
        );
        this.patchModules(results);
        this.progress.update((p) => ({ ...p, done: Math.min(p.done + batch.length, p.total) }));
      }

      // Phase 3: enrich with open release PRs + modernization issues (shared CI).
      await this.enrichPrs(org, token);
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : 'An unknown error occurred.');
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Merge derived module results into the signal, clearing their loading flag. */
  private patchModules(results: ModuleStatus[]): void {
    const byRepo = new Map(results.map((r) => [r.repo, r]));
    this.modules.update((mods) =>
      mods.map((m) => {
        const r = byRepo.get(m.repo);
        return r ? { ...r, loading: false } : m;
      }),
    );
  }

  /**
   * Phase 3 (read-only): for every repo that has an open release PR OR a matched
   * modernization issue, fetch its open-PR list ONCE (head SHAs come free with the
   * list — no per-PR detail GET), then fetch check-runs ONCE per distinct PR we
   * surface. The same CI result feeds the matrix (release badge + "in PR" coverage)
   * and the "Ready to review" queue, so no PR's CI is looked up twice.
   */
  private async enrichPrs(org: string, token: string): Promise<void> {
    // Org-wide searches run in parallel: open release PRs + open issues.
    const [releaseSearch, issueSearch] = await Promise.all([
      this.githubSearch.fetchAllSearchItems(
        `org:${org} is:pr is:open in:title Cleanup release`,
        token,
      ),
      this.githubSearch.fetchAllSearchItems(`org:${org} is:issue is:open`, token),
    ]);

    const releaseItems = releaseSearch.items.filter((it) => RELEASE_PR_RE.test(it.title));
    const matched = issueSearch.items.filter(
      (it) =>
        MODERNIZATION_ISSUE_RE.test(it.title) ||
        (it.labels ?? []).some((l) => MODERNIZATION_ISSUE_RE.test(l.name)),
    );

    // Group matched issues by repo, and collect every repo we must inspect
    // (repos with a release PR but no matched issue still belong in the set).
    const issuesByRepo = new Map<string, { owner: string; repo: string; issues: GitHubIssueSearchItem[] }>();
    const reposOfInterest = new Map<string, { owner: string; repo: string }>();
    for (const it of matched) {
      const { owner, repo } = this.parseRepoUrl(it.repository_url);
      if (!owner || !repo) continue;
      const key = `${owner}/${repo}`;
      const entry = issuesByRepo.get(key) ?? { owner, repo, issues: [] };
      entry.issues.push(it);
      issuesByRepo.set(key, entry);
      reposOfInterest.set(key, { owner, repo });
    }
    for (const it of releaseItems) {
      const { owner, repo } = this.parseRepoUrl(it.repository_url);
      if (owner && repo) reposOfInterest.set(`${owner}/${repo}`, { owner, repo });
    }

    // Resolve each repo's PRs once (list + shared CI), in bounded batches.
    const enriched = new Map<string, RepoPrInfo>();
    const repos = [...reposOfInterest.values()];
    const BATCH = 8;
    for (let i = 0; i < repos.length; i += BATCH) {
      const batch = repos.slice(i, i + BATCH);
      const infos = await Promise.all(
        batch.map((r) =>
          this.resolveRepoPrs(
            r.owner,
            r.repo,
            issuesByRepo.get(`${r.owner}/${r.repo}`)?.issues ?? [],
            token,
          ),
        ),
      );
      for (const info of infos) enriched.set(`${info.owner}/${info.repo}`, info);
    }

    const query = encodeURIComponent(`is:issue is:open ${MODERNIZATION_TERMS.join(' OR ')}`);
    this.modules.update((mods) =>
      mods.map((m) => {
        const info = enriched.get(`${m.owner}/${m.repo}`);
        if (!info) return m;
        const next: ModuleStatus = { ...m, releasePr: info.releasePr };
        const issuesEntry = issuesByRepo.get(`${m.owner}/${m.repo}`);
        if (issuesEntry && issuesEntry.issues.length > 0) {
          const items = issuesEntry.issues.slice(0, 8).map((i) => ({
            number: i.number,
            title: i.title,
            closingPr: info.closingByIssue.get(i.number),
          }));
          next.issues = {
            count: issuesEntry.issues.length,
            coveredCount: issuesEntry.issues.filter((i) => info.closingByIssue.has(i.number)).length,
            url: `https://github.com/${m.owner}/${m.repo}/issues?q=${query}`,
            items,
            closingPrs: info.closingPrs,
          };
        }
        return next;
      }),
    );
  }

  /**
   * One repo's open-PR facts: the release PR (if any) and the distinct PRs that
   * will close matched issues — each with a CI status fetched exactly once.
   */
  private async resolveRepoPrs(
    owner: string,
    repo: string,
    issues: GitHubIssueSearchItem[],
    token: string,
  ): Promise<RepoPrInfo> {
    const info: RepoPrInfo = { owner, repo, releasePr: null, closingByIssue: new Map(), closingPrs: [] };

    let prs: GitHubPullListItem[];
    try {
      prs = await this.getJson<GitHubPullListItem[]>(
        `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=100`,
        token,
      );
    } catch {
      return info; // on failure: no release PR, issues show as uncovered
    }

    // Which matched issue does each open PR close (first PR wins per issue)?
    const issueNums = new Set(issues.map((i) => i.number));
    const closingPrByIssue = new Map<number, GitHubPullListItem>();
    for (const pr of prs) {
      const refs = parseClosingIssueRefs(`${pr.title}\n${pr.body ?? ''}`, owner, repo);
      for (const num of refs) {
        if (issueNums.has(num) && !closingPrByIssue.has(num)) closingPrByIssue.set(num, pr);
      }
    }

    const releasePrItem = prs.find((pr) => RELEASE_PR_RE.test(pr.title)) ?? null;

    // Group closing PRs by number, accumulating the issues each will close.
    const closingGroups = new Map<number, { pr: GitHubPullListItem; closes: number[] }>();
    for (const [issueNum, pr] of closingPrByIssue) {
      const g = closingGroups.get(pr.number) ?? { pr, closes: [] };
      g.closes.push(issueNum);
      closingGroups.set(pr.number, g);
    }

    // Resolve CI once per distinct PR we surface (release PR + closing PRs).
    const distinct = new Map<number, GitHubPullListItem>();
    if (releasePrItem) distinct.set(releasePrItem.number, releasePrItem);
    for (const g of closingGroups.values()) distinct.set(g.pr.number, g.pr);

    const ci = new Map<number, CiStatus>();
    await Promise.all(
      [...distinct.values()].map(async (pr) => {
        ci.set(pr.number, await this.ciStatusForSha(owner, repo, pr.head.sha, token));
      }),
    );

    if (releasePrItem) {
      info.releasePr = {
        number: releasePrItem.number,
        title: releasePrItem.title,
        html_url: releasePrItem.html_url,
        isDraft: releasePrItem.draft,
        ciStatus: ci.get(releasePrItem.number) ?? 'unknown',
      };
    }
    info.closingByIssue = new Map(
      [...closingPrByIssue].map(([num, pr]) => [num, { number: pr.number, url: pr.html_url }]),
    );
    info.closingPrs = [...closingGroups.values()].map((g) => ({
      number: g.pr.number,
      url: g.pr.html_url,
      title: g.pr.title,
      ciStatus: ci.get(g.pr.number) ?? 'unknown',
      isDraft: g.pr.draft,
      closes: g.closes,
    }));
    return info;
  }

  /** Split a search item's repository_url into its owner/repo segments. */
  private parseRepoUrl(url: string): { owner: string | null; repo: string | null } {
    const parts = url.split('/');
    const repo = parts.pop() ?? null;
    const owner = parts.pop() ?? null;
    return { owner, repo };
  }

  /** Read-only CI roll-up for a commit's check runs. */
  private async ciStatusForSha(owner: string, repo: string, sha: string, token: string): Promise<CiStatus> {
    try {
      const checks = await this.getJson<GitHubCheckRunsResponse>(
        `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/check-runs`,
        token,
      );
      return this.aggregateCheckRuns(checks);
    } catch {
      return 'unknown';
    }
  }

  private aggregateCheckRuns(checks: GitHubCheckRunsResponse): CiStatus {
    const runs = checks?.check_runs ?? [];
    if (runs.length === 0) return 'unknown';
    if (runs.some((c) => c.conclusion === 'failure' || c.conclusion === 'timed_out')) return 'failure';
    if (runs.some((c) => c.status === 'in_progress' || c.status === 'queued')) return 'pending';
    if (runs.every((c) => ['success', 'skipped', 'neutral'].includes(c.conclusion ?? ''))) return 'success';
    return 'unknown';
  }

  /** READ-ONLY GET helper. */
  private async getJson<T>(url: string, token: string): Promise<T> {
    const res = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json', Authorization: `token ${token}` },
    });
    if (!res.ok) throw new Error(`GET failed: ${res.status}`);
    return (await res.json()) as T;
  }
}
