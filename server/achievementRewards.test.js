import test from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENT_CATALOG } from '../src/data/achievementCatalog.js';
import { planAchievementRewards, mergeAchievementRewards, normalizeAchievementRewards } from './achievementRewards.js';

const items = ids => ACHIEVEMENT_CATALOG.filter(item => ids.includes(item.id)).map(item => ({ ...item, unlocked: true }));
test('all 132 achievements have positive, monotonic chain entitlements', () => {
  for (const item of ACHIEVEMENT_CATALOG) {
    assert.ok(Number.isInteger(item.xpReward) && item.xpReward > 0, item.id);
    for (const lower of ACHIEVEMENT_CATALOG.filter(entry => entry.rewardChain === item.rewardChain && entry.target < item.target)) assert.ok(lower.xpReward <= item.xpReward);
  }
});
test('a direct perfect score grants 4500 total for the score chain; reloads and lower facts cannot grant again', () => {
  const earned = items(ACHIEVEMENT_CATALOG.filter(item => item.metric === 'mockBest').map(item => item.id));
  const first = planAchievementRewards(null, earned);
  assert.equal(first.xpGained, 4500);
  assert.deepEqual(first.rewards.notifications, { 'mock-score-100': 4500 });
  assert.equal(planAchievementRewards(first.rewards, earned).xpGained, 0);
  assert.equal(planAchievementRewards(first.rewards, []).xpGained, 0);
});
test('80 to 88 pays only 600 more, and separate chains remain additive', () => {
  const first = planAchievementRewards(null, items(['mock-score-80']));
  const next = planAchievementRewards(first.rewards, items(['mock-score-80', 'mock-score-88', 'mock-count-1']));
  assert.equal(first.xpGained, 1500); assert.equal(next.xpGained, 1200);
  assert.equal(next.rewards.notifications['mock-score-88'], 600);
  assert.equal(next.rewards.total, 2700);
});
test('historical milestones aggregate once; the first new action retains its own delta', () => {
  const next = planAchievementRewards(null, items(['ege-solves-1', 'ege-solves-10', 'ege-solves-25', 'active-days-1']), { initialize: true, baselineIds: ['ege-solves-1', 'ege-solves-10'] });
  assert.equal(next.xpGained, 675); assert.equal(next.rewards.historicalXp, 300);
  assert.equal(next.rewards.notifications['ege-solves-25'], 300);
  assert.equal(next.rewards.notifications['active-days-1'], 75);
});
test('stale saves preserve new XP and cannot resurrect acknowledged historical notifications', () => {
  const first = planAchievementRewards(null, items(['ege-solves-10']), { initialize: true, baselineIds: ['ege-solves-10'] }).rewards;
  const claimed = { ...first, historicalClaimedXp: 300 };
  const next = planAchievementRewards(claimed, items(['ege-solves-25'])).rewards;
  const merged = mergeAchievementRewards(next, first);
  assert.equal(merged.total, 600); assert.equal(merged.historicalClaimedXp, 300);
  assert.equal(merged.historicalXp - merged.historicalClaimedXp, 0);
});
test('normalization rejects unknown chains and caps corrupt values instead of trusting stored totals', () => {
  const result = normalizeAchievementRewards({ total: 9999999, chains: { mockBest: Infinity, unknown: 999999, egeSolved: -10 }, notifications: { unknown: 999999 }, historicalXp: 999999, historicalClaimedXp: 999999 });
  assert.equal(result.total, 4500); assert.equal(result.historicalXp, 4500); assert.equal(result.historicalClaimedXp, 4500);
  assert.equal(result.chains.unknown, undefined); assert.deepEqual(result.notifications, {});
});

test('version one receives only the increase, while a new milestone retains its own notification', () => {
  const old = { version: 1, chains: { egeSolved: 100 }, notifications: {}, historicalXp: 100, historicalClaimedXp: 100 };
  const next = planAchievementRewards(old, items(['ege-solves-10', 'ege-solves-25']), { initialize: true, baselineIds: ['ege-solves-10'] });
  assert.equal(next.xpGained, 500); // 200 catch-up + 300 for the newly earned step
  assert.equal(next.rewards.version, 2);
  assert.equal(next.rewards.historicalXp - next.rewards.historicalClaimedXp, 200);
  assert.equal(next.rewards.notifications['ege-solves-25'], 300);
  const claimed = { ...next.rewards, historicalClaimedXp: next.rewards.historicalXp };
  const stale = mergeAchievementRewards(claimed, old);
  assert.equal(stale.version, 2);
  assert.equal(stale.total, 600);
  assert.equal(stale.historicalXp - stale.historicalClaimedXp, 0);
  assert.equal(planAchievementRewards(stale, items(['ege-solves-25'])).xpGained, 0);
});
