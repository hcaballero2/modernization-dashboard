import { describe, expect, it } from 'vitest';
import {
  detectEl7,
  detectOpenvox,
  detectPdk,
  detectPins,
  detectReferenceCi,
  detectRefactor,
  detectSpecHelper,
  detectTcpwrappers,
} from './checklist-detectors';

describe('detectPdk', () => {
  it('flags todo when pdk gem is present', () => {
    expect(detectPdk("gem 'pdk', '>= 2.0'").state).toBe('todo');
    expect(detectPdk('gem("pdk", ["< 4.0"])').state).toBe('todo');
  });
  it('is done when no pdk gem', () => {
    expect(detectPdk("gem 'puppet'").state).toBe('done');
  });
  it('is unknown without a Gemfile', () => {
    expect(detectPdk(null).state).toBe('unknown');
  });
});

describe('detectSpecHelper', () => {
  it('done when voxpupuli-test replaces puppetlabs_spec_helper', () => {
    expect(detectSpecHelper("gem 'voxpupuli-test'").state).toBe('done');
  });
  it('todo when still on puppetlabs_spec_helper', () => {
    expect(detectSpecHelper("gem 'puppetlabs_spec_helper', '~> 8.0'").state).toBe('todo');
  });
  it('partial when both present, linking the puppetlabs_spec_helper line', () => {
    const cell = detectSpecHelper("gem 'voxpupuli-test'\ngem 'puppetlabs_spec_helper'");
    expect(cell.state).toBe('partial');
    expect(cell.path).toBe('Gemfile');
    expect(cell.line).toBe(2);
    expect(cell.detail).toMatch(/remove .*puppetlabs_spec_helper/i);
  });
});

describe('detectPins', () => {
  it('done when rake>=6 and beaker>=3', () => {
    const gemfile = "gem 'simp-rake-helpers', '~> 6.0'\ngem 'simp-beaker-helpers', '~> 3.0'";
    expect(detectPins(gemfile).state).toBe('done');
  });
  it('todo when both below floor', () => {
    const gemfile = "gem 'simp-rake-helpers', '~> 5.24'\ngem 'simp-beaker-helpers', '~> 2.0'";
    expect(detectPins(gemfile).state).toBe('todo');
  });
  it('partial when only one bumped, linking the offending pin line', () => {
    const gemfile = "gem 'simp-rake-helpers', '~> 6.0'\ngem 'simp-beaker-helpers', '~> 2.0'";
    const cell = detectPins(gemfile);
    expect(cell.state).toBe('partial');
    expect(cell.path).toBe('Gemfile');
    expect(cell.line).toBe(2);
    // Names the lagging pin and its target floor, not just the current value.
    expect(cell.detail).toContain('simp-beaker-helpers');
    expect(cell.detail).toContain('~> 3.0');
  });
  it('unknown when pins absent', () => {
    expect(detectPins("gem 'puppet'").state).toBe('unknown');
  });
});

describe('detectOpenvox', () => {
  it('done when openvox is a requirement', () => {
    const meta = JSON.stringify({ requirements: [{ name: 'openvox' }] });
    expect(detectOpenvox(meta).state).toBe('done');
  });
  it('todo when only puppet is required', () => {
    const meta = JSON.stringify({ requirements: [{ name: 'puppet', version_requirement: '>= 7' }] });
    expect(detectOpenvox(meta).state).toBe('todo');
  });
  it('unknown on invalid metadata', () => {
    expect(detectOpenvox('not json').state).toBe('unknown');
  });
});

describe('detectEl7', () => {
  it('todo when EL7 still declared', () => {
    const meta = JSON.stringify({
      operatingsystem_support: [{ operatingsystem: 'CentOS', operatingsystemrelease: ['7', '8'] }],
    });
    expect(detectEl7(meta).state).toBe('todo');
  });
  it('done when EL7 removed', () => {
    const meta = JSON.stringify({
      operatingsystem_support: [{ operatingsystem: 'RedHat', operatingsystemrelease: ['8', '9', '10'] }],
    });
    expect(detectEl7(meta).state).toBe('done');
  });
});

describe('detectTcpwrappers', () => {
  it('todo when a tcpwrappers manifest exists', () => {
    const paths = ['manifests/init.pp', 'manifests/server/tcpwrappers.pp'];
    expect(detectTcpwrappers(paths, null, null).state).toBe('todo');
  });
  it('todo when tcpwrappers is a metadata dependency', () => {
    const meta = JSON.stringify({ dependencies: [{ name: 'simp/tcpwrappers' }] });
    expect(detectTcpwrappers(['manifests/init.pp'], meta, null).state).toBe('todo');
  });
  it('todo when .fixtures.yml still references tcpwrappers', () => {
    const fixtures = 'fixtures:\n  repositories:\n    tcpwrappers: https://github.com/simp/pupmod-simp-tcpwrappers.git';
    expect(detectTcpwrappers(['manifests/init.pp'], '{}', fixtures).state).toBe('todo');
  });
  it('done when no references anywhere', () => {
    expect(detectTcpwrappers(['manifests/init.pp'], '{}', 'fixtures: {}').state).toBe('done');
  });
});

describe('detectRefactor', () => {
  it('done when a compliance profile defines simp:defaults', () => {
    const data = 'version: 2.0.0\nprofiles:\n  simp:defaults:\n    controls:\n      foo: true';
    expect(detectRefactor('iptables', data).state).toBe('done');
  });
  it('todo for a known high-blast-radius module without the profile', () => {
    expect(detectRefactor('pam', null).state).toBe('todo');
  });
  it('na for a module the refactor does not apply to', () => {
    expect(detectRefactor('simplib', null).state).toBe('na');
  });
});

describe('detectReferenceCi', () => {
  it('done when REFERENCE.md and a CI freshness check exist', () => {
    const paths = ['REFERENCE.md', '.github/workflows/pr_tests.yml'];
    const wf = 'jobs:\n  ref:\n    run: bundle exec rake strings:generate:reference';
    expect(detectReferenceCi(paths, wf).state).toBe('done');
  });
  it('partial when REFERENCE.md exists but no CI check', () => {
    expect(detectReferenceCi(['REFERENCE.md'], 'jobs: {}').state).toBe('partial');
  });
  it('todo when REFERENCE.md missing', () => {
    expect(detectReferenceCi(['manifests/init.pp'], null).state).toBe('todo');
  });
});
