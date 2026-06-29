import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GitHubSearchService } from './github-search.service';

const TOKEN = 'ghp_test';
const QUERY = 'is:pr author:app/renovate org:my-org is:open';

function makeItem(id: number) {
  return { id, number: id, title: 'PR', repository_url: 'https://api.github.com/repos/org/repo', html_url: '', user: { login: 'renovate', avatar_url: '' }, created_at: '', labels: [] };
}

function searchResponse(items: object[], opts: { total_count?: number; incomplete_results?: boolean } = {}) {
  return new Response(
    JSON.stringify({ total_count: opts.total_count ?? items.length, incomplete_results: opts.incomplete_results ?? false, items }),
    { status: 200 }
  );
}

describe('GitHubSearchService', () => {
  let service: GitHubSearchService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    service = TestBed.inject(GitHubSearchService);
  });

  afterEach(() => vi.restoreAllMocks());

  it('returns items from a single page', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(searchResponse([makeItem(1), makeItem(2)]));

    const { items, incompleteResults } = await service.fetchAllSearchItems(QUERY, TOKEN);

    expect(items).toHaveLength(2);
    expect(incompleteResults).toBe(false);
  });

  it('fetches all items across multiple pages', async () => {
    const page1Items = Array.from({ length: 100 }, (_, i) => makeItem(i + 1));
    const page2Items = [makeItem(101)];

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(searchResponse(page1Items, { total_count: 101 }))
      .mockResolvedValueOnce(searchResponse(page2Items, { total_count: 101 }));

    const { items, incompleteResults } = await service.fetchAllSearchItems(QUERY, TOKEN);

    expect(items).toHaveLength(101);
    expect(incompleteResults).toBe(false);
  });

  it('sets incompleteResults when the API reports incomplete_results', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      searchResponse([makeItem(1)], { incomplete_results: true })
    );

    const { incompleteResults } = await service.fetchAllSearchItems(QUERY, TOKEN);

    expect(incompleteResults).toBe(true);
  });

  it('continues fetching when incomplete_results is true but fewer than per_page items were returned', async () => {
    // GitHub can return < 100 items with incomplete_results: true while total_count is still higher.
    // The loop should not treat a short page as end-of-results in that case.
    const shortPage = Array.from({ length: 50 }, (_, i) => makeItem(i + 1));
    const finalPage = [makeItem(51)];

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(searchResponse(shortPage, { total_count: 51, incomplete_results: true }))
      .mockResolvedValueOnce(searchResponse(finalPage, { total_count: 51, incomplete_results: true }));

    const { items, incompleteResults } = await service.fetchAllSearchItems(QUERY, TOKEN);

    expect(items).toHaveLength(51);
    expect(incompleteResults).toBe(true);
  });

  it('caps at 10 pages and sets incompleteResults when total_count exceeds 1000', async () => {
    const fullPage = Array.from({ length: 100 }, (_, i) => makeItem(i + 1));
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(searchResponse(fullPage, { total_count: 2000 }))
    );

    const { items, incompleteResults } = await service.fetchAllSearchItems(QUERY, TOKEN);

    expect(fetchSpy).toHaveBeenCalledTimes(10);
    expect(items).toHaveLength(1000);
    expect(incompleteResults).toBe(true);
  });

  it('throws with status and statusText on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 403, statusText: 'Forbidden' }));

    await expect(service.fetchAllSearchItems(QUERY, TOKEN)).rejects.toThrow('GitHub search failed: 403 Forbidden');
  });

  it('uses the JSON error message when the body contains one', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401, statusText: 'Unauthorized' })
    );

    await expect(service.fetchAllSearchItems(QUERY, TOKEN)).rejects.toThrow('Bad credentials');
  });

  it('uses space-separated query terms (not + signs) when building the URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(searchResponse([]));

    await service.fetchAllSearchItems(QUERY, TOKEN);

    const calledUrl = String(fetchSpy.mock.calls[0][0]);
    // URLSearchParams encodes spaces as +, colons as %3A
    expect(calledUrl).toContain('is%3Apr+author%3Aapp');
    // Literal + from + sign would have been encoded as %2B — confirm it's not there
    expect(calledUrl).not.toContain('%2B');
  });
});
