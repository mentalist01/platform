import { normalizeStudentParentContact } from './studentParentContact.js';

export function parentReportPeriod(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(now)).reduce((result, part) => { if (part.type !== 'literal') result[part.type] = part.value; return result; }, {});
  return { month: `${parts.year}-${parts.month}`, date: `${parts.year}-${parts.month}-${parts.day}`, due: Number(parts.day) >= 25 };
}

export function parentReportRecipients(students = [], contacts = {}, month) {
  return students.flatMap(student => {
    if (!student?.id || student.deletedAt) return [];
    let contact;
    try { contact = normalizeStudentParentContact(contacts[student.id] || {}); } catch { return []; }
    if (!contact.url) return [];
    return [{ student, contact, sent: Boolean(student.monthlyReportSentMonths?.[month]) }];
  }).sort((a, b) => Number(a.sent) - Number(b.sent) || String(a.student.name || '').localeCompare(String(b.student.name || ''), 'ru'));
}

export const parentReportSnoozeKey = (userId, month) => `ivan100:parent-report-reminder:${userId}:${month}`;
export function readParentReportSnooze(userId, month, storage) {
  try { return storage?.getItem(parentReportSnoozeKey(userId, month)) || ''; } catch { return ''; }
}
export function snoozeParentReports(userId, now, storage) {
  const until = parentReportPeriod(Number(now) + 24 * 60 * 60_000).date;
  try { storage?.setItem(parentReportSnoozeKey(userId, parentReportPeriod(now).month), until); } catch { /* The current tab can still dismiss. */ }
  return until;
}

export function personalizeParentReport(text, name) {
  const parentName = String(name || '').trim().replace(/\s+/gu, ' ');
  return parentName ? String(text || '').replace(/^Здравствуйте!/u, `Здравствуйте, ${parentName}!`) : String(text || '');
}
