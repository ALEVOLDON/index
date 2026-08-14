import json
import os
import re
from datetime import datetime
from collections import Counter

DATA_PATH = os.path.join(os.path.dirname(__file__), "../data/repos.json")
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "../data/insights.json")
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "../config/projects.json")
INTELLIGENCE_PATH = os.path.join(os.path.dirname(__file__), "../config/intelligence.json")

DEFAULT_INTELLIGENCE = {
    "version": "2.0",
    "scoring_weights": {
        "health": {
            "has_description": 0.15,
            "has_topics": 0.10,
            "topic_richness": 0.05,
            "has_license": 0.10,
            "has_stars": 0.10,
            "has_forks": 0.05,
            "has_language": 0.10,
            "non_empty_size": 0.10,
            "has_homepage": 0.05,
            "recent_push_bonus": 0.20,
            "archived_penalty": 0.40
        },
        "activity": {
            "days_7": 1.0,
            "days_30": 0.85,
            "days_90": 0.70,
            "days_180": 0.45,
            "days_365": 0.20
        },
        "momentum": {
            "activity_weight": 0.40,
            "recency_boost": 0.30,
            "revival_boost": 0.15,
            "engagement_weight": 0.15
        },
        "recommendation": {
            "health_weight": 0.35,
            "activity_weight": 0.25,
            "momentum_weight": 0.25,
            "stars_weight": 0.15
        }
    },
    "thresholds": {
        "auto_discovery_health": 0.45,
        "auto_discovery_momentum": 0.50,
        "rising_momentum_min": 0.55,
        "rising_activity_min": 0.40,
        "featured_recommendation_min": 0.65,
        "neglected_days": 365
    },
    "category_definitions": {
        "ai": {
            "topics": [
                "ai", "machine-learning", "openai", "llm", "local-llm", "chatgpt", "deep-learning",
                "neural-network", "nlp", "computer-vision", "knowledge-management", "pkm", "obsidian",
                "obsidian-plugin", "rag", "semantic-search", "vector-database", "embeddings",
                "prompt-engineering", "automation", "telegram-bot-ai-assistant", "chatbot",
                "community-management", "mcp", "agents", "autonomous-agents", "pydanticai",
                "langchain", "ollama", "claude", "gemini"
            ],
            "keywords": [
                "gpt", "openai", "ollama", "llm", "language model", "neural", "deep learning",
                "machine learning", "ml", "chatbot", "embedding", "embeddings", "vector database",
                "vector search", "semantic search", "nlp", "transformer", "assistant", "ai bot",
                "bot", "bot assistant", "mcp", "agent", "agents", "pydanticai", "prompt engineering",
                "claude", "gemini"
            ],
            "languages": ["python", "jupyter notebook"]
        },
        "music": {
            "topics": [
                "music", "audio", "music-technology", "generative-music", "experimental-music",
                "sound-design", "ableton-live", "vcv-rack", "audiovisual", "modular-synthesis",
                "synthesizer", "midi", "daw", "web-audio", "sound", "eurorack", "synthesizers",
                "bandcamp", "soundcloud", "max-msp", "supercollider", "dsp", "audio-processing"
            ],
            "keywords": [
                "synthesizer", "synth", "daw", "melody", "sound design", "audio", "music technology",
                "modular", "vcv rack", "ableton", "oscillator", "midi", "chord", "beat", "drum",
                "bass", "sound", "web audio", "eurorack", "sound tracker", "playlist", "soundcloud",
                "bandcamp", "dsp"
            ],
            "languages": ["c++", "max", "supercollider", "faust"]
        },
        "frontend": {
            "topics": [
                "react", "frontend", "web", "webdev", "javascript", "typescript", "nodejs",
                "astro", "vite", "html5", "css3", "pwa", "nextjs", "vue", "svelte",
                "tailwindcss", "tailwind", "sass", "scss", "web-app", "portfolio", "landing-page"
            ],
            "keywords": [
                "react", "frontend", "ui", "vite", "astro", "vue", "svelte", "angular",
                "next.js", "nextjs", "nuxt", "web app", "dashboard", "portfolio", "landing",
                "website", "web", "html5", "css3", "sass", "tailwind", "pwa"
            ],
            "languages": ["typescript", "javascript", "html", "css"]
        },
        "creative": {
            "topics": [
                "3d", "threejs", "three.js", "blender", "generative-art", "creative-coding",
                "phaser", "gamedev", "browsergame", "indie-game", "mobilegame", "procedural",
                "geometry-nodes", "webgl", "canvas", "shaders", "glsl", "p5js", "animation", "game"
            ],
            "keywords": [
                "three.js", "threejs", "blender", "game", "creative", "generative",
                "procedural", "shader", "shaders", "canvas", "webgl", "glsl", "music visual",
                "visualizer", "arcade", "scrolling", "shooter", "pwa game", "creative coding",
                "generative art", "p5.js", "p5js"
            ],
            "languages": ["glsl", "c#", "gdscript"]
        },
        "productivity": {
            "topics": [
                "productivity", "tool", "utility", "habit-tracker", "organizer", "planner",
                "cli", "workflow", "automation", "dashboard", "management", "control-panel", "launcher"
            ],
            "keywords": [
                "habit tracker", "habit", "productivity", "tool", "tools", "utility",
                "monitor", "water map", "tracking", "organizer", "planner", "calendar",
                "task manager", "cli", "control panel", "launcher", "workflow"
            ],
            "languages": ["shell", "python", "go", "rust"]
        }
    }
}

