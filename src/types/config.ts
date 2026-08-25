export interface RepoConfig {
  name: string;
  featured: boolean;
  priority: number;
  notes?: string;
  custom_description?: string;
  custom_badges?: string;
}

export interface CategoryConfig {
  id: string;
  title: string;
  description: string;
  repos: RepoConfig[];
}

export interface ProjectsConfig {
  categories: CategoryConfig[];
}
