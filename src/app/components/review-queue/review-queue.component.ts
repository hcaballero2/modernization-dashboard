import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { ModuleStatus } from '../../models/module-status.model';

interface ReadyPr {
  name: string;
  owner: string;
  repo: string;
  number: number;
  title: string;
  html_url: string;
  /** True for a "Cleanup for X.0.0 release" PR; false for an issue-closing PR. */
  isRelease: boolean;
  /** Matched issue numbers this PR will close (empty for a plain release PR). */
  closes: number[];
}

/**
 * "Ready to review" queue: open PRs whose CI is green and that aren't drafts —
 * both release PRs and PRs that will close a modernization issue, i.e. PRs a human
 * can act on now. Failing/pending/draft PRs are intentionally hidden.
 * Derived entirely from already-fetched module data; issues no additional API calls.
 */
@Component({
  selector: 'app-review-queue',
  imports: [],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ready().length > 0) {
      <div class="rounded-lg border border-edge bg-panel">
        <button
          type="button"
          (click)="toggle()"
          class="w-full flex items-center justify-between gap-3 px-5 py-3 text-left"
          [attr.aria-expanded]="expanded()"
        >
          <span class="flex items-center gap-2">
            <span class="text-sm font-semibold text-ink">Ready to review</span>
            <span class="px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-500 font-mono">
              {{ ready().length }}
            </span>
            <span class="hidden sm:inline text-xs text-ink-3">open PRs · CI passing · not draft</span>
          </span>
          <svg
            class="w-4 h-4 text-ink-3 transition-transform duration-200"
            [class.rotate-180]="expanded()"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        @if (expanded()) {
          <ul class="border-t border-edge divide-y divide-edge/60">
            @for (r of ready(); track r.owner + '/' + r.repo + '#' + r.number) {
              <li class="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-ghost/50 transition-colors">
                <a
                  [href]="'https://github.com/' + r.owner + '/' + r.repo"
                  target="_blank" rel="noopener noreferrer"
                  class="font-mono text-xs text-ink hover:text-accent transition-colors shrink-0 min-w-40"
                >{{ r.name }}</a>
                <a
                  [href]="r.html_url"
                  target="_blank" rel="noopener noreferrer"
                  class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-mono shrink-0 bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                  [title]="'PR #' + r.number + ' — CI passing: ' + r.title"
                >PR&nbsp;#{{ r.number }} · CI&nbsp;passing</a>
                @if (r.isRelease) {
                  <span class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wide bg-ghost text-ink-3 border border-edge">release</span>
                } @else {
                  <span class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono bg-ghost text-ink-3 border border-edge" [title]="'Closes issue(s): ' + closesLabel(r)">closes&nbsp;{{ closesLabel(r) }}</span>
                }
                <span class="text-ink-2 truncate">{{ r.title }}</span>
              </li>
            }
          </ul>
        }
      </div>
    }
  `,
})
export class ReviewQueueComponent {
  modules = input<ModuleStatus[]>([]);
  expanded = signal(true);

  ready = computed<ReadyPr[]>(() => {
    const out: ReadyPr[] = [];
    for (const m of this.modules()) {
      // Dedupe per module by PR number: a PR can be both a release PR and an
      // issue-closer, and one PR can close several issues.
      const byNumber = new Map<number, ReadyPr>();

      const rp = m.releasePr;
      if (rp && rp.ciStatus === 'success' && !rp.isDraft) {
        byNumber.set(rp.number, {
          name: m.name, owner: m.owner, repo: m.repo,
          number: rp.number, title: rp.title, html_url: rp.html_url,
          isRelease: true, closes: [],
        });
      }

      for (const pr of m.issues?.closingPrs ?? []) {
        if (pr.ciStatus !== 'success' || pr.isDraft) continue;
        const existing = byNumber.get(pr.number);
        if (existing) {
          existing.closes.push(...pr.closes);
        } else {
          byNumber.set(pr.number, {
            name: m.name, owner: m.owner, repo: m.repo,
            number: pr.number, title: pr.title, html_url: pr.url,
            isRelease: false, closes: [...pr.closes],
          });
        }
      }

      out.push(...byNumber.values());
    }
    return out.sort((a, b) => a.name.localeCompare(b.name) || a.number - b.number);
  });

  closesLabel(r: ReadyPr): string {
    return r.closes.map((n) => `#${n}`).join(', ');
  }

  toggle(): void {
    this.expanded.update((v) => !v);
  }
}
