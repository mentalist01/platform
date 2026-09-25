const FONT = 'Inter, Arial, sans-serif';
const WIDTH = 1000;
const PAD = 76;
const CONTENT_WIDTH = WIDTH - PAD * 2;

const normalizeText = value => String(value || '').replace(/\r\n?/g, '\n').trim();

// Only restructure the known automatic draft. A teacher's edited text stays whole.
export function getStudentReportImageContent({ report, text }) {
  const draft = normalizeText(text);
  const automatic = normalizeText(report?.texts?.student || report?.studentText);
  const paragraphs = draft.split(/\n\s*\n/u).filter(Boolean);
  if (!automatic || draft !== automatic || paragraphs.length < 3) {
    return { body: draft, goals: [] };
  }
  return {
    body: paragraphs.slice(1, -1).join('\n\n'),
    goals: paragraphs.at(-1).split(/(?<=[.!?])\s+(?=[А-ЯЁ])/u),
  };
}

export function wrapReportText(context, value, maxWidth) {
  const lines = [];
  normalizeText(value).split('\n').forEach(paragraph => {
    if (!paragraph.trim()) { lines.push(''); return; }
    let line = '';
    for (const word of paragraph.trim().split(/\s+/u)) {
      if (line && context.measureText(`${line} ${word}`).width <= maxWidth) {
        line += ` ${word}`;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      // Long names, links or pasted tokens must never cross the card's edge.
      for (const character of word) {
        if (line && context.measureText(line + character).width > maxWidth) {
          lines.push(line);
          line = '';
        }
        line += character;
      }
    }
    if (line) lines.push(line);
  });
  return lines;
}

const roundedRect = (context, x, y, width, height, radius, fill) => {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
};

const measureLines = (lines, lineHeight, paragraphGap = 24) => (
  lines.reduce((height, line) => height + (line ? lineHeight : paragraphGap), 0)
);

const drawLines = (context, lines, x, top, lineHeight, paragraphGap = 24) => {
  let y = top;
  for (const line of lines) {
    if (line) context.fillText(line, x, y);
    y += line ? lineHeight : paragraphGap;
  }
  return y;
};

const getMonthCaption = ({ report, month }) => {
  const label = String(report?.monthLabel || month || '').trim();
  const monthLabel = label ? label[0].toLocaleUpperCase('ru-RU') + label.slice(1) : '';
  const generatedAt = new Date(report?.generatedAt || '');
  if (!report?.currentMonth || !Number.isFinite(generatedAt.getTime())) return monthLabel;
  const day = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow', day: 'numeric', month: 'long',
  }).format(generatedAt);
  return `${monthLabel} · на ${day}`;
};

const loadCat = () => new Promise(resolve => {
  const illustration = new Image();
  const timer = window.setTimeout(() => resolve(null), 5000);
  illustration.onload = () => { window.clearTimeout(timer); resolve(illustration); };
  illustration.onerror = () => { window.clearTimeout(timer); resolve(null); };
  illustration.src = new URL('../assets/reports/study-cat.png', import.meta.url).href;
});

