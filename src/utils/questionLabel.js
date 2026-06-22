export const DEFAULT_QUESTION_LABEL_COLOR = '#7c3aed';
export const QUESTION_LABEL_TEXT_MAX_LENGTH = 40;

export const normalizeQuestionLabelText = (value) => (
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, QUESTION_LABEL_TEXT_MAX_LENGTH)
);

export const normalizeQuestionLabelColor = (value, fallback = DEFAULT_QUESTION_LABEL_COLOR) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(normalized)) return normalized;
  if (/^#[0-9a-f]{3}$/.test(normalized)) {
    return `#${normalized.slice(1).split('').map((char) => `${char}${char}`).join('')}`;
  }
  return fallback;
};

export const isQuestionLabelColorValid = (value) => (
  /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(String(value ?? '').trim())
);

export const normalizeQuestionLabel = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const text = normalizeQuestionLabelText(value.text);
  if (!text) return null;
  return {
    text,
    color: normalizeQuestionLabelColor(value.color),
  };
};

export const getQuestionLabelTextColor = (color) => {
  const normalized = normalizeQuestionLabelColor(color).slice(1);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance > 164 ? '#172033' : '#ffffff';
};

export const getQuestionLabelStyle = (label) => {
  const normalized = normalizeQuestionLabel(label);
  if (!normalized) return undefined;
  return {
    borderColor: normalized.color,
    backgroundColor: normalized.color,
    color: getQuestionLabelTextColor(normalized.color),
  };
};
