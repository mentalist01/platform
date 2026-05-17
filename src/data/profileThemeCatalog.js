export const PROFILE_THEME_CATALOG = [
  {
    id: 'python-aurora',
    rarity: 'common',
    name: 'Python Aurora',
    shortName: 'Aurora',
    description: 'Мягкое северное сияние для строки рейтинга.',
    accent: '#22d3ee',
  },
  {
    id: 'syntax-neon',
    rarity: 'common',
    name: 'Syntax Neon',
    shortName: 'Neon',
    description: 'Неоновая подсветка в стиле ночного редактора.',
    accent: '#a855f7',
  },
  {
    id: 'terminal-matrix',
    rarity: 'rare',
    name: 'Terminal Matrix',
    shortName: 'Matrix',
    description: 'Глубокий терминальный фон с зелёным свечением.',
    accent: '#34d399',
  },
  {
    id: 'golden-proof',
    rarity: 'rare',
    name: 'Golden Proof',
    shortName: 'Gold',
    description: 'Тёплое золотое оформление для аккуратных побед.',
    accent: '#f59e0b',
  },
  {
    id: 'cosmic-runner',
    rarity: 'epic',
    name: 'Cosmic Runner',
    shortName: 'Cosmic',
    description: 'Космический градиент с холодной звездной аурой.',
    accent: '#818cf8',
  },
  {
    id: 'crystal-ege',
    rarity: 'epic',
    name: 'Crystal EGE',
    shortName: 'Crystal',
    description: 'Кристальный фон с ледяными бликами.',
    accent: '#67e8f9',
  },
  {
    id: 'absolute-crown',
    rarity: 'legendary',
    name: 'Absolute Crown',
    shortName: 'Crown',
    description: 'Легендарный фон с коронным свечением.',
    accent: '#facc15',
  },
  {
    id: 'void-champion',
    rarity: 'legendary',
    name: 'Void Champion',
    shortName: 'Void',
    description: 'Тёмная чемпионская аура с фиолетовым ядром.',
    accent: '#c084fc',
  },
];

export const PROFILE_THEME_CATALOG_BY_ID = new Map(
  PROFILE_THEME_CATALOG.map((theme) => [theme.id, theme])
);

export const PROFILE_THEME_RARITY_ORDER = ['legendary', 'epic', 'rare', 'common'];
