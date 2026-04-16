const fs = require('fs');
const path = require('path');

const GITHUB_API_URL = 'https://api.github.com/';
const USERNAME = 'ALEVOLDON';

const DATA_DIR = path.join(__dirname, '../data');
const REPOS_PATH = path.join(DATA_DIR, 'repos.json');
const INSIGHTS_PATH = path.join(DATA_DIR, 'insights.json');

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

async function postIssue(title, body) {
    if (!process.env.GITHUB_ACTIONS || !process.env.GITHUB_TOKEN) {
        console.log(`[Dry Run] Would create issue: ${title}`);
        return;
    }
    
    await fetch(GITHUB_API_URL + `repos/${USERNAME}/index/issues`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ title, body })
    });
}

async function runAutoDiscovery() {
    if (!fs.existsSync(REPOS_PATH) || !fs.existsSync(INSIGHTS_PATH)) {
        console.error('Missing data/repos.json or data/insights.json');
        return;
    }

    const reposData = JSON.parse(fs.readFileSync(REPOS_PATH, 'utf8'));
    const insightsData = JSON.parse(fs.readFileSync(INSIGHTS_PATH, 'utf8'));
    
    const metricsMap = {};
    for (const m of (insightsData.repo_metrics || [])) {
        metricsMap[m.repo] = m;
    }

    let existingIssues = [];
    try {
        if (process.env.GITHUB_ACTIONS && process.env.GITHUB_TOKEN) {
            existingIssues = await fetchJSON(`repos/${USERNAME}/index/issues?state=open&creator=app/github-actions`);
        }
    } catch (err) {
        console.log('Failed to fetch existing issues: ', err.message);
    }

    for (const repo of reposData) {
        // Find untracked repositories that are not forks
        if (!repo.tracked && !repo.fork && repo.name !== 'ALEVOLDON' && repo.name !== 'index') {
            const metrics = metricsMap[repo.name] || {};
            
            // Basic threshold for health_score to avoid spamming empty repos
            if (metrics.health_score >= 0.5) {
                const title = `Auto-Discovery: Add ${repo.name} to README`;
                const exists = existingIssues.some(iss => iss.title === title);
                
                if (!exists) {
                    console.log(`Creating issue for ${repo.name}...`);
                    const body = `✨ **Auto-Discovery Radar!** ✨

The script discovered a new public repository: **[${repo.name}](https://github.com/${USERNAME}/${repo.name})**.

### 🧠 AI Insights
- **Health Score**: ${metrics.health_score || 'N/A'}
- **Activity Score**: ${metrics.activity_score || 'N/A'}
- **Suggested Category**: \`${metrics.suggested_category || 'archive'}\`

Please review it and consider adding it to \`config/projects.json\` under the appropriate category!`;
                    
                    await postIssue(title, body);
                }
            }
        }
    }
}

runAutoDiscovery().catch(err => {
    console.error('Auto-discovery failed:', err);
    process.exit(1);
});
