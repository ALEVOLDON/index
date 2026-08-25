export interface TechBadgeItem {
  label: string;
  color: string;
  logo?: string;
  logoColor?: string;
}

export type TechBadgesMap = Record<string, TechBadgeItem>;
