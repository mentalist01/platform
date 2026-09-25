// Match whole words, not names such as «Пробников» or a mock exam («пробник»).
const TRIAL_WORD = /(?:^|[^\p{L}\p{N}_])пробн(?:ое|ый|ая|ую|ого|ой|ом)(?=$|[^\p{L}\p{N}_])/iu;

export const isExplicitTrialLesson = (entry) => {
  if (!entry || entry.isLearningGroupEvent || entry.groupId) return false;
  if (entry.trial === true || entry.isTrial === true || entry.status === 'trial') return true;
  return [entry.subject, entry.summary, entry.googleCalendarTitle].some(value => (
    typeof value === 'string' && TRIAL_WORD.test(value.normalize('NFKC'))
  ));
};
