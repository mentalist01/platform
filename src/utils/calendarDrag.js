export const CALENDAR_DRAG_STEP_MINUTES = 10;

// Anchor the increments to the original start: 12:05 moves to 12:15, not 12:10.
export function snapCalendarDragStart({ pointerMinutes, cursorOffsetMinutes = 0, sourceStartMinutes = 0, durationMinutes, dayStartMinutes = 0, dayEndMinutes = 1440 }) {
  const raw = pointerMinutes - cursorOffsetMinutes;
  const step = CALENDAR_DRAG_STEP_MINUTES;
  const first = sourceStartMinutes + Math.ceil((dayStartMinutes - sourceStartMinutes) / step) * step;
  const last = sourceStartMinutes + Math.floor((dayEndMinutes - durationMinutes - sourceStartMinutes) / step) * step;
  return Math.max(first, Math.min(last, sourceStartMinutes + Math.round((raw - sourceStartMinutes) / step) * step));
}


// Keep the native drag source mounted while another week is rendered. Removing
// it would make Chromium cancel the drag before the user can choose a target.
export function retainCalendarDragSource(events, drag, dayIndex) {
  if (!drag || drag.sourceDayIndex !== dayIndex || events.some(event => String(event.id || '').trim() === drag.eventId)) return events;
  return [...events, { ...drag.entry, calendarDragPlaceholder: true }];
}

export function createCalendarDragWeekPager({ onTurn, onDirectionChange = () => {},
  delay = 650, repeatDelay = 1100, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let direction = 0, timer = null, lastOver = 0;
  const stop = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
    if (direction) { direction = 0; onDirectionChange(0); }
  };
  const turn = () => {
    timer = null;
    if (!direction || now() - lastOver > 1000) { stop(); return; }
    onTurn(direction);
    if (direction) timer = setTimer(turn, repeatDelay);
  };
  return {
    update(value) {
      const next = value === -1 || value === 1 ? value : 0;
      if (!next) { stop(); return; }
      lastOver = now();
      if (direction === next && timer !== null) return;
      if (timer !== null) clearTimer(timer);
      direction = next; onDirectionChange(direction); timer = setTimer(turn, delay);
    },
    stop,
  };
}
