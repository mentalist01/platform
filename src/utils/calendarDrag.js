export const CALENDAR_DRAG_STEP_MINUTES = 10;

// Anchor the increments to the original start: 12:05 moves to 12:15, not 12:10.
export function snapCalendarDragStart({ pointerMinutes, cursorOffsetMinutes = 0, sourceStartMinutes = 0, durationMinutes, dayStartMinutes = 0, dayEndMinutes = 1440 }) {
  const raw = pointerMinutes - cursorOffsetMinutes;
  const step = CALENDAR_DRAG_STEP_MINUTES;
  const first = sourceStartMinutes + Math.ceil((dayStartMinutes - sourceStartMinutes) / step) * step;
  const last = sourceStartMinutes + Math.floor((dayEndMinutes - durationMinutes - sourceStartMinutes) / step) * step;
  return Math.max(first, Math.min(last, sourceStartMinutes + Math.round((raw - sourceStartMinutes) / step) * step));
}
