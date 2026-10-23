import { ACHIEVEMENT_CATALOG } from '../src/data/achievementCatalog.js';

export const ACHIEVEMENT_REWARD_VERSION = 2;
const integer = value => Math.max(0, Math.floor(Number(value) || 0));
const record = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const caps = Object.fromEntries(ACHIEVEMENT_CATALOG.map(item => [item.rewardChain, Math.max(...ACHIEVEMENT_CATALOG.filter(entry => entry.rewardChain === item.rewardChain).map(entry => entry.xpReward))]));
const byId = new Map(ACHIEVEMENT_CATALOG.map(item => [item.id, item]));

export function normalizeAchievementRewards(value) {
  const source = record(value), chains = {}, notifications = {};
  for (const [chain, amount] of Object.entries(record(source.chains))) if (caps[chain]) chains[chain] = Math.min(caps[chain], integer(amount));
  for (const [id, amount] of Object.entries(record(source.notifications))) if (byId.has(id)) notifications[id] = Math.min(byId.get(id).xpReward, integer(amount));
  const total = Object.values(chains).reduce((sum, amount) => sum + amount, 0);
  const historicalXp = Math.min(total, integer(source.historicalXp));
  return { version: integer(source.version) >= ACHIEVEMENT_REWARD_VERSION ? ACHIEVEMENT_REWARD_VERSION : 1, chains, notifications, total, historicalXp, historicalClaimedXp: Math.min(historicalXp, integer(source.historicalClaimedXp)) };
}

// A stale save may contain an earlier ledger. Monotonic watermarks preserve both
// credited XP and the acknowledgement of the single historical notification.
export function mergeAchievementRewards(current, incoming) {
  const a = normalizeAchievementRewards(current), b = normalizeAchievementRewards(incoming);
  const maxMap = (first, second) => Object.fromEntries([...new Set([...Object.keys(first), ...Object.keys(second)])].map(key => [key, Math.max(first[key] || 0, second[key] || 0)]));
  return normalizeAchievementRewards({ version: Math.max(a.version, b.version), chains: maxMap(a.chains, b.chains), notifications: maxMap(a.notifications, b.notifications), historicalXp: Math.max(a.historicalXp, b.historicalXp), historicalClaimedXp: Math.max(a.historicalClaimedXp, b.historicalClaimedXp) });
}

export function planAchievementRewards(previous, items, { baselineIds = [], initialize = false } = {}) {
  const next = normalizeAchievementRewards(previous), baseline = new Set(baselineIds);
  const unlocked = items.filter(item => item.unlocked && byId.has(item.id)).map(item => byId.get(item.id));
  const oldTotal = next.total;
  next.version = ACHIEVEMENT_REWARD_VERSION;
  for (const chain of new Set(unlocked.map(item => item.rewardChain))) {
    const earned = unlocked.filter(item => item.rewardChain === chain).sort((a, b) => b.xpReward - a.xpReward);
    const highest = earned[0], paid = next.chains[chain] || 0, delta = Math.max(0, highest.xpReward - paid);
    if (!delta) continue;
    const baselineAmount = initialize ? Math.max(0, ...earned.filter(item => baseline.has(item.id)).map(item => item.xpReward)) : 0;
    const catchup = Math.min(delta, Math.max(0, baselineAmount - paid));
    next.chains[chain] = highest.xpReward;
    next.historicalXp += catchup;
    if (delta > catchup) next.notifications[highest.id] = (next.notifications[highest.id] || 0) + delta - catchup;
  }
  const rewards = normalizeAchievementRewards(next);
  return { rewards, xpGained: rewards.total - oldTotal };
}
