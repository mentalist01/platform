export const paceLabel = value => value < 35 ? 'Отстаю, ничего не успеваю'
  : value > 65 ? 'Слишком легко для меня, нужен темп быстрее' : 'Всё круто, я в темпе занятия';
export const paceShortLabel = value => value < 35 ? 'Не успевает' : value > 65 ? 'Хочет быстрее' : 'В темпе';
export const paceTone = value => value < 35 ? 'slow' : value > 65 ? 'fast' : 'comfortable';
