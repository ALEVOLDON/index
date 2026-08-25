import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchJSON, fetchAllPages } from './githubApi.js';
import { RepoData, GitHubIssue } from '../types/repo.js';
import { ProjectsConfig } from '../types/config.js';
import { InsightsData, RepoMetric } from '../types/insights.js';
import { IntelligenceConfig } from '../types/intelligence.js';
import { categorizeRepo } from './categorize.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERNAME = 'ALEVOLDON';
const REPOS_PATH = path.join(__dirname, '../../data/repos.json');
const INSIGHTS_PATH = path.join(__dirname, '../../data/insights.json');
const CONFIG_PATH = path.join(__dirname, '../../config/projects.json');
const INTELLIGENCE_PATH = path.join(__dirname, '../../config/intelligence.json');

async function closeIssue(issueNumber: number): Promise<any> {
  return fetchJSON(`repos/${USERNAME}/index/issues/${issueNumber}`, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'closed' })
  });
}

export async function runAutoDiscovery(): Promise<void> {
  if (!fs.existsSync(REPOS_PATH) || !fs.existsSync(INSIGHTS_PATH)) {
    console.error('Missing data/repos.json or data/insights.json');
    return;
  }

  const reposData: RepoData[] = JSON.parse(fs.readFileSync(REPOS_PATH, 'utf8'));
  const insightsData: InsightsData = JSON.parse(fs.readFileSync(INSIGHTS_PATH, 'utf8'));
  const config: ProjectsConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

  let intelCfg: IntelligenceConfig = {
    version: '2.0',
    scoring_weights: {} as any,
    thresholds: { auto_discovery_health: 0.45, auto_discovery_momentum: 0.50 },
    category_definitions: {}
  };

  if (fs.existsSync(INTELLIGENCE_PATH)) {
    try {
      intelCfg = JSON.parse(fs.readFileSync(INTELLIGENCE_PATH, 'utf8'));
    } catch {}
  }

  const thresholds = intelCfg.thresholds || { auto_discovery_health: 0.45, auto_discovery_momentum: 0.50 };

  const metricsMap: Record<string, RepoMetric> = {};
  for (const m of insightsData.repo_metrics || []) {
    metricsMap[m.repo] = m;
  }

  let existingIssues: GitHubIssue[] = [];
  try {
    if (process.env.GITHUB_ACTIONS && process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim() !== '') {
      existingIssues = await fetchAllPages<GitHubIssue>(
        `repos/${USERNAME}/index/issues?state=open&creator=app%2Fgithub-actions`
      );
      console.log(`Loaded ${existingIssues.length} existing open issues.`);
    }
  } catch (err: any) {
    console.log('Failed to fetch existing issues: ', err.message);
  }

  let configModified = false;
  let reposModified = false;

  for (const repo of reposData) {
    const title = `Auto-Discovery: Add ${repo.name} to README`;
    const existingIssue = existingIssues.find(iss => iss.title === title);

    if (repo.tracked) {
      if (existingIssue) {
        console.log(`Closing auto-discovery issue for ${repo.name} since it is now tracked.`);
        await closeIssue(existingIssue.number).catch(err => console.error(`Failed to close issue: ${err.message}`));
      }
      continue;
    }

    if (repo.fork || repo.archived || repo.name === 'ALEVOLDON' || repo.name === 'index') {
      if (existingIssue) {
        console.log(`Closing auto-discovery issue for ${repo.name} (fork/archived/self/index).`);
        await closeIssue(existingIssue.number).catch(err => console.error(`Failed to close issue: ${err.message}`));
      }
      continue;
    }

    const metrics = metricsMap[repo.name] || ({} as Partial<RepoMetric>);

    // Logic to decide if we should add the repo
    let shouldAdd = false;
    let categoryId: string | null = null;
    let note = '';

    const healthThreshold = thresholds.auto_discovery_health ?? 0.45;
    const momentumThreshold = thresholds.auto_discovery_momentum ?? 0.50;

    if (
      (metrics.health_score !== undefined && metrics.health_score >= healthThreshold) ||
      (metrics.momentum_score !== undefined && metrics.momentum_score >= momentumThreshold) ||
      (metrics.days_inactive !== undefined && metrics.days_inactive <= 180 && repo.description)
    ) {
      const { primary } = categorizeRepo(repo, intelCfg);
      categoryId = metrics.primary_category || primary;
      shouldAdd = true;
      note = repo.topics && repo.topics.length > 0 ? 'Auto-discovered' : 'Auto-discovered (description-based)';
    }

    if (shouldAdd && categoryId) {
      const targetCategory = config.categories.find(c => c.id === categoryId);
      if (targetCategory) {
        if (!targetCategory.repos.find(r => r.name === repo.name)) {
          console.log(`Auto-adding ${repo.name} to config/projects.json under ${categoryId}...`);
          targetCategory.repos.push({
            name: repo.name,
            featured: false,
            priority: 1,
            notes: note,
            custom_description: repo.description || 'No description provided.',
            custom_badges: ''
          });
          configModified = true;
          repo.tracked = true;
          reposModified = true;
        }
      }
    }

    if (existingIssue && (repo.tracked || (metrics.days_inactive && metrics.days_inactive > 180))) {
      console.log(`Closing existing auto-discovery issue for ${repo.name}...`);
      await closeIssue(existingIssue.number).catch(err => console.error(`Failed to close issue: ${err.message}`));
    }
  }

  if (configModified) {
    console.log('Writing updated config/projects.json...');
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  }

  if (reposModified) {
    console.log('Writing updated data/repos.json...');
    fs.writeFileSync(REPOS_PATH, JSON.stringify(reposData, null, 2), 'utf8');
  }
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runAutoDiscovery().catch(err => {
    console.error('Auto-discovery failed:', err);
    process.exit(1);
  });
}
