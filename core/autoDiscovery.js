const fs = require('fs');
const path = require('path');

const GITHUB_API_URL = 'https://api.github.com/';
const USERNAME = 'ALEVOLDON';
const REPOS_PATH = path.join(__dirname, '../data/repos.json');
const INSIGHTS_PATH = path.join(__dirname, '../data/insights.json');

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

async function fetchJSON(endpoint, options = {}) {
    const res = await fetch(GITHUB_API_URL + endpoint, { 
        ...options,
        headers: { ...getHeaders(), ...options.headers } 
    });
    if (!res.ok) {
        // Silently handle 404/403 for individual issues if needed, but for now throw
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

async function runAutoDiscovery() {
    if (!fs.existsSync(REPOS_PATH) || !fs.existsSync(INSIGHTS_PATH)) {
        console.error('Missing data/repos.json or data/insights.json');
        return;
    }

    const reposData = JSON.parse(fs.readFileSync(REPOS_PATH, 'utf8'));
    const insightsData = JSON.parse(fs.readFileSync(INSIGHTS_PATH, 'utf8'));
    
    const configPath = path.join(__dirname, '../config/projects.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    const metricsMap = {};
    for (const m of (insightsData.repo_metrics || [])) {
        metricsMap[m.repo] = m;
    }

    let existingIssues = [];
    try {
        if (process.env.GITHUB_ACTIONS && process.env.GITHUB_TOKEN) {
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
                await closeIssue(existingIssue.number).catch(err => console.error(`Failed to close issue: ${err.message}`));
            }
            continue;
        }
        
        if (repo.fork || repo.name === 'ALEVOLDON' || repo.name === 'index') {
            // Close existing issues for forks/self/index
            if (existingIssue) {
                console.log(`Closing auto-discovery issue for ${repo.name} (fork/self/index).`);
                await closeIssue(existingIssue.number).catch(err => console.error(`Failed to close issue: ${err.message}`));
            }
            continue;
        }

        const metrics = metricsMap[repo.name] || {};
        
        // If it's a healthy project, auto-add it to the config with proper category
        if (metrics.health_score >= 0.7 && repo.topics && repo.topics.length > 0) {
            const categoryId = suggest_category(repo.topics) || 'archive';
            
            const targetCategory = config.categories.find(c => c.id === categoryId);
            
            if (targetCategory) {
                // Check if not already added
                if (!targetCategory.repos.find(r => r.name === repo.name)) {
                    console.log(`Auto-adding ${repo.name} to config/projects.json under ${categoryId}...`);
                    targetCategory.repos.push({
                        name: repo.name,
                        featured: false,
                        priority: 1,
                        notes: "Auto-discovered",
                        custom_description: repo.description || 'No description provided.',
                        custom_badges: ""
                    });
                    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
                    repo.tracked = true;
                    // Mark as tracked in reposData for this run
                }
            } else {
                console.log(`Warning: Category ${categoryId} not found for ${repo.name}`);
            }
        } else if (metrics.health_score >= 0.7 && (!repo.topics || repo.topics.length === 0)) {
            // Healthy but no topics - use description-based categorization
            const desc = (repo.description || '').toLowerCase();
            const categoryId = infer_category_from_description(desc) || 'archive';
            const targetCategory = config.categories.find(c => c.id === categoryId);
            
            if (targetCategory && !targetCategory.repos.find(r => r.name === repo.name)) {
                console.log(`Auto-adding ${repo.name} to config/projects.json under ${categoryId} (description-based)...`);
                targetCategory.repos.push({
                    name: repo.name,
                    featured: false,
                    priority: 1,
                    notes: "Auto-discovered (no topics)",
                    custom_description: repo.description || 'No description provided.',
                    custom_badges: ""
                });
                fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
                repo.tracked = true;
            }
        }
        
        // Clean up any existing auto-discovery issues for this repo
        if (existingIssue) {
            // Only close if repo is now tracked OR if it's been more than 180 days
            if (repo.tracked || (metrics.days_inactive && metrics.days_inactive > 180)) {
                console.log(`Closing existing auto-discovery issue for ${repo.name}...`);
                await closeIssue(existingIssue.number).catch(err => console.error(`Failed to close issue: ${err.message}`));
            }
        }
    }
    
    // Save updated repos data
    fs.writeFileSync(REPOS_PATH, JSON.stringify(reposData, null, 2), 'utf8');
}

function suggest_category(topics) {
    const topics_set = new Set(topics);
    
    const category_topics = {
        "ai": [
            "ai", "machine-learning", "openai", "llm", "local-llm", "automation",
            "telegram", "telegram-api-integration", "telegram-bot-ai-assistant",
            "obsidian", "obsidian-plugin", "knowledge-management", "pkm",
            "chatbot", "community-management"
        ],
        "music": [
            "music", "audio", "music-technology", "generative-music",
            "experimental-music", "sound-design", "ableton-live", "vcv-rack",
            "audiovisual", "modular-synthesis"
        ],
        "frontend": [
            "react", "frontend", "web", "webdev", "javascript", "typescript",
            "nodejs", "astro", "vite", "html5", "css3", "pwa"
        ],
        "creative": [
            "3d", "threejs", "three.js", "blender", "generative-art",
            "creative-coding", "phaser", "gamedev", "browsergame", "indie-game",
            "mobilegame", "procedural", "geometry-nodes"
        ]
    };

    for (const [category, markers] of Object.entries(category_topics)) {
        for (const m of markers) {
            if (topics_set.has(m)) {
                return category;
            }
        }
    }
    return "archive";
}

function infer_category_from_description(desc) {
    const patterns = {
        "ai": ["ai", "bot", "chat", "neural", "gpt", "openai", "ollama", "llm", "assistant", "automation", "telegram"],
        "music": ["music", "audio", "synthesizer", "daw", "melody", "sound", "beat", "chord", "oscillator", "midi"],
        "frontend": ["web", "site", "portfolio", "landing", "ui", "frontend", "react", "vite", "astro", "dashboard"],
        "creative": ["3d", "three.js", "blender", "game", "creative", "generative", "procedural", "shader", "canvas"],
        "productivity": ["habit", "tracker", "productivity", "tool", "utility", "monitor", "map", "water"]
    };
    
    for (const [cat, pats] of Object.entries(patterns)) {
        for (const p of pats) {
            if (desc.includes(p)) return cat;
        }
    }
    return null;
}

runAutoDiscovery().catch(err => {
    console.error('Auto-discovery failed:', err);
    process.exit(1);
});