def load_json(path, default=None):
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default

def days_since(date_str):
    if not date_str:
        return 9999
    try:
        dt = datetime.strptime(date_str[:10], "%Y-%m-%d")
        return max(0, (datetime.now() - dt).days)
    except (ValueError, TypeError):
        return 9999

def match_keyword(kw, text):
    """
    Safely matches a keyword with delimiter / word boundary checks
    to prevent false positives like 'ml' in 'html5' or 'cli' in 'click'.
    """
    if not kw or not text:
        return False
    kw_clean = kw.strip().lower()
    text_clean = text.lower()
    
    # Delimiter-aware boundary regex matching
    pattern = r'(?:^|[\s_\-/,.;:()[\]{}!?\'"<>+=*~`#|\\])' + re.escape(kw_clean) + r'(?:$|[\s_\-/,.;:()[\]{}!?\'"<>+=*~`#|\\])'
    return bool(re.search(pattern, text_clean))

def analyze_topics(repos):
    topic_counter = Counter()
    for r in repos:
        for t in r.get("topics", []):
            topic_counter[t] += 1
    return [t[0] for t in topic_counter.most_common(20)]

def calculate_activity_score(days_inactive, weights):
    if days_inactive <= 7:
        return weights.get("days_7", 1.0)
    elif days_inactive <= 30:
        return weights.get("days_30", 0.85)
    elif days_inactive <= 90:
        return weights.get("days_90", 0.70)
    elif days_inactive <= 180:
        return weights.get("days_180", 0.45)
    elif days_inactive <= 365:
        return weights.get("days_365", 0.20)
    return 0.0

def calculate_health_score(repo, days_inactive, weights):
    score = 0.0
    if repo.get("description"):
        score += weights.get("has_description", 0.15)
    
    topics = repo.get("topics", [])
    if topics and len(topics) > 0:
        score += weights.get("has_topics", 0.10)
        if len(topics) >= 3:
            score += weights.get("topic_richness", 0.05)
            
    if repo.get("license"):
        score += weights.get("has_license", 0.10)
    if repo.get("stars", 0) > 0:
        score += weights.get("has_stars", 0.10)
    if repo.get("forks_count", 0) > 0 or repo.get("forks", 0) > 0:
        score += weights.get("has_forks", 0.05)
    if repo.get("language"):
        score += weights.get("has_language", 0.10)
    if repo.get("size", 0) > 0:
        score += weights.get("non_empty_size", 0.10)
    if repo.get("homepage"):
        score += weights.get("has_homepage", 0.05)
    if days_inactive <= 180:
        score += weights.get("recent_push_bonus", 0.20)

    if repo.get("archived"):
        penalty = weights.get("archived_penalty", 0.40)
        score = max(0.0, score - penalty)

    return max(0.0, min(1.0, score))

def calculate_momentum_score(repo, activity_score, days_inactive, weights):
    if repo.get("archived"):
        return 0.0

    act_weight = weights.get("activity_weight", 0.40)
    rec_weight = weights.get("recency_boost", 0.30)
    rev_weight = weights.get("revival_boost", 0.15)
    eng_weight = weights.get("engagement_weight", 0.15)

    recency_boost = 0.0
    if days_inactive <= 7:
        recency_boost = 1.0
    elif days_inactive <= 30:
        recency_boost = 0.8
    elif days_inactive <= 90:
        recency_boost = 0.5
    elif days_inactive <= 180:
        recency_boost = 0.2

    # Revival Boost: project created > 180 days ago but updated in last 30 days
    created_days = days_since(repo.get("created_at"))
    revival_boost = 0.0
    if created_days > 180 and days_inactive <= 30:
        revival_boost = 1.0
    elif created_days > 180 and days_inactive <= 90:
        revival_boost = 0.5
    elif created_days <= 60 and days_inactive <= 30:
        # Brand new active project boost
        revival_boost = 0.8

    stars = repo.get("stars", 0)
    forks = repo.get("forks_count", 0) or repo.get("forks", 0)
    engagement = min(1.0, (stars * 0.1 + forks * 0.2))

    momentum = (activity_score * act_weight) + (recency_boost * rec_weight) + (revival_boost * rev_weight) + (engagement * eng_weight)
    return max(0.0, min(1.0, momentum))

