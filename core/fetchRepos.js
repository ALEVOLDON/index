const fs = require('fs');
const path = require('path');

const GITHUB_API_URL = 'https://api.github.com/';
const USERNAME = 'ALEVOLDON';

const CONFIG_PATH = path.join(__dirname, '../config/projects.json');
const DATA_DIR = path.join(__dirname, '../data');
const OUT_PATH = path.join(DATA_DIR, 'repos.json');

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
    const remaining = res.headers.get('x-ratelimit-remaining');
    if (remaining !== null) {
        console.log(`[GitHub API] Endpoint ${endpoint} - Rate Limit Remaining: ${remaining}`);
    }
    if (!res.ok) {
        throw new Error(`Failed to fetch ${endpoint}: ${res.status} ${res.statusText}`);
    }
    return res.json();
}

async function main() {
    console.log('Reading config...');
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

    // Create a quick lookup map from config
    const repoCategories = {};
    for (const category of config.categories) {
        for (const repo of category.repos) {
            repoCategories[repo.name] = category.id;
        }
    }

    console.log('Fetching all public repositories...');
    const allRepos = [];
    let page = 1;
    while (true) {
        const reposPage = await fetchJSON(`users/${USERNAME}/repos?per_page=100&page=${page}&type=public`);
        if (!Array.isArray(reposPage) || reposPage.length === 0) break;
        allRepos.push(...reposPage);
        if (reposPage.length < 100) break;
        page++;
    }
    console.log(`Fetched ${allRepos.length} public repositories from GitHub.`);
    
    // Fetch topics only if missing from repo object
    for (const repo of allRepos) {
        if (repo.topics === undefined) {
            try {
                const topicsData = await fetchJSON(`repos/${USERNAME}/${repo.name}/topics`);
                repo.topics = topicsData.names || topicsData || [];
            } catch (err) {
                repo.topics = [];
            }
        }
    }

    const reposData = [];

    for (const repo of allRepos) {
        const isTracked = !!repoCategories[repo.name];
        
        reposData.push({
            name: repo.name,
            stars: repo.stargazers_count || 0,
            updated_at: repo.pushed_at ? repo.pushed_at.substring(0, 10) : (repo.updated_at ? repo.updated_at.substring(0, 10) : ''),
            topics: Array.isArray(repo.topics) ? repo.topics : [],
            tracked: isTracked,
            category: isTracked ? repoCategories[repo.name] : null,
            fork: !!repo.fork,
            description: repo.description || '',
            language: repo.language || '',
            license: repo.license ? (repo.license.spdx_id || repo.license.key || repo.license.name || '') : '',
            forks_count: repo.forks_count || 0,
            open_issues_count: repo.open_issues_count || 0,
            created_at: repo.created_at ? repo.created_at.substring(0, 10) : '',
            homepage: repo.homepage || '',
            size: repo.size || 0,
            archived: !!repo.archived
        });
    }

    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    console.log(`Writing to ${OUT_PATH}...`);
    fs.writeFileSync(OUT_PATH, JSON.stringify(reposData, null, 2), 'utf8');
    console.log('Done.');
}

main().catch(err => {
    console.error('Action failed:', err);
    process.exit(1);
});
