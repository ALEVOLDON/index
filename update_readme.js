const fs = require('fs');
const path = require('path');

const README_PATH = path.join(__dirname, 'README.md');
const GITHUB_API_URL = 'https://api.github.com/repos/ALEVOLDON/';

async function updateReadme() {
    console.log('Reading README.md...');
    let content = fs.readFileSync(README_PATH, 'utf8');

    // Regex explanation:
    // ^\|                -> matches the starting pipe of the table row
    // \s*\[([^\]]+)\]    -> matches the project name inside brackets [name]
    // \(https:\/\/github\.com\/ALEVOLDON\/([^)]+)\) -> matches the URL and captures repo name
    // (?:<br>\s*<small>[^<]*<\/small>\s*)? -> matches our optionally previously injected stats string
    // \|                 -> matches the closing pipe of the first cell
    const regex = /^\|\s*\[([^\]]+)\]\(https:\/\/github\.com\/ALEVOLDON\/([^)]+)\)(?:<br>\s*<small>[^<]*<\/small>\s*)?\s*\|/gm;

    const reposToFetch = new Set();
    let match;
    while ((match = regex.exec(content)) !== null) {
        reposToFetch.add(match[2]);
    }

    console.log(`Found ${reposToFetch.size} unique repositories in the tables.`);

    const stats = {};
    for (const repo of reposToFetch) {
        console.log(`Fetching stats for ${repo}...`);
        try {
            const headers = { 'User-Agent': 'Node.js README Updater' };
            if (process.env.GITHUB_ACTIONS && process.env.GITHUB_TOKEN) {
                headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
            }
            
            const res = await fetch(GITHUB_API_URL + repo, { headers });
            if (res.ok) {
                const data = await res.json();
                stats[repo] = {
                    stars: data.stargazers_count,
                    updated_at: data.pushed_at ? data.pushed_at.substring(0, 10) : ''
                };
            } else {
                console.warn(`Failed to fetch ${repo}: ${res.statusText}`);
            }
        } catch (error) {
            console.error(`Error fetching ${repo}:`, error.message);
        }
        
        // Minor delay to respect rate limit when running locally without token
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log('Injecting stats into README.md...');
    const updatedContent = content.replace(regex, (fullMatch, name, repo) => {
        if (stats[repo]) {
            const { stars, updated_at } = stats[repo];
            let extras = [];
            if (stars > 0) extras.push(`⭐ ${stars}`);
            if (updated_at) extras.push(`📅 ${updated_at}`);
            
            if (extras.length > 0) {
                return `| [${name}](https://github.com/ALEVOLDON/${repo})<br><small>${extras.join(' | ')}</small> |`;
            }
        }
        return `| [${name}](https://github.com/ALEVOLDON/${repo}) |`;
    });

    if (content !== updatedContent) {
        fs.writeFileSync(README_PATH, updatedContent, 'utf8');
        console.log('README.md updated successfully!');
    } else {
        console.log('No changes detected in README.md.');
    }
}

updateReadme();
