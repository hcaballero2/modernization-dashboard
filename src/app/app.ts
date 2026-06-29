import { ChangeDetectionStrategy, Component, signal, computed, inject, effect } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { SearchFormComponent } from './components/search-form/search-form.component';
import { ModuleMatrixComponent } from './components/module-matrix/module-matrix.component';
import { getSourceRepositoryUrl } from './config/source-repository-url';
import { SessionStorageService, SESSION_KEYS } from './services/session-storage.service';
import { ModuleListService } from './services/module-list.service';
import { ChecklistService } from './services/checklist.service';
import { GitHubSearchService } from './services/github-search.service';
import { emptyCells, ModuleStatus } from './models/module-status.model';
import {
  CiStatus,
  GitHubCheckRunsResponse,
  GitHubIssueSearchItem,
  GitHubPullRequestDetails,
} from './models/pull-request.model';

const RELEASE_PR_RE = /cleanup\s+(?:for\s+)?v?\d+\.\d+\.\d+\s+release/i;

@Component({
  selector: 'app-root',
  imports: [SearchFormComponent, ModuleMatrixComponent],
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

      // Phase 3: enrich with open "Cleanup for X.0.0 release" PRs + CI status.
      await this.enrichReleasePrs(org, token);
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

  /** Find open release PRs across the org and attach them (with CI status) to modules. */
  private async enrichReleasePrs(org: string, token: string): Promise<void> {
    const { items } = await this.githubSearch.fetchAllSearchItems(
      `org:${org} is:pr is:open in:title Cleanup release`,
      token,
    );
    const releaseItems = items.filter((it) => RELEASE_PR_RE.test(it.title));

    const BATCH = 8;
    for (let i = 0; i < releaseItems.length; i += BATCH) {
      const batch = releaseItems.slice(i, i + BATCH);
      const enriched = await Promise.all(batch.map((it) => this.toReleasePr(it, token)));
      this.modules.update((mods) =>
        mods.map((m) => {
          const hit = enriched.find((e) => e?.repo === m.repo);
          return hit ? { ...m, releasePr: hit.pr } : m;
        }),
      );
    }
  }

  private async toReleasePr(item: GitHubIssueSearchItem, token: string) {
    const parts = item.repository_url.split('/');
    const repo = parts.pop();
    const owner = parts.pop();
    if (!repo || !owner) return null;

    let ciStatus: CiStatus = 'unknown';
    try {
      const pr = await this.getJson<GitHubPullRequestDetails>(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${item.number}`,
        token,
      );
      const checks = await this.getJson<GitHubCheckRunsResponse>(
        `https://api.github.com/repos/${owner}/${repo}/commits/${pr.head.sha}/check-runs`,
        token,
      );
      ciStatus = this.aggregateCheckRuns(checks);
    } catch {
      ciStatus = 'unknown';
    }

    return {
      repo,
      pr: {
        number: item.number,
        title: item.title,
        html_url: item.html_url,
        isDraft: false,
        ciStatus,
      },
    };
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
