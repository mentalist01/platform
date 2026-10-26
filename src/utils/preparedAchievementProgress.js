// Typing, navigation and geometry updates must not poll the achievements API.
// A saved solution can add evidence after the answer was already checked.
export function hasPreparedAchievementProgress(previous, next) {
  if (!next || next.changeOnly) return false;
  const prior = new Map((previous?.id === next.id ? previous.cards || [] : []).map(card => [card.id, card]));
  return (next.cards || []).some(card => {
    if (card.status !== 'solved' || card.kind === 'theory') return false;
    const old = prior.get(card.id);
    if (old?.status !== 'solved') return true;
    return JSON.stringify(card.attachments?.map(file => file.solution)) !== JSON.stringify(old.attachments?.map(file => file.solution))
      || JSON.stringify(card.achievementParticipants) !== JSON.stringify(old.achievementParticipants);
  });
}
