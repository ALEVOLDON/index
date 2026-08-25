import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHealthScore,
  calculateActivityScore,
  calculateMomentumScore,
  calculateRecommendationScore,
  daysSince,
  DEFAULT_INTELLIGENCE
} from '../analysis/engine.js';
import { categorizeRepo, matchKeyword } from '../core/categorize.js';

describe('Intelligence Engine v2 (TypeScript)', () => {
  const intelCfg = DEFAULT_INTELLIGENCE;
  const weights = intelCfg.scoring_weights;

  test('health_score calculation', () => {
    const fullRepo = {
      name: 'super-ai-bot',
      description: 'An awesome AI Telegram bot assistant',
      topics: ['ai', 'telegram-bot', 'nlp', 'llm'],
      license: 'MIT',
      stars: 15,
      forks_count: 3,
      language: 'Python',
      size: 1024,
      homepage: 'https://example.com'
    };
    const scoreActive = calculateHealthScore(fullRepo, 10, weights.health);
    const scoreInactive = calculateHealthScore(fullRepo, 300, weights.health);

    assert.ok(scoreActive >= 0.8, `Expected scoreActive >= 0.8, got ${scoreActive}`);
    assert.ok(scoreActive > scoreInactive, `Expected scoreActive > scoreInactive`);

    // Test archived penalty
    const archivedRepo = { ...fullRepo, archived: true };
    const scoreArchived = calculateHealthScore(archivedRepo, 10, weights.health);
    assert.ok(scoreArchived < scoreActive, 'Expected scoreArchived < scoreActive');

    const emptyRepo = { name: 'bare-repo' };
    const scoreEmpty = calculateHealthScore(emptyRepo, 400, weights.health);
    assert.equal(scoreEmpty, 0.0);
  });

  test('activity_score step thresholds', () => {
    const w = weights.activity;
    assert.equal(calculateActivityScore(5, w), 1.0);
    assert.equal(calculateActivityScore(25, w), 0.85);
    assert.equal(calculateActivityScore(60, w), 0.70);
    assert.equal(calculateActivityScore(150, w), 0.45);
    assert.equal(calculateActivityScore(300, w), 0.20);
    assert.equal(calculateActivityScore(500, w), 0.0);
  });

  test('momentum_score and revived project', () => {
    const w = weights.momentum;

    // Revived project: created 400 days ago, pushed 3 days ago
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 400);
    const createdOld = pastDate.toISOString().substring(0, 10);

    const revivedRepo = {
      name: 'old-tool',
      created_at: createdOld,
      stars: 5,
      forks_count: 1
    };
    const actRevived = calculateActivityScore(3, weights.activity);
    const momRevived = calculateMomentumScore(revivedRepo, actRevived, 3, w);

    // Abandoned project: updated 500 days ago
    const abandonedRepo = {
      name: 'dead-tool',
      created_at: createdOld,
      stars: 50,
      forks_count: 10
    };
    const actAbandoned = calculateActivityScore(500, weights.activity);
    const momAbandoned = calculateMomentumScore(abandonedRepo, actAbandoned, 500, w);

    assert.ok(momRevived > 0.70, `Expected momRevived > 0.70, got ${momRevived}`);
    assert.ok(momRevived > momAbandoned, `Expected momRevived > momAbandoned`);

    // Archived repo momentum should be 0.0
    const archivedRepo = { ...revivedRepo, archived: true };
    const momArchived = calculateMomentumScore(archivedRepo, actRevived, 3, w);
    assert.equal(momArchived, 0.0);
  });

  test('categorization_ai_telegram_bot', () => {
    const repo = {
      name: 'ai-telegram-assistant',
      description: 'Telegram bot for local LLM and ChatGPT automation',
      topics: ['ai', 'telegram-bot-ai-assistant', 'llm'],
      language: 'Python'
    };
    const { primary } = categorizeRepo(repo, intelCfg);
    assert.equal(primary, 'ai');
  });

  test('categorization_music_audio_threejs', () => {
    const repo = {
      name: 'audio-visualizer-3d',
      description: 'Web Audio synthesizer visualizer with Three.js 3D canvas rendering',
      topics: ['music', 'web-audio', 'threejs', 'audio'],
      language: 'TypeScript'
    };
    const { primary, secondaries } = categorizeRepo(repo, intelCfg);
    assert.ok(['music', 'creative', 'frontend'].includes(primary));
    assert.ok(secondaries.length > 0);
    const allCats = [primary, ...secondaries];
    assert.ok(allCats.includes('music'));
    assert.ok(allCats.includes('creative'));
  });

  test('categorization_manual_override', () => {
    const repo = {
      name: 'custom-tool',
      description: 'Just a tool',
      topics: ['react', 'web'],
      language: 'JavaScript'
    };
    const { primary, secondaries } = categorizeRepo(repo, intelCfg, 'productivity');
    assert.equal(primary, 'productivity');
    assert.ok(secondaries.includes('frontend'));
  });

  test('categorization_no_false_positives', () => {
    // 1. "html5" should NOT trigger "ml" in AI
    const repoHtml = {
      name: 'html5-semantic',
      description: 'HTML5 semantic tags: what are they & how to use them!',
      topics: ['html5', 'css3'],
      language: 'HTML'
    };
    const { primary: primaryHtml, secondaries: secondariesHtml } = categorizeRepo(repoHtml, intelCfg);
    assert.equal(primaryHtml, 'frontend');
    assert.ok(!secondariesHtml.includes('ai'));

    // 2. "Click" should NOT trigger "cli" in Productivity
    const repoLanding = {
      name: 'Anti-Gravity-Landing',
      description: 'Click a button and watch as interface elements crumble under gravity!',
      topics: ['javascript', 'frontend'],
      language: 'JavaScript'
    };
    const { primary: primaryLanding, secondaries: secondariesLanding } = categorizeRepo(repoLanding, intelCfg);
    assert.equal(primaryLanding, 'frontend');
    assert.ok(!secondariesLanding.includes('productivity'));

    // 3. "Building" should NOT trigger "ui" in Frontend
    const repoGame = {
      name: 'Minesweeper',
      description: 'Build minesweeper game with canvas and shaders',
      topics: ['game', 'canvas'],
      language: 'JavaScript'
    };
    const { primary: primaryGame } = categorizeRepo(repoGame, intelCfg);
    assert.equal(primaryGame, 'creative');
  });

  test('categorization_repo_name_tokens', () => {
    const repo = {
      name: 'Dump-Assistant-Bot',
      description: 'Reads posts and analyzes links',
      topics: [],
      language: 'JavaScript'
    };
    const { primary } = categorizeRepo(repo, intelCfg);
    assert.equal(primary, 'ai');

    const repoSynth = {
      name: 'acid-synth',
      description: 'Interactive sound generation and oscilloscope',
      topics: [],
      language: 'Python'
    };
    const { primary: primarySynth } = categorizeRepo(repoSynth, intelCfg);
    assert.equal(primarySynth, 'music');
  });

  test('recommendation_score calculation', () => {
    const w = weights.recommendation;
    const score = calculateRecommendationScore(0.9, 0.85, 0.8, 10, w, false, false);
    assert.ok(score >= 0.8, `Expected score >= 0.8, got ${score}`);

    // Forks & archived repos should have 0.0 recommendation score
    const scoreFork = calculateRecommendationScore(0.9, 0.85, 0.8, 10, w, true, false);
    assert.equal(scoreFork, 0.0);

    const scoreArchived = calculateRecommendationScore(0.9, 0.85, 0.8, 10, w, false, true);
    assert.equal(scoreArchived, 0.0);
  });

  test('days_since safety', () => {
    assert.equal(daysSince(null), 9999);
    assert.equal(daysSince('invalid-date'), 9999);
    // Future date should not return negative days
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 5);
    assert.equal(daysSince(futureDate.toISOString().substring(0, 10)), 0);
  });

  test('match_keyword boundaries', () => {
    assert.ok(matchKeyword('ml', 'Intro to ML and AI'));
    assert.ok(matchKeyword('ml', 'machine-learning, ml, deep learning'));
    assert.ok(!matchKeyword('ml', 'Built with HTML5'));
    assert.ok(!matchKeyword('ml', 'A simple family tool'));
    assert.ok(matchKeyword('cli', 'Simple CLI utility'));
    assert.ok(!matchKeyword('cli', 'Click here to see'));
    assert.ok(matchKeyword('three.js', 'Render with Three.js engine'));
    assert.ok(matchKeyword('web app', 'A modern web app scaffold'));
  });
});
