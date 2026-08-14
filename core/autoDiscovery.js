const fs = require('fs');
const path = require('path');

const GITHUB_API_URL = 'https://api.github.com/';
const USERNAME = 'ALEVOLDON';
const REPOS_PATH = path.join(__dirname, '../data/repos.json');
const INSIGHTS_PATH = path.join(__dirname, '../data/insights.json');
const CONFIG_PATH = path.join(__dirname, '../config/projects.json');
const INTELLIGENCE_PATH = path.join(__dirname, '../config/intelligence.json');

function getHeaders() {
    const headers = { 
        'User-Agent': 'Node.js README Updater',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    };
    if (process.env.GITHUB_ACTIONS && process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim() !== '') {
        headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    return headers;
}

async function fetchJSON(endpoint, options = {}) {
    const res = await fetch(GITHUB_API_URL + endpoint, { 
        ...options,
        headers: { ...getHeaders(), ...options.headers } 
    });
    if (!res.ok) {
        throw new Error(`Failed to fetch ${endpoint}: ${res.statusText}`);
    }
    return res.json();
}

async function fetchAllPages(endpoint) {
    let all = [];
    let page = 1;
    const separator = endpoint.includes('?') ? '&' : '?';
    while (true) {
        const data = await fetchJSON(`${endpoint}${separator}per_page=100&page=${page}`);
        if (!Array.isArray(data) || data.length === 0) break;
        all.push(...data);
        if (data.length < 100) break;
        page++;
    }
    return all;
}

async function closeIssue(issueNumber) {
    return fetchJSON(`repos/${USERNAME}/index/issues/${issueNumber}`, {
        method: 'PATCH',
        body: JSON.stringify({ state: 'closed' })
    });
}

function matchKeyword(kw, text) {
    if (!kw || !text) return false;
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?:^|[\\s_\\-/,.;:()[\\]{}!?'"<>+=*~\`#|\\\\])${escaped}(?:$|[\\s_\\-/,.;:()[\\]{}!?'"<>+=*~\`#|\\\\])`, 'i');
    return pattern.test(text);
}

function inferCategory(repo, intelCfg) {
    const categoryDefs = (intelCfg && intelCfg.category_definitions) ? intelCfg.category_definitions : {};
    const topics = new Set((repo.topics || []).map(t => t.toLowerCase()));
    const nameTokens = (repo.name || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ');
    const combinedText = `${nameTokens} ${repo.description || ''}`;
    const lang = (repo.language || '').toLowerCase();

    const scores = {};
    for (const [catId, catDef] of Object.entries(categoryDefs)) {
        let score = 0;
        const catTopics = new Set((catDef.topics || []).map(t => t.toLowerCase()));
        for (const t of topics) {
            if (catTopics.has(t)) score += 2;
        }
        for (const kw of (catDef.keywords || [])) {
            if (matchKeyword(kw, combinedText)) score += 1;
        }
        const catLangs = (catDef.languages || []).map(l => l.toLowerCase());
        if (lang && catLangs.includes(lang)) score += 1.5;

        if (score > 0) scores[catId] = score;
    }

    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted[0][0] : 'archive';
}

async function runAutoDiscovery() {
    if (!fs.existsSync(REPOS_PATH) || !fs.existsSync(INSIGHTS_PATH)) {
        console.error('Missing data/repos.json or data/insights.json');
        return;
    }

    const reposData = JSON.parse(fs.readFileSync(REPOS_PATH, 'utf8'));
    const insightsData = JSON.parse(fs.readFileSync(INSIGHTS_PATH, 'utf8'));
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    
    let intelCfg = {};
    let thresholds = { auto_discovery_health: 0.45, auto_discovery_momentum: 0.50 };
    if (fs.existsSync(INTELLIGENCE_PATH)) {
        try {
            intelCfg = JSON.parse(fs.readFileSync(INTELLIGENCE_PATH, 'utf8'));
            if (intelCfg.thresholds) thresholds = intelCfg.thresholds;
        } catch (e) {}
    }

    const metricsMap = {};
    for (const m of (insightsData.repo_metrics || [])) {
        metricsMap[m.repo] = m;
    }

    let existingIssues = [];
    try {
        if (process.env.GITHUB_ACTIONS && process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim() !== '') {
            existingIssues = await fetchAllPages(`repos/${USERNAME}/index/issues?state=open&creator=app%2Fgithub-actions`);
            console.log(`Loaded ${existingIssues.length} existing open issues.`);
        }
    } catch (err) {
        console.log('Failed to fetch existing issues: ', err.message);
    }

    let configModified = false;
    let reposModified = false;

    for (const repo of reposData) {
        const title = `Auto-Discovery: Add ${repo.name} to README`;
        const existingIssue = existingIssues.find(iss => iss.title === title);

        if (repo.tracked) {
            if (existingIssue) {
                console.log(`Closing auto-discovery issue for ${repo.name} since it is now tracked.`);
                await closeIssue(existingIssue.number).catch(err => console.error(`Failed to close issue: ${err.message}`));
            }
            continue;
        }
        
        if (repo.fork || repo.archived || repo.name === 'ALEVOLDON' || repo.name === 'index') {
            if (existingIssue) {
                console.log(`Closing auto-discovery issue for ${repo.name} (fork/archived/self/index).`);
                await closeIssue(existingIssue.number).catch(err => console.error(`Failed to close issue: ${err.message}`));
            }
            continue;
        }

        const metrics = metricsMap[repo.name] || {};
        
        // Logic to decide if we should add the repo
        let shouldAdd = false;
        let categoryId = null;
        let note = "";

        const healthThreshold = thresholds.auto_discovery_health || 0.45;
        const momentumThreshold = thresholds.auto_discovery_momentum || 0.50;

        if ((metrics.health_score !== undefined && metrics.health_score >= healthThreshold) ||
            (metrics.momentum_score !== undefined && metrics.momentum_score >= momentumThreshold) ||
            (metrics.days_inactive !== undefined && metrics.days_inactive <= 180 && repo.description)) {
            
            categoryId = metrics.primary_category || inferCategory(repo, intelCfg);
            shouldAdd = true;
            note = repo.topics && repo.topics.length > 0 ? "Auto-discovered" : "Auto-discovered (description-based)";
        }

        if (shouldAdd && categoryId) {
            const targetCategory = config.categories.find(c => c.id === categoryId);
            if (targetCategory) {
                if (!targetCategory.repos.find(r => r.name === repo.name)) {
                    console.log(`Auto-adding ${repo.name} to config/projects.json under ${categoryId}...`);
                    targetCategory.repos.push({
                        name: repo.name,
                        featured: false,
                        priority: 1,
                        notes: note,
                        custom_description: repo.description || 'No description provided.',
                        custom_badges: ""
                    });
                    configModified = true;
                    repo.tracked = true;
                    reposModified = true;
                }
            }
        }
        
        if (existingIssue && (repo.tracked || (metrics.days_inactive && metrics.days_inactive > 180))) {
            console.log(`Closing existing auto-discovery issue for ${repo.name}...`);
            await closeIssue(existingIssue.number).catch(err => console.error(`Failed to close issue: ${err.message}`));
        }
    }
    
    if (configModified) {
        console.log('Writing updated config/projects.json...');
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    }
    
    if (reposModified) {
        console.log('Writing updated data/repos.json...');
        fs.writeFileSync(REPOS_PATH, JSON.stringify(reposData, null, 2), 'utf8');
    }
}

runAutoDiscovery().catch(err => {
    console.error('Auto-discovery failed:', err);
    process.exit(1);
});