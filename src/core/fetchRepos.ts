import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchJSON } from './githubApi.js';
import { ProjectsConfig } from '../types/config.js';
import { RepoData, GitHubApiRepo } from '../types/repo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERNAME = 'ALEVOLDON';
const CONFIG_PATH = path.join(__dirname, '../../config/projects.json');
const DATA_DIR = path.join(__dirname, '../../data');
const OUT_PATH = path.join(DATA_DIR, 'repos.json');

export async function fetchRepositories(): Promise<RepoData[]> {
  console.log('Reading config...');
  const config: ProjectsConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

  // Create a quick lookup map from config
  const repoCategories: Record<string, string> = {};
  for (const category of config.categories) {
    for (const repo of category.repos) {
      repoCategories[repo.name] = category.id;
    }
  }

  console.log('Fetching all public repositories...');
  const allRepos: GitHubApiRepo[] = [];
  let page = 1;
  while (true) {
    const reposPage = await fetchJSON<GitHubApiRepo[]>(`users/${USERNAME}/repos?per_page=100&page=${page}&type=public`);
    if (!Array.isArray(reposPage) || reposPage.length === 0) break;
    allRepos.push(...reposPage);
    if (reposPage.length < 100) break;
    page++;
  }
  console.log(`Fetched ${allRepos.length} public repositories from GitHub.`);

  // Fetch topics if missing from repo object
  for (const repo of allRepos) {
    if (repo.topics === undefined) {
      try {
        const topicsData = await fetchJSON<any>(`repos/${USERNAME}/${repo.name}/topics`);
        repo.topics = topicsData.names || topicsData || [];
      } catch {
        repo.topics = [];
      }
    }
  }

  const reposData: RepoData[] = [];

  for (const repo of allRepos) {
    const isTracked = !!repoCategories[repo.name];

    reposData.push({
      name: repo.name,
      stars: repo.stargazers_count || 0,
      updated_at: repo.pushed_at ? repo.pushed_at.substring(0, 10) : (repo.updated_at ? repo.updated_at.substring(0, 10) : ''),
      topics: Array.isArray(repo.topics) ? repo.topics : [],
      tracked: isTracked,
      category: isTracked ? repoCategories[repo.name] : null,
      fork: !!repo.fork,
      description: repo.description || '',
      language: repo.language || '',
      license: repo.license ? (repo.license.spdx_id || repo.license.key || repo.license.name || '') : '',
      forks_count: repo.forks_count || repo.forks || 0,
      open_issues_count: repo.open_issues_count || 0,
      created_at: repo.created_at ? repo.created_at.substring(0, 10) : '',
      homepage: repo.homepage || '',
      size: repo.size || 0,
      archived: !!repo.archived
    });
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  console.log(`Writing to ${OUT_PATH}...`);
  fs.writeFileSync(OUT_PATH, JSON.stringify(reposData, null, 2), 'utf8');
  console.log('Done.');
  return reposData;
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fetchRepositories().catch(err => {
    console.error('Action failed:', err);
    process.exit(1);
  });
}
