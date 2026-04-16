import json
import os
from datetime import datetime
from collections import Counter, defaultdict

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.cluster import KMeans
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False

DATA_PATH = os.path.join(os.path.dirname(__file__), "../data/repos.json")
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "../data/insights.json")
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "../config/projects.json")

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def days_since(date_str):
    if not date_str:
        return 9999
    dt = datetime.strptime(date_str, "%Y-%m-%d")
    return (datetime.now() - dt).days

def analyze_topics(repos):
    topic_counter = Counter()
    for r in repos:
        for t in r.get("topics", []):
            topic_counter[t] += 1
    return [t[0] for t in topic_counter.most_common(20)]

def calculate_repo_metrics(repo, all_categories, top_topics):
    # Activity score: 1.0 (recent push) down to 0.0 (push > 2 years ago)
    d = days_since(repo.get("updated_at"))
    activity_score = max(0.0, 1.0 - (d / 730.0))
    
    # Health score based on having description, topics, stars
    health_score = 0.0
    if repo.get("description"): health_score += 0.3
    if repo.get("topics"): health_score += 0.3
    if repo.get("stars", 0) > 0: health_score += 0.4
    
    # Simple Suggested Category logic
    suggested = "archive"
    topics_set = set(repo.get("topics", []))
    
    if "ai" in topics_set or "machine-learning" in topics_set:
        suggested = "ai"
    elif "music" in topics_set or "audio" in topics_set:
        suggested = "music"
    elif "react" in topics_set or "frontend" in topics_set or "web" in topics_set:
        suggested = "frontend"
    elif "3d" in topics_set or "threejs" in topics_set:
        suggested = "creative"
    
    return {
        "repo": repo["name"],
        "suggested_category": suggested,
        "health_score": round(health_score, 2),
        "activity_score": round(activity_score, 2),
        "days_inactive": d
    }

def build_insights():
    repos = load_json(DATA_PATH)
    config = load_json(CONFIG_PATH)
    categories = [c["id"] for c in config.get("categories", [])]
    
    topics = analyze_topics(repos)
    
    repo_metrics = []
    neglected_repos = []
    
    for r in repos:
        metrics = calculate_repo_metrics(r, categories, topics)
        repo_metrics.append(metrics)
        
        # Consider a repo neglected if it is tracked, active config-wise, but hasn't been updated in 365 days
        if r.get("tracked", False) and metrics["days_inactive"] > 365:
            neglected_repos.append({"name": r["name"], "days_inactive": metrics["days_inactive"]})

    neglected_repos.sort(key=lambda x: -x["days_inactive"])
    
    suggestions = []
    if topics:
        suggestions.append(f"Your ecosystem is currently heavily focused around '{topics[0]}'.")
    if len(neglected_repos) > 5:
        suggestions.append(f"You have {len(neglected_repos)} tracked repositories that are becoming inactive, consider archiving the oldest ones.")
        
    insights = {
        "generated_at": datetime.now().isoformat(),
        "top_topics": topics[:10],
        "repo_metrics": repo_metrics,
        "neglected_repos": neglected_repos[:10],
        "suggestions": suggestions
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(insights, f, indent=2, ensure_ascii=False)

if __name__ == "__main__":
    print("Running Intelligence Engine...")
    build_insights()
    print("Intelligence Engine complete. Generated insights.json.")
