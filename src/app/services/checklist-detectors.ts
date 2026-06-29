import { ChecklistCell } from '../models/module-status.model';

/**
 * Pure functions that derive each modernization-checklist cell from ground truth
 * (a module's Gemfile, metadata.json, file tree, and workflow files).
 *
 * Kept free of Angular/HTTP so they can be unit-tested against fixtures.
 */

export interface ModuleSource {
  gemfile: string | null;
  metadata: string | null;
  /** All file paths in the repo tree (recursive), e.g. 'manifests/server/tcpwrappers.pp'. */
  paths: string[];
  /** Concatenated contents of .github/workflows/*.yml (best-effort). */
  workflows: string | null;
  /** Contents of .fixtures.yml (for leftover module references). */
  fixtures: string | null;
  /** Concatenated contents of SIMP/compliance_profiles/* (for simp:defaults detection). */
  complianceData: string | null;
}

/**
 * Modules with destructive zero-parameter defaults that the "reduce blast radius"
 * refactor targets (roadmap.md §15). For any module NOT in this set, the
 * blast-radius cell is "n/a" rather than an unhelpful "unknown".
 */
export const BLAST_RADIUS_MODULES = new Set<string>([
  'pam', 'ssh', 'sudo', 'iptables', 'simp_firewalld', 'auditd', 'stunnel', 'rsyslog', 'cron',
  'libreswan', 'aide',
]);

interface ParsedMetadata {
  requirements?: { name?: string }[];
  operatingsystem_support?: { operatingsystem?: string; operatingsystemrelease?: string[] }[];
  dependencies?: { name?: string }[];
}

function safeParse(json: string | null): ParsedMetadata | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as ParsedMetadata;
  } catch {
    return null;
  }
}

/** 1-based line number of the first line matching `re`, or undefined. */
function lineOf(text: string | null, re: RegExp): number | undefined {
  if (text == null) return undefined;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return i + 1;
  }
  return undefined;
}

/** pdk dropped: no `gem 'pdk'` entry remains in the Gemfile. */
export function detectPdk(gemfile: string | null): ChecklistCell {
  if (gemfile == null) return { state: 'unknown', detail: 'No Gemfile found' };
  const hasPdk = /gem\s*\(?\s*['"]pdk['"]/.test(gemfile);
  return hasPdk
    ? { state: 'todo', detail: "Gemfile still declares gem 'pdk'" }
    : { state: 'done', detail: 'No pdk gem in Gemfile' };
}

/** spec helper swapped: voxpupuli-test present and puppetlabs_spec_helper gone. */
export function detectSpecHelper(gemfile: string | null): ChecklistCell {
  if (gemfile == null) return { state: 'unknown', detail: 'No Gemfile found' };
  const hasVox = /voxpupuli-test/.test(gemfile);
  const hasPlabs = /puppetlabs_spec_helper/.test(gemfile);
  if (hasVox && !hasPlabs) return { state: 'done', detail: 'Uses voxpupuli-test' };
  if (hasVox && hasPlabs) {
    return {
      state: 'partial',
      detail: 'Both present — remove puppetlabs_spec_helper',
      path: 'Gemfile',
      line: lineOf(gemfile, /puppetlabs_spec_helper/),
    };
  }
  if (hasPlabs) {
    return {
      state: 'todo',
      detail: 'Still uses puppetlabs_spec_helper',
      path: 'Gemfile',
      line: lineOf(gemfile, /puppetlabs_spec_helper/),
    };
  }
  return { state: 'unknown', detail: 'Neither spec helper found in Gemfile' };
}

/**
 * Harness pins bumped: simp-rake-helpers >= 6 and simp-beaker-helpers >= 3.
 * Best-effort regex against the Gemfile; marks unknown when not parseable.
 */
export function detectPins(gemfile: string | null): ChecklistCell {
  if (gemfile == null) return { state: 'unknown', detail: 'No Gemfile found' };
  const rake = majorFloor(gemfile, 'simp-rake-helpers');
  const beaker = majorFloor(gemfile, 'simp-beaker-helpers');
  if (rake == null && beaker == null) {
    return { state: 'unknown', detail: 'No simp-rake/beaker-helpers pin found in Gemfile' };
  }
  const rakeOk = rake != null && rake >= 6;
  const beakerOk = beaker != null && beaker >= 3;
  const detail = `rake-helpers ${rake ?? '?'}, beaker-helpers ${beaker ?? '?'}`;
  if (rakeOk && beakerOk) return { state: 'done', detail };
  // Point at the pin that still needs bumping.
  const offending = !rakeOk ? 'simp-rake-helpers' : 'simp-beaker-helpers';
  const line = lineOf(gemfile, new RegExp(offending.replace(/-/g, '\\-')));
  if (rakeOk || beakerOk) {
    return { state: 'partial', detail: `${detail} — bump ${offending}`, path: 'Gemfile', line };
  }
  return { state: 'todo', detail, path: 'Gemfile', line };
}

/** Pull the highest version number associated with a gem name in the Gemfile. */
function majorFloor(gemfile: string, gem: string): number | null {
  // Find the line(s) mentioning the gem, then the largest "<major>." token near it.
  const re = new RegExp(`['"]${gem.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}['"][^\\n]*`, 'g');
  let best: number | null = null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(gemfile)) !== null) {
    const versions = m[0].match(/\d+(?=\.\d+)/g);
    if (versions) {
      for (const v of versions) {
        const n = Number(v);
        if (best == null || n > best) best = n;
      }
    }
  }
  return best;
}

