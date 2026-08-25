import { IntelligenceConfig } from '../types/intelligence.js';
import { RepoData } from '../types/repo.js';

export function matchKeyword(kw: string, text: string): boolean {
  if (!kw || !text) return false;
  const kwClean = kw.trim().toLowerCase();
  const textClean = text.toLowerCase();

  // Delimiter-aware boundary regex matching
  const escaped = kwClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `(?:^|[\\s_\\-/,.;:()[\\]{}!?'"<>+=*~\`#|\\\\])${escaped}(?:$|[\\s_\\-/,.;:()[\\]{}!?'"<>+=*~\`#|\\\\])`,
    'i'
  );
  return pattern.test(textClean);
}

export function categorizeRepo(
  repo: Partial<RepoData>,
  intelCfg: IntelligenceConfig,
  manualCategory?: string | null
): { primary: string; secondaries: string[] } {
  const categoryDefs = intelCfg.category_definitions || {};
  const topics = new Set((repo.topics || []).map(t => t.toLowerCase()));
  const desc = repo.description || '';
  const name = repo.name || '';

  // Split camelCase and replace separators for token matching
  const nameTokens = name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ');
  const combinedText = `${nameTokens} ${desc}`;
  const lang = (repo.language || '').toLowerCase();

  const scores: Record<string, number> = {};

  for (const [catId, catDef] of Object.entries(categoryDefs)) {
    let catScore = 0;

    // 1. Topic matching (+2.0 per topic)
    const catTopics = new Set((catDef.topics || []).map(t => t.toLowerCase()));
    for (const t of topics) {
      if (catTopics.has(t)) {
        catScore += 2.0;
      }
    }

    // 2. Keyword matching (+1.0 per matched keyword with boundary check)
    for (const kw of catDef.keywords || []) {
      if (matchKeyword(kw, combinedText)) {
        catScore += 1.0;
      }
    }

    // 3. Language matching (+1.5 if match)
    const catLangs = (catDef.languages || []).map(l => l.toLowerCase());
    if (lang && catLangs.includes(lang)) {
      catScore += 1.5;
    }

    if (catScore > 0) {
      scores[catId] = Math.round(catScore * 100) / 100;
    }
  }

  // Rank categories by score descending
  const sortedCats = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  let primary: string;
  let secondaries: string[];

  if (manualCategory) {
    primary = manualCategory;
    secondaries = sortedCats.filter(([c, s]) => c !== manualCategory && s > 0).map(([c]) => c);
  } else if (sortedCats.length > 0) {
    primary = sortedCats[0][0];
    secondaries = sortedCats.slice(1).filter(([, s]) => s > 0).map(([c]) => c);
  } else {
    primary = 'archive';
    secondaries = [];
  }

  return { primary, secondaries };
}
