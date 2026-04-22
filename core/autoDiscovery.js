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

// Removed postIssue function

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
            
            // If it's a healthy project, auto-add it to the config!
            if (metrics.health_score >= 1.0) {
                console.log(`Auto-adding ${repo.name} to config/projects.json...`);
                
                const configPath = path.join(__dirname, '../config/projects.json');
                const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                
                const categoryId = metrics.suggested_category || 'archive';
                let targetCategory = config.categories.find(c => c.id === categoryId);
                
                // Fallback to archive if suggested category doesn't exist
                if (!targetCategory) {
                    targetCategory = config.categories.find(c => c.id === 'archive');
                }
                
                if (targetCategory) {
                    // Check if not already added
                    if (!targetCategory.repos.find(r => r.name === repo.name)) {
                        targetCategory.repos.push({
                            name: repo.name,
                            featured: false,
                            priority: 1, // lowest priority initially
                            notes: "Auto-discovered"
                        });
                        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
                        repo.tracked = true; // Mark as tracked so we close existing issues if any
                    }
                }
            }
            
            // Clean up any existing auto-discovery issues for this repo (either we added it, or it doesn't meet the threshold)
            if (existingIssue) {
                console.log(`Closing existing auto-discovery issue for ${repo.name}...`);
                await closeIssue(existingIssue.number);
            }
        }
    }
}

runAutoDiscovery().catch(err => {
    console.error('Auto-discovery failed:', err);
    process.exit(1);
});
