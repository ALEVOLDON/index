import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ProjectsConfig } from '../types/config.js';
import { RepoData } from '../types/repo.js';
import { InsightsData } from '../types/insights.js';
import { IntelligenceConfig } from '../types/intelligence.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.join(__dirname, '../..');
const CONFIG_PATH = path.join(ROOT, 'config', 'projects.json');
const REPOS_PATH = path.join(ROOT, 'data', 'repos.json');
const INSIGHTS_PATH = path.join(ROOT, 'data', 'insights.json');
const TECH_BADGES_PATH = path.join(ROOT, 'config', 'tech_badges.json');
const INTELLIGENCE_PATH = path.join(ROOT, 'config', 'intelligence.json');

function readJSON<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File missing: ${path.relative(ROOT, filePath)}`);
  }
  const content = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(content) as T;
  } catch (err: any) {
    console.error(`JSON Parse Error in ${path.relative(ROOT, filePath)}:`);
    console.error(err.message);
    throw new Error(`Invalid JSON in ${path.relative(ROOT, filePath)}`);
  }
}

export function validate(): void {
  console.log('Starting validation...');
  const config = readJSON<ProjectsConfig>(CONFIG_PATH);
  const repos = readJSON<RepoData[]>(REPOS_PATH);
  const insights = readJSON<InsightsData>(INSIGHTS_PATH);
  const intelligence = readJSON<IntelligenceConfig>(INTELLIGENCE_PATH);

  if (fs.existsSync(TECH_BADGES_PATH)) {
    readJSON(TECH_BADGES_PATH);
  }

  const errors: string[] = [];

  if (!intelligence.scoring_weights || !intelligence.thresholds || !intelligence.category_definitions) {
    errors.push('config/intelligence.json must contain scoring_weights, thresholds, and category_definitions.');
  } else {
    const sw = intelligence.scoring_weights;
    if (!sw.health || !sw.activity || !sw.momentum || !sw.recommendation) {
      errors.push('config/intelligence.json scoring_weights must contain health, activity, momentum, and recommendation.');
    }
  }

  if (insights.repo_metrics && Array.isArray(insights.repo_metrics)) {
    for (const metric of insights.repo_metrics.slice(0, 10)) {
      if (
        metric.health_score === undefined ||
        metric.activity_score === undefined ||
        metric.momentum_score === undefined ||
        metric.recommendation_score === undefined
      ) {
        errors.push(`insights.json metric for repo ${metric.repo} is missing v2 score fields.`);
        break;
      }
    }
  }

  const repoNames = new Set(repos.map(r => r.name));
  const configuredRepos = new Map<string, string>();

  if (!Array.isArray(config.categories)) {
    errors.push('config/projects.json must contain a categories array.');
  }

  for (const category of config.categories || []) {
    if (!category.id) {
      errors.push('Every category must have an id.');
      continue;
    }

    if (!Array.isArray(category.repos)) {
      errors.push(`Category "${category.id}" must contain a repos array.`);
      continue;
    }

    for (const repo of category.repos) {
      if (!repo.name) {
        errors.push(`Category "${category.id}" contains a repo without a name.`);
        continue;
      }

      if (!repoNames.has(repo.name)) {
        errors.push(`Configured repo "${repo.name}" in category "${category.id}" is missing from data/repos.json.`);
      }

      if (configuredRepos.has(repo.name)) {
        errors.push(`Duplicate configured repo "${repo.name}" in categories "${configuredRepos.get(repo.name)}" and "${category.id}".`);
      } else {
        configuredRepos.set(repo.name, category.id);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Validation failed with ${errors.length} errors:\n- ${errors.join('\n- ')}`);
  }

  console.log('Validation passed successfully.');
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    validate();
  } catch (err: any) {
    console.error('VALIDATION ERROR:', err.message);
    process.exit(1);
  }
}
