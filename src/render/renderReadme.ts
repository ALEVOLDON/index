import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { fetchJSON } from '../core/githubApi.js';
import { SYSTEM_REPOS } from '../core/categorize.js';
import { daysSince } from '../analysis/engine.js';
import { ProjectsConfig, RepoConfig } from '../types/config.js';
import { RepoData, GitHubEvent } from '../types/repo.js';
import { InsightsData } from '../types/insights.js';
import { TechBadgesMap } from '../types/badges.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERNAME = 'ALEVOLDON';

const CONFIG_PATH = path.join(__dirname, '../../config/projects.json');
const DATA_DIR = path.join(__dirname, '../../data');
const REPOS_PATH = path.join(DATA_DIR, 'repos.json');
const INSIGHTS_PATH = path.join(DATA_DIR, 'insights.json');
const TEMPLATE_PATH = path.join(__dirname, '../../render/template.md');
const README_PATH = path.join(__dirname, '../../README.md');
const TECH_BADGES_PATH = path.join(__dirname, '../../config/tech_badges.json');

export function sanitizeMarkdownCell(text: string | null | undefined): string {
  if (!text) return '';
  return String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

export function getBadgeForTopic(topic: string, techBadgesMap: TechBadgesMap): string {
  const key = topic.toLowerCase();
  if (techBadgesMap[key]) {
    const item = techBadgesMap[key];
    const logoParam = item.logo ? `&logo=${encodeURIComponent(item.logo)}` : '';
    const logoColorParam = item.logoColor ? `&logoColor=${encodeURIComponent(item.logoColor)}` : '';
    const label = encodeURIComponent(item.label.replace(/-/g, '--'));
    return `![${item.label}](https://img.shields.io/badge/${label}-${item.color}?style=flat-square${logoParam}${logoColorParam})`;
  }
  const safeTopic = topic.replace(/-/g, '--');
  return `![${topic}](https://img.shields.io/badge/${encodeURIComponent(safeTopic)}-1572B6?style=flat-square)`;
}

export function getRepoBadges(rConf: RepoConfig, rData: RepoData, techBadgesMap: TechBadgesMap, limit = 3): string {
  if (rConf.custom_badges) return rConf.custom_badges;

  const rawTopics = rData.topics && rData.topics.length > 0
    ? [...rData.topics]
    : (rData.language ? [rData.language] : []);

  if (rawTopics.length === 0) return '';

  // Prioritize known technology badges over unmapped generic tags
  const sortedTopics = rawTopics.sort((a, b) => {
    const aKnown = techBadgesMap[a.toLowerCase()] ? 1 : 0;
    const bKnown = techBadgesMap[b.toLowerCase()] ? 1 : 0;
    return bKnown - aKnown;
  });

  // Avoid duplicate badge labels (e.g. "web-audio" and "webaudio")
  const selectedBadges: string[] = [];
  const seenLabels = new Set<string>();

  for (const t of sortedTopics) {
    if (selectedBadges.length >= limit) break;
    const key = t.toLowerCase();
    const labelKey = techBadgesMap[key] ? techBadgesMap[key].label.toLowerCase() : key;
    if (seenLabels.has(labelKey)) continue;
    seenLabels.add(labelKey);
    selectedBadges.push(getBadgeForTopic(t, techBadgesMap));
  }

  return selectedBadges.join(' ');
}

export function deduplicateActivityLines(markdown: string): string[] {
  const lines = markdown
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.startsWith('- '));

  const uniqueLines: string[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    // Normalize line up to repo link to avoid duplicate pushes to the same repo on the same day
    const repoMatch = line.match(/^\-\s+\*\*([^*]+)\*\*.*?\*\*\[([^\]]+)\]/);
    const dedupKey = repoMatch ? `${repoMatch[1]}:${repoMatch[2]}` : line;
    if (!seen.has(dedupKey)) {
      seen.add(dedupKey);
      uniqueLines.push(line);
    }
  }
  return uniqueLines;
}

