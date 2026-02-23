import React from 'react';

const LINK_TOKEN_PATTERN = /(https?:\/\/[^\s<>"'`]+|www\.[^\s<>"'`]+)/gi;
const TRAILING_PUNCTUATION = new Set(['.', ',', '!', '?', ';', ':', ')', ']', '}']);

const splitTrailingPunctuation = (token) => {
  let value = String(token || '');
  let trailing = '';
  while (value) {
    const tail = value[value.length - 1];
    if (!TRAILING_PUNCTUATION.has(tail)) break;
    trailing = `${tail}${trailing}`;
    value = value.slice(0, -1);
  }
  return { value, trailing };
};

const normalizeLinkHref = (candidate) => {
  const raw = String(candidate || '').trim();
  if (!raw) return '';
  const withProtocol = raw.startsWith('www.') ? `https://${raw}` : raw;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.href;
  } catch {
    return '';
  }
};

const buildParts = (text, linkClassName) => {
  const value = String(text || '');
  if (!value) return '';

  LINK_TOKEN_PATTERN.lastIndex = 0;
  const parts = [];
  let cursor = 0;
  let key = 0;
  let match;

  while ((match = LINK_TOKEN_PATTERN.exec(value)) !== null) {
    const token = match[0];
    const start = match.index;
    const end = start + token.length;

    if (start > cursor) {
      parts.push(value.slice(cursor, start));
    }

    const { value: tokenWithoutPunctuation, trailing } = splitTrailingPunctuation(token);
    const href = normalizeLinkHref(tokenWithoutPunctuation);
    if (!href) {
      parts.push(token);
      cursor = end;
      continue;
    }

    parts.push(
      <a
        key={`link-${key}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={linkClassName}
      >
        {tokenWithoutPunctuation}
      </a>
    );
    key += 1;

    if (trailing) {
      parts.push(trailing);
    }

    cursor = end;
  }

  if (cursor < value.length) {
    parts.push(value.slice(cursor));
  }

  return parts.length > 0 ? parts : value;
};

const LinkifiedText = ({ text, className = '', linkClassName = '' }) => (
  <div className={className}>{buildParts(text, linkClassName)}</div>
);

export default LinkifiedText;
