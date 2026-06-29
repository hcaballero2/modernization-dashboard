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
  /** Repo-relative path of the file that needs the change (linked for partial cells). */
  path?: string;
  /** 1-based line number within `path` of the line that still needs changing, if known. */
  line?: number;
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

export interface ModuleIssueItem {
  number: number;
  title: string;
  /** Open PR that will auto-close this issue (via a closing keyword), if any. */
  closingPr?: { number: number; url: string };
}

/** A distinct open PR that will close one or more matched modernization issues. */
export interface ClosingPr {
  number: number;
  url: string;
  title: string;
  /** CI state, resolved from the same check-runs lookup the matrix/queue share. */
  ciStatus: CiStatus;
  isDraft: boolean;
  /** Matched issue numbers this PR will auto-close. */
  closes: number[];
}

export interface ModuleIssues {
  /** Number of open modernization-related issues in the module's repo. */
  count: number;
  /** How many of those issues already have an open PR that will close them. */
  coveredCount: number;
  /** GitHub issues search URL (repo-scoped, modernization filter). */
  url: string;
  /** First few matched issues (with any closing PR), for the hover tooltip. */
  items: ModuleIssueItem[];
  /** All distinct open PRs that will close matched issues (not capped to `items`). */
  closingPrs: ClosingPr[];
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
  /** Open modernization-related issues for the module's repo. */
  issues?: ModuleIssues | null;
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
