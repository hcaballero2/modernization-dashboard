/**
 * Parse the issue numbers that a pull request will auto-close, from its title/body,
 * using GitHub's closing keywords (close/closes/closed, fix/fixes/fixed,
 * resolve/resolves/resolved).
 *
 * Kept pure (no Angular/HTTP) so it can be unit-tested. GET-only friendly: callers
 * read an open PR's body and pass it here — no write/GraphQL needed.
 */

const KEYWORD = '(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)';

/**
 * Issue numbers in `owner/repo` that `text` (a PR title + body) declares it closes.
 * Matches bare `#123`, `owner/repo#123`, and full `.../issues/123` URLs — only when
 * the cross-repo reference targets `owner/repo` (a bare `#123` is assumed same-repo).
 */
export function parseClosingIssueRefs(
  text: string | null,
  owner: string,
  repo: string,
): number[] {
  if (!text) return [];
  const found = new Set<number>();
  const o = owner.toLowerCase();
  const r = repo.toLowerCase();

  // keyword [: ] (owner/repo)?#123
  const hashRe = new RegExp(`\\b${KEYWORD}\\b\\s*:?\\s+(?:([\\w.-]+)\\/([\\w.-]+))?#(\\d+)`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = hashRe.exec(text)) !== null) {
    const refOwner = m[1];
    const refRepo = m[2];
    const num = Number(m[3]);
    if (refOwner && refRepo) {
      if (refOwner.toLowerCase() === o && refRepo.toLowerCase() === r) found.add(num);
    } else {
      found.add(num); // bare #N → same repo
    }
  }

  // keyword [: ] https://github.com/owner/repo/issues/123
  const urlRe = new RegExp(
    `\\b${KEYWORD}\\b\\s*:?\\s+https?:\\/\\/github\\.com\\/([\\w.-]+)\\/([\\w.-]+)\\/issues\\/(\\d+)`,
    'gi',
  );
  while ((m = urlRe.exec(text)) !== null) {
    if (m[1].toLowerCase() === o && m[2].toLowerCase() === r) found.add(Number(m[3]));
  }

  return [...found];
}
