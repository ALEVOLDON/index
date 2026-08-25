const fs = require('fs');
const path = require('path');

const GITHUB_API_URL = 'https://api.github.com/';
const USERNAME = 'ALEVOLDON';

const CONFIG_PATH = path.join(__dirname, '../config/projects.json');
const DATA_DIR = path.join(__dirname, '../data');
const REPOS_PATH = path.join(DATA_DIR, 'repos.json');
const INSIGHTS_PATH = path.join(DATA_DIR, 'insights.json');
const TEMPLATE_PATH = path.join(__dirname, 'template.md');
const README_PATH = path.join(__dirname, '../README.md');
const TECH_BADGES_PATH = path.join(__dirname, '../config/tech_badges.json');

function getHeaders() {
    const headers = { 
        'User-Agent': 'Node.js README Updater',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };
    if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim() !== '') {
        headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    return headers;
}

async function fetchJSON(endpoint) {
    let res = await fetch(GITHUB_API_URL + endpoint, { headers: getHeaders() });
    if (res.status === 401 && process.env.GITHUB_TOKEN) {
        console.warn(`[GitHub API] Token unauthorized for ${endpoint}, retrying without token...`);
        res = await fetch(GITHUB_API_URL + endpoint, { 
            headers: { 
                'User-Agent': 'Node.js README Updater',
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            } 
        });
    }
    if (!res.ok) {
        throw new Error(`Failed to fetch ${endpoint}: ${res.status} ${res.statusText}`);
    }
    return res.json();
}

function sanitizeMarkdownCell(text) {
    if (!text) return '';
    return String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function getBadgeForTopic(topic, techBadgesMap) {
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

function getRepoBadges(rConf, rData, techBadgesMap, limit = 3) {
    if (rConf.custom_badges) return rConf.custom_badges;
    const topics = (rData.topics || []).slice(0, limit);
    if (topics.length === 0) return '';
    return topics.map(t => getBadgeForTopic(t, techBadgesMap)).join(' ');
}

function extractExistingActivity(readmePath) {
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
                return extracted
                    .replace(/🚀 Pushed changes to/g, '![Push](https://img.shields.io/badge/-push-blue?style=flat-square&logo=git&logoColor=white) Pushed changes to')
                    .replace(/🎉 Created new repository/g, '![Created](https://img.shields.io/badge/-created-brightgreen?style=flat-square&logo=github&logoColor=white) Created new repository')
                    .replace(/📦 Released/g, '![Release](https://img.shields.io/badge/-release-blueviolet?style=flat-square&logo=github&logoColor=white) Released')
                    .replace(/🐛 Opened issue in/g, '![Issue](https://img.shields.io/badge/-issue-orange?style=flat-square&logo=github&logoColor=white) Opened issue in');
            }
        }
    } catch (e) {}
    return null;
}

