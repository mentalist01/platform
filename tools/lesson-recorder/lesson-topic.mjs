const themes = [
  ['Базы данных',['баз данных','таблиц','ключ','связ','запрос']],
  ['Кодирование звука',['звук','дискретизац','частот','разрядност','аудио']],
  ['Кодирование изображений',['пиксел','палитр','изображен','глубин цвета']],
  ['Системы счисления',['счислен','двоичн','шестнадцатер','восьмеричн']],
  ['Логика',['логик','импликац','истинност','конъюнкц','дизъюнкц']],
  ['Python: циклы',['цикл','range','питон','python','итерац']],
  ['Python: строки и списки',['строк','список','срез','питон','python']],
  ['Рекурсия',['рекурси','функци','базов случа']],
  ['Электронные таблицы',['эксел','excel','ячейк','формул','столбц']],
  ['Графы',['граф','вершин','ребр','кратчайш']],
  ['Сети и IP-адреса',['маск','ip','адрес','подсет']],
];
const words=['перв','втор','трет','четверт','пят','шест','седьм','восьм','девят','десят','одиннадцат','двенадцат','тринадцат','четырнадцат','пятнадцат','шестнадцат','семнадцат','восемнадцат','девятнадцат','двадцат'];
const normalize=value=>String(value || '').toLowerCase().replaceAll('ё','е');
const ordinal = `(?:двадцать\\s+(?:перв|втор|трет|четверт|пят|шест|седьм)[а-я]*|(?:${[...words].reverse().join('|')})[а-я]*)`;
const taskMention = new RegExp(`(?:задани[а-я]*|задач[а-я]*|номер)\\s*(?:№\\s*|номер\\s*)?(\\d{1,2}(?!\\d)|${ordinal})(?=$|[^а-я0-9])|(?:^|[^а-я0-9])(\\d{1,2}|${ordinal})\\s+(?:задани[а-я]*|задач[а-я]*)(?=$|[^а-я])`, 'g');
const number=value=>{
  const text=normalize(value);const n=/\d+/.exec(text);if(n)return +n[0];
  const compound=/двадцать\s+(перв|втор|трет|четверт|пят|шест|седьм)/.exec(text);
  if(compound)return 21+words.indexOf(compound[1]);
  for(let i=words.length-1;i>=0;i--)if(text.startsWith(words[i]))return i+1;
  return 0;
};
// Use explicit task mentions, never arbitrary numbers from a problem. Generic
// chatter stays untitled. All speech analysis happens on the teacher's PC.
export function inferLessonTopic(segments=[]) {
  const texts=segments.map(segment=>normalize(segment.text)).filter(Boolean),tasks=new Map();
  for(const text of texts){
    const seen=new Set();
    const mentions=text.matchAll(taskMention);
    for(const mention of mentions){const value=number(mention[1] || mention[2]);if(value>=1&&value<=27)seen.add(value);}
    for(const value of seen){const old=tasks.get(value)||{count:0,intro:false};tasks.set(value,{count:old.count+1,intro:old.intro || /сегодня|разбира|изуча|решаем/.test(text)});}
  }
  const taskNumbers=[...tasks.entries()].filter(([,v])=>v.count>=2 || v.intro).sort((a,b)=>b[1].count-a[1].count || a[0]-b[0]).slice(0,3).map(([n])=>n);
  const ranked=themes.map(([title,roots])=>({title,score:texts.reduce((sum,text)=>sum+roots.filter(root=>text.includes(root)).length,0),segments:texts.filter(text=>roots.some(root=>text.includes(root))).length,roots:roots.filter(root=>texts.some(text=>text.includes(root))).length})).filter(theme=>theme.roots>=2&&theme.segments>=2).sort((a,b)=>b.score-a.score);
  const theme=ranked[0]?.title || '';
  const taskText=taskNumbers.length ? `${taskNumbers.length===1?'Задание':'Задания'} №${taskNumbers.join(', ')}` : '';
  const text=[taskText,theme].filter(Boolean).join(' · ');
  return text ? {text,source:'transcript',taskNumbers} : null;
}
export function archiveTopicTitle(item) {
  const original=item.recordingTitle || item.title || 'Запись урока';
  return item.topic?.text ? `${item.topic.text} · ${original}` : original;
}
