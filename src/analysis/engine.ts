import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { RepoData } from '../types/repo.js';
import { ProjectsConfig } from '../types/config.js';
import {
  IntelligenceConfig,
  HealthWeights,
  ActivityWeights,
  MomentumWeights,
  RecommendationWeights
} from '../types/intelligence.js';
import {
  InsightsData,
  RepoMetric,
  RisingProject,
  FeaturedRecommendation,
  NeglectedRepo,
  EcosystemStats
} from '../types/insights.js';
import { categorizeRepo } from '../core/categorize.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_PATH = path.join(__dirname, '../../data/repos.json');
const OUTPUT_PATH = path.join(__dirname, '../../data/insights.json');
const CONFIG_PATH = path.join(__dirname, '../../config/projects.json');
const INTELLIGENCE_PATH = path.join(__dirname, '../../config/intelligence.json');

export const DEFAULT_INTELLIGENCE: IntelligenceConfig = {
  version: '2.0',
  scoring_weights: {
    health: {
      has_description: 0.15,
      has_topics: 0.10,
      topic_richness: 0.05,
      has_license: 0.10,
      has_stars: 0.10,
      has_forks: 0.05,
      has_language: 0.10,
      non_empty_size: 0.10,
      has_homepage: 0.05,
      recent_push_bonus: 0.20,
      archived_penalty: 0.40
    },
    activity: {
      days_7: 1.0,
      days_30: 0.85,
      days_90: 0.70,
      days_180: 0.45,
      days_365: 0.20
    },
    momentum: {
      activity_weight: 0.40,
      recency_boost: 0.30,
      revival_boost: 0.15,
      engagement_weight: 0.15
    },
    recommendation: {
      health_weight: 0.35,
      activity_weight: 0.25,
      momentum_weight: 0.25,
      stars_weight: 0.15
    }
  },
  thresholds: {
    auto_discovery_health: 0.45,
    auto_discovery_momentum: 0.50,
    rising_momentum_min: 0.55,
    rising_activity_min: 0.40,
    featured_recommendation_min: 0.65,
    neglected_days: 365
  },
  category_definitions: {
    ai: {
      topics: [
        'ai', 'machine-learning', 'openai', 'llm', 'local-llm', 'chatgpt', 'deep-learning',
        'neural-network', 'nlp', 'computer-vision', 'knowledge-management', 'pkm', 'obsidian',
        'obsidian-plugin', 'rag', 'semantic-search', 'vector-database', 'embeddings',
        'prompt-engineering', 'automation', 'telegram-bot-ai-assistant', 'chatbot',
        'community-management', 'mcp', 'agents', 'autonomous-agents', 'pydanticai',
        'langchain', 'ollama', 'claude', 'gemini'
      ],
      keywords: [
        'gpt', 'openai', 'ollama', 'llm', 'language model', 'neural', 'deep learning',
        'machine learning', 'ml', 'chatbot', 'embedding', 'embeddings', 'vector database',
        'vector search', 'semantic search', 'nlp', 'transformer', 'assistant', 'ai bot',
        'bot', 'bot assistant', 'mcp', 'agent', 'agents', 'pydanticai', 'prompt engineering',
        'claude', 'gemini'
      ],
      languages: ['python', 'jupyter notebook']
    },
    music: {
      topics: [
        'music', 'audio', 'music-technology', 'generative-music', 'experimental-music',
        'sound-design', 'ableton-live', 'vcv-rack', 'audiovisual', 'modular-synthesis',
        'synthesizer', 'midi', 'daw', 'web-audio', 'sound', 'eurorack', 'synthesizers',
        'bandcamp', 'soundcloud', 'max-msp', 'supercollider', 'dsp', 'audio-processing'
      ],
      keywords: [
        'synthesizer', 'synth', 'daw', 'melody', 'sound design', 'audio', 'music technology',
        'modular', 'vcv rack', 'ableton', 'oscillator', 'midi', 'chord', 'beat', 'drum',
        'bass', 'sound', 'web audio', 'eurorack', 'sound tracker', 'playlist', 'soundcloud',
        'bandcamp', 'dsp'
      ],
      languages: ['c++', 'max', 'supercollider', 'faust']
    },
    frontend: {
      topics: [
        'react', 'frontend', 'web', 'webdev', 'javascript', 'typescript', 'nodejs',
        'astro', 'vite', 'html5', 'css3', 'pwa', 'nextjs', 'vue', 'svelte',
        'tailwindcss', 'tailwind', 'sass', 'scss', 'web-app', 'portfolio', 'landing-page'
      ],
      keywords: [
        'react', 'frontend', 'ui', 'vite', 'astro', 'vue', 'svelte', 'angular',
        'next.js', 'nextjs', 'nuxt', 'web app', 'dashboard', 'portfolio', 'landing',
        'website', 'web', 'html5', 'css3', 'sass', 'tailwind', 'pwa'
      ],
      languages: ['typescript', 'javascript', 'html', 'css']
    },
    creative: {
      topics: [
        '3d', 'threejs', 'three.js', 'blender', 'generative-art', 'creative-coding',
        'phaser', 'gamedev', 'browsergame', 'indie-game', 'mobilegame', 'procedural',
        'geometry-nodes', 'webgl', 'canvas', 'shaders', 'glsl', 'p5js', 'animation', 'game'
      ],
      keywords: [
        'three.js', 'threejs', 'blender', 'game', 'creative', 'generative',
        'procedural', 'shader', 'shaders', 'canvas', 'webgl', 'glsl', 'music visual',
        'visualizer', 'arcade', 'scrolling', 'shooter', 'pwa game', 'creative coding',
        'generative art', 'p5.js', 'p5js'
      ],
      languages: ['glsl', 'c#', 'gdscript']
    },
    productivity: {
      topics: [
        'productivity', 'tool', 'utility', 'habit-tracker', 'organizer', 'planner',
        'cli', 'workflow', 'automation', 'dashboard', 'management', 'control-panel', 'launcher'
      ],
      keywords: [
        'habit tracker', 'habit', 'productivity', 'tool', 'tools', 'utility',
        'monitor', 'water map', 'tracking', 'organizer', 'planner', 'calendar',
        'task manager', 'cli', 'control panel', 'launcher', 'workflow'
      ],
      languages: ['shell', 'python', 'go', 'rust']
    }
  }
};

