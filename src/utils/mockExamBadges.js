export const MOCK_EXAM_BADGE_MAX_ITEMS = 4;
export const MOCK_EXAM_BADGE_LABEL_MAX_LENGTH = 36;
export const DEFAULT_MOCK_EXAM_BADGE_THEME_ID = 'sunset';

export const MOCK_EXAM_BADGE_THEME_OPTIONS = [
  {
    id: 'sunset',
    label: 'Закат',
    badgeClassName: 'border-rose-200/70 bg-[linear-gradient(135deg,rgba(251,113,133,0.96),rgba(236,72,153,0.92),rgba(249,115,22,0.92))] text-white shadow-[0_12px_28px_rgba(244,63,94,0.22)]',
    swatchClassName: 'border-rose-200/70 bg-[linear-gradient(135deg,rgba(251,113,133,0.98),rgba(236,72,153,0.96),rgba(249,115,22,0.96))]',
    stickerFill: 'rgba(244, 63, 94, 0.18)',
    stickerFillDark: 'rgba(244, 63, 94, 0.18)',
    stickerStroke: '#f43f5e',
    stickerTextClassName: 'text-rose-700',
    stickerTextClassNameDark: 'text-rose-100',
    stickerShadow: '0 18px 40px rgba(244, 63, 94, 0.16)',
  },
  {
    id: 'ocean',
    label: 'Океан',
    badgeClassName: 'border-sky-200/70 bg-[linear-gradient(135deg,rgba(6,182,212,0.96),rgba(37,99,235,0.92),rgba(14,165,233,0.94))] text-white shadow-[0_12px_28px_rgba(14,165,233,0.22)]',
    swatchClassName: 'border-sky-200/70 bg-[linear-gradient(135deg,rgba(6,182,212,0.98),rgba(37,99,235,0.96),rgba(14,165,233,0.96))]',
    stickerFill: 'rgba(14, 165, 233, 0.18)',
    stickerFillDark: 'rgba(14, 165, 233, 0.18)',
    stickerStroke: '#0ea5e9',
    stickerTextClassName: 'text-sky-700',
    stickerTextClassNameDark: 'text-sky-100',
    stickerShadow: '0 18px 40px rgba(14, 165, 233, 0.16)',
  },
  {
    id: 'forest',
    label: 'Лес',
    badgeClassName: 'border-emerald-200/70 bg-[linear-gradient(135deg,rgba(16,185,129,0.96),rgba(5,150,105,0.92),rgba(34,197,94,0.92))] text-white shadow-[0_12px_28px_rgba(16,185,129,0.22)]',
    swatchClassName: 'border-emerald-200/70 bg-[linear-gradient(135deg,rgba(16,185,129,0.98),rgba(5,150,105,0.96),rgba(34,197,94,0.96))]',
    stickerFill: 'rgba(34, 197, 94, 0.17)',
    stickerFillDark: 'rgba(34, 197, 94, 0.17)',
    stickerStroke: '#22c55e',
    stickerTextClassName: 'text-emerald-700',
    stickerTextClassNameDark: 'text-emerald-100',
    stickerShadow: '0 18px 40px rgba(16, 185, 129, 0.15)',
  },
  {
    id: 'violet',
    label: 'Вайолет',
    badgeClassName: 'border-violet-200/70 bg-[linear-gradient(135deg,rgba(139,92,246,0.96),rgba(99,102,241,0.92),rgba(217,70,239,0.92))] text-white shadow-[0_12px_28px_rgba(139,92,246,0.24)]',
    swatchClassName: 'border-violet-200/70 bg-[linear-gradient(135deg,rgba(139,92,246,0.98),rgba(99,102,241,0.96),rgba(217,70,239,0.96))]',
    stickerFill: 'rgba(168, 85, 247, 0.18)',
    stickerFillDark: 'rgba(168, 85, 247, 0.18)',
    stickerStroke: '#a855f7',
    stickerTextClassName: 'text-violet-700',
    stickerTextClassNameDark: 'text-violet-100',
    stickerShadow: '0 18px 40px rgba(139, 92, 246, 0.16)',
  },
  {
    id: 'gold',
    label: 'Золото',
    badgeClassName: 'border-amber-200/80 bg-[linear-gradient(135deg,rgba(251,191,36,0.96),rgba(245,158,11,0.94),rgba(234,88,12,0.9))] text-amber-950 shadow-[0_12px_28px_rgba(245,158,11,0.24)]',
    swatchClassName: 'border-amber-200/80 bg-[linear-gradient(135deg,rgba(251,191,36,0.98),rgba(245,158,11,0.96),rgba(234,88,12,0.94))]',
    stickerFill: 'rgba(245, 158, 11, 0.2)',
    stickerFillDark: 'rgba(245, 158, 11, 0.2)',
    stickerStroke: '#d97706',
    stickerTextClassName: 'text-amber-900',
    stickerTextClassNameDark: 'text-amber-100',
    stickerShadow: '0 18px 40px rgba(245, 158, 11, 0.15)',
  },
  {
    id: 'midnight',
    label: 'Ночь',
    badgeClassName: 'border-slate-300/80 bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(30,41,59,0.94),rgba(71,85,105,0.92))] text-white shadow-[0_12px_28px_rgba(15,23,42,0.24)]',
    swatchClassName: 'border-slate-300/80 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(30,41,59,0.96),rgba(71,85,105,0.96))]',
    stickerFill: 'rgba(148, 163, 184, 0.2)',
    stickerFillDark: 'rgba(148, 163, 184, 0.2)',
    stickerStroke: '#64748b',
    stickerTextClassName: 'text-slate-700',
    stickerTextClassNameDark: 'text-slate-100',
    stickerShadow: '0 18px 40px rgba(15, 23, 42, 0.14)',
  },
];

