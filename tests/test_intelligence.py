import unittest
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from analysis.engine import (
    calculate_health_score,
    calculate_activity_score,
    calculate_momentum_score,
    calculate_recommendation_score,
    categorize_repo,
    match_keyword,
    days_since,
    DEFAULT_INTELLIGENCE
)

class TestIntelligenceEngineV2(unittest.TestCase):
    def setUp(self):
        self.intel_cfg = DEFAULT_INTELLIGENCE
        self.weights = self.intel_cfg["scoring_weights"]

    def test_health_score(self):
        full_repo = {
            "name": "super-ai-bot",
            "description": "An awesome AI Telegram bot assistant",
            "topics": ["ai", "telegram-bot", "nlp", "llm"],
            "license": "MIT",
            "stars": 15,
            "forks_count": 3,
            "language": "Python",
            "size": 1024,
            "homepage": "https://example.com"
        }
        score_active = calculate_health_score(full_repo, days_inactive=10, weights=self.weights["health"])
        score_inactive = calculate_health_score(full_repo, days_inactive=300, weights=self.weights["health"])
        
        self.assertGreaterEqual(score_active, 0.8)
        self.assertGreater(score_active, score_inactive)

        # Test archived penalty
        archived_repo = dict(full_repo, archived=True)
        score_archived = calculate_health_score(archived_repo, days_inactive=10, weights=self.weights["health"])
        self.assertLess(score_archived, score_active)

        empty_repo = {"name": "bare-repo"}
        score_empty = calculate_health_score(empty_repo, days_inactive=400, weights=self.weights["health"])
        self.assertEqual(score_empty, 0.0)

    def test_activity_score(self):
        w = self.weights["activity"]
        self.assertEqual(calculate_activity_score(5, w), 1.0)
        self.assertEqual(calculate_activity_score(25, w), 0.85)
        self.assertEqual(calculate_activity_score(60, w), 0.70)
        self.assertEqual(calculate_activity_score(150, w), 0.45)
        self.assertEqual(calculate_activity_score(300, w), 0.20)
        self.assertEqual(calculate_activity_score(500, w), 0.0)

    def test_momentum_score_and_revived_project(self):
        w = self.weights["momentum"]

        # Revived project: created 400 days ago, pushed 3 days ago
        created_old = (datetime.now() - timedelta(days=400)).strftime("%Y-%m-%d")
        revived_repo = {
            "name": "old-tool",
            "created_at": created_old,
            "stars": 5,
            "forks_count": 1
        }
        act_revived = calculate_activity_score(3, self.weights["activity"])
        mom_revived = calculate_momentum_score(revived_repo, act_revived, days_inactive=3, weights=w)

        # Abandoned project: updated 500 days ago
        abandoned_repo = {
            "name": "dead-tool",
            "created_at": created_old,
            "stars": 50,
            "forks_count": 10
        }
        act_abandoned = calculate_activity_score(500, self.weights["activity"])
        mom_abandoned = calculate_momentum_score(abandoned_repo, act_abandoned, days_inactive=500, weights=w)

        self.assertGreater(mom_revived, 0.70)
        self.assertGreater(mom_revived, mom_abandoned)

        # Archived repo momentum should be 0.0
        archived_repo = dict(revived_repo, archived=True)
        mom_archived = calculate_momentum_score(archived_repo, act_revived, days_inactive=3, weights=w)
        self.assertEqual(mom_archived, 0.0)

    def test_categorization_ai_telegram_bot(self):
        repo = {
            "name": "ai-telegram-assistant",
            "description": "Telegram bot for local LLM and ChatGPT automation",
            "topics": ["ai", "telegram-bot-ai-assistant", "llm"],
            "language": "Python"
        }
        primary, secondaries = categorize_repo(repo, self.intel_cfg)
        self.assertEqual(primary, "ai")

    def test_categorization_music_audio_threejs(self):
        repo = {
            "name": "audio-visualizer-3d",
            "description": "Web Audio synthesizer visualizer with Three.js 3D canvas rendering",
            "topics": ["music", "web-audio", "threejs", "audio"],
            "language": "TypeScript"
        }
        primary, secondaries = categorize_repo(repo, self.intel_cfg)
        self.assertIn(primary, ["music", "creative", "frontend"])
        self.assertTrue(len(secondaries) > 0)
        all_cats = [primary] + secondaries
        self.assertIn("music", all_cats)
        self.assertIn("creative", all_cats)

    def test_categorization_manual_override(self):
        repo = {
            "name": "custom-tool",
            "description": "Just a tool",
            "topics": ["react", "web"],
            "language": "JavaScript"
        }
        primary, secondaries = categorize_repo(repo, self.intel_cfg, manual_category="productivity")
        self.assertEqual(primary, "productivity")
        self.assertIn("frontend", secondaries)

    def test_categorization_no_false_positives(self):
        # 1. "html5" should NOT trigger "ml" in AI
        repo_html = {
            "name": "html5-semantic",
            "description": "HTML5 semantic tags: what are they & how to use them!",
            "topics": ["html5", "css3"],
            "language": "HTML"
        }
        primary_html, secondaries_html = categorize_repo(repo_html, self.intel_cfg)
        self.assertEqual(primary_html, "frontend")
        self.assertNotIn("ai", secondaries_html)

        # 2. "Click" should NOT trigger "cli" in Productivity
        repo_landing = {
            "name": "Anti-Gravity-Landing",
            "description": "Click a button and watch as interface elements crumble under gravity!",
            "topics": ["javascript", "frontend"],
            "language": "JavaScript"
        }
        primary_landing, secondaries_landing = categorize_repo(repo_landing, self.intel_cfg)
        self.assertEqual(primary_landing, "frontend")
        self.assertNotIn("productivity", secondaries_landing)

        # 3. "Building" should NOT trigger "ui" in Frontend
        repo_game = {
            "name": "Minesweeper",
            "description": "Build minesweeper game with canvas and shaders",
            "topics": ["game", "canvas"],
            "language": "JavaScript"
        }
        primary_game, _ = categorize_repo(repo_game, self.intel_cfg)
        self.assertEqual(primary_game, "creative")

    def test_categorization_repo_name_tokens(self):
        # Repo name contains strong category tokens
        repo = {
            "name": "Dump-Assistant-Bot",
            "description": "Reads posts and analyzes links",
            "topics": [],
            "language": "JavaScript"
        }
        primary, _ = categorize_repo(repo, self.intel_cfg)
        self.assertEqual(primary, "ai")

        repo_synth = {
            "name": "acid-synth",
            "description": "Interactive sound generation and oscilloscope",
            "topics": [],
            "language": "Python"
        }
        primary_synth, _ = categorize_repo(repo_synth, self.intel_cfg)
        self.assertEqual(primary_synth, "music")

    def test_recommendation_score(self):
        w = self.weights["recommendation"]
        score = calculate_recommendation_score(
            health_score=0.9, activity_score=0.85, momentum_score=0.8,
            stars=10, weights=w, is_fork=False, is_archived=False
        )
        self.assertGreaterEqual(score, 0.8)

        # Forks & archived repos should have 0.0 recommendation score
        score_fork = calculate_recommendation_score(
            health_score=0.9, activity_score=0.85, momentum_score=0.8,
            stars=10, weights=w, is_fork=True, is_archived=False
        )
        self.assertEqual(score_fork, 0.0)

        score_archived = calculate_recommendation_score(
            health_score=0.9, activity_score=0.85, momentum_score=0.8,
            stars=10, weights=w, is_fork=False, is_archived=True
        )
        self.assertEqual(score_archived, 0.0)

    def test_days_since_safety(self):
        self.assertEqual(days_since(None), 9999)
        self.assertEqual(days_since("invalid-date"), 9999)
        # Future date should not return negative days
        future_date = (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d")
        self.assertEqual(days_since(future_date), 0)

    def test_match_keyword_boundaries(self):
        self.assertTrue(match_keyword("ml", "Intro to ML and AI"))
        self.assertTrue(match_keyword("ml", "machine-learning, ml, deep learning"))
        self.assertFalse(match_keyword("ml", "Built with HTML5"))
        self.assertFalse(match_keyword("ml", "A simple family tool"))
        self.assertTrue(match_keyword("cli", "Simple CLI utility"))
        self.assertFalse(match_keyword("cli", "Click here to see"))
        self.assertTrue(match_keyword("three.js", "Render with Three.js engine"))
        self.assertTrue(match_keyword("web app", "A modern web app scaffold"))

if __name__ == "__main__":
    unittest.main()
