const GITHUB_API_URL = 'https://api.github.com/';

export function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'User-Agent': 'Node.js README Updater',
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim() !== '') {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

export async function fetchJSON<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${GITHUB_API_URL}${endpoint}`;
  let res = await fetch(url, {
    ...options,
    headers: { ...getHeaders(), ...(options.headers as Record<string, string>) }
  });

  if (res.status === 401 && process.env.GITHUB_TOKEN) {
    console.warn(`[GitHub API] Token unauthorized for ${endpoint}, retrying without token...`);
    const fallbackHeaders: Record<string, string> = {
      'User-Agent': 'Node.js README Updater',
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    res = await fetch(url, {
      ...options,
      headers: { ...fallbackHeaders, ...(options.headers as Record<string, string>) }
    });
  }

  const remaining = res.headers.get('x-ratelimit-remaining');
  if (remaining !== null) {
    console.log(`[GitHub API] Endpoint ${endpoint} - Rate Limit Remaining: ${remaining}`);
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch ${endpoint}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchAllPages<T = any>(endpoint: string): Promise<T[]> {
  const all: T[] = [];
  let page = 1;
  const separator = endpoint.includes('?') ? '&' : '?';
  while (true) {
    const data = await fetchJSON<T[]>(`${endpoint}${separator}per_page=100&page=${page}`);
    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);
    if (data.length < 100) break;
    page++;
  }
  return all;
}
