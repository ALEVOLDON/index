const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config', 'projects.json');
const REPOS_PATH = path.join(ROOT, 'data', 'repos.json');
const INSIGHTS_PATH = path.join(ROOT, 'data', 'insights.json');

function readJSON(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        throw new Error(`Invalid JSON in ${path.relative(ROOT, filePath)}: ${err.message}`);
    }
}

function validate() {
    const config = readJSON(CONFIG_PATH);
    const repos = readJSON(REPOS_PATH);
    readJSON(INSIGHTS_PATH);

    const errors = [];
    const repoNames = new Set(repos.map(repo => repo.name));
    const configuredRepos = new Map();

    if (!Array.isArray(config.categories)) {
        errors.push('config/projects.json must contain a categories array.');
    }

    for (const category of config.categories || []) {
        if (!category.id) {
            errors.push('Every category must have an id.');
            continue;
        }

        if (!Array.isArray(category.repos)) {
            errors.push(`Category "${category.id}" must contain a repos array.`);
            continue;
        }

        for (const repo of category.repos) {
            if (!repo.name) {
                errors.push(`Category "${category.id}" contains a repo without a name.`);
                continue;
            }

            if (!repoNames.has(repo.name)) {
                errors.push(`Configured repo "${repo.name}" in category "${category.id}" is missing from data/repos.json.`);
            }

            if (configuredRepos.has(repo.name)) {
                errors.push(`Duplicate configured repo "${repo.name}" in categories "${configuredRepos.get(repo.name)}" and "${category.id}".`);
            } else {
                configuredRepos.set(repo.name, category.id);
            }
        }
    }

    if (errors.length > 0) {
        throw new Error(`Validation failed:\n- ${errors.join('\n- ')}`);
    }

    console.log('Validation passed.');
}

try {
    validate();
} catch (err) {
    console.error(err.message);
    process.exit(1);
}
