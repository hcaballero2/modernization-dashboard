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
        // Two-tone: emerald (done) left half, amber (remaining) right half.
        return 'border-amber-500/40 text-transparent bg-[linear-gradient(90deg,rgb(16_185_129/0.35)_0_50%,rgb(245_158_11/0.30)_50%_100%)]';
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
        // The two-tone split fill is the signal; no glyph (see chipClass).
        return '';
      case 'na':
        return '–';
      default:
        return '?';
    }
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
