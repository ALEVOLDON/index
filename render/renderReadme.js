const fs = require('fs');
const path = require('path');

const GITHUB_API_URL = 'https://api.github.com/';
const USERNAME = 'ALEVOLDON';

const CONFIG_PATH = path.join(__dirname, '../config/projects.json');
const DATA_DIR = path.join(__dirname, '../data');
const REPOS_PATH = path.join(DATA_DIR, 'repos.json');
const INSIGHTS_PATH = path.join(DATA_DIR, 'insights.json');
const TEMPLATE_PATH = path.join(__dirname, 'template.md');
const README_PATH = path.join(__dirname, '../README_new.md');

function getHeaders() {
    const headers = { 
        'User-Agent': 'Node.js README Updater',
        'Accept': 'application/vnd.github.mercy-preview+json'
    };
    if (process.env.GITHUB_ACTIONS && process.env.GITHUB_TOKEN) {
        headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    return headers;
}

async function fetchJSON(endpoint) {
    const res = await fetch(GITHUB_API_URL + endpoint, { headers: getHeaders() });
    if (!res.ok) {
        throw new Error(`Failed to fetch ${endpoint}: ${res.statusText}`);
    }
    return res.json();
}

async function renderReadme() {
    console.log('Loading data...');
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const reposData = JSON.parse(fs.readFileSync(REPOS_PATH, 'utf8'));
    
    let insights = null;
    if (fs.existsSync(INSIGHTS_PATH)) {
        insights = JSON.parse(fs.readFileSync(INSIGHTS_PATH, 'utf8'));
    }

    let template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

    // Create lookup map
    const reposMap = {};
    for (const r of reposData) {
        reposMap[r.name] = r;
    }

    // 1. Featured Projects
    console.log('Rendering Featured Projects...');
    let featuredMarkdown = '';
    for (const category of config.categories) {
        for (const rConf of category.repos) {
            if (rConf.featured) {
                const rData = reposMap[rConf.name];
                if (rData) {
                    const techBadges = (rData.topics || []).slice(0, 4).map(t => {
                        const safeTopic = t.replace(/-/g, '--');
                        return `![${t}](https://img.shields.io/badge/${encodeURIComponent(safeTopic)}-1572B6?style=flat-square)`;
                    }).join(' ');

                    featuredMarkdown += `### 🌟 [${rData.name}](https://github.com/${USERNAME}/${rData.name})\n\n`;
                    featuredMarkdown += `> ${rData.description || 'No description provided.'}\n\n`;
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
        return (new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24);
    };

    for (const category of config.categories) {
        sectionsMarkdown += `## ${category.title}\n`;
        sectionsMarkdown += `*${category.description}*\n\n`;
        sectionsMarkdown += `| Project | Description | Technologies | Status | Links |\n`;
        sectionsMarkdown += `| :--- | :--- | :--- | :--- | :--- |\n`;

        // Sort by priority (descending)
        const sortedRepos = [...category.repos].sort((a, b) => b.priority - a.priority);

        for (const rConf of sortedRepos) {
            const rData = reposMap[rConf.name];
            if (rData) {
                let statusText = rConf.featured ? '**Featured** ⭐' : '**Active** 🚀';
                
                // Auto-archive logic based on inactivity
                if (daysSince(rData.updated_at) > 365) {
                    statusText = '**Maintenance** 🛠️';
                }

                // Add notes context
                if (rConf.notes && rConf.notes.includes('Archived')) {
                    statusText = '**Archived** 📦';
                }

                const techBadges = (rData.topics || []).slice(0, 3).map(t => {
                    const safeTopic = t.replace(/-/g, '--');
                    return `![${t}](https://img.shields.io/badge/${encodeURIComponent(safeTopic)}-1572B6?style=flat-square)`;
                }).join(' ');

                let extraHtml = '';
                let extras = [];
                if (rData.stars > 0) extras.push(`⭐ ${rData.stars}`);
                if (rData.updated_at) extras.push(`📅 ${rData.updated_at}`);
                if (extras.length > 0) {
                    extraHtml = `<br><small>${extras.join(' • ')}</small>`;
                }

                const nameCol = `[${rData.name}](https://github.com/${USERNAME}/${rData.name})${extraHtml}`;
                const descCol = (rData.description || 'No description').substring(0, 60) + (rData.description && rData.description.length > 60 ? '...' : '');

                sectionsMarkdown += `| ${nameCol} | ${descCol} | ${techBadges} | ${statusText} | [Repo](https://github.com/${USERNAME}/${rData.name}) |\n`;
            }
        }
        sectionsMarkdown += `\n---\n\n`;
    }
    // Remove the last ---
    sectionsMarkdown = sectionsMarkdown.substring(0, sectionsMarkdown.lastIndexOf('---')).trim();
    template = template.replace('{{ CATEGORY_SECTIONS }}', sectionsMarkdown);


    // 4. Insights
    console.log('Rendering Insights...');
    let insightsMarkdown = '';
    if (insights && insights.suggestions) {
        for (const suggestion of insights.suggestions) {
            insightsMarkdown += `- 💡 ${suggestion}\n`;
        }
        // Add additional logic when Python script expands insights.json
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
    for(let [topic, count] of topTopics) {
        const safeTopic = topic.replace(/-/g, '--');
        techCloudMarkdown += `![](https://img.shields.io/badge/${encodeURIComponent(safeTopic)}-${count}-1572B6?style=flat-square) `;
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
                    msg = `: _"${ev.payload.commits[0].message.split('\n')[0].substring(0, 40)}"_`;
                }
                actionStr = `🚀 Pushed changes to **[${ev.repo.name}](https://github.com/${ev.repo.name})** (${branch})${msg}`;
            } else if (ev.type === 'CreateEvent' && ev.payload.ref_type === 'repository') {
                actionStr = `🎉 Created new repository **[${ev.repo.name}](https://github.com/${ev.repo.name})**`;
            } else if (ev.type === 'ReleaseEvent') {
                actionStr = `📦 Released **${ev.payload.release.tag_name}** in **[${ev.repo.name}](https://github.com/${ev.repo.name})**`;
            } else if (ev.type === 'IssuesEvent' && ev.payload.action === 'opened') {
                actionStr = `🐛 Opened issue in **[${ev.repo.name}](https://github.com/${ev.repo.name})**: _${ev.payload.issue.title}_`;
            } else {
                continue;
            }
            
            activityMarkdown += `- **${dateStr}** — ${actionStr}\n`;
            eventCount++;
        }
    } catch(err) {
        console.error('Failed to fetch events: ', err);
    }
    
    if (activityMarkdown === '') {
        activityMarkdown = '_No recent prominent activity in the last 90 days._\n';
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
