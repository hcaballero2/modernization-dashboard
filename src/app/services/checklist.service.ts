import { inject, Injectable } from '@angular/core';
import { GitHubApiService } from './github-api.service';
import { deriveCells, ModuleSource } from './checklist-detectors';
import { ActiveModule } from './module-list.service';
import { emptyCells, ModuleStatus } from '../models/module-status.model';

/**
 * Computes a module's modernization-checklist status from ground truth, using
 * READ-ONLY GitHub API calls (Gemfile, metadata.json, file tree, workflows).
 */
@Injectable({ providedIn: 'root' })
export class ChecklistService {
  private api = inject(GitHubApiService);

  async deriveModule(owner: string, mod: ActiveModule, token: string): Promise<ModuleStatus> {
    const base: ModuleStatus = {
      name: mod.name,
      repo: mod.repo,
      owner,
      cells: emptyCells(),
      releasePr: null,
      loading: false,
    };

    try {
      const branch = await this.api.getDefaultBranch(owner, mod.repo, token);
      const [paths, gemfile, metadata, fixtures] = await Promise.all([
        this.api.getTreePaths(owner, mod.repo, branch, token),
        this.api.getRawFile(owner, mod.repo, 'Gemfile', token),
        this.api.getRawFile(owner, mod.repo, 'metadata.json', token),
        this.api.getRawFile(owner, mod.repo, '.fixtures.yml', token),
      ]);

      const [workflows, complianceData] = await Promise.all([
        this.fetchWorkflows(owner, mod.repo, paths, token),
        this.fetchComplianceData(owner, mod.repo, paths, token),
      ]);

      const src: ModuleSource = { gemfile, metadata, paths, workflows, fixtures, complianceData };
      return { ...base, cells: deriveCells(src, mod.name) };
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      return { ...base, error: message };
    }
  }

  /** Fetch and concatenate the workflow files (best-effort) for CI detection. */
  private async fetchWorkflows(
    owner: string,
    repo: string,
    paths: string[],
    token: string,
  ): Promise<string | null> {
    const workflowPaths = paths.filter((p) => /^\.github\/workflows\/.+\.ya?ml$/i.test(p));
    if (workflowPaths.length === 0) return null;
    // Prefer pr_tests.yml; otherwise scan up to 3 to bound API calls.
    const ordered = workflowPaths.sort((a) => (/pr_tests/i.test(a) ? -1 : 1)).slice(0, 3);
    const contents = await Promise.all(
      ordered.map((p) => this.api.getRawFile(owner, repo, p, token).catch(() => null)),
    );
    const joined = contents.filter((c): c is string => c != null).join('\n');
    return joined.length > 0 ? joined : null;
  }

  /** Fetch compliance-profile files (best-effort) for simp:defaults detection. */
  private async fetchComplianceData(
    owner: string,
    repo: string,
    paths: string[],
    token: string,
  ): Promise<string | null> {
    const dataPaths = paths.filter((p) => /^SIMP\/compliance_profiles\/.+\.(ya?ml|json)$/i.test(p));
    if (dataPaths.length === 0) return null;
    const contents = await Promise.all(
      dataPaths.slice(0, 4).map((p) => this.api.getRawFile(owner, repo, p, token).catch(() => null)),
    );
    const joined = contents.filter((c): c is string => c != null).join('\n');
    return joined.length > 0 ? joined : null;
  }
}