export const MOCK_EXAM_BADGE_SUGGESTIONS = [
  { label: 'Реальный экзамен', themeId: 'sunset' },
  { label: 'Досрочный ЕГЭ', themeId: 'violet' },
  { label: 'Новый формат', themeId: 'ocean' },
  { label: 'Сложный уровень', themeId: 'midnight' },
  { label: 'Важно', themeId: 'gold' },
  { label: 'Повторение', themeId: 'forest' },
];

const badgeThemeMap = new Map(
  MOCK_EXAM_BADGE_THEME_OPTIONS.map((theme) => [theme.id, theme])
);

export const normalizeMockExamBadgeLabel = (value) => (
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MOCK_EXAM_BADGE_LABEL_MAX_LENGTH)
);

export const normalizeMockExamBadgeThemeId = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return badgeThemeMap.has(normalized) ? normalized : DEFAULT_MOCK_EXAM_BADGE_THEME_ID;
};

export const normalizeMockExamBadges = (value, limit = MOCK_EXAM_BADGE_MAX_ITEMS) => {
  const list = Array.isArray(value) ? value : [];
  const next = [];
  const seen = new Set();

  list.forEach((item) => {
    const label = normalizeMockExamBadgeLabel(item?.label);
    if (!label) return;
    const themeId = normalizeMockExamBadgeThemeId(item?.themeId);
    const dedupeKey = `${themeId}:${label.toLowerCase()}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    next.push({ label, themeId });
  });

  return next.slice(0, Math.max(0, limit));
};

export const getMockExamBadgeSignature = (value) => (
  normalizeMockExamBadges(value)
    .map((item) => `${item.themeId}:${item.label.toLowerCase()}`)
    .join('|')
);

export const getMockExamBadgeTheme = (themeId) => (
  badgeThemeMap.get(normalizeMockExamBadgeThemeId(themeId))
  || badgeThemeMap.get(DEFAULT_MOCK_EXAM_BADGE_THEME_ID)
);
