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
                return extracted;
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
    let statsMarkdown = '';
    if (insights && insights.ecosystem_stats) {
        const s = insights.ecosystem_stats;
        statsMarkdown = `![Repos](https://img.shields.io/badge/REPOSITORIES-${s.total_repos}-blueviolet?style=flat-square) ![Stars](https://img.shields.io/badge/STARS-${s.total_stars}-gold?style=flat-square)`;
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

                    featuredMarkdown += `### 🌟 [${rData.name}](https://github.com/${USERNAME}/${rData.name})\n\n`;
                    featuredMarkdown += `> ${sanitizeMarkdownCell(rConf.custom_description || rData.description || 'No description provided.')}\n\n`;
                    if (techBadges) featuredMarkdown += `**Technologies:** ${techBadges}\n\n`;
                    featuredMarkdown += `**Status:** **Active** 🚀 | [Repository](https://github.com/${USERNAME}/${rData.name})\n\n`;
                }
            }
        }
    }
    template = template.replace('{{ FEATURED_PROJECTS }}', featuredMarkdown.trim());

    // 2. Navigation
    console.log('Rendering Category Links...');
    let navMarkdown = '';
    for (const category of config.categories) {
        const anchor = category.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        navMarkdown += `- [${category.title}](#${anchor}) — ${category.description.split('.')[0]}.\n`;
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
            let statusText = rConf.featured ? '**Featured** ⭐' : '**Active** 🚀';
            
            // Status determination
            if (rData.archived || category.id === 'archive' || (rConf.notes && rConf.notes.toLowerCase().includes('archive'))) {
                statusText = '**Archived** 📦';
            } else if (daysSince(rData.updated_at) > 365) {
                statusText = '**Maintenance** 🛠️';
            }

            const techBadges = getRepoBadges(rConf, rData, techBadgesMap, 3);

            let extraHtml = '';
            let extras = [];
            if (rData.stars > 0) extras.push(`⭐ ${rData.stars}`);
            if (rData.updated_at) extras.push(`📅 ${rData.updated_at}`);
            if (extras.length > 0) {
                extraHtml = `<br><small>${extras.join(' • ')}</small>`;
            }

            const nameCol = `[${rData.name}](https://github.com/${USERNAME}/${rData.name})${extraHtml}`;
            let rawDesc = rConf.custom_description || rData.description || 'No description';
            if (!rConf.custom_description && rawDesc.length > 60) {
                rawDesc = rawDesc.substring(0, 60) + '...';
            }
            const descCol = sanitizeMarkdownCell(rawDesc);

            tableContent += `| ${nameCol} | ${descCol} | ${techBadges} | ${statusText} | [Repo](https://github.com/${USERNAME}/${rData.name}) |\n`;
        }

        if (category.id === 'archive') {
            sectionsMarkdown += `<details>\n<summary><b>📦 View Archived & Learning Repositories (${category.repos.length} items)</b></summary>\n\n`;
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
            insightsMarkdown += `- 💡 ${suggestion}\n`;
        }
        if (insights.rising_projects && insights.rising_projects.length > 0) {
            insightsMarkdown += `\n**🚀 Rising & Active Momentum Projects:**\n`;
            insights.rising_projects.slice(0, 4).forEach(rp => {
                insightsMarkdown += `- 🔥 **[${rp.repo}](https://github.com/${USERNAME}/${rp.repo})** (${rp.primary_category}) — _${rp.reason}_\n`;
            });
        }
        if (insights.neglected_repos && insights.neglected_repos.length > 0) {
            insightsMarkdown += `\n**Attention Needed:**\n`;
            insights.neglected_repos.slice(0, 3).forEach(nr => {
                insightsMarkdown += `- ⚠️ \`${nr.name}\` (inactive for ${nr.days_inactive} days)\n`;
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
                actionStr = `🚀 Pushed changes to **[${ev.repo.name}](https://github.com/${ev.repo.name})** (${branch})${msg}`;
            } else if (ev.type === 'CreateEvent' && ev.payload.ref_type === 'repository') {
                actionStr = `🎉 Created new repository **[${ev.repo.name}](https://github.com/${ev.repo.name})**`;
            } else if (ev.type === 'ReleaseEvent') {
                actionStr = `📦 Released **${ev.payload.release.tag_name}** in **[${ev.repo.name}](https://github.com/${ev.repo.name})**`;
            } else if (ev.type === 'IssuesEvent' && ev.payload.action === 'opened') {
                actionStr = `🐛 Opened issue in **[${ev.repo.name}](https://github.com/${ev.repo.name})**: _${sanitizeMarkdownCell(ev.payload.issue.title)}_`;
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