export function extractExistingActivity(readmePath: string): string | null {
  if (!fs.existsSync(readmePath)) return null;
  try {
    const content = fs.readFileSync(readmePath, 'utf8');
    const startTag = '<!-- RECENT_ACTIVITY_START -->';
    const endTag = '<!-- RECENT_ACTIVITY_END -->';
    const startIdx = content.indexOf(startTag);
    const endIdx = content.indexOf(endTag);
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const extracted = content.substring(startIdx + startTag.length, endIdx).trim();
      if (extracted && !extracted.includes('_No recent prominent activity')) {
        const normalized = extracted
          .replace(/🚀 Pushed changes to/g, '![Push](https://img.shields.io/badge/-push-blue?style=flat-square&logo=git&logoColor=white) Pushed changes to')
          .replace(/🎉 Created new repository/g, '![Created](https://img.shields.io/badge/-created-brightgreen?style=flat-square&logo=github&logoColor=white) Created new repository')
          .replace(/📦 Released/g, '![Release](https://img.shields.io/badge/-release-blueviolet?style=flat-square&logo=github&logoColor=white) Released')
          .replace(/🐛 Opened issue in/g, '![Issue](https://img.shields.io/badge/-issue-orange?style=flat-square&logo=github&logoColor=white) Opened issue in');
        const uniqueLines = deduplicateActivityLines(normalized);
        if (uniqueLines.length > 0) {
          return uniqueLines.join('\n');
        }
      }
    }
  } catch {}
  return null;
}

export function buildFallbackActivityFromRepos(reposData: RepoData[], existingLines: string[] = [], maxItems = 5): string {
  const result = [...existingLines];
  const seenRepos = new Set<string>();

  for (const line of result) {
    const match = line.match(/\*\*\[([^\]]+)\]/);
    if (match) {
      const repoFull = match[1];
      seenRepos.add(repoFull.includes('/') ? repoFull.split('/')[1] : repoFull);
    }
  }

  const recentRepos = [...reposData]
    .filter(r => !r.fork && !r.archived && !SYSTEM_REPOS.has(r.name) && r.updated_at && daysSince(r.updated_at) <= 90)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  for (const r of recentRepos) {
    if (result.length >= maxItems) break;
    if (seenRepos.has(r.name)) continue;
    seenRepos.add(r.name);
    const dateStr = new Date(`${r.updated_at}T12:00:00Z`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC'
    });
    result.push(
      `- **${dateStr}** — ![Push](https://img.shields.io/badge/-push-blue?style=flat-square&logo=git&logoColor=white) Pushed changes to **[${USERNAME}/${r.name}](https://github.com/${USERNAME}/${r.name})** (main)`
    );
  }

  return result.join('\n');
}

