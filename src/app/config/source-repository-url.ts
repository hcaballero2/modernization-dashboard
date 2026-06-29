const DEFAULT_SOURCE_REPOSITORY_URL = 'https://github.com/simp/modernization-dashboard';

export function getSourceRepositoryUrl(): string {
  const envValue = import.meta.env?.NG_APP_SOURCE_REPOSITORY_URL;

  if (typeof envValue === 'string') {
    const trimmed = envValue.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return DEFAULT_SOURCE_REPOSITORY_URL;
}

export { DEFAULT_SOURCE_REPOSITORY_URL };
