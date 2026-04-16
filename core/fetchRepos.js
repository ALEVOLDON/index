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
    while(true) {
        const reposPage = await fetchJSON(`users/${USERNAME}/repos?per_page=100&page=${page}&type=public`);
        if (reposPage.length === 0) break;
        allRepos.push(...reposPage);
        if (reposPage.length < 100) break;
        page++;
    }
    console.log(`Fetched ${allRepos.length} public repositories from GitHub.`);

    const reposData = [];

    for (const repo of allRepos) {
        const isTracked = !!repoCategories[repo.name];
        
        reposData.push({
            name: repo.name,
            stars: repo.stargazers_count,
            updated_at: repo.pushed_at ? repo.pushed_at.substring(0, 10) : '',
            topics: repo.topics || [],
            tracked: isTracked,
            category: isTracked ? repoCategories[repo.name] : null,
            fork: repo.fork,
            description: repo.description || ''
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