def calculate_recommendation_score(health_score, activity_score, momentum_score, stars, weights, is_fork=False, is_archived=False):
    if is_fork or is_archived:
        return 0.0

    h_w = weights.get("health_weight", 0.35)
    a_w = weights.get("activity_weight", 0.25)
    m_w = weights.get("momentum_weight", 0.25)
    s_w = weights.get("stars_weight", 0.15)

    star_score = min(1.0, stars / 10.0)
    total = (health_score * h_w) + (activity_score * a_w) + (momentum_score * m_w) + (star_score * s_w)
    return max(0.0, min(1.0, total))

def categorize_repo(repo, intel_cfg, manual_category=None):
    category_defs = intel_cfg.get("category_definitions", {})
    topics = set(t.lower() for t in repo.get("topics", []))
    desc = repo.get("description") or ""
    name = repo.get("name") or ""
    
    # Split camelCase and replace separators for name token matching
    name_tokens = re.sub(r'([a-z])([A-Z])', r'\1 \2', name).replace('-', ' ').replace('_', ' ')
    combined_text = f"{name_tokens} {desc}"
    lang = (repo.get("language") or "").lower()

    scores = {}
    for cat_id, cat_def in category_defs.items():
        cat_score = 0.0
        
        # 1. Topic matching (+2.0 per topic)
        cat_topics = set(t.lower() for t in cat_def.get("topics", []))
        matched_topics = topics & cat_topics
        cat_score += len(matched_topics) * 2.0

        # 2. Keyword matching (+1.0 per matched keyword with boundary check)
        cat_keywords = cat_def.get("keywords", [])
        for kw in cat_keywords:
            if match_keyword(kw, combined_text):
                cat_score += 1.0

        # 3. Language matching (+1.5 if match)
        cat_langs = [l.lower() for l in cat_def.get("languages", [])]
        if lang and lang in cat_langs:
            cat_score += 1.5

        if cat_score > 0:
            scores[cat_id] = round(cat_score, 2)

    # Rank categories by score
    sorted_cats = sorted(scores.items(), key=lambda x: -x[1])

    if manual_category:
        primary = manual_category
        secondaries = [c for c, s in sorted_cats if c != manual_category and s > 0]
    elif sorted_cats:
        primary = sorted_cats[0][0]
        secondaries = [c for c, s in sorted_cats[1:] if s > 0]
    else:
        primary = "archive"
        secondaries = []

    return primary, secondaries

