const NAVIGATION_STOP_WORDS = new Set([
  'бы', 'в', 'во', 'где', 'давай', 'для', 'до', 'зайди', 'зайти', 'и', 'из', 'или',
  'как', 'к', 'ко', 'мне', 'можно', 'на', 'найди', 'найти', 'нужно', 'открой',
  'открыть', 'перейди', 'перейти', 'по', 'пожалуйста', 'покажи', 'показать', 'с',
  'со', 'хочу',
]);

const RUSSIAN_TOKEN_ENDINGS = [
  'иями', 'ьями', 'ами', 'ями', 'иях', 'ьях', 'ах', 'ях',
  'ение', 'ания', 'ение', 'ого', 'ему', 'ому', 'ыми', 'ими',
  'ость', 'ов', 'ев', 'ей', 'ий', 'ый', 'ой', 'ая', 'яя', 'ое', 'ее',
  'ую', 'юю', 'ам', 'ям', 'ом', 'ем', 'им', 'ым', 'их', 'ых',
  'ие', 'ия', 'ья', 'ы', 'и', 'а', 'я', 'у', 'ю', 'е',
];

export const normalizeStudentSearchText = (value) => String(value ?? '')
  .toLocaleLowerCase('ru-RU')
  .replace(/ё/g, 'е')
  .replace(/[^a-zа-я0-9+#]+/giu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const stemSearchToken = (value) => {
  const token = normalizeStudentSearchText(value);
  if (token.length <= 3 || /\d/.test(token)) return token;
  const ending = RUSSIAN_TOKEN_ENDINGS.find((candidate) => (
    token.endsWith(candidate) && token.length - candidate.length >= 3
  ));
  return ending ? token.slice(0, -ending.length) : token;
};

const tokenize = (value, { omitNavigationWords = false } = {}) => normalizeStudentSearchText(value)
  .split(' ')
  .filter(Boolean)
  .filter((token) => !omitNavigationWords || !NAVIGATION_STOP_WORDS.has(token))
  .map(stemSearchToken)
  .filter(Boolean);

const getSearchTokens = (value) => {
  const meaningfulTokens = tokenize(value, { omitNavigationWords: true });
  return meaningfulTokens.length ? meaningfulTokens : tokenize(value);
};

const hasSingleEdit = (left, right) => {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  return edits + Number(leftIndex < left.length || rightIndex < right.length) <= 1;
};

const getTokenMatchQuality = (queryToken, candidateToken, { allowPredictivePrefix = false } = {}) => {
  if (!queryToken || !candidateToken) return 0;
  if (queryToken === candidateToken) return 1;
  if (allowPredictivePrefix && candidateToken.startsWith(queryToken)) {
    if (queryToken.length === 1) return 0.58;
    if (queryToken.length === 2) return 0.72;
    if (queryToken.length === 3) return 0.84;
    return 0.92;
  }
  const shorterLength = Math.min(queryToken.length, candidateToken.length);
  const longerLength = Math.max(queryToken.length, candidateToken.length);
  if (
    shorterLength >= 3
    && (queryToken.startsWith(candidateToken) || candidateToken.startsWith(queryToken))
    && shorterLength / longerLength >= 0.7
  ) return 0.88;
  if (shorterLength >= 5 && hasSingleEdit(queryToken, candidateToken)) return 0.76;
  return 0;
};

const getTokenSetMatch = (queryTokens, candidateTokens, options = {}) => {
  if (!queryTokens.length || !candidateTokens.length) return 0;
  const qualities = queryTokens.map((queryToken) => candidateTokens.reduce(
    (best, candidateToken) => Math.max(best, getTokenMatchQuality(queryToken, candidateToken, options)),
    0
  ));
  const minimumQuality = Number(options.minimumQuality) || 0.7;
  if (qualities.some((quality) => quality < minimumQuality)) return 0;
  const averageQuality = qualities.reduce((sum, quality) => sum + quality, 0) / qualities.length;
  const specificity = Math.min(1, queryTokens.length / candidateTokens.length);
  return averageQuality * (0.88 + specificity * 0.12);
};

const compareByRank = (left, right) => (
  (right.score - left.score)
  || (Number(right.item?.timestamp) - Number(left.item?.timestamp))
  || String(left.item?.title || '').localeCompare(String(right.item?.title || ''), 'ru')
);

export const getStudentSearchActionMatch = (item, query) => {
  const normalizedQuery = normalizeStudentSearchText(query);
  const queryTokens = getSearchTokens(normalizedQuery);
  if (!normalizedQuery || !queryTokens.length) return null;

  const queryCore = queryTokens.join(' ');
  const title = normalizeStudentSearchText(item?.title);
  const titleTokens = tokenize(title);
  const titleCore = titleTokens.join(' ');
  const intentPhrases = Array.isArray(item?.intentPhrases) ? item.intentPhrases : [];
  const predictiveMatchOptions = { allowPredictivePrefix: true, minimumQuality: 0.55 };
  let confidence = 0;
  let isDirect = false;

  if (normalizedQuery === title || queryCore === titleCore) {
    confidence = 1;
    isDirect = true;
  } else if (title.startsWith(normalizedQuery)) {
    confidence = 0.94;
  } else {
    const titleQuality = getTokenSetMatch(queryTokens, titleTokens, predictiveMatchOptions);
    if (titleQuality) confidence = Math.max(confidence, 0.69 + titleQuality * 0.22);
  }

  intentPhrases.forEach((phrase) => {
    const normalizedPhrase = normalizeStudentSearchText(phrase);
    const phraseTokens = tokenize(normalizedPhrase, { omitNavigationWords: true });
    const phraseCore = phraseTokens.join(' ');
    if (!phraseCore) return;
    if (normalizedQuery === normalizedPhrase || queryCore === phraseCore) {
      confidence = Math.max(confidence, normalizedQuery === normalizedPhrase ? 1 : 0.98);
      isDirect = true;
      return;
    }
    const intentQuality = getTokenSetMatch(queryTokens, phraseTokens, predictiveMatchOptions);
    if (intentQuality) confidence = Math.max(confidence, 0.75 + intentQuality * 0.21);
  });

  const searchableTokens = tokenize(item?.searchText);
  const broadQuality = getTokenSetMatch(queryTokens, searchableTokens, predictiveMatchOptions);
  if (broadQuality) confidence = Math.max(confidence, 0.55 + broadQuality * 0.25);
  if (!isDirect) {
    const shortestQueryToken = Math.min(...queryTokens.map((token) => token.length));
    if (shortestQueryToken === 1) confidence = Math.min(confidence, 0.68);
    else if (shortestQueryToken === 2) confidence = Math.min(confidence, 0.82);
    else if (shortestQueryToken === 3) confidence = Math.min(confidence, 0.89);
  }
  if (confidence < 0.56) return null;

  return {
    confidence: Math.min(1, confidence),
    isDirect,
    score: Math.round(Math.min(1, confidence) * 1000),
  };
};

export const getStudentSearchMaterialScore = (item, query) => {
  const normalizedQuery = normalizeStudentSearchText(query);
  const queryTokens = getSearchTokens(normalizedQuery);
  if (!normalizedQuery || !queryTokens.length) return -1;
  const searchableTokens = tokenize(item?.searchText);
  const broadQuality = getTokenSetMatch(queryTokens, searchableTokens);
  if (!broadQuality && item?.serverResult !== true) return -1;

  const title = normalizeStudentSearchText(item?.title);
  const titleTokens = tokenize(title);
  const titleQuality = getTokenSetMatch(queryTokens, titleTokens);
  let score = 100 + broadQuality * 260;
  if (title === normalizedQuery) score += 1000;
  else if (title.startsWith(normalizedQuery)) score += 700;
  else if (title.includes(normalizedQuery)) score += 450;
  else if (titleQuality) score += titleQuality * 280;
  if (Number.isFinite(Number(item?.serverScore))) {
    score += Math.min(520, Math.max(0, Number(item.serverScore)) * 0.32);
  }
  return score;
};

export const rankStudentSearch = ({
  query,
  actionItems = [],
  materialItems = [],
  actionLimit = 5,
  materialLimit = 25,
} = {}) => {
  const rankedActions = actionItems
    .map((item) => ({ item, match: getStudentSearchActionMatch(item, query) }))
    .filter((entry) => entry.match)
    .map((entry) => ({ ...entry, score: entry.match.score }))
    .sort(compareByRank)
    .slice(0, Math.max(0, actionLimit));

  const topAction = rankedActions[0];
  const runnerUp = rankedActions[1];
  const topIsUnambiguous = Boolean(topAction
    && topAction.match.confidence >= 0.88
    && (topAction.match.isDirect
      || !runnerUp
      || topAction.match.confidence - runnerUp.match.confidence >= 0.1));
  const actions = rankedActions.map((entry, index) => ({
    ...entry.item,
    searchConfidence: entry.match.confidence,
    presentationTier: index === 0 && topIsUnambiguous
      ? 'hero'
      : (entry.match.confidence >= 0.72 ? 'feature' : 'compact'),
  }));

  const materials = materialItems
    .map((item) => ({ item, score: getStudentSearchMaterialScore(item, query) }))
    .filter((entry) => entry.score >= 0)
    .sort(compareByRank)
    .slice(0, Math.max(0, materialLimit))
    .map(({ item }) => ({ ...item, presentationTier: 'compact' }));

  return { actions, materials, ordered: [...actions, ...materials] };
};
