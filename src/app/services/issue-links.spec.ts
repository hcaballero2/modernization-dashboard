import { describe, expect, it } from 'vitest';
import { parseClosingIssueRefs } from './issue-links';

describe('parseClosingIssueRefs', () => {
  const owner = 'simp';
  const repo = 'pupmod-simp-ssh';

  it('matches bare closing keywords (same repo)', () => {
    expect(parseClosingIssueRefs('Closes #12', owner, repo)).toEqual([12]);
    expect(parseClosingIssueRefs('fixes #3 and resolves #4', owner, repo).sort()).toEqual([3, 4]);
    expect(parseClosingIssueRefs('Closed: #9', owner, repo)).toEqual([9]);
  });

  it('matches case-insensitively and dedupes', () => {
    expect(parseClosingIssueRefs('FIX #5\nfixes #5', owner, repo)).toEqual([5]);
  });

  it('honors owner/repo#N only when it targets this repo', () => {
    expect(parseClosingIssueRefs('Closes simp/pupmod-simp-ssh#7', owner, repo)).toEqual([7]);
    expect(parseClosingIssueRefs('Closes other/repo#7', owner, repo)).toEqual([]);
  });

  it('matches full issue URLs for this repo', () => {
    const body = 'Resolves https://github.com/simp/pupmod-simp-ssh/issues/42';
    expect(parseClosingIssueRefs(body, owner, repo)).toEqual([42]);
  });

  it('ignores plain mentions without a closing keyword', () => {
    expect(parseClosingIssueRefs('see #99 for context', owner, repo)).toEqual([]);
    expect(parseClosingIssueRefs('related to #99', owner, repo)).toEqual([]);
  });

  it('returns empty for null/empty text', () => {
    expect(parseClosingIssueRefs(null, owner, repo)).toEqual([]);
    expect(parseClosingIssueRefs('', owner, repo)).toEqual([]);
  });
});