export function loadJSON<T>(filePath: string, defaultValue: T): T {
  if (!fs.existsSync(filePath)) return defaultValue;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return defaultValue;
  }
}

export function daysSince(dateStr: string | null | undefined): number {
  if (!dateStr) return 9999;
  try {
    const dt = new Date(dateStr.substring(0, 10));
    if (isNaN(dt.getTime())) return 9999;
    const diff = (new Date().getTime() - dt.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, Math.floor(diff));
  } catch {
    return 9999;
  }
}

export function analyzeTopics(repos: RepoData[]): string[] {
  const counter: Record<string, number> = {};
  for (const r of repos) {
    for (const t of r.topics || []) {
      counter[t] = (counter[t] || 0) + 1;
    }
  }
  return Object.entries(counter)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([topic]) => topic);
}

export function calculateActivityScore(daysInactive: number, weights: Partial<ActivityWeights>): number {
  if (daysInactive <= 7) return weights.days_7 ?? 1.0;
  if (daysInactive <= 30) return weights.days_30 ?? 0.85;
  if (daysInactive <= 90) return weights.days_90 ?? 0.70;
  if (daysInactive <= 180) return weights.days_180 ?? 0.45;
  if (daysInactive <= 365) return weights.days_365 ?? 0.20;
  return 0.0;
}

export function calculateHealthScore(repo: Partial<RepoData>, daysInactive: number, weights: Partial<HealthWeights>): number {
  let score = 0.0;
  if (repo.description) score += weights.has_description ?? 0.15;

  const topics = repo.topics || [];
  if (topics.length > 0) {
    score += weights.has_topics ?? 0.10;
    if (topics.length >= 3) {
      score += weights.topic_richness ?? 0.05;
    }
  }

  if (repo.license) score += weights.has_license ?? 0.10;
  if ((repo.stars ?? 0) > 0) score += weights.has_stars ?? 0.10;
  if ((repo.forks_count ?? 0) > 0) score += weights.has_forks ?? 0.05;
  if (repo.language) score += weights.has_language ?? 0.10;
  if ((repo.size ?? 0) > 0) score += weights.non_empty_size ?? 0.10;
  if (repo.homepage) score += weights.has_homepage ?? 0.05;
  if (daysInactive <= 180) score += weights.recent_push_bonus ?? 0.20;

  if (repo.archived) {
    const penalty = weights.archived_penalty ?? 0.40;
    score = Math.max(0.0, score - penalty);
  }

  return Math.max(0.0, Math.min(1.0, score));
}

