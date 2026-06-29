import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  CellState,
  CHECKLIST_ITEMS,
  ChecklistKey,
  ModuleStatus,
} from '../../models/module-status.model';

interface RollupEntry {
  key: ChecklistKey;
  label: string;
  help: string;
  done: number;
  total: number;
}

@Component({
  selector: 'app-module-matrix',
  imports: [],
  templateUrl: './module-matrix.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModuleMatrixComponent {
  modules = input<ModuleStatus[]>([]);
  readonly items = CHECKLIST_ITEMS;

  /** Per-checklist-item done/total across all (applicable) modules. */
  rollup = computed<RollupEntry[]>(() => {
    const mods = this.modules();
    return this.items.map((item) => {
      let done = 0;
      let total = 0;
      for (const m of mods) {
        const state = m.cells[item.key].state;
        if (state === 'na') continue;
        total++;
        if (state === 'done') done++;
      }
      return { key: item.key, label: item.label, help: item.help, done, total };
    });
  });

  /** Modules fully complete across every applicable checklist item. */
  completeCount = computed(
    () =>
      this.modules().filter((m) =>
        this.items.every((i) => {
          const s = m.cells[i.key].state;
          return s === 'done' || s === 'na';
        }),
      ).length,
  );

  cell(m: ModuleStatus, key: ChecklistKey) {
    return m.cells[key];
  }

  /** GitHub deep-link to the line/file that still needs changing, or null. */
  cellHref(m: ModuleStatus, key: ChecklistKey): string | null {
    const c = m.cells[key];
    if (!c.path) return null;
    const base = `https://github.com/${m.owner}/${m.repo}/blob/HEAD/${c.path}`;
    return c.line ? `${base}#L${c.line}` : base;
  }

  percent(done: number, total: number): number {
    return total === 0 ? 0 : Math.round((done / total) * 100);
  }

  /** Tailwind classes for a cell chip by state. */
  chipClass(state: CellState): string {
    switch (state) {
      case 'done':
        return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';
      case 'todo':
        return 'bg-rose-500/15 text-rose-500 border-rose-500/30';
      case 'partial':
        return 'bg-amber-500/15 text-amber-500 border-amber-500/30';
      case 'na':
        return 'bg-ghost text-ink-3 border-edge';
      default:
        return 'bg-ghost text-ink-3 border-edge';
    }
  }

  chipSymbol(state: CellState): string {
    switch (state) {
      case 'done':
        return '✓';
      case 'todo':
        return '✗';
      case 'partial':
        return '◐';
      case 'na':
        return '–';
      default:
        return '?';
    }
  }

  /** True when every matched issue already has an open PR that will close it. */
  allIssuesCovered(m: ModuleStatus): boolean {
    const i = m.issues;
    return !!i && i.count > 0 && i.coveredCount === i.count;
  }

  /** Neutral by default; emerald when all matched issues are already covered by PRs. */
  issuesBadgeClass(m: ModuleStatus): string {
    return this.allIssuesCovered(m)
      ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
      : 'bg-ghost text-ink-2 border-edge hover:text-ink';
  }

  /** Hover text: one line per issue, marking those a PR will close. */
  issuesTooltip(m: ModuleStatus): string {
    const i = m.issues;
    if (!i) return '';
    const lines = i.items.map((it) =>
      it.closingPr
        ? `#${it.number} ${it.title} — will close via PR #${it.closingPr.number}`
        : `#${it.number} ${it.title}`,
    );
    if (i.count > i.items.length) lines.push(`…and ${i.count - i.items.length} more`);
    return lines.join('\n');
  }

  prBadgeClass(ci: string): string {
    switch (ci) {
      case 'success':
        return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';
      case 'failure':
        return 'bg-rose-500/15 text-rose-500 border-rose-500/30';
      case 'pending':
        return 'bg-amber-500/15 text-amber-500 border-amber-500/30';
      default:
        return 'bg-ghost text-ink-2 border-edge';
    }
  }
}
