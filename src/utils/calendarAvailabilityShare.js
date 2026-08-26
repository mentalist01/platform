const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const CALENDAR_AVAILABILITY_EXPORT_START_HOUR = 8;
export const CALENDAR_AVAILABILITY_EXPORT_END_HOUR = 24;
export const CALENDAR_AVAILABILITY_DAY_LABELS = [
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
  'Воскресенье',
];

const cloneDateOnly = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

/**
 * Returns the Monday of the week that is `offsetWeeks` weeks after the
 * current week. The offset is intentionally limited to the two options used
 * by the availability-sharing flow.
 */
export const getAvailabilityShareWeekStart = (date = new Date(), offsetWeeks = 4) => {
  const normalized = cloneDateOnly(date) || cloneDateOnly(new Date());
  const day = normalized.getDay();
  const mondayOffset = (day + 6) % 7;
  normalized.setDate(normalized.getDate() - mondayOffset + (Math.max(0, Number(offsetWeeks) || 0) * 7));
  return normalized;
};

export const formatAvailabilityShareDate = (date) => {
  const normalized = cloneDateOnly(date);
  if (!normalized) return '';
  return normalized.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
};

export const formatAvailabilityShareWeekLabel = (weekStartDate) => {
  const start = cloneDateOnly(weekStartDate);
  if (!start) return '';
  const end = new Date(start.getTime() + (6 * MS_PER_DAY));
  return `${formatAvailabilityShareDate(start)} – ${formatAvailabilityShareDate(end)}`;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const formatClock = (minutes) => {
  const safeMinutes = clamp(Math.round(Number(minutes) || 0), 0, 24 * 60);
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
};

const drawRoundedRect = (context, x, y, width, height, radius) => {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
};

/**
 * Renders a self-contained PNG of the seven-day busy/free calendar. It does
 * not depend on DOM-to-image libraries, so it also works in the Capacitor
 * build and does not capture private names from another part of the page.
 */
export const renderCalendarAvailabilityPng = async ({
  weekStartDate,
  events = [],
  timezoneLabel = 'GMT+03',
  title = 'Занятость преподавателя',
  dayLabels = CALENDAR_AVAILABILITY_DAY_LABELS,
  width = 1800,
} = {}) => {
  if (typeof document === 'undefined') return null;
  const start = cloneDateOnly(weekStartDate);
  if (!start) return null;

  const safeWidth = Math.max(1200, Math.round(Number(width) || 1800));
  const timeColumnWidth = 132;
  const dayWidth = (safeWidth - timeColumnWidth) / 7;
  const headerHeight = 148;
  const dayHeaderHeight = 76;
  const hourHeight = 60;
  const visibleStartMinutes = CALENDAR_AVAILABILITY_EXPORT_START_HOUR * 60;
  const visibleEndMinutes = CALENDAR_AVAILABILITY_EXPORT_END_HOUR * 60;
  const visibleHourCount = CALENDAR_AVAILABILITY_EXPORT_END_HOUR
    - CALENDAR_AVAILABILITY_EXPORT_START_HOUR;
  const calendarHeight = visibleHourCount * hourHeight;
  const footerHeight = 58;
  const canvas = document.createElement('canvas');
  canvas.width = safeWidth;
  canvas.height = headerHeight + dayHeaderHeight + calendarHeight + footerHeight;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.fillStyle = '#f8fbff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, headerHeight);

  context.fillStyle = '#0f172a';
  context.font = '700 38px system-ui, -apple-system, Segoe UI, sans-serif';
  context.fillText(title, 32, 51);
  context.fillStyle = '#64748b';
  context.font = '600 20px system-ui, -apple-system, Segoe UI, sans-serif';
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  const rangeLabel = `${formatAvailabilityShareDate(start)} – ${formatAvailabilityShareDate(end)}`;
  context.fillText(`${rangeLabel} • ${timezoneLabel}`, 32, 84);
  context.fillStyle = '#2563eb';
  context.fillRect(32, 108, 19, 19);
  context.fillStyle = '#334155';
  context.font = '600 17px system-ui, -apple-system, Segoe UI, sans-serif';
  context.fillText('занято', 61, 124);
  context.fillStyle = '#e2e8f0';
  context.fillRect(157, 108, 19, 19);
  context.fillStyle = '#334155';
  context.fillText('свободно', 186, 124);

  context.fillStyle = '#f1f5f9';
  context.fillRect(0, headerHeight, canvas.width, dayHeaderHeight);
  context.fillStyle = '#64748b';
  context.font = '700 18px system-ui, -apple-system, Segoe UI, sans-serif';
  context.textAlign = 'center';
  context.fillText(timezoneLabel, timeColumnWidth / 2, headerHeight + 47);
  dayLabels.slice(0, 7).forEach((label, index) => {
    const x = timeColumnWidth + (index * dayWidth);
    context.fillStyle = '#0f172a';
    context.font = '700 25px system-ui, -apple-system, Segoe UI, sans-serif';
    context.fillText(label, x + (dayWidth / 2), headerHeight + 49);
  });
  context.textAlign = 'left';

  const gridTop = headerHeight + dayHeaderHeight;
  context.fillStyle = '#ffffff';
  context.fillRect(0, gridTop, canvas.width, calendarHeight);
  context.strokeStyle = '#e2e8f0';
  context.lineWidth = 1;
  for (
    let hour = CALENDAR_AVAILABILITY_EXPORT_START_HOUR;
    hour <= CALENDAR_AVAILABILITY_EXPORT_END_HOUR;
    hour += 1
  ) {
    const y = gridTop + ((hour - CALENDAR_AVAILABILITY_EXPORT_START_HOUR) * hourHeight);
    context.beginPath();
    context.moveTo(0, y + 0.5);
    context.lineTo(canvas.width, y + 0.5);
    context.stroke();
    if (hour < CALENDAR_AVAILABILITY_EXPORT_END_HOUR) {
      context.fillStyle = '#64748b';
      context.font = '700 22px system-ui, -apple-system, Segoe UI, sans-serif';
      context.textAlign = 'right';
      context.fillText(formatClock(hour * 60), timeColumnWidth - 18, y + 28);
    }
  }
  for (let day = 0; day <= 7; day += 1) {
    const x = timeColumnWidth + (day * dayWidth);
    context.beginPath();
    context.moveTo(x + 0.5, headerHeight);
    context.lineTo(x + 0.5, gridTop + calendarHeight);
    context.stroke();
  }
  context.textAlign = 'left';

  const normalizedEvents = (Array.isArray(events) ? events : [])
    .map((event) => ({
      ...event,
      dayIndex: clamp(Math.trunc(Number(event?.dayIndex) || 0), 0, 6),
      startMinutes: clamp(Number(event?.startMinutes) || 0, 0, 24 * 60),
      endMinutes: clamp(Number(event?.endMinutes) || 0, 0, 24 * 60),
      lane: Math.max(0, Math.trunc(Number(event?.lane) || 0)),
      laneCount: Math.max(1, Math.trunc(Number(event?.laneCount) || 1)),
    }))
    .filter((event) => (
      event.endMinutes > event.startMinutes
      && event.endMinutes > visibleStartMinutes
      && event.startMinutes < visibleEndMinutes
    ));

  normalizedEvents.forEach((event) => {
    const laneWidth = dayWidth / event.laneCount;
    const visibleEventStart = Math.max(event.startMinutes, visibleStartMinutes);
    const visibleEventEnd = Math.min(event.endMinutes, visibleEndMinutes);
    const x = timeColumnWidth + (event.dayIndex * dayWidth) + (event.lane * laneWidth) + 5;
    const y = gridTop + (
      ((visibleEventStart - visibleStartMinutes) / 60) * hourHeight
    ) + 3;
    const height = Math.max(
      34,
      ((visibleEventEnd - visibleEventStart) / 60) * hourHeight - 6
    );
    const cardWidth = Math.max(24, laneWidth - 10);
    const gradient = context.createLinearGradient(x, y, x + cardWidth, y + height);
    gradient.addColorStop(0, '#3b82f6');
    gradient.addColorStop(1, '#1d4ed8');
    context.fillStyle = gradient;
    drawRoundedRect(context, x, y, cardWidth, height, 9);
    context.fill();
    context.fillStyle = '#ffffff';
    context.font = '700 18px system-ui, -apple-system, Segoe UI, sans-serif';
    context.fillText('Занятие', x + 11, y + 23);
    if (height >= 48) {
      context.font = '600 14px system-ui, -apple-system, Segoe UI, sans-serif';
      context.fillText(`${formatClock(event.startMinutes)}–${formatClock(event.endMinutes)}`, x + 11, y + 43);
    }
  });

  context.fillStyle = '#64748b';
  context.font = '500 15px system-ui, -apple-system, Segoe UI, sans-serif';
  context.fillText('Время без карточки — свободное для нового занятия.', 22, canvas.height - 22);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(null);
        return;
      }
      const url = typeof URL !== 'undefined' && URL.createObjectURL
        ? URL.createObjectURL(blob)
        : '';
      resolve({ blob, url, width: canvas.width, height: canvas.height });
    }, 'image/png');
  });
};
