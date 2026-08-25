export interface HealthWeights {
  has_description: number;
  has_topics: number;
  topic_richness: number;
  has_license: number;
  has_stars: number;
  has_forks: number;
  has_language: number;
  non_empty_size: number;
  has_homepage: number;
  recent_push_bonus: number;
  archived_penalty: number;
}

export interface ActivityWeights {
  days_7: number;
  days_30: number;
  days_90: number;
  days_180: number;
  days_365: number;
}

export interface MomentumWeights {
  activity_weight: number;
  recency_boost: number;
  revival_boost: number;
  engagement_weight: number;
}

export interface RecommendationWeights {
  health_weight: number;
  activity_weight: number;
  momentum_weight: number;
  stars_weight: number;
}

export interface ScoringWeights {
  health: HealthWeights;
  activity: ActivityWeights;
  momentum: MomentumWeights;
  recommendation: RecommendationWeights;
}

export interface Thresholds {
  auto_discovery_health?: number;
  auto_discovery_momentum?: number;
  rising_momentum_min?: number;
  rising_activity_min?: number;
  featured_recommendation_min?: number;
  neglected_days?: number;
}

export interface CategoryDefinition {
  topics: string[];
  keywords: string[];
  languages: string[];
}

export interface IntelligenceConfig {
  version: string;
  scoring_weights: ScoringWeights;
  thresholds: Thresholds;
  category_definitions: Record<string, CategoryDefinition>;
}