/** openvox declared in metadata.json requirements. */
export function detectOpenvox(metadata: string | null): ChecklistCell {
  const meta = safeParse(metadata);
  if (!meta) return { state: 'unknown', detail: 'No/invalid metadata.json' };
  const names = (meta.requirements ?? []).map((r) => (r.name ?? '').toLowerCase());
  if (names.includes('openvox')) return { state: 'done', detail: 'Declares openvox' };
  if (names.includes('puppet')) return { state: 'todo', detail: 'Declares puppet only' };
  return { state: 'unknown', detail: 'No puppet/openvox requirement' };
}

/** EL7 dropped from operatingsystem_support. */
export function detectEl7(metadata: string | null): ChecklistCell {
  const meta = safeParse(metadata);
  if (!meta) return { state: 'unknown', detail: 'No/invalid metadata.json' };
  const oss = meta.operatingsystem_support ?? [];
  if (oss.length === 0) return { state: 'unknown', detail: 'No operatingsystem_support' };
  const el7 = oss.filter((o) => (o.operatingsystemrelease ?? []).some((r) => r === '7'));
  if (el7.length > 0) {
    const names = el7.map((o) => o.operatingsystem).filter(Boolean).join(', ');
    return { state: 'todo', detail: `Still declares EL7: ${names}` };
  }
  return { state: 'done', detail: 'No EL7 in metadata' };
}

/**
 * tcpwrappers references gone: no tcpwrappers manifest, no metadata dependency,
 * and no leftover reference in .fixtures.yml (the last is what cleanup PRs strip).
 */
export function detectTcpwrappers(
  paths: string[],
  metadata: string | null,
  fixtures: string | null,
): ChecklistCell {
  const manifestHit = paths.find((p) => /^manifests\/.*tcpwrappers.*\.pp$/i.test(p));
  const meta = safeParse(metadata);
  const depHit = (meta?.dependencies ?? []).some((d) => /tcpwrappers/i.test(d.name ?? ''));
  const fixtureHit = fixtures != null && /tcpwrappers/i.test(fixtures);
  if (manifestHit) return { state: 'todo', detail: `tcpwrappers manifest: ${manifestHit}` };
  if (depHit) return { state: 'todo', detail: 'tcpwrappers in metadata dependencies' };
  if (fixtureHit) return { state: 'todo', detail: 'tcpwrappers in .fixtures.yml' };
  return { state: 'done', detail: 'No tcpwrappers references' };
}

/** REFERENCE.md present and a CI job regenerates/verifies it. */
export function detectReferenceCi(paths: string[], workflows: string | null): ChecklistCell {
  const hasReference = paths.includes('REFERENCE.md');
  const ciChecks = workflows != null && /strings:generate:reference|REFERENCE\.md/.test(workflows);
  if (hasReference && ciChecks) return { state: 'done', detail: 'REFERENCE.md + CI freshness check' };
  if (hasReference) {
    // The change needed is adding a freshness check to the CI workflow.
    const workflowPath =
      paths.find((p) => /^\.github\/workflows\/.*pr_tests.*\.ya?ml$/i.test(p)) ??
      paths.find((p) => /^\.github\/workflows\/.+\.ya?ml$/i.test(p));
    return {
      state: 'partial',
      detail: 'REFERENCE.md present — add a CI freshness check',
      path: workflowPath ?? 'REFERENCE.md',
    };
  }
  return { state: 'todo', detail: 'No REFERENCE.md' };
}

/**
 * Blast-radius refactor: bare `include` is non-destructive, with hardened
 * behavior restored via a `simp:defaults` compliance_engine profile.
 * - done: a compliance-profile file actually defines a simp:defaults profile
 * - todo: a known high-blast-radius module that hasn't shipped it yet
 * - na:   the refactor doesn't apply to this module
 */
export function detectRefactor(
  moduleName: string,
  complianceData: string | null,
): ChecklistCell {
  if (complianceData != null && /simp[:_]defaults/i.test(complianceData)) {
    return { state: 'done', detail: 'Ships a simp:defaults profile' };
  }
  if (BLAST_RADIUS_MODULES.has(moduleName)) {
    return { state: 'todo', detail: 'Destructive defaults; no simp:defaults profile yet' };
  }
  return { state: 'na', detail: 'Blast-radius refactor not applicable' };
}

/** Compute all cells for a module from its source. */
export function deriveCells(src: ModuleSource, moduleName: string) {
  return {
    pdk: detectPdk(src.gemfile),
    specHelper: detectSpecHelper(src.gemfile),
    pins: detectPins(src.gemfile),
    openvox: detectOpenvox(src.metadata),
    referenceCi: detectReferenceCi(src.paths, src.workflows),
    el7: detectEl7(src.metadata),
    tcpwrappers: detectTcpwrappers(src.paths, src.metadata, src.fixtures),
    refactor: detectRefactor(moduleName, src.complianceData),
  };
}