/** The same canvas is used for preview and PNG download; all text remains real data. */
export async function createStudentReportCanvas({ report, text, studentName, month }) {
  try {
    await Promise.all([
      document.fonts?.load(`500 32px ${FONT}`),
      document.fonts?.load(`700 64px ${FONT}`),
    ]);
  } catch { /* readable system fallback */ }
  const cat = await loadCat();
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable');
  const { body, goals } = getStudentReportImageContent({ report, text });
  context.font = `700 64px ${FONT}`;
  const nameLines = wrapReportText(context, studentName || 'Ученик', CONTENT_WIDTH);
  context.font = `500 26px ${FONT}`;
  const captionLines = wrapReportText(context, getMonthCaption({ report, month }), CONTENT_WIDTH);
  const nameTop = 116;
  const captionTop = nameTop + nameLines.length * 76 + 10;
  const metricTop = captionTop + captionLines.length * 38 + 36;
  const headingTop = metricTop + 150 + 48;
  const bodyTop = headingTop + 70;
  context.font = `400 32px ${FONT}`;
  const bodyLines = wrapReportText(context, body, CONTENT_WIDTH);
  const bodyBottom = bodyTop + measureLines(bodyLines, 49);
  const goalLines = goals.map(goal => wrapReportText(context, goal, CONTENT_WIDTH - 94));
  const goalHeight = goals.length ? 108 + goalLines.reduce((sum, lines) => sum + measureLines(lines, 46) + 18, 0) : 0;
  const goalTop = bodyBottom + 24;
  const footerTop = Math.max(990, goals.length ? goalTop + goalHeight + 36 : bodyBottom + 48);
  const height = footerTop + 196;
  // Large edited reports stay crisp rather than silently losing the end of the text.
  if (height > 24000) throw new Error('Слишком длинный отчёт для одной картинки. Сократите текст или скачайте его текстовым файлом.');
  canvas.width = WIDTH;
  canvas.height = height;
  context.textBaseline = 'top';
  context.fillStyle = '#f4f1ff';
  context.fillRect(0, 0, WIDTH, height);
  roundedRect(context, 26, 26, WIDTH - 52, height - 52, 32, '#ffffff');
  context.fillStyle = '#7c3aed';
  context.font = `700 23px ${FONT}`;
  context.fillText('ИТОГИ МЕСЯЦА', PAD, 68);
  context.fillStyle = '#142039';
  context.font = `700 64px ${FONT}`;
  drawLines(context, nameLines, PAD, nameTop, 76);
  context.fillStyle = '#64748b';
  context.font = `500 26px ${FONT}`;
  drawLines(context, captionLines, PAD, captionTop, 38);

  const metrics = report?.metrics || {};
  const metricData = [
    { value: String(metrics.lessons?.count ?? 0), label: 'Занятия', fill: '#eaf5ff' },
    { value: metrics.homework?.averagePercent == null ? '—' : `${metrics.homework.averagePercent}%`, label: 'Домашка', fill: '#eaf9f2', note: metrics.homework?.averagePercent == null ? 'пока нет результата' : 'среднее выполнение' },
    { value: metrics.mocks?.latestScore == null ? '—' : String(metrics.mocks.latestScore), label: 'Пробник', fill: '#f1ecff', note: metrics.mocks?.latestScore == null ? 'пока нет результата' : 'баллов' },
  ];
  const metricWidth = (CONTENT_WIDTH - 32) / 3;
  metricData.forEach((metric, index) => {
    const x = PAD + index * (metricWidth + 16);
    roundedRect(context, x, metricTop, metricWidth, 150, 18, metric.fill);
    context.fillStyle = '#142039';
    context.font = `700 46px ${FONT}`;
    context.fillText(metric.value, x + 24, metricTop + 22, metricWidth - 48);
    context.font = `500 25px ${FONT}`;
    context.fillText(metric.label, x + 24, metricTop + 80);
    if (metric.note) {
      context.fillStyle = '#64748b';
      context.font = `400 18px ${FONT}`;
      context.fillText(metric.note, x + 24, metricTop + 116, metricWidth - 48);
    }
  });
  context.fillStyle = '#142039';
  context.font = `700 36px ${FONT}`;
  context.fillText('Как прошёл месяц', PAD, headingTop);
  context.fillStyle = '#29364b';
  context.font = `400 32px ${FONT}`;
  drawLines(context, bodyLines, PAD, bodyTop, 49);

  if (goals.length) {
    roundedRect(context, PAD, goalTop, CONTENT_WIDTH, goalHeight, 24, '#f6f3ff');
    context.fillStyle = '#7138d4';
    context.font = `700 32px ${FONT}`;
    context.fillText('Следующие шаги', PAD + 30, goalTop + 30);
    context.font = `400 32px ${FONT}`;
    let y = goalTop + 92;
    for (const lines of goalLines) {
      context.fillStyle = '#8b5cf6';
      context.beginPath();
      context.arc(PAD + 36, y + 18, 5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#29364b';
      y = drawLines(context, lines, PAD + 60, y, 46) + 18;
    }
  }
  context.fillStyle = '#ede9fe';
  context.fillRect(PAD, footerTop, CONTENT_WIDTH, 2);
  context.fillStyle = '#64748b';
  context.font = `400 22px ${FONT}`;
  const footerText = ['Код не с первого раза?', 'Бывает. Разберёмся.'];
  drawLines(context, footerText, WIDTH - PAD - (cat ? 520 : 300), footerTop + 64, 32);
  if (cat) {
    const imageWidth = 220;
    const imageHeight = imageWidth * cat.naturalHeight / cat.naturalWidth;
    context.drawImage(cat, WIDTH - PAD - imageWidth, footerTop + 16, imageWidth, imageHeight);
  }
  return canvas;
}
