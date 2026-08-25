export interface RepoData {
  name: string;
  stars: number;
  updated_at: string;
  topics: string[];
  tracked: boolean;
  category: string | null;
  fork: boolean;
  description: string;
  language: string;
  license: string;
  forks_count: number;
  open_issues_count: number;
  created_at: string;
  homepage: string;
  size: number;
  archived: boolean;
}

export interface GitHubApiRepo {
  name: string;
  stargazers_count?: number;
  pushed_at?: string;
  updated_at?: string;
  created_at?: string;
  topics?: string[];
  fork?: boolean;
  description?: string | null;
  language?: string | null;
  license?: {
    key?: string;
    name?: string;
    spdx_id?: string;
  } | null;
  forks_count?: number;
  forks?: number;
  open_issues_count?: number;
  homepage?: string | null;
  size?: number;
  archived?: boolean;
}

export interface GitHubEvent {
  type: string;
  created_at: string;
  repo: {
    name: string;
  };
  payload: {
    ref?: string;
    ref_type?: string;
    commits?: Array<{ message: string }>;
    release?: { tag_name: string };
    action?: string;
    issue?: { title: string };
  };
}

export interface GitHubIssue {
  number: number;
  title: string;
  state: string;
}
