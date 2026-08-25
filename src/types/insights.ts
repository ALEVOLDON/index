export interface RepoMetric {
  repo: string;
  primary_category: string;
  secondary_categories: string[];
  suggested_category: string;
  health_score: number;
  activity_score: number;
  momentum_score: number;
  recommendation_score: number;
  days_inactive: number;
}

export interface RisingProject {
  repo: string;
  momentum_score: number;
  activity_score: number;
  primary_category: string;
  reason: string;
}

export interface FeaturedRecommendation {
  repo: string;
  recommendation_score: number;
  primary_category: string;
  reasons: string[];
}

export interface NeglectedRepo {
  name: string;
  days_inactive: number;
}

export interface EcosystemStats {
  total_repos: number;
  total_stars: number;
  ai_projects: number;
  music_projects: number;
  frontend_projects: number;
  creative_projects: number;
  productivity_projects: number;
}

export interface InsightsData {
  version: string;
  generated_at: string;
  ecosystem_stats: EcosystemStats;
  top_topics: string[];
  repo_metrics: RepoMetric[];
  rising_projects: RisingProject[];
  featured_recommendations: FeaturedRecommendation[];
  neglected_repos: NeglectedRepo[];
  suggestions: string[];
}