export function calculateMomentumScore(
  repo: Partial<RepoData>,
  activityScore: number,
  daysInactive: number,
  weights: Partial<MomentumWeights>
): number {
  if (repo.archived) return 0.0;

  const actWeight = weights.activity_weight ?? 0.40;
  const recWeight = weights.recency_boost ?? 0.30;
  const revWeight = weights.revival_boost ?? 0.15;
  const engWeight = weights.engagement_weight ?? 0.15;

  let recencyBoost = 0.0;
  if (daysInactive <= 7) recencyBoost = 1.0;
  else if (daysInactive <= 30) recencyBoost = 0.8;
  else if (daysInactive <= 90) recencyBoost = 0.5;
  else if (daysInactive <= 180) recencyBoost = 0.2;

  // Revival Boost: created > 180 days ago but updated in last 30 days
  const createdDays = daysSince(repo.created_at);
  let revivalBoost = 0.0;
  if (createdDays > 180 && daysInactive <= 30) {
    revivalBoost = 1.0;
  } else if (createdDays > 180 && daysInactive <= 90) {
    revivalBoost = 0.5;
  } else if (createdDays <= 60 && daysInactive <= 30) {
    // Brand new active project boost
    revivalBoost = 0.8;
  }

  const stars = repo.stars ?? 0;
  const forks = repo.forks_count ?? 0;
  const engagement = Math.min(1.0, stars * 0.1 + forks * 0.2);

  const momentum =
    activityScore * actWeight +
    recencyBoost * recWeight +
    revivalBoost * revWeight +
    engagement * engWeight;

  return Math.max(0.0, Math.min(1.0, momentum));
}

export function calculateRecommendationScore(
  healthScore: number,
  activityScore: number,
  momentumScore: number,
  stars: number,
  weights: Partial<RecommendationWeights>,
  isFork = false,
  isArchived = false
): number {
  if (isFork || isArchived) return 0.0;

  const hW = weights.health_weight ?? 0.35;
  const aW = weights.activity_weight ?? 0.25;
  const mW = weights.momentum_weight ?? 0.25;
  const sW = weights.stars_weight ?? 0.15;

  const starScore = Math.min(1.0, stars / 10.0);
  const total = healthScore * hW + activityScore * aW + momentumScore * mW + starScore * sW;
  return Math.max(0.0, Math.min(1.0, total));
}