async function renderReadme() {
    console.log('Loading data...');
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const reposData = JSON.parse(fs.readFileSync(REPOS_PATH, 'utf8'));
    
    let techBadgesMap = {};
    if (fs.existsSync(TECH_BADGES_PATH)) {
        techBadgesMap = JSON.parse(fs.readFileSync(TECH_BADGES_PATH, 'utf8'));
    }

    let insights = null;
    if (fs.existsSync(INSIGHTS_PATH)) {
        insights = JSON.parse(fs.readFileSync(INSIGHTS_PATH, 'utf8'));
    }

    let template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

    // Ecosystem Stats
    // Ecosystem Stats
    let statsMarkdown = '';
    if (insights && insights.ecosystem_stats) {
        const s = insights.ecosystem_stats;
        statsMarkdown = `![Repos](https://img.shields.io/badge/REPOSITORIES-${s.total_repos}-blueviolet?style=flat-square&logo=github&logoColor=white) ![Stars](https://img.shields.io/badge/STARS-${s.total_stars}-gold?style=flat-square&logo=apachespark&logoColor=white)`;
    }
    template = template.replace('{{ ECOSYSTEM_STATS }}', statsMarkdown);

    // Create lookup map
    const reposMap = {};
    for (const r of reposData) {
        reposMap[r.name] = r;
    }

    const missingConfiguredRepos = [];

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
                    rawDesc = rawDesc.replace(/:[a-zA-Z0-9_+-]+:/g, '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim();

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
    const categoryBadges = {
        'ai': '![AI](https://img.shields.io/badge/AI-6366F1?style=flat-square&logo=openai&logoColor=white)',
        'music': '![Music](https://img.shields.io/badge/Music-FF5500?style=flat-square&logo=audacity&logoColor=white)',
        'frontend': '![Frontend](https://img.shields.io/badge/Frontend-3178C6?style=flat-square&logo=react&logoColor=white)',
        'creative': '![Creative](https://img.shields.io/badge/Creative-F5792A?style=flat-square&logo=blender&logoColor=white)',
        'productivity': '![Productivity](https://img.shields.io/badge/Productivity-339933?style=flat-square&logo=nodedotjs&logoColor=white)',
        'archive': '![Archive](https://img.shields.io/badge/Archive-6E7681?style=flat-square&logo=archivebox&logoColor=white)'
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
    
    const daysSince = (dateStr) => {
        if (!dateStr) return 9999;
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return 9999;
        return Math.max(0, (new Date() - d) / (1000 * 60 * 60 * 24));
    };

    for (const category of config.categories) {
        sectionsMarkdown += `## ${category.title}\n`;
        sectionsMarkdown += `*${category.description}*\n\n`;
        
        let tableContent = '';
        tableContent += `| Project | Description | Technologies | Status | Links |\n`;
        tableContent += `| :--- | :--- | :--- | :--- | :--- |\n`;

        // Sort by priority (descending) then by update date
        const sortedRepos = [...category.repos].sort((a, b) => {
            if (b.priority !== a.priority) return b.priority - a.priority;
            const rDataA = reposMap[a.name];
            const rDataB = reposMap[b.name];
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
            let extras = [];
            if (rData.stars > 0) extras.push(`![Stars](https://img.shields.io/badge/stars-${rData.stars}-gold?style=flat-square)`);
            if (rData.updated_at) extras.push(`Updated: ${rData.updated_at}`);
            if (extras.length > 0) {
                extraHtml = `<br><small>${extras.join(' • ')}</small>`;
            }

            const nameCol = `[${rData.name}](https://github.com/${USERNAME}/${rData.name})${extraHtml}`;
            let rawDesc = rConf.custom_description || rData.description || 'No description';
            // Strip any raw emojis or colon-codes if present in repos descriptions
            rawDesc = rawDesc.replace(/:[a-zA-Z0-9_+-]+:/g, '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim();
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
    const topicsCount = {};
    for (const r of reposData) {
        for (const t of (r.topics || [])) {
            topicsCount[t] = (topicsCount[t] || 0) + 1;
        }
    }
    const topTopics = Object.entries(topicsCount).sort((a,b) => b[1] - a[1]).slice(0, 20);
    
    let techCloudMarkdown = '';
    for(let [topic] of topTopics) {
        const badgeStr = getBadgeForTopic(topic, techBadgesMap);
        techCloudMarkdown += `${badgeStr} `;
    }
    template = template.replace('{{ TECH_CLOUD }}', techCloudMarkdown.trim());

    // 6. Recent Activity
    console.log('Fetching Recent Activity...');
    let activityMarkdown = '';
    try {
        const events = await fetchJSON(`users/${USERNAME}/events/public?per_page=30`);
        let eventCount = 0;
        
        for (const ev of events) {
            if (eventCount >= 5) break; 
            
            const dateStr = new Date(ev.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
                actionStr = `![Release](https://img.shields.io/badge/-release-blueviolet?style=flat-square&logo=github&logoColor=white) Released **${ev.payload.release.tag_name}** in **[${ev.repo.name}](https://github.com/${ev.repo.name})**`;
            } else if (ev.type === 'IssuesEvent' && ev.payload.action === 'opened') {
                actionStr = `![Issue](https://img.shields.io/badge/-issue-orange?style=flat-square&logo=github&logoColor=white) Opened issue in **[${ev.repo.name}](https://github.com/${ev.repo.name})**: _${sanitizeMarkdownCell(ev.payload.issue.title)}_`;
            } else {
                continue;
            }
            
            activityMarkdown += `- **${dateStr}** — ${actionStr}\n`;
            eventCount++;
        }
    } catch(err) {
        console.warn('Could not fetch latest live events (rate limit or offline):', err.message);
    }
    
    if (activityMarkdown === '') {
        const existing = extractExistingActivity(README_PATH);
        if (existing) {
            console.log('Preserved previous Recent Activity from README.md.');
            activityMarkdown = existing;
        } else {
            activityMarkdown = '_No recent prominent activity in the last 90 days._\n';
        }
    }
    template = template.replace('{{ RECENT_ACTIVITY }}', activityMarkdown.trim());

    // Write to README
    console.log('Writing README.md...');
    fs.writeFileSync(README_PATH, template, 'utf8');
    console.log('Successfully generated README.md!');
}

renderReadme().catch(err => {
    console.error('Action failed:', err);
    process.exit(1);
});
