// Edit artifact names and descriptions here.
export const ARTIFACT_CATALOG_METADATA = [
  {
    id: 'krylov',
    rank: 'S',
    name: 'Крылов',
    description: 'Он пойдёт с тобой на экзамен в качестве помощника. Увеличивает весь получаемый опыт в 2 раза.',
  },
  {
    id: 'tears',
    rank: 'S',
    name: 'Слёзы составителей',
    description: 'Получаются каждый раз когда кто-то решает гробовые задачи. Увеличивает опыт за решение задач 24-27 в 4 раза.',
  },
  {
    id: '1tbssd',
    rank: 'A',
    name: '1 TB SSD',
    description: 'Возьми с собой на экзамен чтобы комп не завис. Увеличивает в 1.5 раза получаемый опыт за решение 15 и 16 заданий.',
  },
  {
    id: 'list-comprehension',
    rank: 'A',
    name: 'Генератор списков',
    description: 'Не забывай его. Увеличивает опыт за решение 17 заданий в 1.5 раза.',
  },
  {
    id: 'python',
    rank: 'A',
    name: 'Python',
    description: 'Прокачивает тебя в знании Python. Увеличивает получаемые монеты в 2 раза.',
  },
  {
    id: 'crutch',
    rank: 'B',
    name: 'Костыль',
    description: 'Не самый изящный, но надежный способ дойти до результата, когда дедлайн уже дышит в спину. Увеличивает получаемый опыт в 1.1 раз.',
  },
  {
    id: 'whileTrue',
    rank: 'B',
    name: 'while True',
    description: 'Цикл без страха и сомнений, который держится до последнего, пока задача наконец не сдастся. Увеличивает получаемые монеты в 1.2 раза.',
  },
  {
    id: 'black_pen',
    rank: 'C',
    name: 'Гелевая ручка',
    description: 'Не забудь взять на экзамен. Даёт 1000 опыта.',
  },
  {
    id: 'coffee',
    rank: 'C',
    name: 'Кофе',
    description: 'Теплый источник бодрости, без которого многие правильные решения вообще бы не появились. Даёт 5 монет.',
  },
  {
    id: 'draft',
    rank: 'C',
    name: 'Черновик',
    description: 'Скромный спутник каждой сложной мысли, где ошибки постепенно превращаются в готовое решение. Даёт 1000 опыта.',
  },
];

export const ARTIFACT_CATALOG_METADATA_BY_ID = new Map(
  ARTIFACT_CATALOG_METADATA.map((artifact) => [artifact.id, artifact])
);
