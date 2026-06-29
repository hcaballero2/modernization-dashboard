import { inject, Injectable } from '@angular/core';
import { GitHubApiService } from './github-api.service';

export interface ActiveModule {
  /** Full repo name, e.g. 'pupmod-simp-ssh'. */
  repo: string;
  /** Short name, e.g. 'ssh'. */
  name: string;
}

/** Repo names to skip even though they match the pupmod-simp- prefix. */
const ALWAYS_SKIP = new Set<string>([]);

/**
 * Fallback active-module set (pupmod-simp-*), used if simp-core's
 * Puppetfile.branches can't be fetched. Derived from Puppetfile.branches
 * on 2026-06-29; the live fetch keeps this current.
 */
export const FALLBACK_MODULES: string[] = [
  'acpid', 'aide', 'at', 'auditd', 'autofs', 'clamav', 'compliance_markup', 'cron',
  'crypto_policy', 'dconf', 'deferred_resources', 'dhcp', 'ds389', 'fips', 'freeradius',
  'gdm', 'gnome', 'haveged', 'ima', 'iptables', 'issue', 'krb5', 'libreswan', 'libvirt',
  'logrotate', 'mate', 'mozilla', 'named', 'nfs', 'ntpd', 'oath', 'oddjob', 'openscap',
  'pam', 'pki', 'polkit', 'postfix', 'pupmod', 'resolv', 'rsync', 'rsyslog', 'selinux',
  'simp', 'simp_apache', 'simp_banners', 'simp_ds389', 'simp_firewalld', 'simp_gitlab',
  'simp_grub', 'simpkv', 'simplib', 'simp_nfs', 'simp_options', 'simp_rsyslog',
  'simp_snmpd', 'ssh', 'sssd', 'stunnel', 'sudo', 'svckill', 'swap', 'tftpboot', 'tlog',
  'tpm2', 'tuned', 'useradd', 'vnc', 'vsftpd', 'x2go',
].map((n) => `pupmod-simp-${n}`);

@Injectable({ providedIn: 'root' })
export class ModuleListService {
  private api = inject(GitHubApiService);

  /**
   * Live active-module set: parse simp-core/Puppetfile.branches for
   * github.com/<owner>/pupmod-simp-* repos. Falls back to FALLBACK_MODULES.
   */
  async fetchActiveModules(owner: string, token: string): Promise<ActiveModule[]> {
    let repos: string[];
    try {
      const puppetfile = await this.api.getRawFile(owner, 'simp-core', 'Puppetfile.branches', token);
      repos = puppetfile ? this.parsePuppetfile(puppetfile, owner) : FALLBACK_MODULES;
      if (repos.length === 0) repos = FALLBACK_MODULES;
    } catch {
      repos = FALLBACK_MODULES;
    }
    return repos
      .filter((r) => !ALWAYS_SKIP.has(r))
      .sort()
      .map((repo) => ({ repo, name: repo.replace(/^pupmod-simp-/, '') }));
  }

  /** Extract distinct pupmod-simp-* repo names owned by `owner`. */
  parsePuppetfile(puppetfile: string, owner: string): string[] {
    const re = new RegExp(`github\\.com/${owner}/(pupmod-simp-[A-Za-z0-9_]+)`, 'g');
    const found = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(puppetfile)) !== null) {
      found.add(m[1]);
    }
    return Array.from(found);
  }
}
