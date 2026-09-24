// Only replace an iCal subscription with the API for that same calendar.
// The calendar selected for writeback may be a different one.
export function googleCalendarReadId(icalUrl, connection) {
  if (!connection?.encryptedTokens) return '';
  try {
    const url = new URL(icalUrl);
    if (url.protocol !== 'https:' || !['calendar.google.com', 'www.google.com'].includes(url.hostname)) return '';
    const match = url.pathname.match(/^\/calendar\/ical\/([^/]+)\//);
    if (!match) return '';
    const id = decodeURIComponent(match[1]);
    return id === connection.calendarId || connection.calendars?.some(calendar => calendar.id === id) ? id : '';
  } catch {
    return '';
  }
}

export function googleApiEventToCalendarEvent(event) {
  return {
    type: 'VEVENT',
    uid: event.iCalUID || event.id,
    status: String(event.status || '').toUpperCase(),
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    isFullDay: Boolean(event.start?.date),
    summary: event.summary,
    description: event.description,
    location: event.location,
    url: event.hangoutLink || '',
  };
}
