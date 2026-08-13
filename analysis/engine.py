import json
import os
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
            "has_description": 0.20,
            "has_topics": 0.15,
            "has_license": 0.10,
            "has_stars": 0.10,
            "has_forks": 0.05,
            "has_language": 0.10,
            "non_empty_size": 0.10,
            "recent_push_bonus": 0.20
        },
        "activity": {
            "days_7": 1.0,
            "days_30": 0.85,
            "days_90": 0.70,
            "days_180": 0.45,
            "days_365": 0.20
        },
        "momentum": {
            "activity_weight": 0.50,
            "recency_boost": 0.30,
            "engagement_weight": 0.20
        },
        "recommendation": {
            "health_weight": 0.40,
            "activity_weight": 0.25,
            "momentum_weight": 0.25,
            "stars_weight": 0.10
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
            "topics": ["ai", "machine-learning", "openai", "llm", "local-llm", "chatgpt", "deep-learning", "neural-network", "nlp", "obsidian", "rag", "semantic-search", "embeddings", "automation", "telegram-bot-ai-assistant", "chatbot"],
            "keywords": ["gpt", "openai", "ollama", "llm", "neural", "deep learning", "machine learning", "ml", "chatbot", "embedding", "vector", "semantic", "nlp", "assistant", "ai bot", "bot"],
            "languages": ["python", "jupyter notebook"]
        },
        "music": {
            "topics": ["music", "audio", "music-technology", "generative-music", "experimental-music", "sound-design", "ableton-live", "vcv-rack", "audiovisual", "modular-synthesis", "synthesizer", "midi", "daw", "web-audio"],
            "keywords": ["synthesizer", "daw", "melody", "sound design", "audio", "music technology", "modular", "vcv rack", "ableton", "oscillator", "midi", "chord", "beat", "drum", "bass", "sound", "web audio"],
            "languages": ["c++", "max", "supercollider", "faust"]
        },
        "frontend": {
            "topics": ["react", "frontend", "web", "webdev", "javascript", "typescript", "nodejs", "astro", "vite", "html5", "css3", "pwa", "nextjs", "vue", "svelte", "tailwindcss"],
            "keywords": ["react", "frontend", "ui", "vite", "astro", "vue", "svelte", "angular", "next.js", "nuxt", "web app", "dashboard", "portfolio", "landing", "website", "web", "site"],
            "languages": ["typescript", "javascript", "html", "css"]
        },
        "creative": {
            "topics": ["3d", "threejs", "three.js", "blender", "generative-art", "creative-coding", "phaser", "gamedev", "browsergame", "indie-game", "mobilegame", "procedural", "geometry-nodes", "webgl", "canvas", "shaders", "glsl"],
            "keywords": ["three.js", "threejs", "blender", "game", "creative", "generative", "procedural", "shader", "canvas", "webgl", "glsl", "music visual", "visualizer", "arcade", "scrolling", "shooter", "pwa game"],
            "languages": ["glsl", "c#", "gdscript"]
        },
        "productivity": {
            "topics": ["productivity", "tool", "utility", "habit-tracker", "organizer", "planner", "cli", "workflow"],
            "keywords": ["habit tracker", "productivity", "tool", "utility", "monitor", "water map", "tracking", "organizer", "planner", "calendar", "task manager", "cli"],
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
        return (datetime.now() - dt).days
    except ValueError:
        return 9999

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
        score += weights.get("has_description", 0.20)
    if repo.get("topics") and len(repo.get("topics")) > 0:
        score += weights.get("has_topics", 0.15)
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
    if days_inactive <= 180:
        score += weights.get("recent_push_bonus", 0.20)

    # Normalize to max 1.0
    return min(1.0, score)

def calculate_momentum_score(repo, activity_score, days_inactive, weights):
    act_weight = weights.get("activity_weight", 0.50)
    rec_boost_weight = weights.get("recency_boost", 0.30)
    eng_weight = weights.get("engagement_weight", 0.20)

    recency_boost = 0.0
    if days_inactive <= 7:
        recency_boost = 1.0
    elif days_inactive <= 30:
        recency_boost = 0.8
    elif days_inactive <= 90:
        recency_boost = 0.5
    elif days_inactive <= 180:
        recency_boost = 0.2

    stars = repo.get("stars", 0)
    forks = repo.get("forks_count", 0)
    engagement = min(1.0, (stars * 0.1 + forks * 0.2))

    momentum = (activity_score * act_weight) + (recency_boost * rec_boost_weight) + (engagement * eng_weight)
    return min(1.0, momentum)

def calculate_recommendation_score(health_score, activity_score, momentum_score, stars, weights):
    h_w = weights.get("health_weight", 0.40)
    a_w = weights.get("activity_weight", 0.25)
    m_w = weights.get("momentum_weight", 0.25)
    s_w = weights.get("stars_weight", 0.10)

    star_score = min(1.0, stars / 10.0)
    total = (health_score * h_w) + (activity_score * a_w) + (momentum_score * m_w) + (star_score * s_w)
    return min(1.0, total)

def categorize_repo(repo, intel_cfg, manual_category=None):
    category_defs = intel_cfg.get("category_definitions", {})
    topics = set(t.lower() for t in repo.get("topics", []))
    desc = (repo.get("description") or "").lower()
    lang = (repo.get("language") or "").lower()

    scores = {}
    for cat_id, cat_def in category_defs.items():
        cat_score = 0.0
        
        # Topic matching (+2.0 per topic)
        cat_topics = set(t.lower() for t in cat_def.get("topics", []))
        matched_topics = topics & cat_topics
        cat_score += len(matched_topics) * 2.0

        # Keyword matching (+1.0 per keyword)
        cat_keywords = cat_def.get("keywords", [])
        for kw in cat_keywords:
            if kw in desc:
                cat_score += 1.0

        # Language matching (+1.5 if match)
        cat_langs = [l.lower() for l in cat_def.get("languages", [])]
        if lang and lang in cat_langs:
            cat_score += 1.5

        if cat_score > 0:
            scores[cat_id] = cat_score

    # Rank categories by score
    sorted_cats = sorted(scores.items(), key=lambda x: -x[1])

    if manual_category:
        primary = manual_category
        secondaries = [c for c, s in sorted_cats if c != manual_category]
    elif sorted_cats:
        primary = sorted_cats[0][0]
        secondaries = [c for c, s in sorted_cats[1:]]
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

        act_score = calculate_activity_score(d, weights.get("activity", {}))
        hlth_score = calculate_health_score(r, d, weights.get("health", {}))
        mom_score = calculate_momentum_score(r, act_score, d, weights.get("momentum", {}))
        rec_score = calculate_recommendation_score(hlth_score, act_score, mom_score, stars, weights.get("recommendation", {}))

        manual_cat = repo_manual_cat.get(name)
        primary_cat, secondary_cats = categorize_repo(r, intel_cfg, manual_category=manual_cat)

        cat_counts[primary_cat] += 1

        metric = {
            "repo": name,
            "primary_category": primary_cat,
            "secondary_categories": secondary_cats,
            "suggested_category": primary_cat, # for backward compatibility
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
        if mom_score >= rising_min_mom and act_score >= rising_min_act and not r.get("fork") and name not in ("index", "ALEVOLDON") and not r.get("archived"):
            reason = f"High momentum ({round(mom_score, 2)}) with recent updates ({d} days ago)"
            rising_projects.append({
                "repo": name,
                "momentum_score": round(mom_score, 2),
                "activity_score": round(act_score, 2),
                "primary_category": primary_cat,
                "reason": reason
            })

        # Featured Recommendations criteria
        rec_min = thresholds.get("featured_recommendation_min", 0.65)
        if rec_score >= rec_min and not repo_featured.get(name) and not r.get("fork") and name not in ("index", "ALEVOLDON"):
            reasons = []
            if hlth_score >= 0.7:
                reasons.append(f"High completeness & health ({round(hlth_score, 2)})")
            if act_score >= 0.7:
                reasons.append(f"Recent active updates ({d} days ago)")
            if mom_score >= 0.6:
                reasons.append(f"Strong momentum ({round(mom_score, 2)})")
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
        if r.get("tracked", False) and d > neglected_limit:
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
        suggestions.append(f"You have {len(neglected_repos)} tracked repositories inactive for over 1 year.")

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
