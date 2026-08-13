import unittest
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from analysis.engine import (
    calculate_health_score,
    calculate_activity_score,
    calculate_momentum_score,
    calculate_recommendation_score,
    categorize_repo,
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
            "topics": ["ai", "telegram-bot"],
            "license": "MIT",
            "stars": 15,
            "forks_count": 3,
            "language": "Python",
            "size": 1024
        }
        score_active = calculate_health_score(full_repo, days_inactive=10, weights=self.weights["health"])
        score_inactive = calculate_health_score(full_repo, days_inactive=300, weights=self.weights["health"])
        
        self.assertGreaterEqual(score_active, 0.8)
        self.assertGreater(score_active, score_inactive)

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

        # Revived project: low overall health or older history, but pushed 3 days ago
        revived_repo = {"name": "old-tool", "stars": 5, "forks_count": 1}
        act_revived = calculate_activity_score(3, self.weights["activity"])
        mom_revived = calculate_momentum_score(revived_repo, act_revived, days_inactive=3, weights=w)

        # Abandoned project: updated 500 days ago
        abandoned_repo = {"name": "dead-tool", "stars": 50, "forks_count": 10}
        act_abandoned = calculate_activity_score(500, self.weights["activity"])
        mom_abandoned = calculate_momentum_score(abandoned_repo, act_abandoned, days_inactive=500, weights=w)

        self.assertGreater(mom_revived, 0.70)
        self.assertGreater(mom_revived, mom_abandoned)

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
        # Check that both music and creative are detected in primary or secondaries
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

    def test_recommendation_score(self):
        w = self.weights["recommendation"]
        score = calculate_recommendation_score(health_score=0.9, activity_score=0.85, momentum_score=0.8, stars=10, weights=w)
        self.assertGreaterEqual(score, 0.8)

if __name__ == "__main__":
    unittest.main()
