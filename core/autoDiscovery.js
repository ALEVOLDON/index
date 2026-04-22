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

// Fetch ALL pages of a paginated GitHub API endpoint
async function fetchAllPages(endpoint) {
    const allItems = [];
    let page = 1;
    const separator = endpoint.includes('?') ? '&' : '?';
    while (true) {
        const items = await fetchJSON(`${endpoint}${separator}per_page=100&page=${page}`);
        if (!Array.isArray(items) || items.length === 0) break;
        allItems.push(...items);
        if (items.length < 100) break;
        page++;
    }
    return allItems;
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

async function closeIssue(issueNumber) {
    if (!process.env.GITHUB_ACTIONS || !process.env.GITHUB_TOKEN) {
        console.log(`[Dry Run] Would close issue #${issueNumber}`);
        return;
    }
    
    await fetch(GITHUB_API_URL + `repos/${USERNAME}/index/issues/${issueNumber}`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify({ state: 'closed', state_reason: 'completed' })
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
            // Fetch ALL pages to avoid missing existing issues (default API limit is 30)
            existingIssues = await fetchAllPages(`repos/${USERNAME}/index/issues?state=open&creator=app%2Fgithub-actions`);
            console.log(`Loaded ${existingIssues.length} existing open issues.`);
        }
    } catch (err) {
        console.log('Failed to fetch existing issues: ', err.message);
    }

    for (const repo of reposData) {
        const title = `Auto-Discovery: Add ${repo.name} to README`;
        const existingIssue = existingIssues.find(iss => iss.title === title);

        if (repo.tracked) {
            // If the repo is now tracked, close the issue if it exists!
            if (existingIssue) {
                console.log(`Closing auto-discovery issue for ${repo.name} since it is now tracked.`);
                await closeIssue(existingIssue.number);
            }
        } else if (!repo.fork && repo.name !== 'ALEVOLDON' && repo.name !== 'index') {
            const metrics = metricsMap[repo.name] || {};
            
            // Increased threshold to avoid spamming
            if (metrics.health_score >= 1.0) {
                if (!existingIssue) {
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
            } else {
                // If an issue exists but the repo no longer meets the health score threshold, close it.
                if (existingIssue) {
                    console.log(`Closing auto-discovery issue for ${repo.name} because it does not meet the new health threshold (>= 1.0).`);
                    await closeIssue(existingIssue.number);
                }
            }
        }
    }
}

runAutoDiscovery().catch(err => {
    console.error('Auto-discovery failed:', err);
    process.exit(1);
});
