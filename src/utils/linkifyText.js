const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const SIMPLE_TRAILING_PUNCTUATION = new Set(['.', ',', '!', '?', ';', ':']);

const countChar = (value, char) => String(value || '').split(char).length - 1;

const trimTrailingUrlCharacters = (candidate) => {
  let url = String(candidate || '');
  let trailing = '';
  while (url) {
    const lastChar = url[url.length - 1];
    if (SIMPLE_TRAILING_PUNCTUATION.has(lastChar)) {
      trailing = lastChar + trailing;
      url = url.slice(0, -1);
      continue;
    }
    if (lastChar === ')' && countChar(url, ')') > countChar(url, '(')) {
      trailing = lastChar + trailing;
      url = url.slice(0, -1);
      continue;
    }
    if (lastChar === ']' && countChar(url, ']') > countChar(url, '[')) {
      trailing = lastChar + trailing;
      url = url.slice(0, -1);
      continue;
    }
    break;
  }
  return { url, trailing };
};

export const normalizeHttpUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
};

export const splitTextWithUrls = (value) => {
  const text = String(value ?? '');
  if (!text) return [];

  const parts = [];
  let cursor = 0;
  URL_PATTERN.lastIndex = 0;
  let match = URL_PATTERN.exec(text);
  while (match) {
    const matchIndex = Number(match.index) || 0;
    const matchedText = match[0] || '';
    if (matchIndex > cursor) {
      parts.push({ type: 'text', value: text.slice(cursor, matchIndex) });
    }

    const { url, trailing } = trimTrailingUrlCharacters(matchedText);
    if (url) {
      parts.push({
        type: 'link',
        value: url,
        href: normalizeHttpUrl(url),
      });
    } else if (matchedText) {
      parts.push({ type: 'text', value: matchedText });
    }
    if (trailing) {
      parts.push({ type: 'text', value: trailing });
    }

    cursor = matchIndex + matchedText.length;
    match = URL_PATTERN.exec(text);
  }

  if (cursor < text.length) {
    parts.push({ type: 'text', value: text.slice(cursor) });
  }
  return parts;
};