export function buildInsights(): InsightsData {
  const repos = loadJSON<RepoData[]>(DATA_PATH, []);
  const config = loadJSON<ProjectsConfig>(CONFIG_PATH, { categories: [] });
  const intelCfg = loadJSON<IntelligenceConfig>(INTELLIGENCE_PATH, DEFAULT_INTELLIGENCE);

  const weights = intelCfg.scoring_weights || DEFAULT_INTELLIGENCE.scoring_weights;
  const thresholds = intelCfg.thresholds || DEFAULT_INTELLIGENCE.thresholds;

  const repoManualCat: Record<string, string> = {};
  const repoFeatured: Record<string, boolean> = {};

  for (const cat of config.categories || []) {
    for (const r of cat.repos || []) {
      repoManualCat[r.name] = cat.id;
      if (r.featured) repoFeatured[r.name] = true;
    }
  }

  const topics = analyzeTopics(repos);
  const repoMetrics: RepoMetric[] = [];
  const risingProjects: RisingProject[] = [];
  const featuredRecommendations: FeaturedRecommendation[] = [];
  const neglectedRepos: NeglectedRepo[] = [];
  const catCounts: Record<string, number> = {};

  for (const r of repos) {
    const name = r.name;
    const d = daysSince(r.updated_at);
    const stars = r.stars || 0;
    const isFork = !!r.fork;
    const isArchived = !!r.archived;

    const actScore = calculateActivityScore(d, weights.activity || {});
    const hlthScore = calculateHealthScore(r, d, weights.health || {});
    const momScore = calculateMomentumScore(r, actScore, d, weights.momentum || {});
    const recScore = calculateRecommendationScore(
      hlthScore,
      actScore,
      momScore,
      stars,
      weights.recommendation || {},
      isFork,
      isArchived
    );

    const manualCat = repoManualCat[name];
    const { primary: primaryCat, secondaries: secondaryCats } = categorizeRepo(r, intelCfg, manualCat);

    catCounts[primaryCat] = (catCounts[primaryCat] || 0) + 1;

    repoMetrics.push({
      repo: name,
      primary_category: primaryCat,
      secondary_categories: secondaryCats,
      suggested_category: primaryCat,
      health_score: Math.round(hlthScore * 100) / 100,
      activity_score: Math.round(actScore * 100) / 100,
      momentum_score: Math.round(momScore * 100) / 100,
      recommendation_score: Math.round(recScore * 100) / 100,
      days_inactive: d
    });

    // Rising Projects criteria
    const risingMinMom = thresholds.rising_momentum_min ?? 0.55;
    const risingMinAct = thresholds.rising_activity_min ?? 0.40;
    if (
      momScore >= risingMinMom &&
      actScore >= risingMinAct &&
      !isFork &&
      name !== 'index' &&
      name !== 'ALEVOLDON' &&
      !isArchived
    ) {
      const createdDays = daysSince(r.created_at);
      let reason = '';
      if (createdDays > 180 && d <= 30) {
        reason = `Revived project with recent active pushes (${d} days ago, momentum ${Math.round(momScore * 100) / 100})`;
      } else if (d <= 7) {
        reason = `High momentum (${Math.round(momScore * 100) / 100}) with updates in the last 7 days`;
      } else {
        reason = `Strong momentum (${Math.round(momScore * 100) / 100}) with recent updates (${d} days ago)`;
      }

      risingProjects.push({
        repo: name,
        momentum_score: Math.round(momScore * 100) / 100,
        activity_score: Math.round(actScore * 100) / 100,
        primary_category: primaryCat,
        reason
      });
    }

    // Featured Recommendations criteria
    const recMin = thresholds.featured_recommendation_min ?? 0.65;
    if (
      recScore >= recMin &&
      !repoFeatured[name] &&
      !isFork &&
      name !== 'index' &&
      name !== 'ALEVOLDON' &&
      !isArchived
    ) {
      const reasons: string[] = [];
      if (hlthScore >= 0.70) reasons.push(`High completeness & health (${Math.round(hlthScore * 100) / 100})`);
      if (actScore >= 0.70) reasons.push(`Active updates (${d} days ago)`);
      if (momScore >= 0.60) reasons.push(`Strong momentum (${Math.round(momScore * 100) / 100})`);
      if (r.homepage) reasons.push('Live demo homepage available');
      if (stars > 0) reasons.push(`${stars} star(s)`);

      if (reasons.length === 0) {
        reasons.push(`Overall recommendation score (${Math.round(recScore * 100) / 100})`);
      }

      featuredRecommendations.push({
        repo: name,
        recommendation_score: Math.round(recScore * 100) / 100,
        primary_category: primaryCat,
        reasons
      });
    }

    // Neglected repos check
    const neglectedLimit = thresholds.neglected_days ?? 365;
    if (r.tracked && d > neglectedLimit && !isArchived && manualCat !== 'archive') {
      neglectedRepos.push({ name, days_inactive: d });
    }
  }

  risingProjects.sort((a, b) => b.momentum_score - a.momentum_score);
  featuredRecommendations.sort((a, b) => b.recommendation_score - a.recommendation_score);
  neglectedRepos.sort((a, b) => b.days_inactive - a.days_inactive);

  const totalRepos = repos.length;
  const totalStars = repos.reduce((acc, r) => acc + (r.stars || 0), 0);

  const ecosystemStats: EcosystemStats = {
    total_repos: totalRepos,
    total_stars: totalStars,
    ai_projects: catCounts['ai'] || 0,
    music_projects: catCounts['music'] || 0,
    frontend_projects: catCounts['frontend'] || 0,
    creative_projects: catCounts['creative'] || 0,
    productivity_projects: catCounts['productivity'] || 0
  };

  const suggestions: string[] = [];
  if (topics.length > 0) {
    suggestions.push(`Your ecosystem is currently heavily focused around '${topics[0]}'.`);
  }
  if (risingProjects.length > 0) {
    suggestions.push(
      `${risingProjects.length} projects are showing strong recent momentum (e.g. '${risingProjects[0].repo}').`
    );
  }
  if (featuredRecommendations.length > 0) {
    suggestions.push(
      `Candidate for Featured recommendation: '${featuredRecommendations[0].repo}' (score ${featuredRecommendations[0].recommendation_score}).`
    );
  }
  if (neglectedRepos.length > 5) {
    suggestions.push(
      `You have ${neglectedRepos.length} tracked active repositories inactive for over 1 year.`
    );
  }

  const insights: InsightsData = {
    version: '2.0',
    generated_at: new Date().toISOString(),
    ecosystem_stats: ecosystemStats,
    top_topics: topics.slice(0, 10),
    repo_metrics: repoMetrics,
    rising_projects: risingProjects.slice(0, 5),
    featured_recommendations: featuredRecommendations.slice(0, 5),
    neglected_repos: neglectedRepos.slice(0, 10),
    suggestions
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(insights, null, 2), 'utf8');
  return insights;
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Running Intelligence Engine v2 (TypeScript)...');
  buildInsights();
  console.log('Intelligence Engine v2 complete. Generated insights.json.');
}