def build_insights():
    repos = load_json(DATA_PATH, [])
    config = load_json(CONFIG_PATH, {"categories": []})
    intel_cfg = load_json(INTELLIGENCE_PATH, DEFAULT_INTELLIGENCE)

    weights = intel_cfg.get("scoring_weights", DEFAULT_INTELLIGENCE["scoring_weights"])
    thresholds = intel_cfg.get("thresholds", DEFAULT_INTELLIGENCE["thresholds"])

    # Lookup map for manual config categories & featured statuses
    repo_manual_cat = {}
    repo_featured = {}
    for cat in config.get("categories", []):
        for r in cat.get("repos", []):
            repo_manual_cat[r["name"]] = cat["id"]
            if r.get("featured"):
                repo_featured[r["name"]] = True

    topics = analyze_topics(repos)

    repo_metrics = []
    rising_projects = []
    featured_recommendations = []
    neglected_repos = []

    cat_counts = Counter()

    for r in repos:
        name = r["name"]
        d = days_since(r.get("updated_at"))
        stars = r.get("stars", 0)
        is_fork = bool(r.get("fork"))
        is_archived = bool(r.get("archived"))

        act_score = calculate_activity_score(d, weights.get("activity", {}))
        hlth_score = calculate_health_score(r, d, weights.get("health", {}))
        mom_score = calculate_momentum_score(r, act_score, d, weights.get("momentum", {}))
        rec_score = calculate_recommendation_score(
            hlth_score, act_score, mom_score, stars,
            weights.get("recommendation", {}),
            is_fork=is_fork, is_archived=is_archived
        )

        manual_cat = repo_manual_cat.get(name)
        primary_cat, secondary_cats = categorize_repo(r, intel_cfg, manual_category=manual_cat)

        cat_counts[primary_cat] += 1

        metric = {
            "repo": name,
            "primary_category": primary_cat,
            "secondary_categories": secondary_cats,
            "suggested_category": primary_cat,
            "health_score": round(hlth_score, 2),
            "activity_score": round(act_score, 2),
            "momentum_score": round(mom_score, 2),
            "recommendation_score": round(rec_score, 2),
            "days_inactive": d
        }
        repo_metrics.append(metric)

        # Rising Projects criteria
        rising_min_mom = thresholds.get("rising_momentum_min", 0.55)
        rising_min_act = thresholds.get("rising_activity_min", 0.40)
        if mom_score >= rising_min_mom and act_score >= rising_min_act and not is_fork and name not in ("index", "ALEVOLDON") and not is_archived:
            created_days = days_since(r.get("created_at"))
            if created_days > 180 and d <= 30:
                reason = f"Revived project with recent active pushes ({d} days ago, momentum {round(mom_score, 2)})"
            elif d <= 7:
                reason = f"High momentum ({round(mom_score, 2)}) with updates in the last 7 days"
            else:
                reason = f"Strong momentum ({round(mom_score, 2)}) with recent updates ({d} days ago)"
                
            rising_projects.append({
                "repo": name,
                "momentum_score": round(mom_score, 2),
                "activity_score": round(act_score, 2),
                "primary_category": primary_cat,
                "reason": reason
            })

        # Featured Recommendations criteria
        rec_min = thresholds.get("featured_recommendation_min", 0.65)
        if rec_score >= rec_min and not repo_featured.get(name) and not is_fork and name not in ("index", "ALEVOLDON") and not is_archived:
            reasons = []
            if hlth_score >= 0.70:
                reasons.append(f"High completeness & health ({round(hlth_score, 2)})")
            if act_score >= 0.70:
                reasons.append(f"Active updates ({d} days ago)")
            if mom_score >= 0.60:
                reasons.append(f"Strong momentum ({round(mom_score, 2)})")
            if r.get("homepage"):
                reasons.append("Live demo homepage available")
            if stars > 0:
                reasons.append(f"{stars} star(s)")
            
            if not reasons:
                reasons.append(f"Overall recommendation score ({round(rec_score, 2)})")

            featured_recommendations.append({
                "repo": name,
                "recommendation_score": round(rec_score, 2),
                "primary_category": primary_cat,
                "reasons": reasons
            })

        # Neglected repos check
        neglected_limit = thresholds.get("neglected_days", 365)
        if r.get("tracked", False) and d > neglected_limit and not is_archived and manual_cat != "archive":
            neglected_repos.append({"name": name, "days_inactive": d})

    rising_projects.sort(key=lambda x: -x["momentum_score"])
    featured_recommendations.sort(key=lambda x: -x["recommendation_score"])
    neglected_repos.sort(key=lambda x: -x["days_inactive"])

    total_repos = len(repos)
    total_stars = sum(r.get("stars", 0) for r in repos)

    ecosystem_stats = {
        "total_repos": total_repos,
        "total_stars": total_stars,
        "ai_projects": cat_counts.get("ai", 0),
        "music_projects": cat_counts.get("music", 0),
        "frontend_projects": cat_counts.get("frontend", 0),
        "creative_projects": cat_counts.get("creative", 0),
        "productivity_projects": cat_counts.get("productivity", 0)
    }

    suggestions = []
    if topics:
        suggestions.append(f"Your ecosystem is currently heavily focused around '{topics[0]}'.")
    if rising_projects:
        suggestions.append(f"{len(rising_projects)} projects are showing strong recent momentum (e.g. '{rising_projects[0]['repo']}').")
    if featured_recommendations:
        suggestions.append(f"Candidate for Featured recommendation: '{featured_recommendations[0]['repo']}' (score {featured_recommendations[0]['recommendation_score']}).")
    if len(neglected_repos) > 5:
        suggestions.append(f"You have {len(neglected_repos)} tracked active repositories inactive for over 1 year.")

    insights = {
        "version": "2.0",
        "generated_at": datetime.now().isoformat(),
        "ecosystem_stats": ecosystem_stats,
        "top_topics": topics[:10],
        "repo_metrics": repo_metrics,
        "rising_projects": rising_projects[:5],
        "featured_recommendations": featured_recommendations[:5],
        "neglected_repos": neglected_repos[:10],
        "suggestions": suggestions
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(insights, f, indent=2, ensure_ascii=False)

if __name__ == "__main__":
    print("Running Intelligence Engine v2...")
    build_insights()
    print("Intelligence Engine v2 complete. Generated insights.json.")
