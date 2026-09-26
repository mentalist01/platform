const topics = [
  { name: 'Звук', task: 7, roots: ['звук', 'аудио', 'дискретизац', 'стерео', 'моно', 'герц', 'килогерц', 'разрядност'] },
  { name: 'Изображения', task: 7, roots: ['изображен', 'пиксел', 'палитр', 'растров', 'цветов', 'разрешени'] },
  { name: 'Python', roots: ['питон', 'python', 'цикл', 'массив', 'список', 'рекурси', 'перемен', 'функци'] },
  { name: 'Таблицы', roots: ['таблиц', 'эксел', 'excel', 'либре', 'libreoffice', 'ячейк', 'столбц'] },
  { name: 'Системы счисления', roots: ['счислен', 'двоичн', 'шестнадцатер', 'восьмеричн', 'основани'] },
  { name: 'Логика', roots: ['логик', 'импликац', 'истинност', 'конъюнкц', 'дизъюнкц'] },
];
const normalize = value => String(value || '').toLowerCase().replace(/ё/g, 'е');
const ordinals = ['перв', 'втор', 'трет', 'четверт', 'пят', 'шест', 'седьм', 'восьм', 'девят', 'десят', 'одиннадцат', 'двенадцат', 'тринадцат', 'четырнадцат', 'пятнадцат', 'шестнадцат', 'семнадцат', 'восемнадцат', 'девятнадцат', 'двадцат'];
function taskNumber(text) {
  const numeric = text.match(/(?:^|[^a-zа-я0-9])(\d{1,2})(?=$|[^a-zа-я0-9])/);
  if (numeric && Number(numeric[1]) >= 1 && Number(numeric[1]) <= 27) return Number(numeric[1]);
  const compound = text.match(/двадцать\s+(перв|втор|трет|четверт|пят|шест|седьм)[а-я]*/);
  if (compound) return 21 + ordinals.indexOf(compound[1]);
  for (let i = ordinals.length - 1; i >= 0; i--) if (new RegExp(`(?:^|\\s)${ordinals[i]}[а-я]*(?=$|\\s|[.,!?])`).test(text)) return i + 1;
  return null;
}
function mentionsTask(text, number) {
  const parts = normalize(text).match(/(?:задани[а-я]*|задач[а-я]*|номер)\s+(?:номер\s+)?(?:\d{1,2}(?:-?[а-я]+)?|[а-я]+(?:\s+[а-я]+)?)|(?:\d{1,2}(?:-?[а-я]+)?|[а-я]+(?:\s+[а-я]+)?)\s+(?:задани[а-я]*|задач[а-я]*|номер)/g) || [];
  return parts.some(part => taskNumber(part) === number);
}
const stop = new Set(['по', 'про', 'найти', 'задание', 'заданию', 'седьмое', 'седьмому', 'теория', 'теорию', 'еге', 'номер', 'кодирование', 'кодированию', 'и', 'в', 'на', 'для']);
export function topicTags(segments) {
  const text = normalize(segments.map(s => s.text).join(' '));
  return topics.filter(t => t.roots.filter(root => text.includes(root)).length >= 2).map(t => t.name);
}
export function searchArchive(items, transcripts, query, topic = '') {
  const words = normalize(query).match(/[a-zа-я0-9]+/g) || [];
  const number = taskNumber(normalize(query));
  const roots = words.filter(w => w.length >= 3 && !stop.has(w) && !/^(задан|задач)/.test(w) && !ordinals.some(root => w.startsWith(root)) && w !== 'двадцать').map(w => w.length > 5 ? w.slice(0, -2) : w);
  const related = topics.filter(t => t.name === topic || roots.some(w => t.roots.some(r => r.startsWith(w) || w.startsWith(r))));
  const expanded = [...new Set([...roots, ...related.flatMap(t => t.roots)])];
  const task7 = words.includes('7') || words.some(w => w.startsWith('седьм'));
  if (task7 && !expanded.length) expanded.push(...topics.filter(t => t.task === 7).flatMap(t => t.roots));
  if (!expanded.length && !topic && !number) return [];
  const results = [];
  for (const item of items) {
    const segments = transcripts(item.id);
    const matches = segments.filter(s => expanded.some(root => normalize(s.text).includes(root)) || (number && mentionsTask(s.text, number)));
    let group;
    for (const s of matches) {
      const score = expanded.filter(root => normalize(s.text).includes(root)).length + (number && mentionsTask(s.text, number) ? 3 : 0);
      if (!group || s.start - group.last > 45 || s.end - group.start > 420) {
        group = { id: item.id, title: item.title, start: Math.max(0, s.start - 15), end: s.end + 25, last: s.end, score: 0 };
        results.push(group);
      }
      group.last = s.end; group.end = Math.min(item.duration || Infinity, s.end + 25); group.score += score;
    }
    for (const result of results.filter(r => r.id === item.id)) {
      result.text = segments.filter(s => s.end >= result.start && s.start <= result.end).map(s => s.text).join(' ');
      result.explanation = /формул|запомни|обознач|измеряется|называется|это значит|давай.{0,15}разбер/i.test(result.text);
      result.tags = topicTags([{ text: result.text }]);
      if (result.explanation) result.score += 2;
    }
  }
  return results.filter(r => !topic || r.tags.includes(topic)).sort((a, b) => b.score - a.score).slice(0, 80);
}
