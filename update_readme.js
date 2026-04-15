const fs = require('fs');
const path = require('path');

const README_PATH = path.join(__dirname, 'README.md');
const GITHUB_API_URL = 'https://api.github.com/';
const USERNAME = 'ALEVOLDON';

// Headers ensuring topics are fetched and API access is authenticated via Action token
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

// Helper to fetch JSON from GitHub API safely
async function fetchJSON(endpoint) {
    const res = await fetch(GITHUB_API_URL + endpoint, { headers: getHeaders() });
    if (!res.ok) {
        throw new Error(`Failed to fetch ${endpoint}: ${res.statusText}`);
    }
    return res.json();
}

async function updateReadme() {
    console.log('Reading README.md...');
    let content = fs.readFileSync(README_PATH, 'utf8');

    // 1. Parse existing repos from README to track what we already display
    const trackedRepos = new Set();
    const regex = /\|\s*\[([^\]]+)\]\(https:\/\/github\.com\/ALEVOLDON\/([^)]+)\)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
        trackedRepos.add(match[2].split(' ')[0]); // Handle possible trailing attributes
    }
    console.log(`Found ${trackedRepos.size} tracked repositories in README.`);

    // 2. Fetch all public repositories to collect stats and topics
    console.log('Fetching all public repositories...');
    const allRepos = [];
    let page = 1;
    while(true) {
        const reposPage = await fetchJSON(`users/${USERNAME}/repos?per_page=100&page=${page}&type=public`);
        if (reposPage.length === 0) break;
        allRepos.push(...reposPage);
        if (reposPage.length < 100) break;
        page++;
    }
    console.log(`Fetched ${allRepos.length} public repositories from GitHub.`);

    const statsMap = {};
    const topicsCount = {};
    const untrackedRepos = [];

    // Process all repos data
    for (const repo of allRepos) {
        statsMap[repo.name] = {
            stars: repo.stargazers_count,
            updated_at: repo.pushed_at ? repo.pushed_at.substring(0, 10) : '',
            topics: repo.topics || []
        };
        
        for (const topic of (repo.topics || [])) {
            topicsCount[topic] = (topicsCount[topic] || 0) + 1;
        }

        // Radar: If repo isn't listed and isn't a fork, flag it
        if (!trackedRepos.has(repo.name) && !repo.fork && repo.name !== 'ALEVOLDON' && repo.name !== 'index') {
            untrackedRepos.push(repo.name);
        }
    }

    // 3. Auto-Discovery Issue Creation
    if (process.env.GITHUB_ACTIONS && process.env.GITHUB_TOKEN) {
        console.log(`Found ${untrackedRepos.length} untracked repositories.`);
        for (const rName of untrackedRepos) {
            console.log(`Checking if issue exists for new repo: ${rName}...`);
            try {
                // Ensure the username query accurately finds issues created by github-actions
                const issues = await fetchJSON(`repos/${USERNAME}/index/issues?state=open&creator=app/github-actions`);
                const title = `Auto-Discovery: Add ${rName} to README`;
                const exists = issues.some(iss => iss.title === title);
                
                if (!exists) {
                    console.log(`Creating issue for ${rName}...`);
                    await fetch(GITHUB_API_URL + `repos/${USERNAME}/index/issues`, {
                        method: 'POST',
                        headers: getHeaders(),
                        body: JSON.stringify({
                            title: title,
                            body: `✨ **Auto-Discovery Radar!** ✨\n\nThe script discovered a new public repository: **[${rName}](https://github.com/${USERNAME}/${rName})**.\n\nPlease review it and consider adding it to the \`README.md\` master catalog under an appropriate category!`
                        })
                    });
                } else {
                    console.log(`Issue already exists for ${rName}.`);
                }
            } catch (err) {
                console.error(`Failed to handle issues for ${rName}`, err);
            }
        }
    }

    // 4. Update Repo Tables & Auto-Archiving
    console.log('Injecting stats and auto-archiving...');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (line.trim().startsWith('|') && line.includes(`https://github.com/${USERNAME}/`)) {
            const rMatch = line.match(/\|\s*\[([^\]]+)\]\(https:\/\/github\.com\/ALEVOLDON\/([^)]+)\)/);
            if (rMatch) {
                const name = rMatch[1];
                let repoFull = rMatch[2]; // Might have space or extra if parsed badly
                const repo = repoFull.split(' ')[0].split('"')[0].split('<')[0]; // Clean out injected HTML leftovers
                const rStats = statsMap[repo];
                
                if (rStats) {
                    let parts = line.split('|');
                    if (parts.length >= 6) {
                        // FORMATTING STATS (avoiding '|' chars so the table doesn't break!)
                        let extras = [];
                        if (rStats.stars > 0) extras.push(`⭐ ${rStats.stars}`);
                        if (rStats.updated_at) extras.push(`📅 ${rStats.updated_at}`);
                        let extraHtml = extras.length > 0 ? `<br><small>${extras.join(' • ')}</small> ` : '';
                        
                        parts[1] = ` [${name}](https://github.com/${USERNAME}/${repo})${extraHtml}`;

                        // FORMATTING STATUS & AUTO-ARCHIVING (Column index 4)
                        let statusText = parts[4];
                        const daysSincePush = (new Date() - new Date(rStats.updated_at)) / (1000 * 60 * 60 * 24);
                        
                        if (daysSincePush > 365 && statusText.includes('**Active**')) {
                            console.log(`Auto-archiving ${repo} (inactive for ${Math.round(daysSincePush)} days)`);
                            parts[4] = statusText.replace(/\*\*Active\*\*(?:\s*[^\s]+)?/, '**Maintenance** 🛠️');
                        }
                        
                        lines[i] = parts.join('|');
                    }
                }
            }
        }
    }
    content = lines.join('\n');

    // 5. Tech Cloud Generation
    console.log('Generating Tech Cloud...');
    const sortedTopics = Object.entries(topicsCount).sort((a,b) => b[1] - a[1]);
    const topTopics = sortedTopics.slice(0, 20); // Top 20 skills
    
    let techCloudMarkdown = '<div align="center">\n\n';
    for(let [topic, count] of topTopics) {
        // Render badges dynamically
        techCloudMarkdown += `![](https://img.shields.io/badge/${encodeURIComponent(topic)}-${count}-1572B6?style=flat-square) `;
    }
    techCloudMarkdown += '\n\n</div>';
    
    content = content.replace(
        /<!-- TOP_SKILLS_START -->[\s\S]*?<!-- TOP_SKILLS_END -->/,
        `<!-- TOP_SKILLS_START -->\n${techCloudMarkdown}\n<!-- TOP_SKILLS_END -->`
    );

    // 6. Recent Activity Stream
    console.log('Fetching recent activity...');
    const events = await fetchJSON(`users/${USERNAME}/events/public?per_page=30`);
    let activityMarkdown = '';
    let eventCount = 0;
    
    for (const ev of events) {
        if (eventCount >= 5) break; 
        
        const dateStr = new Date(ev.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        let actionStr = '';
        if (ev.type === 'PushEvent') {
            const msg = ev.payload.commits && ev.payload.commits.length > 0 ? ev.payload.commits[0].message.split('\n')[0] : 'Pushed commits';
            actionStr = `🚀 Pushed to **[${ev.repo.name}](https://github.com/${ev.repo.name})**: _"${msg}"_`;
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
    
    if (activityMarkdown === '') {
        activityMarkdown = '_No recent prominent activity in the last 90 days._\n';
    }

    content = content.replace(
        /<!-- RECENT_ACTIVITY_START -->[\s\S]*?<!-- RECENT_ACTIVITY_END -->/,
        `<!-- RECENT_ACTIVITY_START -->\n${activityMarkdown}\n<!-- RECENT_ACTIVITY_END -->`
    );

    // Write back to file
    if (fs.readFileSync(README_PATH, 'utf8') !== content) {
        fs.writeFileSync(README_PATH, content, 'utf8');
        console.log('README.md successfully updated!');
    } else {
        console.log('No changes needed in README.md.');
    }
}

updateReadme().catch(err => {
    console.error('Action failed:', err);
    process.exit(1);
});
