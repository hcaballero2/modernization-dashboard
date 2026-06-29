import { CiStatus } from './pull-request.model';

/**
 * State of a single modernization-checklist cell for a module.
 * - done:    the item is complete on the default branch
 * - todo:    the item is still outstanding
 * - partial: partially done / ambiguous (e.g. REFERENCE.md present but no CI check)
 * - na:      not applicable to this module
 * - unknown: could not be determined (file missing / parse failure)
 */
export type CellState = 'done' | 'todo' | 'partial' | 'na' | 'unknown';

export interface ChecklistCell {
  state: CellState;
  /** Short human-readable evidence shown on hover. */
  detail?: string;
}

/** The fixed per-module modernization checklist (see roadmap.md / Slack 2026-06-29). */
export const CHECKLIST_ITEMS = [
  { key: 'pdk', label: 'Drop pdk', help: 'pdk gem removed from Gemfile (pupmod:build replaces pdk build)' },
  { key: 'specHelper', label: 'voxpupuli-test', help: 'puppetlabs_spec_helper swapped for voxpupuli-test' },
  { key: 'pins', label: 'Harness pins', help: 'simp-rake-helpers ~> 6.0 and simp-beaker-helpers ~> 3.0' },
  { key: 'openvox', label: 'OpenVox', help: 'openvox declared in metadata.json requirements' },
  { key: 'referenceCi', label: 'REFERENCE CI', help: 'REFERENCE.md present + freshness check in CI' },
  { key: 'el7', label: 'EL7 dropped', help: 'no EL7 in metadata.json operatingsystem_support' },
  { key: 'tcpwrappers', label: 'tcpwrappers', help: 'no tcpwrappers manifests/references remain' },
  { key: 'refactor', label: 'Blast-radius', help: 'non-destructive include (simp:defaults profile)' },
] as const;

export type ChecklistKey = (typeof CHECKLIST_ITEMS)[number]['key'];

export interface ReleasePr {
  number: number;
  title: string;
  html_url: string;
  isDraft: boolean;
  ciStatus: CiStatus;
}

export interface ModuleStatus {
  /** Short name, e.g. 'ssh'. */
  name: string;
  /** Full repo name, e.g. 'pupmod-simp-ssh'. */
  repo: string;
  /** GitHub owner, e.g. 'simp'. */
  owner: string;
  /** Per-checklist-item state. */
  cells: Record<ChecklistKey, ChecklistCell>;
  /** Open "Cleanup for X.0.0 release" PR, if any (populated in Phase 3). */
  releasePr?: ReleasePr | null;
  /** Per-module load state for incremental rendering. */
  loading: boolean;
  /** Fetch/parse error for this module, if any. */
  error?: string;
}

export function emptyCells(state: CellState = 'unknown'): Record<ChecklistKey, ChecklistCell> {
  return CHECKLIST_ITEMS.reduce(
    (acc, item) => {
      acc[item.key] = { state };
      return acc;
    },
    {} as Record<ChecklistKey, ChecklistCell>,
  );
}