export async function renderReadme(): Promise<void> {
  console.log('Loading data...');
  const config: ProjectsConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const reposData: RepoData[] = JSON.parse(fs.readFileSync(REPOS_PATH, 'utf8'));

  let techBadgesMap: TechBadgesMap = {};
  if (fs.existsSync(TECH_BADGES_PATH)) {
    techBadgesMap = JSON.parse(fs.readFileSync(TECH_BADGES_PATH, 'utf8'));
  }

  let insights: InsightsData | null = null;
  if (fs.existsSync(INSIGHTS_PATH)) {
    insights = JSON.parse(fs.readFileSync(INSIGHTS_PATH, 'utf8'));
  }

  let template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  // Ecosystem Stats
  let statsMarkdown = '';
  if (insights && insights.ecosystem_stats) {
    const s = insights.ecosystem_stats;
    statsMarkdown = `![Repos](https://img.shields.io/badge/REPOSITORIES-${s.total_repos}-blueviolet?style=flat-square&logo=github&logoColor=white) ![Stars](https://img.shields.io/badge/STARS-${s.total_stars}-gold?style=flat-square&logo=apachespark&logoColor=white)`;
  }
  template = template.replace('{{ ECOSYSTEM_STATS }}', statsMarkdown);

  // Create lookup map
  const reposMap: Record<string, RepoData> = {};
  for (const r of reposData) {
    reposMap[r.name] = r;
  }

  const missingConfiguredRepos: string[] = [];

  // 1. Featured Projects
  console.log('Rendering Featured Projects...');
  let featuredMarkdown = '';
  for (const category of config.categories) {
    for (const rConf of category.repos) {
      if (rConf.featured) {
        const rData = reposMap[rConf.name];
        if (rData) {
          const techBadges = getRepoBadges(rConf, rData, techBadgesMap, 4);

          let rawDesc = rConf.custom_description || rData.description || 'No description provided.';
          rawDesc = rawDesc
            .replace(/:[a-zA-Z0-9_+-]+:/g, '')
            .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
            .replace(/\s+/g, ' ')
            .trim();

          featuredMarkdown += `### [${rData.name}](https://github.com/${USERNAME}/${rData.name})\n\n`;
          featuredMarkdown += `> ${sanitizeMarkdownCell(rawDesc)}\n\n`;
          if (techBadges) featuredMarkdown += `**Technologies:** ${techBadges}\n\n`;
          featuredMarkdown += `**Status:** ![Featured](https://img.shields.io/badge/Status-Featured-f1e05a?style=flat-square&logo=githubsponsors&logoColor=black) | [![Repository](https://img.shields.io/badge/Repo-View-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/${USERNAME}/${rData.name})\n\n`;
        }
      }
    }
  }
  template = template.replace('{{ FEATURED_PROJECTS }}', featuredMarkdown.trim());

  // 2. Navigation
  console.log('Rendering Category Links...');
  const categoryBadges: Record<string, string> = {
    ai: '![AI](https://img.shields.io/badge/AI-6366F1?style=flat-square&logo=openai&logoColor=white)',
    music: '![Music](https://img.shields.io/badge/Music-FF5500?style=flat-square&logo=audacity&logoColor=white)',
    frontend: '![Frontend](https://img.shields.io/badge/Frontend-3178C6?style=flat-square&logo=react&logoColor=white)',
    creative: '![Creative](https://img.shields.io/badge/Creative-F5792A?style=flat-square&logo=blender&logoColor=white)',
    productivity: '![Productivity](https://img.shields.io/badge/Productivity-339933?style=flat-square&logo=nodedotjs&logoColor=white)',
    archive: '![Archive](https://img.shields.io/badge/Archive-6E7681?style=flat-square&logo=archivebox&logoColor=white)'
  };
  let navMarkdown = '';
  for (const category of config.categories) {
    const anchor = category.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const badge = categoryBadges[category.id] ? `${categoryBadges[category.id]} ` : '';
    navMarkdown += `- ${badge}[**${category.title}**](#${anchor}) — ${category.description.split('.')[0]}.\n`;
  }
  template = template.replace('{{ CATEGORY_LINKS }}', navMarkdown.trim());

  // 3. Category Sections
  console.log('Rendering Categories...');
  let sectionsMarkdown = '';

  const getRepoTier = (rConf: RepoConfig, rData: RepoData | undefined, catId: string): number => {
    if (rConf.featured) return 3;
    if (!rData) return 0;
    if (rData.archived || catId === 'archive' || (rConf.notes && rConf.notes.toLowerCase().includes('archive'))) return 0;
    if (daysSince(rData.updated_at) > 365) return 1;
    return 2;
  };

  for (const category of config.categories) {
    sectionsMarkdown += `## ${category.title}\n`;
    sectionsMarkdown += `*${category.description}*\n\n`;

    let tableContent = '';
    tableContent += `| Project | Description | Technologies | Status | Links |\n`;
    tableContent += `| :--- | :--- | :--- | :--- | :--- |\n`;

    // Sort by status tier (Featured > Active > Maintenance > Archived), then priority (descending), then update date
    const sortedRepos = [...category.repos].sort((a, b) => {
      const rDataA = reposMap[a.name];
      const rDataB = reposMap[b.name];
      const tierA = getRepoTier(a, rDataA, category.id);
      const tierB = getRepoTier(b, rDataB, category.id);
      if (tierB !== tierA) return tierB - tierA;
      if (b.priority !== a.priority) return b.priority - a.priority;
      const dateA = rDataA && rDataA.updated_at ? rDataA.updated_at : '';
      const dateB = rDataB && rDataB.updated_at ? rDataB.updated_at : '';
      return dateB.localeCompare(dateA);
    });

    for (const rConf of sortedRepos) {
      const rData = reposMap[rConf.name];
      if (!rData) {
        missingConfiguredRepos.push(`${category.id}: ${rConf.name}`);
        continue;
      }
      let statusText = rConf.featured
        ? '![Featured](https://img.shields.io/badge/Status-Featured-f1e05a?style=flat-square&logo=githubsponsors&logoColor=black)'
        : '![Active](https://img.shields.io/badge/Status-Active-brightgreen?style=flat-square&logo=githubactions&logoColor=white)';

      // Status determination
      if (rData.archived || category.id === 'archive' || (rConf.notes && rConf.notes.toLowerCase().includes('archive'))) {
        statusText = '![Archived](https://img.shields.io/badge/Status-Archived-lightgrey?style=flat-square&logo=archivebox&logoColor=white)';
      } else if (daysSince(rData.updated_at) > 365) {
        statusText = '![Maintenance](https://img.shields.io/badge/Status-Maintenance-orange?style=flat-square&logo=dependabot&logoColor=white)';
      }

      const techBadges = getRepoBadges(rConf, rData, techBadgesMap, 3);

      let extraHtml = '';
      const extras: string[] = [];
      if (rData.stars > 0) extras.push(`![Stars](https://img.shields.io/badge/stars-${rData.stars}-gold?style=flat-square)`);
      if (rData.updated_at) extras.push(`Updated: ${rData.updated_at}`);
      if (extras.length > 0) {
        extraHtml = `<br><small>${extras.join(' • ')}</small>`;
      }

      const nameCol = `[${rData.name}](https://github.com/${USERNAME}/${rData.name})${extraHtml}`;
      let rawDesc = rConf.custom_description || rData.description || 'No description';
      rawDesc = rawDesc
        .replace(/:[a-zA-Z0-9_+-]+:/g, '')
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!rConf.custom_description && rawDesc.length > 60) {
        rawDesc = rawDesc.substring(0, 60) + '...';
      }
      const descCol = sanitizeMarkdownCell(rawDesc);

      const repoLinkCol = `[![Repo](https://img.shields.io/badge/Repo-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/${USERNAME}/${rData.name})`;

      tableContent += `| ${nameCol} | ${descCol} | ${techBadges} | ${statusText} | ${repoLinkCol} |\n`;
    }

    if (category.id === 'archive') {
      sectionsMarkdown += `<details>\n<summary><b>View Archived & Learning Repositories (${category.repos.length} items)</b></summary>\n\n`;
      sectionsMarkdown += tableContent;
      sectionsMarkdown += `\n</details>\n\n`;
    } else {
      sectionsMarkdown += tableContent;
      sectionsMarkdown += `\n---\n\n`;
    }
  }

  if (missingConfiguredRepos.length > 0) {
    throw new Error(`Configured repositories missing from data/repos.json:\n${missingConfiguredRepos.join('\n')}`);
  }

  // Remove trailing separators
  sectionsMarkdown = sectionsMarkdown.trim();
  if (sectionsMarkdown.endsWith('---')) {
    sectionsMarkdown = sectionsMarkdown.substring(0, sectionsMarkdown.lastIndexOf('---')).trim();
  }
  template = template.replace('{{ CATEGORY_SECTIONS }}', sectionsMarkdown);

  // 4. Insights
  console.log('Rendering Insights...');
  let insightsMarkdown = '';
  if (insights && insights.suggestions) {
    for (const suggestion of insights.suggestions) {
      insightsMarkdown += `- ![Insight](https://img.shields.io/badge/-insight-6366F1?style=flat-square&logo=probot&logoColor=white) ${suggestion}\n`;
    }
    if (insights.rising_projects && insights.rising_projects.length > 0) {
      insightsMarkdown += `\n**Rising & Active Momentum Projects:**\n`;
      insights.rising_projects.slice(0, 4).forEach(rp => {
        insightsMarkdown += `- ![Rising](https://img.shields.io/badge/-rising-FF4500?style=flat-square&logo=speedtest&logoColor=white) **[${rp.repo}](https://github.com/${USERNAME}/${rp.repo})** (${rp.primary_category}) — _${rp.reason}_\n`;
      });
    }
    if (insights.featured_recommendations && insights.featured_recommendations.length > 0) {
      insightsMarkdown += `\n**Recommended for Featured:**\n`;
      insights.featured_recommendations.slice(0, 3).forEach(rec => {
        insightsMarkdown += `- ![Recommended](https://img.shields.io/badge/-recommended-10B981?style=flat-square&logo=githubsponsors&logoColor=white) **[${rec.repo}](https://github.com/${USERNAME}/${rec.repo})** (${rec.primary_category}, score ${rec.recommendation_score}) — _${rec.reasons.join(', ')}_\n`;
      });
    }
    if (insights.neglected_repos && insights.neglected_repos.length > 0) {
      insightsMarkdown += `\n**Attention Needed:**\n`;
      insights.neglected_repos.slice(0, 3).forEach(nr => {
        insightsMarkdown += `- ![Attention](https://img.shields.io/badge/-attention-orange?style=flat-square&logo=dependabot&logoColor=white) \`${nr.name}\` (inactive for ${nr.days_inactive} days)\n`;
      });
    }
  } else {
    insightsMarkdown = '_No recent intelligence analysis available._\n';
  }
  template = template.replace('{{ INSIGHTS }}', insightsMarkdown);

  // 5. Tech Cloud
  console.log('Rendering Tech Cloud...');
  const topicsCount: Record<string, number> = {};
  for (const r of reposData) {
    if (SYSTEM_REPOS.has(r.name)) continue;
    for (const t of r.topics || []) {
      topicsCount[t] = (topicsCount[t] || 0) + 1;
    }
  }
  const topTopics = Object.entries(topicsCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  let techCloudMarkdown = '';
  for (const [topic] of topTopics) {
    const badgeStr = getBadgeForTopic(topic, techBadgesMap);
    techCloudMarkdown += `${badgeStr} `;
  }
  template = template.replace('{{ TECH_CLOUD }}', techCloudMarkdown.trim());

  // 6. Recent Activity
  console.log('Fetching Recent Activity...');
  let activityMarkdown = '';
  const seenEventKeys = new Set<string>();
  try {
    const events = await fetchJSON<GitHubEvent[]>(`users/${USERNAME}/events/public?per_page=30`);
    let eventCount = 0;

    for (const ev of events) {
      if (eventCount >= 5) break;

      const shortRepoName = ev.repo.name.includes('/') ? ev.repo.name.split('/')[1] : ev.repo.name;
      if (SYSTEM_REPOS.has(shortRepoName)) continue;

      const dateStr = new Date(ev.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const dedupKey = `${dateStr}:${ev.type}:${ev.repo.name}`;
      if (seenEventKeys.has(dedupKey)) continue;

      let actionStr = '';
      if (ev.type === 'PushEvent') {
        const branch = ev.payload.ref ? ev.payload.ref.replace('refs/heads/', '') : 'main';
        let msg = '';
        if (ev.payload.commits && ev.payload.commits.length > 0) {
          msg = `: _"${sanitizeMarkdownCell(ev.payload.commits[0].message.split('\n')[0].substring(0, 40))}"_`;
        }
        actionStr = `![Push](https://img.shields.io/badge/-push-blue?style=flat-square&logo=git&logoColor=white) Pushed changes to **[${ev.repo.name}](https://github.com/${ev.repo.name})** (${branch})${msg}`;
      } else if (ev.type === 'CreateEvent' && ev.payload.ref_type === 'repository') {
        actionStr = `![Created](https://img.shields.io/badge/-created-brightgreen?style=flat-square&logo=github&logoColor=white) Created new repository **[${ev.repo.name}](https://github.com/${ev.repo.name})**`;
      } else if (ev.type === 'ReleaseEvent') {
        actionStr = `![Release](https://img.shields.io/badge/-release-blueviolet?style=flat-square&logo=github&logoColor=white) Released **${ev.payload.release?.tag_name || ''}** in **[${ev.repo.name}](https://github.com/${ev.repo.name})**`;
      } else if (ev.type === 'IssuesEvent' && ev.payload.action === 'opened') {
        actionStr = `![Issue](https://img.shields.io/badge/-issue-orange?style=flat-square&logo=github&logoColor=white) Opened issue in **[${ev.repo.name}](https://github.com/${ev.repo.name})**: _${sanitizeMarkdownCell(ev.payload.issue?.title || '')}_`;
      } else {
        continue;
      }

      seenEventKeys.add(dedupKey);
      activityMarkdown += `- **${dateStr}** — ${actionStr}\n`;
      eventCount++;
    }
  } catch (err: any) {
    console.warn('Could not fetch latest live events (rate limit or offline):', err.message);
  }

  if (activityMarkdown === '') {
    console.log('Building deduplicated Recent Activity from repository history...');
    activityMarkdown = buildFallbackActivityFromRepos(reposData, [], 5);
    if (!activityMarkdown.trim()) {
      const existing = extractExistingActivity(README_PATH);
      if (existing) activityMarkdown = existing;
    }
    if (!activityMarkdown.trim()) {
      activityMarkdown = '_No recent prominent activity in the last 90 days._\n';
    }
  }
  template = template.replace('{{ RECENT_ACTIVITY }}', activityMarkdown.trim());

  // Write to README
  console.log('Writing README.md...');
  fs.writeFileSync(README_PATH, template, 'utf8');
  console.log('Successfully generated README.md!');
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  renderReadme().catch(err => {
    console.error('Action failed:', err);
    process.exit(1);
  });
}
